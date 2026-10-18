import test from 'node:test';
import assert from 'node:assert/strict';
import { dialogueDisplayText } from '../core/dialogue-text.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { speechSegments, chapterRequests } from '../core/speech-segments.js';
import { speechRevealCues } from '../core/speech-reveal.js';

test('performance tags disappear at the start middle and end without joining words or leaving punctuation gaps', () => {
    for (const [source, visible] of [
        ['"[laugh] Hello [cough], friend! [sigh]"', '"Hello, friend!"'],
        ['[stern, controlled displeasure] Please [voice_break] listen.', 'Please listen.'],
        ['“[whispering] Stay [break] close.”', '“Stay close.”'],
        ['Hello[laugh][sigh]there.', 'Hello there.'],
        ['"I was [gasp]—"', '"I was—"'],
        ['"[laugh]"', ''],
        ['[unfamiliar delivery instruction] Still readable.', 'Still readable.'],
    ]) assert.equal(dialogueDisplayText(source), visible);
    assert.equal(dialogueDisplayText('  Ordinary  **emphasis**,\nand an unfinished [aside.  '), '  Ordinary  **emphasis**,\nand an unfinished [aside.  ');
});

test('hiding a dialogue tag leaves parsed source and Fish performance cues intact', () => {
    const source = 'Nina: "[laugh] Hello [cough], friend!" [happy]', parsed = parsePOV(source);
    const settings = structuredClone(DEFAULT_SETTINGS), registry = new CharacterRegistry({ inventory: {} }, settings);
    settings.characters.nina = { voiceId: 'test-nina' };
    const timeline = compileTimeline(parsed.tokens, registry, settings), segments = speechSegments(timeline, registry, 'test', settings.tts);
    assert.equal(dialogueDisplayText(parsed.tokens[0].text), '"Hello, friend!"');
    assert.ok(parsed.tokens[0].text.includes('[laugh]')); assert.ok(segments[0].text.includes('[cough]'));
    const prompt = chapterRequests(segments, settings.tts)[0].body.text;
    assert.ok(prompt.includes('[laughing]')); assert.ok(prompt.includes('[coughing]')); assert.ok(prompt.includes('[happy]'));
    assert.equal(parsed.tokens[0].emotion, 'happy'); assert.equal(source, 'Nina: "[laugh] Hello [cough], friend!" [happy]');
});

test('cleaned dialogue still follows actual word timestamps rather than falling back to estimated typing', () => {
    const text = dialogueDisplayText('"[laugh] Hello [cough], friend 😅!"');
    const words = [{ text: 'Hello', start: .25, end: .5 }, { text: 'friend', start: .8, end: 1 }];
    const clip = { first: 0, last: 1, start: .1, end: 1.2, line: { text: '[laugh] Hello [cough], friend 😅!' } };
    const cues = speechRevealCues(text, clip, words);
    assert.ok(cues); assert.equal(text.slice(0, cues[0].through), '"Hello, ');
    assert.equal(cues[1].through, Array.from(text).length); assert.ok(Math.abs(cues[1].at - .7) < .001);
});
