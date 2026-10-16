import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSpeechText, speechTokens } from '../core/speech-text.js';
import { speechSegments, chapterRequests } from '../core/speech-segments.js';
import { alignChapter } from '../core/speech-alignment.js';
import { speechRevealCues } from '../core/speech-reveal.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { SpeechEngine } from '../renderers/speech-engine.js';

const prompt = (text, options) => compileSpeechText(text, options).synthesisText;
const fixture = (source, characters = {}) => {
    const config = structuredClone(DEFAULT_SETTINGS); config.characters = characters; config.tts.enabled = true;
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, config);
    const timeline = compileTimeline(parsePOV(source).tokens, registry, config);
    return { config, registry, timeline };
};

test('S2.1 emotions prefix spoken text regardless of leading trailing or inline placement', () => {
    for (const text of ['Hello. [angry]', '[angry] Hello.', 'Hello [angry].', '“Hello.” [angry]']) assert.equal(prompt(text), '[angry] Hello.');
    assert.equal(prompt('Hello.', { emotion: 'angry' }), '[angry] Hello.');
    assert.equal(prompt('[angry] Hello.', { direction: 'angry' }), '[angry] Hello.');
    assert.equal(prompt('Hello.', { emotion: 'default' }), 'Hello.');
    assert.equal(prompt('Hello [joy].'), '[happy] Hello.');
    assert.equal(prompt('Hello.', { direction: 'matter_of_fact' }), '[matter of fact] Hello.');
    assert.equal(prompt('Go[angry]away.'), '[angry] Go away.');
});

test('emotional transitions stay at sentence starts and timed effects retain their position', () => {
    assert.equal(prompt('I am [angry] upset. [sad] I miss you.'), '[angry] I am upset. [sad] I miss you.');
    assert.equal(prompt('No. I am [sad] leaving.'), 'No. [sad] I am leaving.');
    assert.equal(prompt('Dr. Smith is [angry] waiting.'), '[angry] Dr. Smith is waiting.');
    assert.equal(prompt('Hello [break] dear [emphasis] friend [sigh].', { direction: 'curious' }), '[curious] Hello [break] dear [emphasis] friend [sighing].');
    assert.equal(prompt('Hello. [gasping]'), 'Hello. [gasping]');
});

test('angry or serious full-name vocatives become controlled reprimands using known aliases', () => {
    const fullNames = ['Jason Weber', 'Hermione Jean Granger'];
    for (const direction of ['angry', 'serious', 'very annoyed', 'stern']) {
        for (const text of ['Jason Weber!', 'JASON WEBER.', 'Jason Weber, listen to me.', 'Jason Weber']) {
            assert.equal(prompt(text, { direction, fullNames }), `[stern, controlled displeasure] ${text}`);
        }
    }
    assert.equal(prompt('Hermione Jean Granger!', { direction: 'serious, whispering', fullNames }), '[stern, controlled displeasure][whispering] Hermione Jean Granger!');
    assert.equal(prompt('Élodie Dupré!', { direction: 'angry', fullNames: ['Élodie Dupré'] }), '[stern, controlled displeasure] Élodie Dupré!');
});

test('name mentions first names cheerful greetings and unknown titles do not become reprimands', () => {
    const fullNames = ['Jason Weber'];
    for (const text of ['I spoke to Jason Weber.', 'Jason Weber is waiting.', 'Jason!', 'Good Morning!', 'Dr. Smith!']) {
        assert.equal(prompt(text, { direction: 'serious', fullNames }), `[serious] ${text}`);
    }
    assert.equal(prompt('Jason Weber!', { direction: 'happy', fullNames }), '[happy] Jason Weber!');
    assert.equal(prompt('Jason Weber!', { direction: 'not angry', fullNames }), '[not angry] Jason Weber!');
});

