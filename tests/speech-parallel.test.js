import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { SpeechEngine } from '../renderers/speech-engine.js';
import { DEFAULT_SETTINGS, loadSettings } from '../ui/settings.js';
import { speechSettings, SAMPLE_RATE } from '../core/speech-segments.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { registerBridge } from '../server/index.mjs';

const turn = () => new Promise(resolve => setImmediate(resolve));
const until = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 2)); } throw new Error('Test readiness timeout'); };
const stream = index => new Response(`data: ${JSON.stringify({ audio_base64: btoa(String(index)), chunk_seq: 0, chunk_audio_offset_sec: 0,
    alignment: { segments: [{ text: `Line ${index}`, start: .1, end: .5 }] } })}\n\n`);
const audio = () => ({ paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} });
function fixture(count = 6, parallelBatches = 3, capacity = 5) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings.tts, { enabled: true, chapterSize: 1, parallelBatches }); settings.characters = { nina: { voiceId: 'test-nina' } };
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsePOV(Array.from({ length: count }, (_, index) => `Nina: "Line ${index}"`).join('\n')).tokens, registry, settings);
    const calls = []; let active = 0, maximum = 0;
    const request = async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true, ...(capacity ? { maxParallelBatches: capacity } : {}) });
        const input = JSON.parse(options.body), index = Number(/Line (\d+)/.exec(input.body.text)[1]);
        return new Promise((resolve, reject) => {
            active++; maximum = Math.max(maximum, active);
            const call = { index, options, input, done: false, finish(value, error) {
                if (this.done) return; this.done = true; active--; options.signal.removeEventListener('abort', abort);
                if (error) reject(error); else resolve(value);
            } };
            const abort = () => call.finish(null, new DOMException('Cancelled', 'AbortError'));
            options.signal.addEventListener('abort', abort, { once: true }); calls.push(call);
        });
    };
    const engine = new SpeechEngine({ request }, settings, { audioFactory: audio,
        decode: async bytes => new Float32Array(SAMPLE_RATE).fill((Number(new TextDecoder().decode(bytes)) + 1) / 10),
        process: async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(10), notes: [] })),
    });
    engine.prepare('parallel-source', timeline, registry);
    return { engine, settings, registry, timeline, calls, get maximum() { return maximum; },
        release(index, status = 200) { const call = calls.find(call => call.index === index && !call.done); assert.ok(call, `No pending chapter ${index}`); call.finish(status === 200 ? stream(index) : Response.json({ error: `Rejected ${status}` }, { status })); },
    };
}

test('parallel batch preference migrates defaults clamps integers and never persists credentials', () => {
    assert.equal(loadSettings({ extensionSettings: {} }).tts.parallelBatches, 3);
    for (const [input, expected] of [[0, 1], [-10, 1], [2.9, 2], [99, 5], [NaN, 3], [Infinity, 3], ['4', 3]]) {
        const result = speechSettings({ parallelBatches: input, apiKey: 'do-not-copy' }); assert.equal(result.parallelBatches, expected); assert.equal(result.apiKey, undefined);
    }
});

test('bounded workers publish out-of-order chapters early and restore chronological exports and offsets', { timeout: 5000 }, async () => {
    const h = fixture(); const { engine } = h;
    try {
        const generation = engine.generate(); await until(() => h.calls.length === 3); assert.deepEqual(h.calls.map(call => call.index), [0, 1, 2]);
        h.release(2); await until(() => h.calls.length === 4 && engine.job.chapters.some(chapter => chapter.index === 2));
        const early = engine.job.chapters[0]; assert.equal(early.index, 2); assert.equal(early.offsetSamples, null);
        assert.equal(engine.lineStatus(early.clips[0].beat).state, 'ready');
        await assert.rejects(engine.sourceSamples(), /earlier chapter/);
        engine.setNoise(2, .7, .8); assert.deepEqual(early.noise, { start: .7, end: .8 });
        engine.reviewCut(2, early.clips[0].id, .1, .5); assert.ok(early.clips[0].approved);
        await engine.playChapter(2); assert.ok(engine.speaking); engine.stop();
        h.release(0); await until(() => h.calls.length === 5);
        h.release(1); await until(() => h.calls.length === 6);
        h.release(5); h.release(4); h.release(3); const job = await generation;
        assert.equal(h.maximum, 3); assert.equal(job.status, 'complete');
        assert.deepEqual(job.chapters.map(chapter => chapter.index), [0, 1, 2, 3, 4, 5]);
        assert.deepEqual(job.chapters.map(chapter => chapter.offsetSamples), [0, 1, 2, 3, 4, 5].map(index => index * SAMPLE_RATE));
        const samples = await engine.sourceSamples(); assert.equal(samples.length, 6 * SAMPLE_RATE);
        for (let index = 0; index < 6; index++) assert.ok(Math.abs(samples[index * SAMPLE_RATE] - (index + 1) / 10) < 1e-6);
        const processed = job.chapters[0].processed;
        h.settings.tts.parallelBatches = 5; await engine.generate(); assert.equal(h.calls.length, 6);
        assert.equal(await engine.ensureProcessed(job.chapters[0]), processed);
    } finally { engine.dispose(); }
});

