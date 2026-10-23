import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterRegistry } from '../core/character-registry.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { chapterRequests, speechSegments, speechSettings, SAMPLE_RATE } from '../core/speech-segments.js';
import { speechTokens } from '../core/speech-text.js';
import { DEFAULT_SETTINGS, loadSettings } from '../ui/settings.js';
import { SpeechEngine } from '../renderers/speech-engine.js';
import { validateRequest } from '../server/index.mjs';

const source = 'Jason: "Copper river."\nRon: "Silent lantern."\nHarry: "Velvet cloud."\nLyra: "Amber dawn."\nJason: "Silver field."';
function fixture(text = source) {
    const settings = structuredClone(DEFAULT_SETTINGS); Object.assign(settings.tts, { enabled: true, splitChapters: false, parallelBatches: 4 });
    settings.characters = { jason_weber: { aliases: ['Jason'], voiceId: 'voice-jason' }, ron_weasley: { aliases: ['Ron'], voiceId: 'voice-ron' },
        harry_potter: { aliases: ['Harry'], voiceId: 'voice-harry' }, lyra_malfoy: { aliases: ['Lyra'], voiceId: 'voice-lyra' }, narrator: { voiceId: 'voice-story' } };
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsePOV(text).tokens, registry, settings);
    const lines = speechSegments(timeline, registry, 'isolated', settings.tts);
    return { settings, registry, timeline, lines, plan: () => chapterRequests(lines, settings.tts) };
}
const until = async fn => { for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 2)); } throw new Error('Timeout'); };
const response = (request, code) => new Response(`data: ${JSON.stringify({ audio_base64: btoa(String(code)), chunk_seq: 0, chunk_audio_offset_sec: 0,
    alignment: { segments: speechTokens(request.body.text).map((text, index) => ({ text, start: .1 + index * .1, end: .18 + index * .1 })) } })}\n\n`);

test('voice isolation defaults on for saved settings and every recorded request has one reference matching each routed line', () => {
    assert.equal(loadSettings({ extensionSettings: {} }).tts.isolateVoices, true);
    assert.equal(speechSettings({ isolateVoices: false }).isolateVoices, false);
    const h = fixture(), plan = h.plan(); assert.equal(plan.length, 4);
    for (const chapter of plan) {
        assert.equal(chapter.body.reference_id.length, 1); assert.ok(!chapter.body.text.includes('speaker:1'));
        for (const [index, line] of chapter.lines.entries()) {
            const route = chapter.routing[index]; assert.equal(route.character, line.character); assert.equal(route.voice, line.voice);
            assert.equal(route.id, line.id); assert.equal(route.speaker, 0); assert.equal(chapter.body.reference_id[route.speaker], line.voice);
        }
        validateRequest({ model: h.settings.tts.model, body: chapter.body });
    }
    assert.deepEqual(plan[0].lines.map(line => line.character), ['jason_weber', 'jason_weber']);
    assert.deepEqual(plan.flatMap(chapter => chapter.lines).sort((a, b) => a.beat - b.beat), h.lines);
});

test('isolated voices retain narration separation joined utterances language boundaries and one reference for shared voices', () => {
    const h = fixture('Jason: "Come here," [angry]\nThe door opens.\nJason: "right now." [serious]\nRon: "Ich bin hier."\nHarry: "I understand."');
    h.settings.tts.narratorEnabled = true; h.settings.tts.chapterSize = 1; h.settings.tts.splitChapters = true;
    const lines = speechSegments(h.timeline, h.registry, 'joined-isolation', h.settings.tts), plan = chapterRequests(lines, h.settings.tts);
    const joined = plan.find(chapter => chapter.body.reference_id[0] === 'voice-jason');
    assert.equal(joined.body.text, '<|speaker:0|>[angry] Come here, [serious] right now.');
    assert.equal(joined.lines.length, 2); assert.equal(plan.find(chapter => chapter.language === 'de').body.reference_id[0], 'voice-ron');
    assert.equal(plan.find(chapter => chapter.kind === 'narration').body.reference_id[0], 'voice-story');
    const shared = fixture(); shared.lines.forEach(line => line.voice = 'shared');
    const chapter = shared.plan()[0]; assert.equal(shared.plan().length, 1); assert.deepEqual(chapter.body.reference_id, ['shared']);
    assert.equal(chapter.body.text.match(/<\|speaker:0\|>/g).length, 5); assert.equal(new Set(chapter.routing.map(route => route.character)).size, 4);
});

