import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { youngifySettings, YOUNGIFY_DEFAULTS } from '../core/speech-youngify.js';
import { speechSegments, SAMPLE_RATE } from '../core/speech-segments.js';
import { youngifyClip } from '../renderers/praat-voice.js';
import { SpeechEngine } from '../renderers/speech-engine.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { registerPraat, validatePraatRequest, runPraat } from '../server/praat.mjs';

function fixture() {
    const settings = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings.tts, { enabled: true, autoGenerate: true, narratorEnabled: true, isolateVoices: false });
    settings.characters = { narrator: { voiceId: 'story' }, jason_weber: { aliases: ['Jason'], ttsYoungify: true }, nina: { voiceId: 'nina' } };
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsePOV('The hall is quiet.\nJason: "Hello there."\nNina: "Good morning."').tokens, registry, settings);
    return { settings, registry, timeline };
}
test('youngify defaults, opt-out and bounded options validate without mutating properties', () => {
    assert.deepEqual(youngifySettings(true), YOUNGIFY_DEFAULTS);
    for (const input of [undefined, null, false, { enabled: false, pitchSemitones: 99 }]) assert.equal(youngifySettings(input), null);
    const input = { enabled: true, pitchSemitones: 6, formantRatio: 1.2 }; const before = structuredClone(input);
    assert.deepEqual(youngifySettings(input), { pitchSemitones: 6, formantRatio: 1.2, pitchRange: 1 }); assert.deepEqual(input, before);
    for (const input of ['yes', [], 4, { enabled: 'yes' }, { pitchSemitones: -1 }, { formantRatio: 8 }, { pitchRange: NaN }]) assert.throws(() => youngifySettings(input), /ttsYoungify/);
});
test('aliases and narrator fallback retain actor effects; each character opts in independently', () => {
    const h = fixture(), lines = speechSegments(h.timeline, h.registry, 'test', h.settings.tts);
    assert.deepEqual(lines.map(line => [line.character, !!line.youngify]), [['narrator', false], ['jason_weber', true], ['nina', false]]);
    assert.equal(lines[1].voiceCharacter, 'narrator'); assert.equal(lines[1].voice, 'story');
    h.settings.characters.narrator.ttsYoungify = { pitchSemitones: 2 };
    assert.equal(speechSegments(h.timeline, h.registry, 'test', h.settings.tts)[0].youngify.pitchSemitones, 2);
    h.settings.characters.jason_weber.ttsYoungify = { formantRatio: 'wrong' };
    assert.throws(() => speechSegments(h.timeline, h.registry, 'test', h.settings.tts), /Jason: Invalid ttsYoungify/);
});
test('binary client transport preserves samples and rejects duration changes and non-finite output', async () => {
    const input = new Float32Array([.1, -.2, .3]);
    const result = await youngifyClip(async (url, options) => {
        assert.equal(url, 'praat/youngify'); const body = JSON.parse(options.body);
        const validated = validatePraatRequest(body); assert.deepEqual(validated.settings, YOUNGIFY_DEFAULTS);
        assert.equal(validated.input.readFloatLE(4), input[1]);
        return new Response(validated.input, { headers: { 'X-VN-Praat-Note': 'Adjusted' } });
    }, input, YOUNGIFY_DEFAULTS);
    assert.deepEqual(result.samples, input); assert.deepEqual(result.notes, ['Adjusted']);
    await assert.rejects(youngifyClip(async () => new Response(new Uint8Array(4)), input, YOUNGIFY_DEFAULTS), /duration/);
    await assert.rejects(youngifyClip(async () => new Response(new Float32Array([NaN, 0, 0])), input, YOUNGIFY_DEFAULTS), /invalid audio/);
});
test('local effects cache by actor and options, preserve originals and never regenerate Fish', async () => {
    const h = fixture(); let fish = 0, effects = 0, finishing = 0;
    const engine = new SpeechEngine({ request: async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true, maxParallelBatches: 5 });
        fish++; const body = JSON.parse(options.body).body; assert.ok(!JSON.stringify(body).includes('youngify'));
        const text = body.text.includes('hall') ? 'The hall is quiet.' : 'Hello there. Good morning.';
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa('fake'), chunk_seq: 0, chunk_audio_offset_sec: 0,
            alignment: { segments: text.split(' ').map((word, index) => ({ text: word, start: .1 + index * .2, end: .25 + index * .2 })) } })}\n\n`);
    } }, h.settings, {
        decode: async () => new Float32Array(SAMPLE_RATE * 2).fill(.1),
        process: async chapter => { finishing++; return chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id,
            samples: chapter.original.slice(Math.round(clip.start * SAMPLE_RATE), Math.round(clip.end * SAMPLE_RATE)), notes: [] })); },
        youngify: async (samples, options) => { effects++; return { samples: samples.map(value => value * options.pitchSemitones / 2), notes: ['Praat test'] }; },
    });
    try {
        engine.prepare('cache', h.timeline, h.registry); await engine.generate();
        assert.equal(fish, 2); assert.equal(effects, 1);
        const id = engine.prepared.segments.find(line => line.character === 'jason_weber').id;
        const original = await engine.clipSamples(id, false), first = await engine.clipSamples(id);
        assert.ok(first.length); assert.equal(first.length, original.length); assert.ok(Math.abs(first[0] - .2) < 1e-6);
        const source = engine.job, signature = engine.prepared.signature;
        h.settings.characters.jason_weber.ttsYoungify = { pitchSemitones: 6 };
        engine.prepare('cache', h.timeline, h.registry); assert.equal(engine.job, source); assert.equal(engine.prepared.signature, signature);
        assert.equal(engine.lineStatus(1).state, 'generating');
        await engine.generate(); const second = await engine.clipSamples(id);
        assert.ok(Math.abs(second[0] - .3) < 1e-6); assert.equal(fish, 2); assert.equal(effects, 2);
        const finished = finishing; await engine.generate(); assert.equal(finishing, finished); assert.equal(effects, 2);
        h.settings.characters.jason_weber.ttsYoungify = false;
        engine.prepare('cache', h.timeline, h.registry); await engine.generate();
        assert.deepEqual(await engine.clipSamples(id), original); assert.equal(fish, 2);
        assert.deepEqual(await engine.clipSamples(id, false), original);
    } finally { engine.dispose(); }
});
test('Praat failure keeps original available and rejects stale/cancelled processing', async () => {
    const h = fixture(), engine = new SpeechEngine({}, h.settings, { process: async () => [{ id: 'error:1', samples: new Float32Array(10), notes: [] }],
        youngify: async () => { throw new Error('Praat unavailable'); } });
    engine.prepare('error', h.timeline, h.registry);
    const chapter = { original: new Float32Array(10), clips: [{ id: 'error:1', line: engine.prepared.segments[1], start: 0, end: 10 / SAMPLE_RATE }], words: [] };
    engine.job = { chapters: [chapter], status: 'complete' };
    try {
        assert.equal((await engine.clipSamples('error:1')).length, 10);
        assert.equal(engine.lineStatus(1).state, 'ready'); assert.equal((await engine.clipSamples('error:1', false)).length, 10);
        const result = chapter.processed.results.get('error:1'); assert.match(result.youngifyError, /Praat unavailable/);
        assert.match(result.notes.join(' '), /unmodified voice/); assert.ok(!chapter.processingError);
        h.settings.characters.jason_weber.ttsYoungify = false;
        engine.prepared.segments = speechSegments(h.timeline, h.registry, 'error', h.settings.tts);
        assert.equal(engine.lineStatus(1).state, 'generating'); await engine.ensureProcessed(chapter); assert.equal(engine.lineStatus(1).state, 'ready');
        chapter.processed = null; const abort = new AbortController(); abort.abort();
        await assert.rejects(engine.ensureProcessed(chapter, abort.signal), { name: 'AbortError' }); assert.equal(chapter.processed, null);
    } finally { engine.dispose(); }
});
test('Praat input validation rejects malformed, excessive and non-finite audio', () => {
    const valid = { sampleRate: SAMPLE_RATE, settings: true, pcm: Buffer.from(new Float32Array([.1]).buffer).toString('base64') };
    assert.equal(validatePraatRequest(valid).input.length, 4);
    for (const changes of [{ settings: false }, { settings: { pitchSemitones: 999 } }, { sampleRate: 22050 }, { pcm: '!!!!' }, { pcm: '====' }, { pcm: 'AAAA' },
        { pcm: Buffer.from(new Float32Array([NaN]).buffer).toString('base64') }, { pcm: Buffer.from(new Float32Array([5]).buffer).toString('base64') }]) assert.throws(() => validatePraatRequest({ ...valid, ...changes }));
});
test('bridge requires an authenticated user, bounds CPU work and cancels queued requests', async () => {
    const routes = new Map(), router = { get: (url, fn) => routes.set(url, fn), post: (url, fn) => routes.set(url, fn) };
    const pending = []; let maximum = 0, active = 0;
    registerPraat(router, async (input, settings, signal) => {
        if (!input) return { available: true, version: 'test' };
        active++; maximum = Math.max(maximum, active);
        return new Promise((resolve, reject) => {
            const done = () => { active--; resolve({ samples: input, note: 'Adjusted' }); };
            signal.addEventListener('abort', () => { active--; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
            pending.push(done);
        });
    });
    const request = () => Object.assign(new EventEmitter(), { user: { directories: {} }, body: { sampleRate: SAMPLE_RATE, settings: true, pcm: Buffer.alloc(4).toString('base64') } });
    const response = () => Object.assign(new EventEmitter(), { statusCode: 200, sendStatus(code) { this.statusCode = code; }, status(code) { this.statusCode = code; return this; },
        set(value) { this.headers = value; return this; }, json(value) { this.value = value; return this; }, send(value) { this.value = value; return this; } });
    const denied = response(); await routes.get('/praat/status')({}, denied); assert.equal(denied.statusCode, 401);
    const status = response(); await routes.get('/praat/status')(request(), status); assert.equal(status.value.available, true);
    const requests = Array.from({ length: 4 }, request), responses = requests.map(response);
    const jobs = requests.map((req, index) => routes.get('/praat/youngify')(req, responses[index]));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(pending.length, 2);
    requests[2].emit('aborted'); pending[0](); await new Promise(resolve => setImmediate(resolve)); assert.equal(pending.length, 3);
    pending[1](); pending[2](); await Promise.all(jobs); assert.equal(maximum, 2);
    assert.equal(responses[3].value.length, 4); assert.equal(responses[3].headers['Cache-Control'], 'no-store');
    const deniedPost = response(); await routes.get('/praat/youngify')({}, deniedPost); assert.equal(deniedPost.statusCode, 401);
});
test('missing optional Python has an actionable error without exposing executable paths', async () => {
    await assert.rejects(runPraat(null, null, null, 'vnplus-python-that-does-not-exist'), error => error.status === 503 && /install-praat.js/.test(error.message) && !/ENOENT/.test(error.message));
});
test('local processing has two CPU slots across all chapters and drops aborted queued clips', async () => {
    let active = 0, maximum = 0; const releases = [];
    const engine = new SpeechEngine({}, {}, { youngify: async samples => {
        active++; maximum = Math.max(maximum, active);
        return new Promise(resolve => releases.push(() => { active--; resolve({ samples, notes: [] }); }));
    } });
    const abort = new AbortController(), samples = new Float32Array(10);
    const jobs = Array.from({ length: 6 }, (_, index) => engine.processVoice(samples, YOUNGIFY_DEFAULTS, index === 2 ? abort.signal : undefined));
    const cancelled = assert.rejects(jobs[2], { name: 'AbortError' });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(releases.length, 2); abort.abort();
    for (let index = 0; index < 5; index++) { releases[index](); await new Promise(resolve => setImmediate(resolve)); }
    await Promise.all([cancelled, ...jobs.filter((_, index) => index !== 2)]);
    assert.equal(maximum, 2); assert.equal(engine.effectQueue.length, 0); assert.equal(engine.activeEffects, 0); engine.dispose();
});
