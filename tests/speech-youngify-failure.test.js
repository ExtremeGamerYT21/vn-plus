import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechEngine } from '../renderers/speech-engine.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { SAMPLE_RATE } from '../core/speech-segments.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
    for (let index = 0; index < 100; index++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 2)); }
    throw new Error('Test readiness timeout');
}
function fixture() {
    const settings = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings.tts, { enabled: true, narratorEnabled: true, autoGenerate: true, chapterSize: 6, isolateVoices: false });
    settings.characters = { narrator: { voiceId: 'story' }, jason: { voiceId: 'jason' }, daphne: { voiceId: 'daphne', ttsYoungify: true } };
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsePOV('The door opens.\nJason: "Good morning."\nDaphne: "Hello there."').tokens, registry, settings);
    let requests = 0, effects = 0, mode = 'missing', release;
    const audio = () => ({ paused: true, currentTime: 0, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} });
    const engine = new SpeechEngine({ request: async (url, options) => {
        if (url.endsWith('/praat/youngify')) {
            effects++;
            if (mode === 'delayed') await new Promise(resolve => release = resolve);
            if (mode !== 'ready') return new Response('Not found', { status: 404 });
            const pcm = Buffer.from(JSON.parse(options.body).pcm, 'base64');
            for (let offset = 0; offset < pcm.length; offset += 4) pcm.writeFloatLE(pcm.readFloatLE(offset) * 1.5, offset);
            return new Response(pcm, { headers: { 'X-VN-Praat-Note': 'Adjusted' } });
        }
        if (url.endsWith('/status')) return Response.json({ configured: true, maxParallelBatches: 5 });
        requests++; const body = JSON.parse(options.body).body;
        const narration = body.reference_id[0] === 'story', text = narration ? 'The door opens.' : 'Good morning. Hello there.';
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa(narration ? 'narration' : 'dialogue'), chunk_seq: 0, chunk_audio_offset_sec: 0,
            alignment: { segments: text.split(' ').map((text, index) => ({ text, start: .1 + index * .2, end: .25 + index * .2 })) } })}\n\n`);
    } }, settings, { audioFactory: audio,
        decode: async bytes => new Float32Array(SAMPLE_RATE * 2).fill(new TextDecoder().decode(bytes) === 'narration' ? .1 : .2),
        process: async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id,
            samples: chapter.original.slice(Math.round(clip.start * SAMPLE_RATE), Math.round(clip.end * SAMPLE_RATE)), notes: [] })),
    });
    engine.prepare('regression', timeline, registry);
    return { engine, settings, registry, timeline, set mode(value) { mode = value; }, release: () => release(),
        get requests() { return requests; }, get effects() { return effects; } };
}
test('a missing Praat route cannot silence Jason or Daphne while narration still works', async () => {
    const h = fixture(), { engine } = h;
    try {
        await engine.generate(); assert.equal(h.requests, 2); assert.equal(h.effects, 1);
        for (const line of engine.prepared.segments) {
            assert.equal(engine.lineStatus(line.beat).state, 'ready');
            const playback = engine.playBeat(line.beat); await until(() => playback.status !== 'loading');
            assert.equal(playback.status, 'playing'); assert.equal(playback.audio.paused, false);
        }
        const chapter = engine.clip('regression:1').chapter;
        assert.equal(chapter.processingError, null);
        assert.ok(!chapter.processed.results.get('regression:1').youngifyError);
        assert.match(chapter.processed.results.get('regression:2').youngifyError, /restart SillyTavern/);
        assert.deepEqual(await engine.clipSamples('regression:2'), await engine.clipSamples('regression:2', false));
        assert.match(engine.status, /unmodified voices/);
        engine.requestAutomatic(); await engine.running;
        for (let index = 0; index < 3; index++) await engine.clipSamples('regression:2');
        assert.equal(h.effects, 1); assert.equal(h.requests, 2);
        h.mode = 'ready'; await engine.generate();
        assert.equal(h.requests, 2); assert.equal(h.effects, 2);
        assert.ok(Math.abs((await engine.clipSamples('regression:2'))[0] - .3) < 1e-6);
        assert.ok(!chapter.processed.results.get('regression:2').youngifyError);
    } finally { engine.dispose(); }
});
test('an unaffected line plays immediately while another character effect is still running', async () => {
    const h = fixture(), { engine } = h; h.mode = 'delayed'; let generation;
    try {
        generation = engine.generate(); await until(() => h.effects === 1);
        assert.equal(engine.lineStatus(1).state, 'ready'); assert.equal(engine.lineStatus(2).state, 'generating');
        const playback = engine.playBeat(1); await until(() => playback.status !== 'loading');
        assert.equal(playback.status, 'playing'); assert.equal(h.effects, 1);
        assert.equal(engine.job.chapters.find(chapter => chapter.kind === 'dialogue').processed.complete, false);
        h.release(); await generation; await turn();
        assert.equal(engine.lineStatus(2).state, 'ready');
    } finally { if (h.effects) h.release(); await generation; engine.dispose(); }
});
test('invalid effect output falls back per clip but cancellation and finishing errors remain failures', async () => {
    const h = fixture(), { engine } = h;
    try {
        for (const samples of [new Float32Array(1), new Float32Array([NaN, NaN])]) {
            engine.youngify = async () => ({ samples, notes: [] });
            const input = { id: 'test', samples: new Float32Array([.1, .2]), notes: [] };
            const result = await engine.adjustVoice(input, { pitchSemitones: 4 }, h.settings.tts);
            assert.deepEqual(result.samples, input.samples); assert.ok(result.youngifyError);
        }
        const abort = new AbortController(); abort.abort();
        await assert.rejects(engine.adjustVoice({ samples: new Float32Array(10) }, {}, h.settings.tts, abort.signal), { name: 'AbortError' });
        engine.process = async () => { throw new Error('Worker failed'); };
        const chapter = { original: new Float32Array(10), clips: [], words: [] };
        await assert.rejects(engine.ensureProcessed(chapter, undefined, 'missing'), /Worker failed/);
        assert.match(chapter.processingError, /Worker failed/);
    } finally { engine.dispose(); }
});
