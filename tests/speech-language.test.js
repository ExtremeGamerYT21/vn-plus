import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSpeechLanguage, speechLanguageCode } from '../core/speech-language.js';
import { speechSegments, chapterRequests, SAMPLE_RATE } from '../core/speech-segments.js';
import { speechTokens } from '../core/speech-text.js';
import { alignChapter } from '../core/speech-alignment.js';
import { speechRevealCues } from '../core/speech-reveal.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { SpeechEngine } from '../renderers/speech-engine.js';

function fixture(source, characters = { henry: { voiceId: 'henry-voice', aliases: ['Dad'] }, jason: { voiceId: 'jason-voice' } }) {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.characters = characters; settings.tts.enabled = true; settings.tts.isolateVoices = false;
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsePOV(source).tokens, registry, settings);
    return { settings, registry, timeline, lines: speechSegments(timeline, registry, 'language-fixture', settings.tts) };
}
const source = 'Henry: "Do it as I say, ja?" [serious]\nHenry: "Ja, wir gehen jetzt nach Hause." [hurried]\nDad: "Du musst mir jetzt zuhören." [angry]\nJason: "I understand, Dad."';

test('whole German sentences beat shared English words without requiring umlauts', () => {
    for (const text of ['Ich bin hier.', 'Wir gehen in den Park.', 'Die Kinder sind in der Schule.', 'Das ist so gut.', 'Du musst mir jetzt zuhören.', 'Es tut mir leid.', 'Ich liebe dich.', 'Guten Tag.', 'Gute Nacht!', 'Ja, das stimmt.', 'Ja, genau.', 'Henry, wir müssen jetzt nach Hause gehen.', 'Nein, danke.', 'Sehr schön!', 'Komm her.', 'Also, ich bin hier, ja.', 'Du musst an mich denken.', 'Verstehst du?']) {
        assert.equal(detectSpeechLanguage(text), 'de', text);
    }
});

test('English and mixed English lines stay together despite German interjections or foreign text', () => {
    for (const text of ['Do it as I say, ja?', 'Come here, mein Sohn.', 'Ja, I understand.', 'Ach so, that makes sense.', 'Hello. Ich bin hier.', 'Please say ありがとう.', 'The word Nein means no.', "I'm going home.", 'Jason Weber, listen to me.', 'We will meet in the park.', 'She is very kind.', 'The die is on the table.']) {
        assert.equal(detectSpeechLanguage(text), 'en', text);
    }
});

test('other recognizable languages and writing systems form distinct local language groups', () => {
    for (const [language, text] of [['fr', 'Je suis ici.'], ['fr', 'Nous allons à la maison.'], ['es', 'No quiero ir a casa.'], ['es', '¿Dónde está mi libro?'], ['pt', 'Eu não quero ir para casa.'], ['pt', 'Você está muito bem.'], ['it', 'Non voglio andare a casa.'], ['nl', 'Ik wil nu naar huis.'], ['pl', 'Nie chcę teraz iść do domu.'], ['ru', 'Я хочу идти домой.'], ['uk', 'Я хочу йти додому, дякую.'], ['ja', '東京へ行きましょう。'], ['zh', '我们现在回家。'], ['ko', '지금 집에 갑시다.'], ['ar', 'دعنا نذهب إلى المنزل.'], ['el', 'Πάμε σπίτι τώρα.']]) {
        assert.equal(detectSpeechLanguage(text), language, text);
    }
});

test('names emotion cues numbers and ambiguous shared words do not invent a language', () => {
    for (const text of ['Jason Weber!', '[angry, serious, quickly] Jason Weber!', '123...', 'Ja!', 'Ach so!', 'No.', 'Die.', 'So.', '...']) assert.equal(detectSpeechLanguage(text), null, text);
    assert.equal(detectSpeechLanguage('[please be very quiet] Ich bin hier.'), 'de');
    assert.equal(speechLanguageCode('de-DE'), 'de'); assert.equal(speechLanguageCode('pt_BR'), 'pt');
    for (const value of ['auto', 'und', '[German]', {}, 'de\nignore']) assert.equal(speechLanguageCode(value), null);
});

test('language boundaries split requests and consecutive German speakers share fresh voice indices', () => {
    const input = fixture(source), before = structuredClone(input.timeline);
    assert.deepEqual(input.lines.map(line => line.language), ['en', 'de', 'de', 'en']);
    assert.equal(input.lines[0].synthesisText, '[serious] Do it as I say, ya?');
    assert.equal(input.lines[1].synthesisText, '[in a hurry tone] Ja, wir gehen jetzt nach Hause.');
    const plan = chapterRequests(input.lines, input.settings.tts);
    assert.deepEqual(plan.map(chapter => chapter.language), ['en', 'de', 'en']);
    assert.deepEqual(plan.map(chapter => chapter.lines.map(line => line.beat)), [[0], [1, 2], [3]]);
    assert.deepEqual(plan.map(chapter => chapter.body.reference_id), [['henry-voice'], ['henry-voice'], ['jason-voice']]);
    assert.ok(!plan[1].body.text.includes('Ya')); assert.ok(!Object.hasOwn(plan[1].body, 'language'));
    assert.deepEqual(input.timeline, before);
    const twoVoices = fixture('Henry: "Ich bin hier."\nJason: "Wir gehen jetzt."');
    assert.deepEqual(chapterRequests(twoVoices.lines, twoVoices.settings.tts)[0].body.reference_id, ['henry-voice', 'jason-voice']);
});