test('explicit multi-speaker mode preserves per-batch indices and rejects conflicting IDs instead of silently selecting the first', () => {
    const h = fixture(); h.settings.tts.isolateVoices = false;
    const [chapter] = h.plan(); assert.deepEqual(chapter.body.reference_id, ['voice-jason', 'voice-ron', 'voice-harry', 'voice-lyra']);
    assert.deepEqual(chapter.routing.map(route => route.speaker), [0, 1, 2, 3, 0]);
    h.lines.at(-1).voice = 'different-jason';
    for (const isolateVoices of [true, false]) assert.throws(() => chapterRequests(h.lines, { ...h.settings.tts, isolateVoices }), /Conflicting voice IDs/);
});

test('parallel isolated batches completing out of order keep every original and processed clip attached to its own voice', async () => {
    const h = fixture(), pending = new Map(), requests = [], codes = new Map(['voice-jason', 'voice-ron', 'voice-harry', 'voice-lyra'].map((id, i) => [id, (i + 1) / 10]));
    const engine = new SpeechEngine({ request: async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true, maxParallelBatches: 5 });
        const request = JSON.parse(options.body), voice = request.body.reference_id[0];
        assert.equal(request.body.reference_id.length, 1); requests.push(request);
        return new Promise(resolve => pending.set(voice, () => resolve(response(request, codes.get(voice)))));
    } }, h.settings, { decode: async bytes => new Float32Array(SAMPLE_RATE * 2).fill(Number(new TextDecoder().decode(bytes))),
        process: async chapter => chapter.clips.map(clip => ({ id: clip.id, samples: chapter.original.slice(Math.round(clip.start * SAMPLE_RATE), Math.round(clip.end * SAMPLE_RATE)), notes: [] })) });
    try {
        engine.prepare('isolated', h.timeline, h.registry); const generation = engine.generate(); await until(() => pending.size === 4);
        for (const voice of ['voice-ron', 'voice-lyra', 'voice-harry', 'voice-jason']) { pending.get(voice)(); await new Promise(resolve => setTimeout(resolve, 1)); }
        const job = await generation; assert.equal(job.status, 'complete', engine.status);
        assert.ok(job.chapters.every(chapter => chapter.clips.every(clip => !clip.review)));
        for (const line of h.lines) {
            for (const processed of [false, true]) assert.ok(Math.abs((await engine.clipSamples(line.id, processed))[0] - codes.get(line.voice)) < 1e-6);
        }
        const scene = await engine.sourceSamples(true); let offset = 0;
        for (const line of h.lines) { const clip = await engine.clipSamples(line.id); assert.ok(Math.abs(scene[offset] - codes.get(line.voice)) < 1e-6); offset += clip.length; }
        assert.equal(scene.length, offset); await engine.generate(); assert.equal(requests.length, 4);
    } finally { engine.dispose(); }
});

test('changing between isolated and multi-speaker plans cannot reuse a different routing job and switching back restores its own cache', async () => {
    const h = fixture(); let posts = 0;
    const engine = new SpeechEngine({ request: async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true, maxParallelBatches: 5 });
        posts++; return response(JSON.parse(options.body), .1);
    } }, h.settings, { decode: async () => new Float32Array(SAMPLE_RATE * 3), process: async chapter => chapter.clips.map(clip => ({ id: clip.id, samples: new Float32Array(100), notes: [] })) });
    try {
        engine.prepare('isolated', h.timeline, h.registry); const isolated = await engine.generate(); assert.equal(posts, 4);
        h.settings.tts.isolateVoices = false; engine.prepare('isolated', h.timeline, h.registry); assert.equal(engine.job, null);
        const mixed = await engine.generate(); assert.equal(posts, 5); assert.notEqual(mixed, isolated);
        h.settings.tts.isolateVoices = true; engine.prepare('isolated', h.timeline, h.registry); assert.equal(engine.job, isolated);
        await engine.generate(); assert.equal(posts, 5);
    } finally { engine.dispose(); }
});
