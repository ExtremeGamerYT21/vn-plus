import test from 'node:test';
import assert from 'node:assert/strict';
import { speechSegments, chapterRequests } from '../core/speech-segments.js';
import { compileSpeechText, speechTokens } from '../core/speech-text.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { alignChapter } from '../core/speech-alignment.js';
import { SpeechEngine } from '../renderers/speech-engine.js';

function fixture(source, options = {}) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings, { playerName: 'Jason', playerAliases: ['You'], characters: {
        jason_weber: { displayName: 'Jason', aliases: ['Jason Weber'], voiceId: 'voice-jason' },
        henry: { displayName: 'Henry', aliases: ['Dad'], voiceId: 'voice-henry' },
        lyra: { displayName: 'Lyra', voiceId: 'voice-lyra' },
        narrator: { voiceId: 'voice-narrator' },
    } });
    Object.assign(settings.tts, { enabled: true, ...options });
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsePOV(source).tokens, registry, settings);
    const before = structuredClone(timeline), lines = speechSegments(timeline, registry, 'actions', settings.tts);
    assert.deepEqual(timeline, before);
    return { lines, settings, registry, timeline };
}

test('narrated vocalizations prefix the matching dialogue without changing its visible words', () => {
    for (const [narration, dialogue, expected] of [
        ['You *sigh*.', 'Jason', 'sighing'], ['I sigh.', 'Jason', 'sighing'],
        ['He *coughs*.', 'Henry', 'coughing'], ['She *laughs*.', 'Lyra', 'laughing'],
        ['Dad coughed.', 'Henry', 'coughing'], ['Jason Weber quietly sighed.', 'Jason', 'sighing'],
        ['jason_weber _sighs_.', 'Jason', 'sighing'],
        ['Henry was quietly coughing.', 'Dad', 'coughing'], ['Lyra giggles.', 'Lyra', 'chuckling'],
        ['Henry clears his throat.', 'Henry', 'clear throat'], ['You yawned.', 'Jason', 'yawning'],
        ['She is sobbing.', 'Lyra', 'sobbing'], ['He sneezes.', 'Henry', 'sneezing'],
        ['Lyra gasps.', 'Lyra', 'gasping'], ['Henry groans.', 'Henry', 'groaning'],
        ['Henry pants.', 'Henry', 'panting'], ['Henry snores.', 'Henry', 'snoring'],
    ]) {
        const { lines } = fixture(`${narration}\n\n${dialogue}: "Well, here we are." [calm]`);
        assert.equal(lines.length, 1, narration);
        assert.equal(lines[0].synthesisText, `[calm][${expected}] Well, here we are.`, narration);
        assert.equal(lines[0].text, 'Well, here we are.');
        assert.deepEqual(speechTokens(lines[0].synthesisText), speechTokens(lines[0].text));
    }
});

test('explicit vocal cues including variants and compound tags override inferred duplicates', () => {
    for (const tag of ['laugh', 'laughing', 'chuckle', 'chuckling', 'quietly laughing, amused']) {
        const { lines } = fixture(`Lyra laughs.\nLyra: "That is funny." [${tag}]`);
        assert.equal(lines[0].synthesisText, compileSpeechText('That is funny.', { direction: tag }).synthesisText);
    }
    for (const text of ['[cough] Hello.', 'Hello [coughing].', 'Hello. [cough]']) {
        assert.equal(compileSpeechText(text, { vocalCues: ['coughing'] }).synthesisText, compileSpeechText(text).synthesisText);
    }
    assert.equal(compileSpeechText('Hello.', { direction: 'laughing and coughing', vocalCues: ['laughing', 'coughing'] }).synthesisText, '[laughing and coughing] Hello.');
    assert.equal(compileSpeechText('Hello.', { direction: 'throat_clearing', vocalCues: ['clear throat'] }).synthesisText, '[clear throat] Hello.');
    const { lines } = fixture('Henry coughs. Henry coughs.\nHenry: "Hello."');
    assert.equal(lines[0].synthesisText, '[coughing] Hello.');
});

test('actor identity keeps separate sounds on their own speakers and applies each action only once', () => {
    const { lines } = fixture('Henry: "Before."\nYou sigh. Henry coughs.\nJason: "After."\nJason: "Another."');
    assert.deepEqual(lines.map(line => line.synthesisText), ['[coughing] Before.', '[sighing] After.', 'Another.']);
    const same = fixture('Dad: "Before."\nHenry coughs.\nHenry: "After."');
    assert.deepEqual(same.lines.map(line => line.synthesisText), ['Before.', '[coughing] After.']);
    assert.equal(fixture('Lyra: "Enough."\nShe laughs.').lines[0].synthesisText, '[laughing] Enough.');
});

