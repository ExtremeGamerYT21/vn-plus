import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { contextEntries, reduceContext } from '../core/context-state.js';
import { characterPresent, quietPresentation } from '../core/character-presence.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
const settings = structuredClone(DEFAULT_SETTINGS), registry = new CharacterRegistry({ inventory: {} }, settings);
registry.properties.set('nina', { aliases: ['Nin'] });
const compile = (text, seed) => compileTimeline(parsePOV(text).tokens, registry, settings, seed);

test('short response cache windows cannot cut the four-beat grace short', () => {
    for (const castMemoryTurns of [1, 3]) {
        const context = { chat: [{ mes: 'PRIVATE\n/////\nNina: "Here."' }] };
        for (let beat = 1; beat <= 5; beat++) {
            context.chat.push({ mes: 'PRIVATE\n/////\nAshley: "Waiting."' });
            const state = reduceContext(contextEntries(context), registry, { ...settings, castMemoryTurns });
            assert.equal(state.characters.nina.silentBeats, beat); assert.equal(state.characters.nina.present, beat <= 4);
        }
        context.chat.push({ mes: 'PRIVATE\n/////\nAshley: "Done."' });
        assert.equal(reduceContext(contextEntries(context), registry, { ...settings, castMemoryTurns }).characters.nina, undefined);
    }
});

test('grace carries across responses without resetting and speaking resets it while explicit exits still win', () => {
    let state = compile('Nina: "Here." [happy]').finalState;
    for (let count = 1; count <= 4; count++) {
        state = compile('Ashley: "Waiting."', state).finalState;
        assert.equal(state.characters.nina.silentBeats, count); assert.equal(state.characters.nina.present, true);
        assert.equal(quietPresentation(state.characters.nina, state.speaker, settings).retreat, 0);
    }
    const gone = compile('Ashley: "Still waiting."', state).finalState;
    assert.equal(gone.characters.nina.silentBeats, 5); assert.equal(gone.characters.nina.present, false);
    const returned = compile('Nin: "Back."', gone).finalState;
    assert.equal(returned.characters.nina.present, true); assert.equal(returned.characters.nina.silentBeats, 0); assert.equal(returned.characters.nina.expression, 'happy');
    assert.equal(compile('Ashley: "Waiting again."', returned).finalState.characters.nina.silentBeats, 1);
    assert.equal(compile('#EXIT Nina\nAshley: "Gone."', returned).finalState.characters.nina, undefined);
});

test('absent participants retire after their grace while cached expressions survive silence', () => {
    const old = compile('Nina: "Hello." [happy]\nAshley: "Here." [angry]').finalState;
    const next = compile(Array.from({ length: 5 }, (_, index) => 'Ashley: "Still here ' + index + '."').join('\n'), old);
    assert.equal(next.finalState.characters.nina.present, false); assert.equal(next.finalState.characters.nina.expression, 'happy');
    assert.equal(next.finalState.characters.ashley.present, true); assert.equal(next.finalState.characters.ashley.expression, 'angry');
    assert.equal(next.maxSlots, 2);
    const returned = compile('Grace: "Hello."\nNin: "Back."', next.finalState).finalState;
    assert.equal(returned.characters.nina.present, true); assert.equal(returned.characters.nina.expression, 'happy');
    const active = Object.values(returned.characters).filter(characterPresent);
    assert.equal(new Set(active.map(character => character.slot)).size, active.length);
    assert.equal(compile('Nin: "Reset." [default]', returned).finalState.characters.nina.expression, 'default');
    assert.equal(compile('#ENTER Nina\nThe room is quiet.', old).finalState.characters.nina.present, true);
    assert.equal(compile('Nobody speaks.', old).finalState.characters.nina.present, true);
});
test('four complete silent beats precede retreat and dimming, commands do not age people, and speaking restores focus', () => {
    const text = 'Nina: "First." [happy]\nAshley: "One."\n#MUSIC buzz\nAshley: "Two."\nThe door creaks.\nAshley: "Three."\nAshley: "Four."\nAshley: "Five."\nAshley: "Six."\nAshley: "Seven."\nNina: "Back."';
    const timeline = compile(text), views = timeline.views.map(index => timeline.beats[index]);
    assert.deepEqual(views.map(beat => beat.state.characters.nina.silentBeats), [0, 1, 2, 3, 4, 5, 6, 7, 8, 0]);
    for (const beat of views.slice(1, 5)) assert.deepEqual(quietPresentation(beat.state.characters.nina, beat.state.speaker, settings), { quiet: 0, retreat: 0, brightness: 1 });
    const quiet = views.slice(5, 9).map(beat => quietPresentation(beat.state.characters.nina, beat.state.speaker, settings));
    for (let index = 1; index < quiet.length; index++) { assert.ok(quiet[index].retreat > quiet[index - 1].retreat); assert.ok(quiet[index].brightness < quiet[index - 1].brightness); }
    assert.ok(Math.abs(quiet.at(-1).brightness - settings.inactiveBrightness) < 1e-9);
    assert.deepEqual(quietPresentation(views.at(-1).state.characters.nina, 'nina', settings), { quiet: 0, retreat: 0, brightness: 1 });
    assert.deepEqual(compile(text), timeline); assert.equal(views.at(-1).state.characters.nina.expression, 'happy');
});
test('history marks absent people as cached, preserves explicit defaults and ignores unavailable POVs for presence', () => {
    const chat = { chatId: 'presence', characterId: 0, chat: ['Nina: "Here." [happy]', 'Ashley: "Now."', 'Nin: "Reset." [default]'].map(pov => ({ mes: `PRIVATE\n/////\n${pov}` })) };
    chat.chat[1].mes = 'PRIVATE\n/////\n' + Array.from({ length: 5 }, (_, index) => 'Ashley: "Now ' + index + '."').join('\n');
    let state = reduceContext(contextEntries(chat, 1), registry, settings);
    assert.equal(state.characters.nina.present, false); assert.equal(state.characters.nina.expression, 'happy');
    state = reduceContext(contextEntries(chat), registry, settings); assert.equal(state.characters.nina.expression, 'default');
    chat.chat.push({ mes: 'PRIVATE\n/////\n' });
    state = reduceContext(contextEntries(chat), registry, settings); assert.equal(state.characters.nina.present, true);
});
