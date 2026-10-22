import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../integration.js';
import { SpeechEngine } from '../renderers/speech-engine.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { parsePOV } from '../core/vn-parser.js';

test('the installed host adapter permits exactly the Praat routes and retains ST request headers and cancellation', async () => {
    const originalFetch = globalThis.fetch, calls = [], abort = new AbortController();
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ available: true }); };
    const host = createHost(() => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'ST_TOKEN', 'Content-Type': 'application/json' }) }));
    try {
        await host.request('/api/plugins/vn-plus-tts/praat/status');
        await host.request('/api/plugins/vn-plus-tts/praat/youngify', { method: 'POST', body: '{}', signal: abort.signal });
        assert.equal(calls.length, 2); assert.equal(calls[1].options.headers['X-CSRF-Token'], 'ST_TOKEN');
        assert.equal(calls[1].options.signal, abort.signal); assert.equal(calls[1].options.body, '{}');
        for (const route of ['/api/plugins/vn-plus-tts/praat', '/api/plugins/vn-plus-tts/praat/other', '/api/plugins/vn-plus-tts/praat/status/extra',
            '/api/plugins/vn-plus-tts/praat/status?path=secret', '/api/plugins/vn-plus-tts/praat/../secret', 'https://example.test/api/plugins/vn-plus-tts/praat/status']) assert.throws(() => host.request(route), /Invalid VN\+ server route/);
        assert.equal(calls.length, 2);
    } finally { globalThis.fetch = originalFetch; }
});

test('in-game SpeechEngine applies Praat through createHost rather than falling back before fetch', async () => {
    const originalFetch = globalThis.fetch, calls = [], settings = structuredClone(DEFAULT_SETTINGS);
    settings.tts.enabled = true; settings.characters = { daphne: { voiceId: 'test-daphne', ttsYoungify: { pitchSemitones: 7, formantRatio: 1.24, pitchRange: 1.05 } } };
    const host = createHost(() => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'ST_TOKEN' }) }));
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsePOV('Daphne: "There you are."').tokens, registry, settings);
    globalThis.fetch = async (url, options) => {
        calls.push(url); assert.equal(options.headers['X-CSRF-Token'], 'ST_TOKEN');
        if (url.endsWith('/praat/status')) return Response.json({ available: true, version: 'test' });
        assert.equal(url, '/api/plugins/vn-plus-tts/praat/youngify');
        const body = JSON.parse(options.body); assert.equal(body.settings.pitchSemitones, 7);
        const bytes = Buffer.from(body.pcm, 'base64'), samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        return new Response(samples.map(value => value * 2).buffer, { headers: { 'X-VN-Praat-Note': 'Praat: pitch and formants adjusted; duration preserved.' } });
    };
    const engine = new SpeechEngine(host, settings, { process: async chapter => chapter.clips.map(clip => ({ id: clip.id, samples: chapter.original.slice(), notes: [] })) });
    try {
        engine.prepare('adapter-check', timeline, registry);
        const line = engine.prepared.segments[0], original = new Float32Array(4410).fill(.1);
        const chapter = { original, clips: [{ id: line.id, line, start: 0, end: .1 }], words: [] }; engine.job = { chapters: [chapter], status: 'complete' };
        await engine.praatStatus(); const samples = await engine.clipSamples(line.id); await engine.ensureProcessed(chapter);
        assert.ok(Math.abs(samples[0] - .2) < 1e-6); assert.equal(samples.length, original.length);
        assert.equal(engine.voiceEffectStatus(line.id).state, 'applied'); assert.ok(!chapter.processed.results.get(line.id).youngifyError);
        assert.deepEqual(calls, ['/api/plugins/vn-plus-tts/praat/status', '/api/plugins/vn-plus-tts/praat/youngify']);
    } finally { engine.dispose(); globalThis.fetch = originalFetch; }
});
