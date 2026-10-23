import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterRegistry } from '../core/character-registry.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { speechSegments, chapterRequests, SAMPLE_RATE } from '../core/speech-segments.js';
import { speechTokens } from '../core/speech-text.js';
import { SpeechEngine } from '../renderers/speech-engine.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

function fixture(text, { narratorEnabled = true, chapterSize = 6, characters = {} } = {}) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings.tts, { enabled: true, narratorEnabled, chapterSize, isolateVoices: false });
    settings.characters = { narrator: { voiceId: 'story-voice', aliases: ['Storyteller'] }, nina: { voiceId: 'nina-voice', aliases: ['Nina Weber'] },
        ashley: { voiceId: 'ashley-voice' }, ...characters };
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsePOV(text).tokens, registry, settings);
    const lines = speechSegments(timeline, registry, 'continuation', settings.tts);
    return { settings, registry, timeline, lines, plan: chapterRequests(lines, settings.tts) };
}
const source = 'Nina: "If you open that door," [angry]\nShe points at the handle.\nNina Weber: "you will regret it." [serious]\nShe lowers her hand.\nNina: "Trust me!" [scared]';

test('comma and full-stop dialogue across narration form one utterance with one speaker marker and intact emotion directions', () => {
    for (const narratorEnabled of [true, false]) {
        const h = fixture(source, { narratorEnabled });
        const dialogue = h.plan.find(chapter => chapter.kind === 'dialogue');
        assert.equal(dialogue.body.text, '<|speaker:0|>[angry] If you open that door, [serious] you will regret it. [scared] Trust me!');
        assert.deepEqual(dialogue.body.reference_id, ['nina-voice']);
        assert.deepEqual(dialogue.lines.map(line => line.beat), [0, 2, 4]);
        assert.deepEqual(dialogue.lines.slice(1).map(line => line.continuationOf), dialogue.lines.slice(0, -1).map(line => line.id));
        assert.deepEqual(dialogue.lines.map(line => line.text), ['If you open that door,', 'you will regret it.', 'Trust me!']);
        assert.equal(h.plan.filter(chapter => chapter.kind === 'narration').length, Number(narratorEnabled));
        assert.ok(!dialogue.body.text.includes('handle')); assert.ok(!dialogue.body.text.includes('hand'));
        assert.equal(parsePOV(source).tokens.filter(token => token.type === 'dialogue')[0].text.trim(), '"If you open that door,"');
    }
});

test('joined utterances survive chapter-size boundaries while standalone dialogue keeps its own chapter limit', () => {
    const h = fixture(source + '\nAshley: "Ready?"\nNina: "Go."', { chapterSize: 1 });
    assert.deepEqual(h.plan.filter(chapter => chapter.kind === 'dialogue').map(chapter => chapter.lines.length), [3, 1, 1]);
    assert.deepEqual(h.plan.filter(chapter => chapter.kind === 'narration').map(chapter => chapter.lines.length), [1, 1]);
    assert.equal(h.plan[0].body.text.match(/<\|speaker:/g).length, 1);
    const shifted = fixture('Ashley: "Listen."\n' + source, { chapterSize: 2 }).plan.find(chapter => chapter.kind === 'dialogue');
    assert.equal(shifted.lines.length, 4);
    assert.equal(shifted.body.text, '<|speaker:0|>Listen.\n<|speaker:1|>[angry] If you open that door, [serious] you will regret it. [scared] Trust me!');
    const separate = fixture('Nina: "Hello."\nNina: "Goodbye."', { chapterSize: 1 });
    assert.equal(separate.plan.length, 2);
});

test('unvoiced dialogue thoughts scene changes and artifacts block joins even when excluded from the synthesis track', () => {
    for (const interruption of ['Ashley: "Wait."', 'Silent: "Wait."', 'Nina: "(I should stop.)"', '<div>Look at this</div>', '#BACKGROUND Library',
        '#SCENE RESET', '[3 August 1991 | Before First Year | 12:26 p.m. | Summer | Diagon Alley]']) {
        const h = fixture(`Nina: "Hello."\nThe door opens.\n${interruption}\nNina: "Goodbye."`, { characters: { silent: { voiceId: '' }, narrator: { voiceId: '' } } });
        const nina = h.lines.filter(line => line.character === 'nina');
        assert.equal(nina[1].continuationOf, undefined, interruption);
        assert.match(h.plan.find(chapter => chapter.kind === 'dialogue').body.text, /\n<\|speaker:0\|>Goodbye\./, interruption);
    }
});

