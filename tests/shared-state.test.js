import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../integration.js';
import { ChatStatePublisher, sceneSnapshot, sharedVariables } from '../core/shared-state.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { inheritedWorld, worldHistory } from '../core/scene-history.js';
import { parsePOV } from '../core/vn-parser.js';
import { parseSceneHeader, sceneLighting } from '../core/scene-context.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

const environment = { id: 'test', name: 'Test' };
function snapshot() {
    const settings = { ...structuredClone(DEFAULT_SETTINGS), showPlayerBust: false }, registry = new CharacterRegistry({ inventory: {} }, settings);
    registry.properties.set('jason_weber', { displayName: 'Jason Weber', aliases: ['Jason'], voiceId: 'DO_NOT_EXPORT', secret: 'PRIVATE_PROPERTIES' });
    registry.knownProperties.add('jason_weber');
    const state = compileTimeline(parsePOV('Jason: "PRIVATE_DIALOGUE" [sad]\nAshley: "Hello." [happy]').tokens, registry, settings).finalState;
    state.scene = parseSceneHeader('[3 August 1991 | Before First Year | 9:00 p.m. | Summer | Shop]');
    state.background = 'shop'; state.music = { name: 'piano', rate: .75 }; state.tint = 'blue';
    const stage = { backgroundUrl: '/backgrounds/shop.png', variables: { lighting: sceneLighting(state.scene, true) }, ambientColor: 'rgb(0, 0, 255)', appliedTint: 'blue' };
    const audio = { channels: { music: { url: '/music/piano.mp3', audio: { paused: false, playbackRate: .75 } }, ambient: {} } };
    return sceneSnapshot({ state, registry, settings, environment, stage, audio, source: { message: 1, swipe: 0, beat: 1, position: 1 } });
}
test('shared snapshot exports canonical cast, hidden player emotion, indoor lighting and independent time of day without private properties', () => {
    const value = snapshot();
    assert.deepEqual(value.characters.map(character => [character.id, character.emotion]), [['ashley', 'happy']]);
    assert.equal(value.player.id, 'jason_weber'); assert.equal(value.player.emotion, 'sad'); assert.equal(value.player.present, false);
    assert.equal(value.background.inside, true); assert.equal(value.lighting.level, 1); assert.equal(value.timeOfDay, 'night');
    assert.equal(value.lighting.ambientColor, 'rgb(0, 0, 255)'); assert.equal(value.music.playing, true); assert.equal(value.music.rate, .75);
    assert(!JSON.stringify(value).includes('PRIVATE')); assert(!JSON.stringify(value).includes('DO_NOT_EXPORT'));
});
test('player emotion survives history, aliases, exits and hidden busts, but resets with the world', () => {
    const settings = { ...structuredClone(DEFAULT_SETTINGS), showPlayerBust: false }, registry = new CharacterRegistry({ inventory: {} }, settings);
    const context = { chat: [{ mes: 'CANONICAL\n/////\nJason: "First." [angry]\n#EXIT Jason' }, { mes: 'CANONICAL\n/////\nNow.' }] };
    const seed = inheritedWorld(worldHistory(context, 1), registry, settings, null);
    assert.equal(seed.playerEmotion, 'angry'); assert.deepEqual(Object.keys(seed.characters), []);
    assert.equal(compileTimeline(parsePOV('#SCENE RESET\nNow.').tokens, registry, settings, seed).finalState.playerEmotion, null);
});
test('message publishers deduplicate state changes and export detached event and getter copies', t => {
    const context = { chatId: 'A', chat: [{ mes: 'SECRET\n/////\nHello.' }] }, host = createHost(() => context), events = [];
    t.after(() => host.extra.dispose());
    const publisher = new ChatStatePublisher(host, value => events.push(value)); publisher.bind(environment);
    publisher.update({ active: false, generating: false }); assert.equal(events.length, 1);
    publisher.commit(snapshot(), publisher.begin()); publisher.commit(snapshot(), publisher.begin()); assert.equal(events.length, 2);
    events[1].player.emotion = 'changed'; const copy = publisher.snapshot; copy.characters.length = 0;
    assert.equal(publisher.snapshot.player.emotion, 'sad'); assert.equal(publisher.snapshot.characters.length, 1);
    assert.equal(context.chat[0].extra.vn_plus.context.player.emotion, 'sad');
    assert.equal(context.chat[0].extra.vn_plus.variables.vn_plus_time, '21:00');
});
test('cancelled or obsolete message publishers cannot commit pending snapshots', t => {
    const context = { chatId: 'A', chat: [{ mes: 'SECRET\n/////\nHello.' }] }, host = createHost(() => context); t.after(() => host.extra.dispose());
    const publisher = new ChatStatePublisher(host); publisher.bind(environment);
    const epoch = publisher.begin(); publisher.update({ active: true }); assert.equal(publisher.snapshot.active, false);
    publisher.cancel(); assert.equal(publisher.commit(snapshot(), epoch), false);
    const pending = publisher.begin(); context.chat[0].mes += ' Edit.'; assert.equal(publisher.commit(snapshot(), pending), false);
    publisher.bind(environment); assert.equal(publisher.snapshot.available, false);
});
test('anonymous contexts never create message extra or global shared variables', () => {
    for (const context of [{ chatId: null, chat: [{ mes: 'Hello.' }] }, { chatId: '', chat: [{ mes: 'Hello.' }] }, { chatId: 'A', chat: [] }]) {
        const host = createHost(() => context), publisher = new ChatStatePublisher(host); publisher.bind(environment);
        assert.equal(publisher.commit(snapshot(), publisher.begin()), false); assert.equal(context.chat[0]?.extra, undefined); assert.equal(context.chatMetadata, undefined); host.extra.dispose();
    }
});