import test from 'node:test';
import assert from 'node:assert/strict';
import { inheritedPresentation, inheritedWorld, worldHistory } from '../core/scene-history.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { parsePOV } from '../core/vn-parser.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { Playback } from '../core/playback.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

const assistant = pov => ({ mes: `#BACKGROUND canonical_secret\n#MUSIC canonical_secret\n/////\n${pov}` });
const history = (...povs) => ({ chat: povs.map(assistant) });
const compile = (context, index) => {
    const settings = structuredClone(DEFAULT_SETTINGS), registry = new CharacterRegistry({ inventory: {} }, settings);
    return compileTimeline(parsePOV(context.chat[index].mes.split('/////\n')[1]).tokens, registry, settings, inheritedPresentation(context, index));
};
test('history searches independently for the nearest background and music and keeps playback rate', () => {
    const context = history('#BACKGROUND kitchen\n#MUSIC buzz slowed', 'Plain prose.', '#BACKGROUND street', 'The latest response.');
    assert.deepEqual(inheritedPresentation(context, 3), { background: 'street', music: { name: 'buzz', rate: .75 } });
    assert.deepEqual(inheritedPresentation(context, 2), { background: 'kitchen', music: { name: 'buzz', rate: .75 } });
    assert.deepEqual(inheritedPresentation(context, 0), { background: null, music: null });
});
test('history respects clear stop empty commands and scene reset boundaries', () => {
    for (const command of ['#BACKGROUND CLEAR\n#MUSIC STOP', '#BACKGROUND NONE\n#MUSIC NONE', '#BACKGROUND\n#MUSIC', '#SCENE RESET']) {
        const context = history('#BACKGROUND kitchen\n#MUSIC buzz', command, 'Next.');
        assert.deepEqual(inheritedPresentation(context, 2), { background: null, music: null });
    }
    const reset = history('#BACKGROUND kitchen\n#MUSIC buzz', '#SCENE RESET\n#MUSIC club', 'Next.');
    assert.deepEqual(inheritedPresentation(reset, 2), { background: null, music: { name: 'club', rate: 1 } });
    reset.chat[1] = assistant('#BACKGROUND street\n#SCENE RESET\n#BACKGROUND hotel');
    assert.deepEqual(inheritedPresentation(reset, 2), { background: 'hotel', music: null });
});
test('scan uses POV commands only and ignores user system missing POV code HTML and later messages', () => {
    const context = history('@background kitchen\n@music buzz half', 'Next.');
    context.chat.splice(1, 0,
        { mes: '#BACKGROUND secret\n#MUSIC secret' },
        { ...assistant('#BACKGROUND user\n#MUSIC user'), is_user: true },
        { ...assistant('#BACKGROUND system\n#MUSIC system'), is_system: true },
        assistant('```text\n#BACKGROUND code\n#MUSIC code\n```\n<div>\n#BACKGROUND html\n#MUSIC html\n</div>'));
    context.chat.push(assistant('#BACKGROUND future\n#MUSIC future'));
    const snapshot = JSON.stringify(context);
    assert.deepEqual(inheritedPresentation(context, 5), { background: 'kitchen', music: { name: 'buzz', rate: .5 } });
    assert.equal(JSON.stringify(context), snapshot);
});
test('edits selected swipes deletion and chat switches recompute without a stale media cache', () => {
    const context = history('#BACKGROUND kitchen\n#MUSIC buzz', 'Next.');
    context.chat[0].swipes = [context.chat[0].mes, assistant('#BACKGROUND rejected\n#MUSIC rejected').mes];
    context.chat[0].swipe_id = 1; // mes remains authoritative even when swipe metadata is stale.
    assert.equal(inheritedPresentation(context, 1).background, 'kitchen');
    context.chat[0].mes = assistant('#BACKGROUND street\n#MUSIC club fast').mes;
    assert.deepEqual(inheritedPresentation(context, 1), { background: 'street', music: { name: 'club', rate: 1.4 } });
    context.chat.splice(0, 1);
    assert.deepEqual(inheritedPresentation(context, 0), { background: null, music: null });
    assert.deepEqual(inheritedPresentation(history('Different chat.'), 0), { background: null, music: null });
    assert.deepEqual(inheritedPresentation(context, 42), { background: null, music: null });
});
test('current commands override inherited state when reached and backward navigation restores it', () => {
    const context = history('#BACKGROUND kitchen\n#MUSIC buzz slowed', 'First.\n#BACKGROUND street\n#MUSIC club\nNARRATION\nSecond.\n#SCENE RESET\nNARRATION\nThird.');
    const player = new Playback(compile(context, 1));
    const first = player.forward(); assert.equal(first.beat.state.background, 'kitchen'); assert.equal(first.beat.state.music.rate, .75);
    const second = player.forward(); assert.equal(second.beat.state.background, 'street'); assert.equal(second.beat.state.music.name, 'club');
    const third = player.forward(); assert.equal(third.beat.state.background, null); assert.equal(third.beat.state.music, null);
    player.back(); assert.deepEqual(player.back().beat.state, first.beat.state);
});
test('background/music-only helper does not add historical cast ambience artifacts effects or beat indexes', () => {
    const context = history('#BACKGROUND kitchen\n#MUSIC buzz\n#AMBIENT fire\n#ENTER Ashley\n#SFX door\n#FLASH WHITE\n<div>Old artifact</div>', 'Nina: "Now."');
    const timeline = compile(context, 1), state = timeline.beats[0].state;
    assert.equal(timeline.beats.length, 1); assert.deepEqual(timeline.views, [0]);
    assert.equal(state.background, 'kitchen'); assert.equal(state.music.name, 'buzz'); assert.equal(state.ambient, null);
    assert.deepEqual(Object.keys(state.characters), ['nina']); assert.deepEqual(timeline.beats[0].oneShots, []);
    assert.equal(timeline.beats[0].token.text, '"Now."');
});
test('independent reconstruction after refresh produces identical inherited media snapshots', () => {
    const context = history('#BACKGROUND forest path\n#MUSIC peaceful piano slow', 'No commands here.');
    assert.deepEqual(compile(context, 1), compile(structuredClone(context), 1));
    assert.equal(compile(history('No commands anywhere.'), 0).beats[0].state.background, null);
});