test('registry folder IDs full names and unvoiced aliases supply context without voicing new speakers', () => {
    const input = fixture('Henry: "Jason Weber!" [angry]\nHenry: "Jason!" [serious]\nJason: "(Stay quiet.)"', {
        henry: { voiceId: 'henry-voice' }, jason_weber: { displayName: 'Jason', aliases: ['Jason Weber'] },
    });
    const before = structuredClone(input.timeline);
    const segments = speechSegments(input.timeline, input.registry, 'scene');
    assert.equal(segments.length, 2); assert.equal(segments[0].synthesisText, '[stern, controlled displeasure] Jason Weber!');
    assert.equal(segments[1].synthesisText, '[serious] Jason!'); assert.deepEqual(input.timeline, before);
    const plan = chapterRequests(segments, input.config.tts);
    assert.equal(plan[0].body.text, '<|speaker:0|>[stern, controlled displeasure] Jason Weber!\n<|speaker:0|>[serious] Jason!');
    assert.deepEqual(plan[0].body.reference_id, ['henry-voice']);
    const markup = fixture('Henry: "[matter_of_fact] **Hello**, _Jason_."', { henry: { voiceId: 'henry-voice' } });
    assert.equal(speechSegments(markup.timeline, markup.registry, 'markup')[0].synthesisText, '[matter of fact] Hello, Jason.');
});

test('explicit voice cracks normalize and emotional stutters receive compatible delivery cues', () => {
    for (const direction of ['voice_break', 'voice cracks', 'broken voice']) assert.equal(prompt('I cannot.', { direction }), '[voice breaking] I cannot.');
    assert.equal(prompt('I-I cannot.', { direction: 'sad' }), '[sad][voice breaking] I-I cannot.');
    assert.equal(prompt('N-no, please.', { direction: 'nervous' }), '[nervous][hesitant, stammering] N-no, please.');
    assert.equal(prompt('I—I cannot.', { direction: 'sad, voice breaking' }), '[sad, voice breaking] I—I cannot.');
    for (const text of ['Please re-read this.', 'A well-known person.', 'It is a co-operative.', 'I—I can.']) assert.equal(prompt(text, { direction: 'calm' }), `[calm] ${text}`);
    assert.equal(prompt('Please re-read this.', { direction: 'nervous' }), '[nervous] Please re-read this.');
});

test('short vocalizations get sound cues while ordinary words remain speech', () => {
    for (const [text, hint] of [['Ha ha!', 'laughing'], ['Hahaha!', 'laughing'], ['Heh.', 'chuckling'], ['Hehe!', 'chuckling'], ['Ugh.', 'groaning'], ['Ahem.', 'clear throat'], ['Huff, puff.', 'panting'], ['Gasp!', 'gasping'], ['Sigh.', 'sighing']]) {
        assert.equal(prompt(text), `[${hint}] ${text}`);
    }
    assert.equal(prompt('She made me laugh.'), 'She made me laugh.');
    assert.equal(prompt('Ha ha!', { direction: 'laughing' }), '[laughing] Ha ha!');
    assert.equal(prompt('Ahem.', { direction: 'serious' }), '[serious][clear throat] Ahem.');
});

test('German interjections receive bounded case-preserving English-friendly spellings', () => {
    assert.equal(prompt('Ja! Ach so, I understand.'), 'Ya! Ach zo, I understand.');
    assert.equal(prompt('JA. ACH SO!'), 'YA. ACH ZO!');
    assert.equal(prompt('ja, ach so.'), 'ya, ach zo.');
    assert.equal(prompt('Ja, Jason, I understand.', { direction: 'serious' }), '[serious] Ya, Jason, I understand.');
    for (const text of ['Jason likes Java and the achievement.', 'Ja, ich bin hier.', 'Ach so, das ist gut.', 'Ja, wir gehen jetzt nach Hause.']) assert.equal(prompt(text), text);
    assert.equal(prompt('Ja!', { direction: 'Ja, surprised' }), '[Ja, surprised] Ya!');
    assert.equal(prompt('Ja!', { language: 'de-DE' }), 'Ja!');
    assert.equal(prompt('Ja!', { language: 'en-GB' }), 'Ya!');
});

