import test from 'node:test';
import assert from 'node:assert/strict';
import { speechSegments, chapterRequests, SAMPLE_RATE } from '../core/speech-segments.js';
import { speechTokens } from '../core/speech-text.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { SpeechEngine } from '../renderers/speech-engine.js';

const source = 'The hall is quiet.\nNina: "Hello." [curious]\nAshley: "Ready?"\nYou take a breath.\nNarrator: "The door opens."\nNina: "Go."';
function fixture(text = source, options = {}) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings.tts, { enabled: true, narratorEnabled: true, ...options });
    settings.characters = { narrator: { displayName: 'Storyteller', aliases: ['Story Voice'], voiceId: 'narrator-voice' },
        nina: { voiceId: 'nina-voice' }, ashley: { voiceId: 'ashley-voice' } };
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsePOV(text).tokens, registry, settings);
    const lines = speechSegments(timeline, registry, 'narrator-fixture', settings.tts);
    return { settings, registry, timeline, lines, plan: chapterRequests(lines, settings.tts) };
}

test('narration paragraphs clump across intervening dialogue in a separate request with original beat IDs', () => {
    const input = fixture(), { plan } = input;
    assert.deepEqual(plan.map(chapter => chapter.kind), ['narration', 'dialogue']);
    assert.deepEqual(plan.map(chapter => chapter.lines.length), [3, 3]);
    assert.deepEqual(plan.map(chapter => chapter.body.reference_id), [['narrator-voice'], ['nina-voice', 'ashley-voice']]);
    assert.deepEqual(plan.flatMap(chapter => chapter.lines).sort((a, b) => a.beat - b.beat), input.lines);
    assert.deepEqual(plan[0].lines.map(line => line.beat), [0, 3, 4]);
    assert.equal(plan[1].body.text, '<|speaker:0|>[curious] Hello.\n<|speaker:1|>Ready?\n<|speaker:0|>Go.');
    assert.equal(plan[0].body.text, '<|speaker:0|>The hall is quiet.\n<|speaker:0|>You take a breath.\n<|speaker:0|>The door opens.');
    assert.ok(plan.every(chapter => chapter.lines.every(line => (line.character === 'narrator') === (chapter.kind === 'narration'))));
    assert.ok(plan.every(chapter => !Object.hasOwn(chapter.body, 'kind')));
});

test('narrator isolation is mandatory even with chapter splitting off and identical voice IDs', () => {
    const input = fixture(source, { splitChapters: false });
    assert.deepEqual(input.plan.map(chapter => chapter.lines.length), [3, 3]);
    assert.equal(chapterRequests(input.lines, { ...input.settings.tts, splitChapters: true, chapterSize: 1 }).length, input.lines.length);
    const same = input.lines.map(line => ({ ...line, voice: 'shared-voice' }));
    const plan = chapterRequests(same, input.settings.tts);
    assert.deepEqual(plan.map(chapter => chapter.kind), ['narration', 'dialogue']);
    assert.ok(plan.every(chapter => chapter.lines.every(line => (line.character === 'narrator') === (chapter.kind === 'narration'))));
});

test('custom narrator aliases resolve to narrator-only requests while thoughts mute speakers and artifacts remain excluded', () => {
    const text = 'Story Voice: "A door opens."\nNina: "Hello."\nAshley: "(Stay quiet.)"\n<div>Hidden artifact words</div>\nStoryteller: "Footsteps."';
    const input = fixture(text);
    assert.deepEqual(input.lines.map(line => line.character), ['narrator', 'nina', 'narrator']);
    assert.deepEqual(input.plan.map(chapter => chapter.kind), ['narration', 'dialogue']);
    assert.equal(input.plan[0].body.reference_id[0], 'narrator-voice');
    assert.ok(!input.plan.some(chapter => /Stay quiet|Hidden artifact/.test(chapter.body.text)));
    assert.ok(!input.timeline.beats.some(beat => beat.state.characters.narrator));
    const muted = fixture(source, { narratorEnabled: false });
    assert.equal(muted.plan.length, 1); assert.equal(muted.plan[0].kind, 'dialogue');
    assert.ok(!muted.plan[0].body.reference_id.includes('narrator-voice'));
});

test('language boundaries and chapter limits operate independently inside each narrator or dialogue run', () => {
    const input = fixture('The hall is quiet.\nNarrator: "Ich bin hier."\nNina: "Wir gehen jetzt nach Hause."\nAshley: "Ich bin gleich bereit."\nThe door opens.\nNina: "Come here."', { splitChapters: false });
    assert.deepEqual(input.plan.map(chapter => [chapter.kind, chapter.language, chapter.lines.length]), [
        ['narration', 'en', 1], ['narration', 'de', 1], ['dialogue', 'de', 2], ['narration', 'en', 1], ['dialogue', 'en', 1],
    ]);
    const onlyNarrator = chapterRequests(input.lines.filter(line => line.character === 'narrator'), input.settings.tts);
    assert.ok(onlyNarrator.every(chapter => chapter.kind === 'narration' && chapter.speakers.length === 1));
});