const world = (context, index) => {
    const settings = structuredClone(DEFAULT_SETTINGS), registry = new CharacterRegistry({ inventory: {} }, settings);
    registry.properties.set('nina', { aliases: ['Nin'] });
    return inheritedWorld(worldHistory(context, index), registry, settings, null);
};
test('world history carries canonical character identity expressions stable slots and all persistent scene state', () => {
    const context = history('#BACKGROUND kitchen\n#MUSIC buzz slowed\n#AMBIENT rain\n#CAMERA ZOOM 1.2\n#TINT blue\n#TEXT whisper\n#ENTER Nina\nAshley: "Hello." [happy]', 'Nin: "Next." [sad]', 'Now.');
    const state = world(context, 2);
    assert.equal(state.background, 'kitchen'); assert.equal(state.music.rate, .75); assert.equal(state.ambient.name, 'rain');
    assert.equal(state.characters.nina.slot, 0); assert.equal(state.characters.ashley.slot, 1); assert.equal(state.characters.nina.expression, 'sad');
    assert.equal(state.camera.zoom, 1.2); assert.equal(state.tint, 'blue'); assert.equal(state.textEffect, 'whisper'); assert.equal(state.speaker, null);
});
test('repeated enter commands are idempotent and omitted cast and ambience remain until exited or stopped', () => {
    const context = history('#ENTER Nina\n#AMBIENT rain\nNina: "First." [happy]', '#ENTER Nin\nPlain prose.', '#EXIT Nin\n#AMBIENT STOP', 'Now.');
    const continued = world(context, 2); assert.deepEqual(Object.keys(continued.characters), ['nina']); assert.equal(continued.characters.nina.expression, 'happy');
    assert.equal(continued.ambient.name, 'rain'); const exited = world(context, 3); assert.deepEqual(Object.keys(exited.characters), []); assert.equal(exited.ambient, null);
});
test('scene clears reset the cast and full resets clear inherited world fields', () => {
    const context = history('#ENTER Nina\n#MUSIC buzz\n#AMBIENT rain\n#CAMERA ZOOM 2\n#FADE BLACK', '#SCENE next\n#ENTER Ashley', '#SCENE RESET', 'Now.');
    const next = world(context, 2); assert.deepEqual(Object.keys(next.characters), ['ashley']); assert.equal(next.music.name, 'buzz'); assert.equal(next.black, true);
    const reset = world(context, 3); assert.deepEqual(Object.keys(reset.characters), []); assert.equal(reset.music, null); assert.equal(reset.ambient, null); assert.equal(reset.black, false); assert.equal(reset.camera.zoom, 1);
});
test('world reduction excludes narration artifacts one-shots and canonical user and future commands', () => {
    const context = history('#ENTER Nina\nNina: "Private old prose." [happy]\n#SFX door\n#FLASH WHITE\n#SHAKE LIGHT\n<div>Old artifact</div>', 'Now.', '#ENTER Future');
    context.chat.splice(1, 0, { ...assistant('#ENTER User'), is_user: true });
    const tokens = worldHistory(context, 2), state = world(context, 2);
    assert(!JSON.stringify(tokens).includes('Private old prose')); assert(!JSON.stringify(tokens).includes('Old artifact')); assert(!JSON.stringify(tokens).includes('canonical_secret'));
    assert.deepEqual(Object.keys(state.characters), ['nina']);
    const settings = structuredClone(DEFAULT_SETTINGS), registry = new CharacterRegistry({ inventory: {} }, settings);
    const timeline = compileTimeline(parsePOV('Nina: "Current."').tokens, registry, settings, state);
    assert.equal(timeline.beats.length, 1); assert.deepEqual(timeline.views, [0]); assert.deepEqual(timeline.beats[0].oneShots, []);
});
test('world reconstruction stays deterministic on edits refreshes and hostile inherited character IDs', () => {
    const context = history('#ENTER Nina', 'Now.'); assert.deepEqual(world(context, 1), world(structuredClone(context), 1));
    context.chat[0] = assistant('#ENTER Ashley'); assert.deepEqual(Object.keys(world(context, 1).characters), ['ashley']);
    const settings = structuredClone(DEFAULT_SETTINGS), registry = new CharacterRegistry({ inventory: {} }, settings);
    const inherited = { characters: JSON.parse('{"__proto__":{"id":"__proto__","name":"Odd","expression":"default","slot":0}}') };
    const timeline = compileTimeline(parsePOV('Constructor: "Current."').tokens, registry, settings, inherited);
    assert(Object.hasOwn(timeline.finalState.characters, '__proto__')); assert(Object.hasOwn(timeline.finalState.characters, 'constructor')); assert.equal(Object.prototype.expression, undefined);
});
