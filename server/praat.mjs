import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { youngifySettings } from '../core/speech-youngify.js';

const script = fileURLToPath(new URL('./praat-youngify.py', import.meta.url));
const MAX_BYTES = 44100 * 4 * 120;
const setup = 'Run node tools/install-praat.js /path/to/SillyTavern, then restart SillyTavern.';
const unavailable = () => Object.assign(new Error(`Praat is unavailable. ${setup}`), { status: 503 });
export function praatPython(root = process.cwd()) {
    return process.env.VNPLUS_PRAAT_PYTHON || path.join(root, 'plugins', 'vn-plus-praat', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}
export function runPraat(input, settings, signal, python = praatPython()) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
        const child = spawn(python, [script, ...(input ? [] : ['--check'])], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        const chunks = []; let size = 0, settled = false;
        const finish = (error, output) => {
            if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
            if (error) { child.kill(); reject(error); } else resolve(output);
        };
        const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
        const timer = setTimeout(() => finish(Object.assign(new Error('Praat processing timed out. Original audio remains available.'), { status: 504 })), 90000);
        signal?.addEventListener('abort', abort, { once: true });
        child.once('error', () => finish(unavailable()));
        // Python tracebacks are diagnostic only; never return local paths or raw stderr to clients.
        child.stderr.resume(); child.stdin.on('error', () => {});
        child.stdout.on('data', chunk => {
            size += chunk.length;
            if (size > (input?.length || 0) + 4096) finish(new Error('Invalid Praat output size.'));
            else chunks.push(chunk);
        });
        child.once('close', code => {
            if (code !== 0) { finish(unavailable()); return; }
            try {
                const output = Buffer.concat(chunks), newline = output.indexOf(10);
                if (!input) { finish(null, JSON.parse(output.toString('utf8'))); return; }
                if (newline < 0 || newline > 2048) throw new Error();
                const metadata = JSON.parse(output.subarray(0, newline).toString('utf8')), samples = output.subarray(newline + 1);
                if (samples.length !== input.length || typeof metadata.note !== 'string') throw new Error();
                for (let offset = 0; offset < samples.length; offset += 4) if (!Number.isFinite(samples.readFloatLE(offset))) throw new Error();
                finish(null, { samples, note: metadata.note.slice(0, 200) });
            } catch { finish(new Error('Invalid Praat output. Original audio remains available.')); }
        });
        if (input) child.stdin.end(Buffer.concat([Buffer.from(JSON.stringify(settings) + '\n'), input])); else child.stdin.end();
    });
}
export function validatePraatRequest(body) {
    const settings = youngifySettings(body?.settings);
    if (!settings || body?.sampleRate !== 44100 || typeof body?.pcm !== 'string' || !body.pcm.length
        || body.pcm.length > Math.ceil(MAX_BYTES / 3) * 4 || body.pcm.length % 4 || /[^A-Za-z0-9+/=]/.test(body.pcm)) throw new Error('Invalid Praat request: use mono 44100 Hz float32 PCM, at most 120 seconds.');
    const input = Buffer.from(body.pcm, 'base64');
    if (!input.length || input.length % 4 || input.length > MAX_BYTES || input.toString('base64') !== body.pcm) throw new Error('Invalid Praat PCM size.');
    for (let offset = 0; offset < input.length; offset += 4) {
        const value = input.readFloatLE(offset);
        if (!Number.isFinite(value) || Math.abs(value) > 4) throw new Error('Invalid Praat PCM samples.');
    }
    return { input, settings };
}
// Local CPU work is bounded independently of concurrent Fish requests.
export function registerPraat(router, processAudio = runPraat) {
    let active = 0, statusCheck = null; const queue = [];
    const acquire = signal => new Promise((resolve, reject) => {
        const entry = { start: () => { signal.removeEventListener('abort', cancel); active++; resolve(); } };
        const cancel = () => { const index = queue.indexOf(entry); if (index >= 0) queue.splice(index, 1); reject(new DOMException('Cancelled', 'AbortError')); };
        if (signal.aborted) { cancel(); return; }
        if (active < 2) entry.start();
        else { signal.addEventListener('abort', cancel, { once: true }); queue.push(entry); }
    });
    const release = () => { active--; queue.shift()?.start(); };
    router.get('/praat/status', async (req, res) => {
        if (!req.user?.directories) return res.sendStatus(401);
        try {
            statusCheck ||= processAudio(null, null).finally(() => { statusCheck = null; });
            const status = await statusCheck;
            res.json({ available: true, version: status.version, maxParallel: 2 });
        } catch { res.status(503).json({ available: false, error: `Praat is unavailable. ${setup}` }); }
    });
    router.post('/praat/youngify', async (req, res) => {
        if (!req.user?.directories) return res.sendStatus(401);
        let request;
        try { request = validatePraatRequest(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
        if (queue.length >= 20) return res.status(429).set({ 'Retry-After': '2' }).json({ error: 'Praat queue is full. Wait before retrying.' });
        const abort = new AbortController(), cancel = () => abort.abort(); let acquired = false;
        const timeout = setTimeout(cancel, 180000);
        req.once('aborted', cancel); res.once('close', cancel);
        try {
            await acquire(abort.signal); acquired = true;
            const output = await processAudio(request.input, request.settings, abort.signal);
            if (!abort.signal.aborted) res.set({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-VN-Praat-Note': output.note }).send(output.samples);
        } catch (error) {
            if (!res.destroyed && !req.aborted) res.status(error.name === 'AbortError' ? 504 : error.status || 500)
                .json({ error: error.name === 'AbortError' ? 'Praat request cancelled or timed out. Original audio remains available.' : error.message });
        } finally {
            clearTimeout(timeout); if (acquired) release();
            req.removeListener('aborted', cancel); res.removeListener('close', cancel);
        }
    });
}
