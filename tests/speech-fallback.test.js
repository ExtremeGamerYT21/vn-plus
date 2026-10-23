import test from 'node:test';
import assert from 'node:assert/strict';
import { speechSegments, chapterRequests } from '../core/speech-segments.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

function fixture(source, characters = {}, narration = false) {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.characters = characters; settings.tts.narratorEnabled = narration; settings.tts.isolateVoices = false;
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsePOV(source).tokens, registry, settings);
    const lines = () => speechSegments(timeline, registry, 'fallback', settings.tts);
    return { settings, registry, timeline, lines, plan: () => chapterRequests(lines(), settings.tts) };
}

test('unvoiced characters use unindexed narrator properties even with narration disabled', async () => {
    const input = fixture('The room is quiet.\nVisitor: "Hello."\nVisitor: "(Stay quiet.)"');
    input.registry.resolver.json = async path => path === 'characters/narrator/properties.json' ? { voiceId: 'story-voice' } : null;
    await input.registry.prepare(['Visitor']);
    const [line] = input.lines(); assert.equal(input.lines().length, 1);
    assert.equal(line.character, input.registry.identify('Visitor')); assert.equal(line.name, 'Visitor');
    assert.equal(line.voice, 'story-voice'); assert.equal(line.voiceCharacter, 'narrator');
    assert.ok(!input.timeline.beats.some(beat => beat.state.characters.narrator));
});

test('resolved aliases keep their own identity, tags, language and properties while borrowing only the voice', () => {
    const characters = { narrator: { voiceId: 'story' }, jason_weber: { displayName: 'Jason', aliases: ['Jason Weber'], voiceId: ' ', textColor: '#123456', ttsLanguage: 'de' } };
    const before = structuredClone(characters), input = fixture('Jason Weber: "Ich bin hier—" [angry]', characters);
    const [line] = input.lines(); assert.equal(line.character, 'jason_weber'); assert.equal(line.name, 'Jason');
    assert.equal(line.voice, 'story'); assert.equal(line.language, 'de'); assert.equal(line.cutOff, true); assert.ok(line.synthesisText.startsWith('['));
    assert.deepEqual(characters, before); assert.equal(input.registry.get('jason_weber').textColor, '#123456');
});

test('personal voice IDs take precedence and invalid IDs remain visible configuration errors', () => {
    const input = fixture('Nina: "Hello."', { nina: { voiceId: 'own-voice' }, narrator: { voiceId: 'invalid voice url' } });
    assert.equal(input.lines()[0].voice, 'own-voice'); assert.equal(input.lines()[0].voiceCharacter, undefined);
    input.settings.characters.nina.voiceId = 'invalid own voice'; assert.throws(input.lines, /Invalid voiceId for Nina/);
    input.settings.characters.nina.voiceId = ''; assert.throws(input.lines, /Invalid voiceId for the narrator fallback/);
});

test('without either voice ID dialogue stays silent and thoughts and artifacts stay excluded', () => {
    const input = fixture('Visitor: "Hello."\nVisitor: "(A thought.)"\n<div>Hidden artifact</div>');
    assert.equal(input.lines().length, 0); assert.throws(input.plan, /characters\/narrator\/properties.json/);
    input.settings.characters.narrator = { voiceId: 'story' };
    assert.equal(input.lines().length, 1); assert.equal(input.lines()[0].text, 'Hello.');
});

test('many fallback characters share one Fish speaker reference without consuming the eight-voice limit', () => {
    const source = Array.from({ length: 12 }, (_, index) => `Visitor ${String.fromCharCode(65 + index)}: "Hello there."`).join('\n');
    const input = fixture(source, { narrator: { voiceId: 'story' } }); input.settings.tts.splitChapters = false;
    const [chapter] = input.plan(); assert.equal(chapter.lines.length, 12); assert.equal(new Set(chapter.lines.map(line => line.character)).size, 12);
    assert.deepEqual(chapter.speakers, ['narrator']); assert.deepEqual(chapter.body.reference_id, ['story']);
    assert.equal(chapter.body.text.match(/<\|speaker:0\|>/g).length, 12); assert.ok(!chapter.body.text.includes('speaker:1'));
});

test('actual narration remains in its own batch and dialogue preserves beat IDs and personal references', () => {
    const input = fixture('The hall is quiet.\nVisitor: "Hello."\nNina: "Come here."\nAnother visitor: "Ready?"\nThe door opens.',
        { narrator: { voiceId: 'story' }, nina: { voiceId: 'nina' } }, true);
    const chapters = input.plan(); assert.deepEqual(chapters.map(chapter => chapter.kind), ['narration', 'dialogue']);
    assert.deepEqual(chapters[0].body.reference_id, ['story']); assert.deepEqual(chapters[1].body.reference_id, ['story', 'nina']);
    assert.deepEqual(chapters[1].lines.map(line => line.beat), [1, 2, 3]); assert.ok(!/hall|door/.test(chapters[1].body.text));
    assert.equal(chapters[1].body.text, '<|speaker:0|>Hello.\n<|speaker:1|>Come here.\n<|speaker:0|>Ready?');
});