test('ambiguous pronouns unknown actors quotations negations and hypothetical actions add no cues', () => {
    for (const narration of [
        'She does not laugh.', 'She never laughs.', 'She tries not to laugh.', 'She might laugh.',
        'She will laugh.', 'If she laughs, it will hurt.', 'If you ask, she laughs.',
        'She is laughed at.', 'She was coughed on.',
        'Imagine it: she laughs.', 'You remember: she laughed.',
        'She hears Henry cough.', 'Her laugh echoes.', 'A cough echoes.', 'The sign reads "She laughs."',
        'She says \'you cough\'.', 'Lyra and Henry laugh.', 'A stranger laughs.', 'Lyra remembers laughing.',
    ]) assert.equal(fixture(`${narration}\nLyra: "Hello."`).lines[0].synthesisText, 'Hello.', narration);
    const ambiguous = fixture('Henry: "Before."\nShe laughs.\nLyra: "After."');
    assert.deepEqual(ambiguous.lines.map(line => line.synthesisText), ['Before.', 'After.']);
    assert.equal(fixture('You sigh.\nHenry: "Hello."').lines[0].synthesisText, 'Hello.');
});

test('scene boundaries artifacts thoughts narrator fallback and narrator rules remain effective', () => {
    for (const barrier of ['#SCENE RESET', '#BACKGROUND elsewhere', '#EXIT Henry', '#FADE BLACK', '<div>Henry coughs.</div>']) {
        assert.equal(fixture(`Henry coughs.\n${barrier}\nHenry: "Hello."`).lines[0].synthesisText, 'Hello.', barrier);
    }
    assert.equal(fixture('Henry coughs.\n#SFX door\nHenry: "Hello."').lines[0].synthesisText, '[coughing] Hello.');
    const thought = fixture('Henry coughs.\nHenry: "(Keep quiet.)"\nHenry: "Hello."');
    assert.equal(thought.lines.length, 1); assert.equal(thought.lines[0].synthesisText, 'Hello.');
    const input = fixture('Henry coughs.\nHenry: "Hello."', { narratorEnabled: true });
    assert.deepEqual(input.lines.map(line => [line.character, line.synthesisText]), [['narrator', 'Henry coughs.'], ['henry', '[coughing] Hello.']]);
    input.settings.characters.henry.voiceId = '';
    const [fallback] = speechSegments(input.timeline, input.registry, 'fallback', input.settings.tts).filter(line => line.character === 'henry');
    assert.equal(fallback.voice, 'voice-narrator'); assert.equal(fallback.synthesisText, '[coughing] Hello.');
    assert.equal(fixture('Henry coughs.').lines.length, 0);
});

test('inferred cues preserve language batch mapping and original word timestamp alignment', () => {
    const { lines, settings } = fixture('Henry coughs.\nDad: "Ich bin hier." [serious]\nLyra laughs.\nLyra: "That is funny."');
    const plan = chapterRequests(lines, settings.tts);
    assert.deepEqual(plan.map(chapter => chapter.language), ['de', 'en']);
    assert.equal(plan[0].body.text, '<|speaker:0|>[serious][coughing] Ich bin hier.');
    assert.deepEqual(plan[0].body.reference_id, ['voice-henry']);
    assert.equal(plan[1].body.text, '<|speaker:0|>[laughing] That is funny.');
    const words = ['Ich', 'bin', 'hier'].map((text, index) => ({ text, start: .2 + index * .2, end: .35 + index * .2 }));
    const [clip] = alignChapter([lines[0]], words, 1);
    assert.equal(clip.review, false); assert.equal(clip.coverage, 1);
});

test('automatic generation submits inferred cues in the existing batch and reuses completed audio', async () => {
    const input = fixture('You *sigh*.\nJason: "Here we are."'), requests = [];
    const words = ['Here', 'we', 'are'].map((text, index) => ({ text, start: .1 + index * .2, end: .25 + index * .2 }));
    const engine = new SpeechEngine({ request: async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true, maxParallelBatches: 5 });
        requests.push(JSON.parse(options.body));
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa('simulated'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: words } })}\n\n`);
    } }, input.settings, { decode: async () => new Float32Array(44100), process: async () => [] });
    try {
        engine.prepare('narrated', input.timeline, input.registry);
        await engine.generate(); await engine.generate();
        assert.equal(requests.length, 1);
        assert.equal(requests[0].body.text, '<|speaker:0|>[sighing] Here we are.');
        assert.deepEqual(requests[0].body.reference_id, ['voice-jason']);
        assert.equal(engine.job.chapters[0].clips[0].review, false);
        assert.equal(engine.prepared.segments[0].text, 'Here we are.');
    } finally { engine.dispose(); }
});
