import test from 'node:test';
import assert from 'node:assert/strict';
import { contextEntries, contextNames, reduceContext } from '../core/context-state.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { parsePOV } from '../core/vn-parser.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

const assistant = text => ({ mes: `PRIVATE_CANONICAL\n/////\n${text}` });
const context = (...texts) => ({ chatId: 'A', characterId: 0, chat: texts.map(assistant) });
const header = (time = '12:26 p.m.', location = 'Shop') => `[3 August 1991 | Before First Year | ${time} | Summer | ${location}]`;
function project(chat, options = {}, end, beforeLast = false) {
    const settings = { ...structuredClone(DEFAULT_SETTINGS), ...options }, registry = new CharacterRegistry({ inventory: {} }, settings);
    registry.properties.set('nina', { aliases: ['Nin'] });
    return reduceContext(contextEntries(chat, end), registry, settings, { beforeLast });
}
test('context reconstructs the final selected world including trailing commands and inherited independent media', () => {
    const chat = context('#BACKGROUND kitchen\n#MUSIC buzz slow\n#AMBIENT rain\nAshley: "Hello." [happy]', `${header()}\nNina: "Now." [sad]\n#BACKGROUND street`, 'No setup.');
    const state = project(chat);
    assert.equal(state.background, 'street'); assert.deepEqual(state.music, { name: 'buzz', rate: .75 }); assert.equal(state.ambient.name, 'rain');
    assert.equal(state.scene.time, '12:26'); assert.deepEqual(Object.keys(state.characters), ['ashley', 'nina']); assert.equal(state.characters.nina.expression, 'sad'); assert.equal(state.speaker, null);
});
test('recent cast is a delta of the last three completed POV responses, independent from media history', () => {
    const chat = context('#BACKGROUND kitchen\n#MUSIC buzz\nAshley: "First." [happy]', 'Nina: "Next." [sad]', 'Quiet.', 'Quiet again.');
    assert.deepEqual(Object.keys(project(chat).characters), ['nina']); assert.equal(project(chat).background, 'kitchen'); assert.equal(project(chat).music.name, 'buzz');
    chat.chat.push(assistant('Nin: "Still here." [angry]')); const state = project(chat);
    assert.deepEqual(Object.keys(state.characters), ['nina']); assert.equal(state.characters.nina.expression, 'angry');
    assert.deepEqual(Object.keys(project(chat, { castMemoryTurns: 0 }).characters), ['ashley', 'nina']);
    assert.deepEqual(Object.keys(project(chat, { castMemoryTurns: 1 }).characters), ['nina']);
});
test('user/system/missing-POV messages do not age the cast or supply media, while canonical headers remain metadata', () => {
    const chat = context('#ENTER Ashley\n#BACKGROUND kitchen');
    for (let index = 0; index < 8; index++) chat.chat.push({ ...assistant('#ENTER Secret\n#BACKGROUND secret'), is_user: true });
    chat.chat.push({ ...assistant('#ENTER System'), is_system: true }, { mes: `${header('9:00 p.m.')}\n#BACKGROUND private` });
    const state = project(chat); assert.deepEqual(Object.keys(state.characters), ['ashley']); assert.equal(state.background, 'kitchen'); assert.equal(state.scene.time, '21:00');
});
test('location changes clear the old cast, same-place time changes retain it, and new speakers enter normally', () => {
    const chat = context(`${header()}\nAshley: "Here." [happy]`, `${header('9:00 p.m.', ' shop ')}\nLater.`);
    assert.deepEqual(Object.keys(project(chat).characters), ['ashley']);
    chat.chat.push(assistant(`${header('9:30 p.m.', 'Street')}\nNin: "Outside." [sad]`));
    const state = project(chat); assert.deepEqual(Object.keys(state.characters), ['nina']); assert.equal(state.characters.nina.expression, 'sad');
    const settings = structuredClone(DEFAULT_SETTINGS), registry = new CharacterRegistry({ inventory: {} }, settings);
    const timeline = compileTimeline(parsePOV(`${header()}\nNARRATION\nBefore.\n${header('9:30 p.m.', 'Street')}\nAfter.`).tokens, registry, settings, { characters: { ashley: { id: 'ashley', name: 'Ashley', expression: 'happy', slot: 0 } } });
    assert.equal(Object.keys(timeline.beats[timeline.views[0]].state.characters).length, 1); assert.equal(Object.keys(timeline.finalState.characters).length, 0);
});
test('explicit exits scene clears resets and stops win over historical and recent cast inference', () => {
    const chat = context('#ENTER Ashley\n#ENTER Nina\n#BACKGROUND kitchen\n#MUSIC buzz', '#EXIT Nin\n#MUSIC STOP', 'Now.');
    assert.deepEqual(Object.keys(project(chat).characters), ['ashley']); assert.equal(project(chat).music, null);
    chat.chat.push(assistant('#SCENE RESET\nNow.')); const reset = project(chat);
    assert.deepEqual(Object.keys(reset.characters), []); assert.equal(reset.background, null); assert.equal(reset.playerEmotion, null);
});
test('selected swipe edits deletions and bounded historical replay always recompute from authoritative mes', () => {
    const chat = context('#BACKGROUND kitchen\nAshley: "Old." [happy]', '#BACKGROUND street\nNina: "Now." [sad]');
    chat.chat[1].swipes = [chat.chat[1].mes, assistant('#BACKGROUND rejected\n#ENTER Secret').mes];
    chat.chat[1].swipe_id = 1; assert.equal(project(chat).background, 'street');
    chat.chat[1].mes = assistant('#BACKGROUND kitchen\nNin: "Edited." [angry]').mes;
    assert.equal(project(chat).characters.nina.expression, 'angry'); assert.equal(project(chat, {}, 0).characters.nina, undefined);
    chat.chat.pop(); assert.equal(project(chat).background, 'kitchen'); assert.deepEqual(Object.keys(project(chat).characters), ['ashley']);
});
test('playback seed excludes current body changes but includes its canonical header and cast recency boundary', () => {
    const chat = context(`${header()}\n#BACKGROUND kitchen\nAshley: "Old." [happy]`, 'Quiet.', 'Quiet.', '#BACKGROUND street\nNina: "New." [sad]');
    const seed = project(chat, {}, 3, true); assert.equal(seed.background, 'kitchen'); assert.deepEqual(Object.keys(seed.characters), []);
    chat.chat[3].mes = `${header('9:00 p.m.', 'Street')}\nPRIVATE\n/////\nNina: "Here." [sad]`;
    assert.equal(project(chat, {}, 3, true).scene.time, '21:00');
});
test('context input contains no raw dialogue HTML canonical prose one-shot effects or future messages', () => {
    const chat = context('Ashley: "PRIVATE_DIALOGUE" [happy]\n#SFX private_sound\n#FLASH RED\n#SHAKE LIGHT\n<div>PRIVATE_HTML</div>', '#ENTER Future');
    const original = JSON.stringify(chat), entries = contextEntries(chat, 0), serialized = JSON.stringify(entries);
    for (const secret of ['PRIVATE_DIALOGUE', 'PRIVATE_HTML', 'PRIVATE_CANONICAL', 'private_sound', 'Future']) assert(!serialized.includes(secret));
    assert.deepEqual(contextNames(entries), ['Ashley']); assert.equal(JSON.stringify(chat), original);
});