test('a failed batch stops new dispatch preserves completed holes and retries only missing chapters', { timeout: 5000 }, async () => {
    const h = fixture(5); const { engine } = h;
    try {
        const generation = engine.generate(); await until(() => h.calls.length === 3);
        h.release(0, 500); await turn(); h.release(2); h.release(1); const failed = await generation;
        assert.equal(failed.status, 'failed'); assert.equal(h.calls.length, 3); assert.deepEqual(failed.chapters.map(chapter => chapter.index), [1, 2]);
        const kept = failed.chapters[1]; const retry = engine.generate(); await until(() => h.calls.length === 6);
        assert.deepEqual(h.calls.slice(3).map(call => call.index), [0, 3, 4]);
        h.release(4); h.release(0); h.release(3); const complete = await retry;
        assert.equal(complete.status, 'complete'); assert.equal(complete.chapters[2], kept);
        assert.equal(h.calls.filter(call => call.index === 1).length, 1); assert.equal(h.calls.filter(call => call.index === 2).length, 1);
    } finally { engine.dispose(); }
});

test('one batch disables parallelism and an older bridge is used sequentially with restart guidance', { timeout: 5000 }, async () => {
    for (const [preference, capacity] of [[1, 5], [5, null]]) {
        const h = fixture(3, preference, capacity);
        try {
            const generation = h.engine.generate();
            for (let index = 0; index < 3; index++) { await until(() => h.calls.length === index + 1); assert.ok(h.calls.slice(0, -1).every(call => call.done)); h.release(index); }
            await generation; assert.equal(h.maximum, 1);
            if (!capacity) assert.match(h.engine.status, /Restart SillyTavern/);
        } finally { h.engine.dispose(); }
    }
});

test('the advertised server capacity bounds the requested pool', { timeout: 5000 }, async () => {
    const h = fixture(3, 5, 2);
    try {
        const generation = h.engine.generate(); await until(() => h.calls.length === 2); h.release(1);
        await until(() => h.calls.length === 3); h.release(2); h.release(0); await generation; assert.equal(h.maximum, 2);
    } finally { h.engine.dispose(); }
});

test('cancellation aborts every active batch without dispatching the remaining queue', { timeout: 5000 }, async () => {
    const h = fixture(6);
    try {
        const generation = h.engine.generate(); await until(() => h.calls.length === 3); const job = h.engine.job;
        h.engine.clearScene(); await generation; assert.ok(h.calls.every(call => call.options.signal.aborted));
        assert.equal(h.calls.length, 3); assert.equal(job.chapters.length, 0); assert.equal(job.status, 'cancelled');
        assert.equal(h.engine.job, null); assert.match(h.engine.status, /Prepare the selected/);
    } finally { h.engine.dispose(); }
});

test('an obsolete decode cannot commit into a new scene or overwrite its generation status', { timeout: 5000 }, async () => {
    const h = fixture(1); let finishDecode;
    h.engine.decode = () => new Promise(resolve => finishDecode = resolve);
    try {
        const previous = h.engine.generate(); await until(() => h.calls.length === 1); h.release(0); await until(() => finishDecode);
        const oldJob = h.engine.job; h.engine.clearScene(); h.engine.prepare('replacement', h.timeline, h.registry);
        h.engine.decode = async () => new Float32Array(SAMPLE_RATE);
        const replacement = h.engine.generate(); await until(() => h.calls.length === 2); h.release(0); await replacement;
        finishDecode(new Float32Array(SAMPLE_RATE)); await previous;
        assert.equal(oldJob.chapters.length, 0); assert.equal(h.engine.job.status, 'complete'); assert.match(h.engine.status, /Voices ready/);
    } finally { h.engine.dispose(); }
});

