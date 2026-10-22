import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePOV } from '../core/vn-parser.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { speechSegments, chapterRequests } from '../core/speech-segments.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { inlinePassage, inlineDialogue, inlineNarration } from './inline-narration-fixture.js';

function voicePlan(source) {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.tts.narratorEnabled = true;
    settings.characters = { professor: { voiceId: 'professor-test' }, narrator: { voiceId: 'story-test' } };
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const parsed = parsePOV(source), timeline = compileTimeline(parsed.tokens, registry, settings);
    const lines = speechSegments(timeline, registry, 'inline', settings.tts);
    return { parsed, lines, plan: chapterRequests(lines, settings.tts) };
}

test('mixed quoted paragraphs alternate spoken fragments and unquoted narration without rewriting the source', () => {
    const source = `Professor: ${inlinePassage} [stern]`, { parsed, plan } = voicePlan(source);
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.tokens.map(token => token.type), ['dialogue', 'narration', 'dialogue', 'narration', 'dialogue', 'narration', 'dialogue']);
    assert.deepEqual(parsed.tokens.filter(token => token.type === 'dialogue').map(token => token.text), inlineDialogue);
    assert.deepEqual(parsed.tokens.filter(token => token.type === 'narration').map(token => token.text), inlineNarration);
    assert.ok(parsed.tokens.filter(token => token.type === 'dialogue').every(token => token.direction === 'stern'));
    const dialogue = plan.find(chapter => chapter.kind === 'dialogue'), narration = plan.find(chapter => chapter.kind === 'narration');
    assert.equal(dialogue.body.text, '<|speaker:0|>[stern] The point, [stern] is that you listen. [stern] You can try again. [stern] Or you can leave.');
    assert.ok(!/says|desk|step|drops/.test(dialogue.body.text));
    assert.ok(narration.body.text.includes('He takes a step toward your desk.'));
    assert.equal(source, `Professor: ${inlinePassage} [stern]`);
});

test('plain inline speech attributions disappear while quoted pieces still share one generation utterance', () => {
    const { parsed, plan } = voicePlan('Professor: "First," she repeated, "then second."');
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.tokens.map(token => token.type), ['dialogue', 'dialogue']);
    assert.equal(plan[0].body.text, '<|speaker:0|>First, then second.');
    assert.ok(!JSON.stringify(plan).includes('she repeated'));
    const punctuation = voicePlan('Professor: "First", [happy] she repeated, "then second."');
    assert.equal(punctuation.parsed.tokens[0].text, '"First,"');
    assert.equal(punctuation.plan[0].body.text, '<|speaker:0|>[happy] First, then second.');
    assert.equal(parsePOV('Professor: "No".').tokens[0].text, '"No."');
});

test('trailing independent actions become narration instead of being swallowed or spoken by the character', () => {
    for (const action of ['She closes the door.', 'He said and closed the door.', 'She smiles', "He picks up his parents' book."]) {
        const parsed = parsePOV(`Professor: "No." ${action}`);
        assert.deepEqual(parsed.errors, []); assert.equal(parsed.tokens[0].text, '"No."');
        assert.equal(parsed.tokens[1].type, 'narration'); assert.equal(parsed.tokens[1].text, action);
    }
});

test('nested quotes escaped quotes contractions and curly or single wrappers stay within their spoken spans', () => {
    for (const text of ['"Give me a \\"proper\\" answer."', '"Give me a "proper" answer."', '“Give me a “proper” answer.”', "'Don’t touch James’s book.'", '"I can’t help it."']) {
        const parsed = parsePOV(`Professor: ${text} He steps back. "Continue."`);
        assert.deepEqual(parsed.errors, [], text); assert.equal(parsed.tokens[0].text, text);
        assert.equal(parsed.tokens[1].text, 'He steps back.'); assert.equal(parsed.tokens[2].text, '"Continue."');
    }
});

test('per-fragment delivery tags and thoughts remain on their own quoted fragments', () => {
    const { parsed, plan } = voicePlan('Professor: "Hello," [happy] she opens the door. "Goodbye." [sad]');
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.tokens[0].direction, 'happy'); assert.equal(parsed.tokens[1].type, 'narration'); assert.equal(parsed.tokens[2].direction, 'sad');
    assert.equal(plan.find(chapter => chapter.kind === 'dialogue').body.text, '<|speaker:0|>[happy] Hello, [sad] Goodbye.');
    const thoughts = voicePlan('Professor: "(Keep quiet.)" She turns around. "Hello."');
    assert.equal(thoughts.parsed.tokens[0].thought, true);
    assert.ok(!thoughts.plan.some(chapter => chapter.body.text.includes('Keep quiet')));
});

test('incomplete inner utterances and streaming attributions remain withheld until complete', () => {
    for (const text of ['"First," she says, "not yet', '"First," she rep', '"First," she says, "(Not yet"']) {
        const parsed = parsePOV(`Professor: ${text}`);
        assert.equal(parsed.tokens.length, 0, text); assert.equal(parsed.errors.length, 1, text);
    }
    const parsed = parsePOV('Professor: "First," he says, as he points,\n"then second."');
    assert.deepEqual(parsed.tokens.map(token => token.type), ['dialogue', 'narration', 'dialogue']);
    assert.equal(parsed.tokens[2].line, 2);
});

test('ordinary prose narrator passages and one wrapped multiline utterance retain their established interpretation', () => {
    const prose = 'She calls the idea "impossible" and leaves.';
    assert.deepEqual(parsePOV(prose).tokens.map(token => [token.type, token.text]), [['narration', prose]]);
    assert.deepEqual(parsePOV('Narrator: "The door opens." [calm]').tokens.map(token => token.type), ['narration']);
    const quoted = '“Hello,\n  you.”';
    assert.equal(parsePOV(`Professor: ${quoted} [happy]`).tokens[0].text, quoted);
});