test('ambiguous dialogue inherits dialogue language rather than the narrator language', () => {
    const english = fixture('Nina: "I am here."\nNarrator: "Ich bin hier."\nNina: "Ja!"');
    assert.deepEqual(english.lines.map(line => line.language), ['en', 'de', 'en']);
    assert.equal(english.lines.at(-1).synthesisText, 'Ya!');
    const german = fixture('Nina: "Ich bin hier."\nThe door opens.\nNina: "Ja!"');
    assert.deepEqual(german.lines.map(line => line.language), ['de', 'en', 'de']);
    assert.equal(german.lines.at(-1).synthesisText, 'Ja!');
});

test('parallel narrator requests keep independent alignment and chronological exports with cache reuse', async () => {
    const input = fixture(source, { chapterSize: 2 }), pending = new Map(), requests = [];
    input.settings.tts.parallelBatches = 4;
    const engine = new SpeechEngine({ request: async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true, maxParallelBatches: 5 });
        const request = JSON.parse(options.body), index = input.plan.findIndex(chapter => chapter.body.text === request.body.text);
        requests.push(request);
        return new Promise(resolve => pending.set(index, () => {
            const words = speechTokens(request.body.text).map((text, word) => ({ text, start: .05 + word * .08, end: .1 + word * .08 }));
            resolve(new Response(`data: ${JSON.stringify({ audio_base64: btoa(String(index)), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: words } })}\n\n`));
        }));
    } }, input.settings, { decode: async bytes => new Float32Array(SAMPLE_RATE * 2).fill((Number(new TextDecoder().decode(bytes)) + 1) / 10),
        process: async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(4410).fill((clip.line.beat + 1) / 20), notes: [] })) });
    try {
        engine.prepare('narrator-fixture', input.timeline, input.registry);
        const generation = engine.generate();
        for (let count = 0; count < 200 && pending.size < 4; count++) await new Promise(resolve => setTimeout(resolve, 2));
        assert.equal(pending.size, 4);
        pending.get(2)();
        for (let count = 0; count < 200 && !engine.job.chapters.length; count++) await new Promise(resolve => setTimeout(resolve, 2));
        await assert.rejects(engine.sourceSamples(), /earlier chapter/);
        assert.match(engine.sceneExportIssue(), /Wait for all narration and dialogue/);
        for (const index of [3, 1, 0]) pending.get(index)();
        const job = await generation;
        assert.equal(job.status, 'complete'); assert.equal(requests.length, 4);
        assert.deepEqual(job.chapters.map(chapter => chapter.kind), ['narration', 'dialogue', 'narration', 'dialogue']);
        assert.ok(job.chapters.every(chapter => chapter.clips.every(clip => !clip.review)));
        assert.ok(job.chapters.every(chapter => chapter.offsetSamples === null));
        const samples = await engine.sourceSamples();
        const ordered = job.chapters.flatMap(chapter => chapter.clips).sort((a, b) => a.line.beat - b.line.beat), expected = [.1, .2, .2, .1, .3, .4];
        let cursor = 0;
        for (const [index, clip] of ordered.entries()) {
            const length = Math.round(clip.end * SAMPLE_RATE) - Math.round(clip.start * SAMPLE_RATE);
            assert.ok(Math.abs(samples[cursor] - expected[index]) < 1e-6); cursor += length;
        }
        assert.equal(samples.length, cursor);
        const processed = await engine.sourceSamples(true); assert.equal(processed.length, 4410 * 6);
        for (let index = 0; index < 6; index++) assert.ok(Math.abs(processed[index * 4410] - (index + 1) / 20) < 1e-6);
        await engine.generate(); assert.equal(requests.length, 4);
    } finally { engine.dispose(); }
});

test('scene exports require reviewed cuts before interleaving a clumped narrator recording', async () => {
    const input = fixture();
    const engine = new SpeechEngine({ request: async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true, maxParallelBatches: 5 });
        const request = JSON.parse(options.body), tokens = speechTokens(request.body.text);
        if (request.body.reference_id.includes('narrator-voice')) tokens[0] = 'incorrect';
        const words = tokens.map((text, index) => ({ text, start: .1 + index * .1, end: .18 + index * .1 }));
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa('simulated'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: words } })}\n\n`);
    } }, input.settings, { decode: async () => new Float32Array(SAMPLE_RATE * 2),
        process: async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(4410), notes: [] })) });
    try {
        engine.prepare('narrator-fixture', input.timeline, input.registry); await engine.generate();
        assert.match(engine.sceneExportIssue(), /Review/);
        await assert.rejects(engine.sourceSamples(), /Review/); await assert.rejects(engine.sourceSamples(true), /Review/);
        assert.equal(engine.job.chapters[0].original.length, SAMPLE_RATE * 2);
        const line = input.lines.find(line => line.character === 'nina'); assert.ok((await engine.clipSamples(line.id, false)).length > 0);
    } finally { engine.dispose(); }
});