test('429 rejections retry with bounded backoff and preserve the selected free model', { timeout: 5000 }, async () => {
    const h = fixture(1), waits = []; let posts = 0;
    h.engine.wait = async delay => waits.push(delay);
    h.engine.host.request = async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true, maxParallelBatches: 5 });
        assert.equal(JSON.parse(options.body).model, 's2.1-pro-free');
        return ++posts < 3 ? Response.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': '2' } }) : stream(0);
    };
    try { await h.engine.generate(); assert.equal(posts, 3); assert.deepEqual(waits, [2000, 2000]); assert.equal(h.engine.job.status, 'complete'); } finally { h.engine.dispose(); }
});

test('cancelling and immediately resuming the same cached job cannot overwrite the newer run', { timeout: 5000 }, async () => {
    const h = fixture(2);
    try {
        const previous = h.engine.generate(); await until(() => h.calls.length === 2); h.engine.cancel();
        const resumed = h.engine.generate(); await until(() => h.calls.length === 4);
        h.release(1); h.release(0); await Promise.all([previous, resumed]);
        assert.equal(h.engine.job.status, 'complete'); assert.equal(h.engine.job.chapters.length, 2);
        assert.match(h.engine.status, /Voices ready/);
    } finally { h.engine.dispose(); }
});

test('429 retries stop after three attempts while non-rate errors are not retried', { timeout: 5000 }, async () => {
    for (const [status, attempts] of [[429, 3], [500, 1], [409, 1]]) {
        const h = fixture(1); let posts = 0, waits = 0; h.engine.wait = async () => { waits++; };
        h.engine.host.request = async url => url.endsWith('/status') ? Response.json({ configured: true, maxParallelBatches: 5 }) : (posts++, Response.json({ error: 'Rejected' }, { status }));
        try { await h.engine.generate(); assert.equal(posts, attempts); assert.equal(waits, attempts - 1); assert.equal(h.engine.job.status, 'failed'); } finally { h.engine.dispose(); }
    }
});

test('cancelling during rate-limit backoff immediately prevents another provider request', { timeout: 5000 }, async () => {
    const h = fixture(1); let posts = 0;
    h.engine.host.request = async url => url.endsWith('/status') ? Response.json({ configured: true, maxParallelBatches: 5 }) : (posts++, Response.json({ error: 'Limited' }, { status: 429 }));
    try {
        const generation = h.engine.generate(); await until(() => h.engine.status.includes('rate limit')); h.engine.cancel(); await generation;
        assert.equal(posts, 1); assert.equal(h.engine.job.status, 'cancelled');
    } finally { h.engine.dispose(); }
});

test('bridge concurrency slots are isolated per user and released after success and upstream errors', { timeout: 5000 }, async () => {
    const routes = new Map(), router = Object.fromEntries(['get', 'post', 'delete'].map(method => [method, (url, callback) => routes.set(`${method}:${url}`, callback)]));
    const h = fixture(1), body = { model: 's2.1-pro-free', body: h.engine.plan()[0].body }, pending = [];
    const req = user => Object.assign(new EventEmitter(), { user: { directories: { secrets: user } }, body });
    const res = () => Object.assign(new EventEmitter(), { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.value = value; }, sendStatus(code) { this.statusCode = code; }, set(headers) { this.headers = { ...this.headers, ...headers }; }, flushHeaders() { this.headersSent = true; }, write() { return true; }, end() {} });
    registerBridge(router, { readSecret: () => 'FAKE_SERVER_KEY' }, async (_, options) => new Promise((resolve, reject) => {
        pending.push(resolve); options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    }));
    const requests = Array.from({ length: 5 }, () => req('one')), responses = requests.map(res), jobs = requests.map((request, index) => routes.get('post:/synthesize')(request, responses[index]));
    const overflow = res(); await routes.get('post:/synthesize')(req('one'), overflow); assert.equal(overflow.statusCode, 429);
    const other = res(), otherJob = routes.get('post:/synthesize')(req('two'), other); assert.equal(pending.length, 6);
    pending[0](Response.json({ error: 'Limited' }, { status: 429, headers: { 'Retry-After': '3' } })); await jobs[0];
    assert.equal(responses[0].statusCode, 429); assert.equal(responses[0].headers['Retry-After'], '3');
    const extra = res(), extraJob = routes.get('post:/synthesize')(req('one'), extra); assert.equal(pending.length, 7);
    for (let index = 1; index < pending.length; index++) pending[index](new Response('data: {}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }));
    await Promise.all([...jobs, otherJob, extraJob]);
    const status = res(); routes.get('get:/status')(req('one'), status); assert.equal(status.value.maxParallelBatches, 5); assert.equal(status.value.version, 4);
    h.engine.dispose();
});
