import test from 'node:test';
import assert from 'node:assert/strict';
import { inheritedPresentation } from '../core/scene-history.js';
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
test('history never replays earlier SFX artifacts cast ambience or effects or changes beat indexes', () => {
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