test('pronunciation metadata is local to the changed words and original dialogue remains intact', () => {
    const result = compileSpeechText('Ja! Ach so, I understand.');
    assert.deepEqual(result.pronunciations, [{ word: 0, from: 'ja', text: 'ya' }, { word: 2, from: 'so', text: 'zo' }]);
    assert.equal(compileSpeechText('Hello.').pronunciations, undefined);
    const input = fixture('Nina: "Ja! Ach so, I understand." [curious]', { nina: { voiceId: 'voice-nina' } });
    const [line] = speechSegments(input.timeline, input.registry, 'scene');
    assert.equal(line.text, 'Ja! Ach so, I understand.'); assert.equal(line.synthesisText, '[curious] Ya! Ach zo, I understand.');
});

test('both original and phonetic provider spellings align to the same unmodified visible words', () => {
    const text = 'Ja! Ach so, I understand.', line = { id: 'line', text, ...compileSpeechText(text) };
    for (const transcript of ['Ya Ach zo I understand', 'Ja Ach so I understand', 'Ya Ach so I understand']) {
        const words = transcript.split(' ').map((text, index) => ({ text, start: .2 + index * .3, end: .4 + index * .3 }));
        const [clip] = alignChapter([line], words, 2);
        assert.equal(clip.review, false); assert.equal(clip.coverage, 1);
        const visible = '“Ja! Ach so, I understand.”', cues = speechRevealCues(visible, clip, words);
        assert.equal(cues.length, 5); assert.equal(cues[2].at, .8);
        assert.equal(Array.from(visible).slice(0, cues[2].through).join(''), '“Ja! Ach so, ');
        assert.equal(cues.at(-1).through, Array.from(visible).length);
    }
});

test('pronunciation exceptions cannot mask another word a missing word or ambiguous timestamps', () => {
    const text = 'Ja, Jason.', line = { id: 'line', text, ...compileSpeechText(text) };
    assert.equal(alignChapter([line], [{ text: 'Ya', start: .1, end: .3 }, { text: 'Different', start: .4, end: .6 }], 1)[0].review, true);
    assert.equal(alignChapter([line], [{ text: 'Ya', start: .1, end: .3 }], 1)[0].review, true);
    assert.equal(alignChapter([line], [{ text: 'Ya', start: .1, end: .3 }, { text: 'Jason', start: NaN, end: .6 }], 1)[0].review, true);
    const words = [{ text: 'Ya', start: .1, end: .3 }, { text: 'Jason', start: .4, end: .6 }], [clip] = alignChapter([line], words, 1);
    assert.equal(speechRevealCues('No, Jason.', clip, words), null);
    assert.equal(alignChapter([{ id: 'unrelated', text: 'Ja' }], [{ text: 'Ya', start: .1, end: .3 }], 1)[0].review, true);
});

test('tag normalization strips embedded speaker markers without changing speaker identity', () => {
    const result = compileSpeechText('<|speaker:7|>Hello [angry].', { direction: 'angry]<|speaker:9|>[whispering' });
    assert.ok(!result.synthesisText.includes('<|speaker:')); assert.ok(!/\]\s*\[\s*$/.test(result.synthesisText));
    assert.deepEqual(speechTokens(result.synthesisText), ['hello']);
});

test('generation uses compiled prompts and keeps actual voiced timing on original chat text', async () => {
    const input = fixture('Nina: "Ja, I understand." [curious]', { nina: { voiceId: 'voice-nina' } });
    const requests = [];
    const words = ['Ya', 'I', 'understand'].map((text, i) => ({ text, start: .1 + i * .2, end: .25 + i * .2 }));
    const engine = new SpeechEngine({ request: async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true });
        requests.push(JSON.parse(options.body));
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa('fake-audio'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: words } })}\n\n`);
    } }, input.config, { decode: async () => new Float32Array(44100), process: async () => [] });
    try {
        engine.prepare('source', input.timeline, input.registry); const job = await engine.generate();
        assert.equal(requests.length, 1); assert.equal(requests[0].model, 's2.1-pro-free');
        assert.equal(requests[0].body.text, '<|speaker:0|>[curious] Ya, I understand.');
        assert.equal(job.chapters[0].clips[0].review, false);
        assert.equal(engine.prepared.segments[0].text, 'Ja, I understand.');
        await engine.generate(); assert.equal(requests.length, 1);
    } finally { engine.dispose(); }
});
