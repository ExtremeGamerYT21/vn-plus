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
function hostFixture(native = true) {
    let context = { characterId: 0, chatId: 'A', chatMetadata: { variables: { unrelated: 'keep' } }, saveMetadataDebounced() { saves++; } };
    let saves = 0;
    if (native) context.variables = { local: { set(name, value) { context.chatMetadata.variables[name] = value; saves++; } } };
    return { host: createHost(() => context), get context() { return context; }, get saves() { return saves; }, switch(next) { context = next; } };
}
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
test('macro variables serialize structured data and clear absent scalar fields without writing globals', () => {
    const values = sharedVariables(snapshot());
    assert.equal(JSON.parse(values.vn_plus).player.emotion, 'sad'); assert.equal(values.vn_plus_time, '21:00');
    assert.equal(values.vn_plus_inside, 'true'); assert.equal(values.vn_plus_time_of_day, 'night');
    const fixture = hostFixture(), publisher = new ChatStatePublisher(fixture.host); publisher.bind(environment);
    assert.equal(fixture.context.chatMetadata.variables.vn_plus_time, '');
    assert.equal(fixture.context.chatMetadata.variables.unrelated, 'keep'); assert.equal(fixture.context.extensionSettings, undefined);
});
test('native local variable setter persists JSON strings and identical writes are deduplicated', () => {
    const fixture = hostFixture(), events = [], publisher = new ChatStatePublisher(fixture.host, value => events.push(value));
    publisher.bind(environment); const first = fixture.saves;
    publisher.update({ active: false, generating: false }); assert.equal(fixture.saves, first);
    publisher.commit(snapshot(), publisher.begin()); assert(fixture.saves > first); const next = fixture.saves;
    publisher.commit(snapshot(), publisher.begin()); assert.equal(fixture.saves, next); assert.equal(events.length, 2);
    events[1].player.emotion = 'mutated'; assert.equal(publisher.snapshot.player.emotion, 'sad');
    const copy = publisher.snapshot; copy.characters.length = 0; assert.equal(publisher.snapshot.characters.length, 1);
});
test('metadata fallback works without the newer local setter', () => {
    const fixture = hostFixture(false), publisher = new ChatStatePublisher(fixture.host);
    publisher.bind(environment); publisher.commit(snapshot(), publisher.begin());
    assert.equal(JSON.parse(fixture.context.chatMetadata.variables.vn_plus).music.name, 'piano'); assert(fixture.saves > 0);
});
test('old async work cannot write into a new chat even if chat ID or metadata alone is reused', () => {
    const fixture = hostFixture(), publisher = new ChatStatePublisher(fixture.host); publisher.bind(environment);
    const epoch = publisher.begin(), old = fixture.context.chatMetadata;
    fixture.context.chatId = 'B'; assert.equal(publisher.commit(snapshot(), epoch), false);
    assert.equal(JSON.parse(old.variables.vn_plus).available, false);
    fixture.context.chatId = 'A'; fixture.context.chatMetadata = { variables: {} };
    assert.equal(publisher.commit(snapshot(), epoch), false); assert.deepEqual(fixture.context.chatMetadata.variables, {});
    publisher.bind(environment); const older = publisher.begin(), newer = publisher.begin();
    assert.equal(publisher.commit(snapshot(), older), false); assert.equal(publisher.commit(snapshot(), newer), true);
});
test('persisted output is discarded on binding so only reconstructed context can become available', () => {
    const fixture = hostFixture(), publisher = new ChatStatePublisher(fixture.host);
    publisher.bind(environment); publisher.commit(snapshot(), publisher.begin());
    const restored = new ChatStatePublisher(fixture.host); restored.bind(environment);
    assert.equal(restored.snapshot.active, false); assert.equal(restored.snapshot.available, false);
    assert.equal(restored.snapshot.music, null); assert.equal(restored.snapshot.player, null);
    restored.bind({ id: 'other', name: 'Other' }); assert.equal(restored.snapshot.available, false);
    assert.equal(fixture.context.chatMetadata.variables.vn_plus_music, ''); assert.equal(fixture.context.chatMetadata.variables.vn_plus_inside, '');
});
test('cancellation rejects obsolete scenes and pending snapshots suppress interim audio writes', () => {
    const fixture = hostFixture(), publisher = new ChatStatePublisher(fixture.host); publisher.bind(environment);
    const epoch = publisher.begin(); publisher.update({ active: true }); assert.equal(publisher.snapshot.active, false);
    publisher.cancel(); assert.equal(publisher.commit(snapshot(), epoch), false);
    publisher.update({ generating: true }); assert.equal(JSON.parse(fixture.context.chatMetadata.variables.vn_plus).generating, true);
});
test('no selected chat or metadata cannot create a global or anonymous variable cache', () => {
    for (const context of [{ chatId: null, chatMetadata: {} }, { chatId: '', chatMetadata: {} }, { chatId: 'A' }]) {
        const publisher = new ChatStatePublisher(createHost(() => context)); publisher.bind(environment);
        assert.equal(publisher.commit(snapshot(), publisher.begin()), false); assert.equal(context.chatMetadata?.variables, undefined);
    }
});
