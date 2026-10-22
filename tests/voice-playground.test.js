import test from 'node:test';
import assert from 'node:assert/strict';
import { VoicePlayground } from '../playground/model.js';
import { localBridge } from '../playground/bridge.js';
import { estimatePitch } from '../core/speech-pitch.js';

const options = pitchSemitones => ({ pitchSemitones, formantRatio: 1.15, pitchRange: 1 });
function fixture() {
    const calls = [], transforms = [], original = new Float32Array(4410).fill(.1);
    const model = new VoicePlayground(async (path, init) => {
        calls.push({ path, init });
        if (path === 'status') return Response.json({ available: true, configured: true });
        if (path === 'praat/status') return Response.json({ available: true, version: 'test' });
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa('test-audio') })}\n\n`);
    }, { decode: async () => original.slice(), measure: async () => ({ medianHz: 110, voicedFrames: 1, frames: 1 }),
        transform: async (samples, settings) => { transforms.push({ samples: samples.slice(), settings }); return { samples: samples.map(value => value * (1 + settings.pitchSemitones / 10)), notes: ['Applied'] }; } });
    return { model, calls, transforms, original };
}

test('voice workbench uses one Fish recording across cached Praat comparisons and validates Fish URLs', async () => {
    const h = fixture();
    try {
        await h.model.generate({ voice: 'https://fish.audio/m/test-voice/', text: 'Hello there. [happy]' });
        assert.equal(h.calls.length, 1); assert.equal(h.calls[0].path, 'synthesize');
        const payload = JSON.parse(h.calls[0].init.body); assert.equal(payload.model, 's2.1-pro-free');
        assert.deepEqual(payload.body.reference_id, ['test-voice']); assert.ok(payload.body.text.startsWith('<|speaker:0|>[happy]'));
        const first = await h.model.apply(options(4)); await h.model.apply(options(7)); const cached = await h.model.apply(options(4));
        assert.equal(first, cached); assert.equal(h.transforms.length, 2); assert.equal(h.calls.length, 1);
        for (const transform of h.transforms) assert.deepEqual(transform.samples, h.original);
        assert.deepEqual(h.model.source.samples, h.original); assert.equal(cached.samples.length, h.original.length);
    } finally { h.model.dispose(); }
});
test('local audio loading, silence and source replacement never synthesize or reuse another source’s effects', async () => {
    const h = fixture();
    try {
        await h.model.load(new Uint8Array(4), 'test.wav'); assert.equal(h.calls.length, 0);
        const first = await h.model.apply(options(4)); await h.model.load(new Uint8Array(4), 'new.wav');
        assert.equal(h.model.result, null); assert.equal(h.model.variants.size, 0);
        const next = await h.model.apply(options(4)); assert.notEqual(first, next); assert.equal(h.transforms.length, 2);
        h.model.transform = async samples => ({ samples: samples.slice(), notes: ['No stable voiced pitch'] });
        const unchanged = await h.model.apply(options(5)); assert.equal(unchanged.changed, false);
    } finally { h.model.dispose(); }
});
test('failed processing preserves original audio and never labels a fallback as a processed result', async () => {
    const h = fixture();
    try {
        await h.model.load(new Uint8Array(4)); h.model.transform = async () => { throw new Error('Praat unavailable'); };
        await assert.rejects(h.model.apply(options(4)), /Praat unavailable/); assert.equal(h.model.result, null);
        assert.deepEqual(h.model.source.samples, h.original); assert.equal(h.model.phase, 'error');
        h.model.transform = async () => ({ samples: new Float32Array(1) });
        await assert.rejects(h.model.apply(options(4)), /length/);
        h.model.transform = async () => ({ samples: new Float32Array([NaN]) });
        await assert.rejects(h.model.apply(options(4)), /invalid/);
    } finally { h.model.dispose(); }
});
test('obsolete Praat jobs cannot overwrite a newer setting after cancellation', async () => {
    const h = fixture(); let release;
    try {
        await h.model.load(new Uint8Array(4));
        h.model.transform = (samples, settings) => settings.pitchSemitones === 4 ? new Promise(resolve => release = () => resolve({ samples: samples.slice(), notes: [] })) : Promise.resolve({ samples: samples.map(value => value * 2), notes: [] });
        const old = h.model.apply(options(4)), rejected = assert.rejects(old, { name: 'AbortError' });
        await h.model.apply(options(7)); release(); await rejected;
        assert.equal(h.model.result.settings.pitchSemitones, 7); assert.equal(h.model.phase, 'idle');
    } finally { h.model.dispose(); }
});
test('invalid synthesis and oversized audio fail before requests; the local effect cache is bounded', async () => {
    const h = fixture();
    try {
        for (const input of [{ voice: '', text: 'Hello' }, { voice: 'test', text: '' }, { voice: 'test', text: 'x'.repeat(2001) }, { voice: 'test', text: 'Hi', model: 'unknown' }]) await assert.rejects(h.model.generate(input));
        await assert.rejects(h.model.load({ byteLength: 41 * 1024 * 1024 }), /40 MB/); assert.equal(h.calls.length, 0);
        await h.model.load(new Uint8Array(4)); for (let pitch = 0; pitch <= 12; pitch++) await h.model.apply(options(pitch));
        assert.equal(h.model.variants.size, 4); assert.ok(h.model.result.samples.every(value => Math.abs(value) <= 10 ** (-1.5 / 20) + 1e-6));
    } finally { h.model.dispose(); }
});
test('local bridge obtains CSRF without retrieving or persisting API keys and surfaces server failures', async () => {
    const calls = [], bridge = localBridge(async (url, init) => {
        calls.push({ url, init }); if (url === '/csrf-token') return Response.json({ token: 'CSRF_TEST' });
        if (url.endsWith('praat/youngify')) return Response.json({ error: 'Praat failed' }, { status: 503 });
        return Response.json({ configured: true });
    });
    await bridge('status'); assert.equal(calls.length, 1);
    await bridge('synthesize', { method: 'POST', body: '{}' }); assert.equal(calls.length, 3);
    assert.equal(calls[2].init.headers.get('X-CSRF-Token'), 'CSRF_TEST'); assert.equal(calls[2].init.credentials, 'same-origin');
    await assert.rejects(bridge('praat/youngify', { method: 'POST' }), /Praat failed/);
    assert.equal(calls.filter(call => call.url === '/csrf-token').length, 1); assert.ok(calls.every(call => !call.url.includes('secret')));
});
test('bounded pitch estimates distinguish a pitch shift and omit silence and unvoiced noise', () => {
    const tone = hz => Float32Array.from({ length: 44100 }, (_, index) => .3 * Math.sin(2 * Math.PI * hz * index / 44100));
    for (const hz of [110, 220, 384]) { const pitch = estimatePitch(tone(hz)); assert.ok(Math.abs(pitch.medianHz - hz) < 3); assert.ok(pitch.voicedFrames > 0); }
    assert.equal(estimatePitch(new Float32Array(44100)).medianHz, null); assert.equal(estimatePitch(new Float32Array(20)).medianHz, null);
    let seed = 123; const noise = Float32Array.from({ length: 44100 }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 - .5; });
    assert.equal(estimatePitch(noise).medianHz, null);
});