test('short replies inherit nearby language while character hints disambiguate without forcing English prose into German', () => {
    const input = fixture('Henry: "Ja!"\nHenry: "Ich bin hier."\nJason: "Ja."\nJason: "I understand."\nHenry: "Ja."');
    assert.deepEqual(input.lines.map(line => line.language), ['de', 'de', 'de', 'en', 'en']);
    assert.equal(input.lines[0].synthesisText, 'Ja!'); assert.equal(input.lines.at(-1).synthesisText, 'Ya.');
    const hinted = fixture('Henry: "Ja!"\nHenry: "Please come here."\nJason: "Ja, ich bin hier."', { henry: { voiceId: 'h', ttsLanguage: 'de-DE' }, jason: { voiceId: 'j', ttsLanguage: 'en-GB' } });
    assert.deepEqual(hinted.lines.map(line => line.language), ['de', 'en', 'de']);
    assert.equal(hinted.lines[0].synthesisText, 'Ja!'); assert.equal(hinted.lines[2].synthesisText, 'Ja, ich bin hier.');
    const unknown = fixture('Henry: "Olen täällä kotona."', { henry: { voiceId: 'h', ttsLanguage: 'fi-FI' } });
    assert.equal(unknown.lines[0].language, 'fi');
});

test('language isolation survives splitting disabled and chunk limits without reordering or mutating segments', () => {
    const input = fixture(source), before = structuredClone(input.lines);
    const unsplit = chapterRequests(input.lines, { ...input.settings.tts, splitChapters: false });
    assert.deepEqual(unsplit.map(chapter => chapter.language), ['en', 'de', 'en']);
    assert.equal(chapterRequests(input.lines, { ...input.settings.tts, chapterSize: 1 }).length, 4);
    const selected = chapterRequests(input.lines.filter(line => line.language === 'de'), { ...input.settings.tts, chapterSize: 2 });
    assert.equal(selected.length, 1); assert.deepEqual(selected[0].lines.map(line => line.id), [input.lines[1].id, input.lines[2].id]);
    assert.deepEqual(input.lines, before);
});

test('mute thoughts and narration stay ineligible and em-dash handoffs survive language boundaries', () => {
    const input = fixture('Henry: "Wait—"\nJason: "Ich bin hier."\nHenry: "(Ich bin müde.)"\nMute: "Je suis ici."\nA quiet room.');
    assert.equal(input.lines.length, 2); assert.deepEqual(input.lines.map(line => line.language), ['en', 'de']);
    assert.equal(input.lines[0].cutOff, true); assert.equal(input.lines[1].followsCutOff, true);
    const plan = chapterRequests(input.lines, input.settings.tts); assert.equal(plan.length, 2);
    const words = speechTokens(input.lines[1].text).map((text, index) => ({ text, start: .3 + index * .2, end: .45 + index * .2 }));
    const [clip] = alignChapter(plan[1].lines, words, 2); assert.equal(clip.review, false); assert.equal(clip.start, .3);
    assert.equal(speechRevealCues('"Ich bin hier."', clip, words).length, 3);
});

test('separate language requests keep ordered clips timestamps and cache reuse through the generation engine', async () => {
    const input = fixture(source), requests = [];
    Object.assign(input.settings.tts, { parallelBatches: 3, autoPlay: false });
    const engine = new SpeechEngine({ request: async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true, maxParallelBatches: 5 });
        const request = JSON.parse(options.body); requests.push(request);
        const words = speechTokens(request.body.text).map((text, index) => ({ text, start: .1 + index * .1, end: .18 + index * .1 }));
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa('fixture'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: words } })}\n\n`);
    } }, input.settings, { decode: async () => new Float32Array(SAMPLE_RATE * 4), process: async () => [] });
    try {
        engine.prepare('multilingual', input.timeline, input.registry);
        const job = await engine.generate(); assert.equal(job.status, 'complete'); assert.equal(requests.length, 3);
        assert.deepEqual(job.chapters.map(chapter => chapter.language), ['en', 'de', 'en']);
        assert.deepEqual(job.chapters.map(chapter => chapter.offsetSamples), [0, SAMPLE_RATE * 4, SAMPLE_RATE * 8]);
        assert.ok(job.chapters.flatMap(chapter => chapter.clips).every(clip => !clip.review));
        assert.deepEqual(job.chapters.flatMap(chapter => chapter.clips.map(clip => clip.id)), engine.prepared.segments.map(line => line.id));
        assert.equal((await engine.sourceSamples(false)).length, SAMPLE_RATE * 12);
        await engine.generate(); assert.equal(requests.length, 3);
    } finally { engine.dispose(); }
});