test('canonical character identity and language determine joins independently of shared voice IDs and narrator aliases', () => {
    const fallback = fixture('Nina: "Hello."\nA clock ticks.\nAshley: "Goodbye."', { characters: { nina: { voiceId: '' }, ashley: { voiceId: '' } } });
    const dialogue = fallback.plan.find(chapter => chapter.kind === 'dialogue');
    assert.deepEqual(dialogue.body.reference_id, ['story-voice']);
    assert.equal(dialogue.body.text, '<|speaker:0|>Hello.\n<|speaker:0|>Goodbye.');
    assert.ok(dialogue.lines.every(line => !line.continuationOf));
    const aliases = fixture('Nina: "Hello."\nStoryteller: "The clock ticks."\nNina Weber: "Goodbye."');
    assert.equal(aliases.plan.find(chapter => chapter.kind === 'dialogue').body.text, '<|speaker:0|>Hello. Goodbye.');
    const languages = fixture('Nina: "I am here."\nA clock ticks.\nNina: "Ich bin hier."');
    assert.deepEqual(languages.plan.filter(chapter => chapter.kind === 'dialogue').map(chapter => chapter.language), ['en', 'de']);
    assert.ok(languages.lines.every(line => !line.continuationOf));
});

test('deselecting a fragment does not join across omitted dialogue or mutate the preserved original lines', () => {
    const h = fixture(source), before = structuredClone(h.lines);
    const dialogue = h.lines.filter(line => line.character !== 'narrator');
    const selected = h.lines.filter(line => line.id !== dialogue[1].id);
    const chapter = chapterRequests(selected, h.settings.tts).find(chapter => chapter.kind === 'dialogue');
    assert.equal(chapter.body.text, '<|speaker:0|>[angry] If you open that door,\n<|speaker:0|>[scared] Trust me!');
    assert.deepEqual(h.lines, before);
    const original = chapterRequests(h.lines, h.settings.tts).find(chapter => chapter.kind === 'dialogue');
    assert.equal(original.body.text.match(/<\|speaker:/g).length, 1);
});

test('a joined Fish recording still aligns each original beat and exports character narration character in story order', async () => {
    const h = fixture(source, { chapterSize: 1 }), requests = [];
    const engine = new SpeechEngine({ request: async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true, maxParallelBatches: 5 });
        const request = JSON.parse(options.body); requests.push(request);
        const words = speechTokens(request.body.text).map((text, index) => ({ text, start: .1 + index * .1, end: .18 + index * .1 }));
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa('fixture'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: words } })}\n\n`);
    } }, h.settings, { decode: async () => new Float32Array(SAMPLE_RATE * 3),
        process: async chapter => chapter.clips.map(clip => ({ id: clip.id, samples: new Float32Array(100).fill((clip.line.beat + 1) / 10), notes: [] })) });
    try {
        engine.prepare('continuation', h.timeline, h.registry);
        const job = await engine.generate(), dialogue = job.chapters.find(chapter => chapter.kind === 'dialogue');
        assert.equal(job.status, 'complete', engine.status);
        assert.equal(requests.length, 3); assert.equal(dialogue.clips.length, 3);
        assert.ok(job.chapters.every(chapter => chapter.clips.every(clip => !clip.review)));
        assert.deepEqual(dialogue.clips.map(clip => clip.line.id), ['continuation:0', 'continuation:2', 'continuation:4']);
        assert.ok(dialogue.clips[0].speechEnd <= dialogue.clips[1].speechStart);
        assert.ok(dialogue.clips[1].speechEnd <= dialogue.clips[2].speechStart);
        const samples = await engine.sourceSamples(true);
        assert.equal(samples.length, 500);
        for (let beat = 0; beat < 5; beat++) assert.ok(Math.abs(samples[beat * 100] - (beat + 1) / 10) < 1e-6);
        await engine.generate(); assert.equal(requests.length, 3);
    } finally { engine.dispose(); }
});
