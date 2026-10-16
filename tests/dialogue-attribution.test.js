import test from 'node:test';
import assert from 'node:assert/strict';
import { stripDialogueAttribution } from '../core/dialogue-text.js';
import { parsePOV } from '../core/vn-parser.js';
import { splitMessage } from '../core/message-reader.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { speechSegments, chapterRequests } from '../core/speech-segments.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

test('trailing speech attributions disappear while the utterance and emotion remain', () => {
    for (const tag of ['she repeated.', 'she said.', 'he asked quietly.', 'Madam Malkin replied.', 'said Madam Malkin.', 'she quietly repeats.']) {
        const parsed = parsePOV(`Madam Malkin: "Two millimetres," ${tag} [flat]`);
        assert.deepEqual(parsed.errors, []); assert.equal(parsed.tokens.length, 1);
        assert.equal(parsed.tokens[0].text, '"Two millimetres,"'); assert.equal(parsed.tokens[0].emotion, 'flat'); assert.equal(parsed.tokens[0].direction, 'flat');
    }
});
test('curly quotes multiline speech apostrophes and escaped quotations preserve their spoken content', () => {
    for (const [input, expected] of [
        ['“Hello,\n  you.” she murmured softly.', '“Hello,\n  you.”'],
        ["'Don’t move,' Henry said.", "'Don’t move,'"],
        ['"I said \\"no\\"." she repeated.', '"I said \\"no\\"."'],
        ['‘Go.’ — she snapped.', '‘Go.’'],
    ]) assert.equal(stripDialogueAttribution(input), expected);
});
test('ordinary spoken words separate narration and substantive actions are not removed', () => {
    for (const text of ['"She repeated."', '"I said no."', 'He said no.', '"No," she closed the door.', '"No," she said and closed the door.', '"No," she added two pins.', '"No," she rep']) assert.equal(stripDialogueAttribution(text), text);
    const parsed = parsePOV('Nina: "No," she repeated. [angry]\nYou step back.\n\nShe repeated the measurement.');
    assert.deepEqual(parsed.tokens.map(token => token.type), ['dialogue', 'narration']);
    assert.equal(parsed.tokens[0].text, '"No,"'); assert.ok(parsed.tokens[1].text.includes('She repeated the measurement.'));
});
test('incomplete dialogue remains withheld and cleaned thoughts remain silent', () => {
    for (const source of ['Nina: "Not yet', 'Nina: "No, she repeated. [flat]', 'Nina: "No," she rep [flat]']) assert.equal(parsePOV(source).tokens.length, 0);
    const token = parsePOV('Nina: "(Not aloud.)" she murmured. [sad]').tokens[0];
    assert.equal(token.thought, true); assert.equal(token.text, '"(Not aloud.)"');
});
test('VN tokens and Fish requests share cleaned dialogue without changing the original message', () => {
    const raw = 'PRIVATE_CANONICAL\n/////\nMadam Malkin: "Two millimetres," she repeated. [flat]\nYou straighten up.';
    const parsed = parsePOV(splitMessage(raw).pov), settings = structuredClone(DEFAULT_SETTINGS);
    settings.characters.madam_malkin = { aliases: ['Madam Malkin'], voiceId: 'malkin-voice' };
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const timeline = compileTimeline(parsed.tokens, registry, settings), lines = speechSegments(timeline, registry, 'test');
    assert.equal(lines.length, 1); assert.equal(lines[0].text, 'Two millimetres,');
    assert.ok(!chapterRequests(lines, settings.tts)[0].body.text.includes('she repeated'));
    assert.equal(parsed.tokens[0].text, '"Two millimetres,"'); assert.ok(raw.includes('she repeated.')); assert.ok(raw.startsWith('PRIVATE_CANONICAL'));
});
