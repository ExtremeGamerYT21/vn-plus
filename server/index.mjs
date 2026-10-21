import { once } from 'node:events';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { registerCharacterFolders } from './character-folders.mjs';
import { registerPraat } from './praat.mjs';

export const info = { id: 'vn-plus-tts', name: 'VN+ server bridge', description: 'Local character folders and timestamped Fish synthesis with per-user secrets.' };
export const SECRET_KEY = 'api_key_vn_plus_fish';
export const MAX_PARALLEL_REQUESTS = 5;
export function validateRequest(input) {
    const { model, timeout = 180, body } = input || {};
    if (!['s2.1-pro-free', 's2.1-pro'].includes(model)) throw new Error('Choose the free or paid Fish model explicitly.');
    if (!Number.isFinite(timeout) || timeout < 30 || timeout > 600) throw new Error('Invalid request timeout.');
    if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 20000) throw new Error('Invalid chapter text.');
    if (!Array.isArray(body.reference_id) || !body.reference_id.length || body.reference_id.length > 8 || body.reference_id.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error('Invalid character voice IDs.');
    const tags = [...body.text.matchAll(/<\|speaker:(\d+)\|>/g)];
    if (!tags.length || tags.some(tag => Number(tag[1]) >= body.reference_id.length)) throw new Error('Invalid speaker mapping.');
    if (body.format !== 'mp3' || body.sample_rate !== 44100 || ![64, 128, 192].includes(body.mp3_bitrate)) throw new Error('Invalid audio format.');
    for (const [key, min, max] of [['temperature', 0, 1], ['top_p', 0, 1], ['chunk_length', 100, 300]]) if (!Number.isFinite(body[key]) || body[key] < min || body[key] > max) throw new Error(`Invalid ${key}.`);
    if (!Number.isFinite(body.prosody?.speed) || body.prosody.speed < .5 || body.prosody.speed > 2 || body.prosody.normalize_loudness !== true) throw new Error('Invalid prosody.');
    if (!['normal', 'low', 'balanced'].includes(body.latency) || typeof body.normalize !== 'boolean' || typeof body.condition_on_previous_chunks !== 'boolean') throw new Error('Invalid synthesis options.');
    return { model, timeout, body: { text: body.text, reference_id: body.reference_id, format: 'mp3', sample_rate: 44100, mp3_bitrate: body.mp3_bitrate,
        temperature: body.temperature, top_p: body.top_p, chunk_length: body.chunk_length, latency: body.latency,
        normalize: body.normalize, condition_on_previous_chunks: body.condition_on_previous_chunks, prosody: { speed: body.prosody.speed, normalize_loudness: true } } };
}
export function registerBridge(router, secrets, fetcher = fetch) {
    const active = new Map();
    const user = (req, res) => { if (!req.user?.directories) { res.sendStatus(401); return null; } return req.user.directories; };
    router.get('/status', (req, res) => { const directories = user(req, res); if (directories) res.json({ available: true, configured: !!secrets.readSecret(directories, SECRET_KEY), version: 4, maxParallelBatches: MAX_PARALLEL_REQUESTS }); });
    router.post('/secret', (req, res) => {
        const directories = user(req, res); if (!directories) return;
        const value = req.body?.value;
        if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\r\n\u0000]/.test(value)) return res.status(400).json({ error: 'Enter a valid Fish API key.' });
        try { secrets.writeSecret(directories, SECRET_KEY, value.trim()); res.json({ configured: true }); }
        catch { res.status(500).json({ error: 'Unable to save the API key in SillyTavern’s secret store.' }); }
    });
    router.delete('/secret', (req, res) => {
        const directories = user(req, res); if (!directories) return;
        try { secrets.deleteSecret(directories, SECRET_KEY); res.json({ configured: false }); }
        catch { res.status(500).json({ error: 'Unable to remove the saved Fish key.' }); }
    });
    router.post('/synthesize', async (req, res) => {
        const directories = user(req, res); if (!directories) return;
        let request; try { request = validateRequest(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
        const identity = directories.secrets || req.user.profile?.handle || directories.root;
        if ((active.get(identity) || 0) >= MAX_PARALLEL_REQUESTS) return res.status(429).json({ error: 'Five Fish batches are already running for this user. Wait for a slot or lower parallel voice batches.' });
        const key = secrets.readSecret(directories, SECRET_KEY); if (!key) return res.status(400).json({ error: 'Save your Fish API key first.' });
        const abort = new AbortController(), cancel = () => abort.abort(); let bytes = 0;
        const timeout = setTimeout(cancel, request.timeout * 1000); active.set(identity, (active.get(identity) || 0) + 1);
        req.once('aborted', cancel); res.once('close', cancel);
        try {
            const upstream = await fetcher('https://api.fish.audio/v1/tts/stream/with-timestamp', {
                method: 'POST', redirect: 'error', signal: abort.signal,
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream', model: request.model },
                body: JSON.stringify(request.body),
            });
            if (!upstream.ok) {
                if (upstream.status === 429 && upstream.headers.get('retry-after')) res.set({ 'Retry-After': upstream.headers.get('retry-after') });
                await upstream.body?.cancel(); return res.status(upstream.status === 429 ? 429 : 502).json({ error: `Fish request failed (HTTP ${upstream.status}). Check your key, model availability and account.` });
            }
            if (!upstream.body || !upstream.headers.get('content-type')?.includes('text/event-stream')) { await upstream.body?.cancel(); throw new Error('Invalid provider response'); }
            res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' }); res.flushHeaders();
            for await (const chunk of upstream.body) {
                bytes += chunk.length; if (bytes > 100 * 1024 * 1024) throw new Error('Stream size limit');
                if (!res.write(chunk)) await once(res, 'drain', { signal: abort.signal });
            }
            res.end();
        } catch {
            if (res.destroyed) return;
            if (!res.headersSent) res.status(502).json({ error: 'Fish synthesis failed or timed out. Completed chapters remain available.' });
            else if (!res.destroyed) res.end('\nevent: error\ndata: {"error":"Synthesis interrupted"}\n\n');
        } finally {
            clearTimeout(timeout); const remaining = (active.get(identity) || 1) - 1;
            if (remaining) active.set(identity, remaining); else active.delete(identity);
            req.removeListener('aborted', cancel); res.removeListener('close', cancel);
        }
    });
}
export async function init(router) {
    const secrets = await import(pathToFileURL(path.resolve(process.cwd(), 'src/endpoints/secrets.js')).href);
    registerBridge(router, secrets);
    registerPraat(router);
    registerCharacterFolders(router, fileURLToPath(new URL('../', import.meta.url)));
}
