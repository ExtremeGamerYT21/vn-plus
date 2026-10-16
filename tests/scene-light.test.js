import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneLight, surfaceLight, LIGHT_DEFAULTS } from '../core/scene-light.js';
import { AssetResolver } from '../core/asset-resolver.js';
import { inventoryCharacters } from '../core/content-inventory.js';
import { DEFAULT_SETTINGS, loadSettings } from '../ui/settings.js';
import { sceneSnapshot } from '../core/shared-state.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { emptyState } from '../core/scene-timeline.js';

const options = { ...LIGHT_DEFAULTS, sceneLightEnabled: true };
const at = (hour, inside = false, settings = options, properties = {}) => sceneLight({ minutes: hour * 60 }, inside, settings, properties);

test('scene light follows an orange-left white-overhead orange-right sun path with smooth interpolation', () => {
    const lights = [6, 9, 12, 15, 18].map(hour => at(hour));
    for (const [index, point] of [[.06, .5], [.22, .08], [.5, -.08], [.78, .08], [.94, .5]].entries()) {
        assert.ok(Math.abs(lights[index].position.x - point[0]) < 1e-10); assert.ok(Math.abs(lights[index].position.y - point[1]) < 1e-10);
    }
    assert.deepEqual(lights.map(light => light.color), ['#ff9955', '#ffe4a3', '#fffdf5', '#ffe4a3', '#ff9955']);
    const before = at(10), after = at(10 + 1 / 60);
    assert.ok(after.position.x > before.position.x && after.position.x - before.position.x < .002);
    assert.ok(after.position.y < before.position.y); assert.ok(lights.every(light => light.kind === 'sun'));
});
test('indoor light is candle-colored overhead and independent of the scene hour', () => {
    assert.deepEqual(at(0, true), at(12, true)); assert.deepEqual(at(6, true), at(23, true));
    assert.equal(at(0, true).color, '#ffd39a'); assert.equal(at(0, true).position.y, .05);
    assert.equal(at(0, true).kind, 'indoor'); assert.equal(at(0, true).level, 1);
});
test('night and missing time remain finite usable and independent of the real clock', () => {
    assert.equal(at(0).kind, 'moon'); assert.equal(at(23).color, '#b5c9ff');
    const unknown = sceneLight(null, false, options);
    assert.equal(unknown.kind, 'unknown'); assert.equal(unknown.level, 1); assert.equal(unknown.position.x, .5);
    assert.equal(sceneLight({ minutes: NaN }, false, options).kind, 'unknown');
    assert.ok(surfaceLight(at(0)).brightness >= .4);
});
test('background light properties override auto position color intensity and fill with bounded validation', () => {
    const properties = { light: { position: { x: .8, y: .2, z: .7 }, color: '#CDBA98', intensity: .6, ambient: .2, unrelated: 'PRIVATE' } };
    const result = at(12, false, options, properties);
    assert.deepEqual(result.position, { x: .8, y: .2, z: .7 }); assert.equal(result.color, '#cdba98');
    assert.equal(result.intensity, .6); assert.equal(result.ambient, .2); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
    const invalid = at(12, false, options, { light: { position: { x: 900, y: NaN, z: -2 }, color: 'url(https://evil/)', intensity: Infinity, ambient: -5 } });
    assert.deepEqual(invalid.position, { x: 3, y: -.08, z: .05 }); assert.equal(invalid.color, '#fffdf5'); assert.equal(invalid.intensity, 1); assert.equal(invalid.ambient, 0);
});
test('light and map options migrate safely off and remain independent of animation preferences', () => {
    const settings = loadSettings({ extensionSettings: {} }); assert.equal(settings.sceneLightEnabled, false); assert.equal(settings.sceneLightNormalMaps, true);
    assert.equal(at(12, false, { ...options, reducedMotion: true, spriteBreathing: false }).enabled, true);
    assert.equal(at(12, false, { ...options, sceneLightNormalMaps: false }).normalMaps, false);
    assert.deepEqual(surfaceLight({ enabled: false }), { brightness: 1, color: '#ffffff', direction: { x: 0, y: -1 }, diffuse: 0 });
    const left = { ...at(12), position: { x: -.5, y: .5, z: .5 } };
    assert.ok(surfaceLight(left).direction.x < 0); assert.ok(surfaceLight(left, { x: .5, y: .5 }, 1, [-1, 0, 0]).diffuse > surfaceLight(left, { x: .5, y: .5 }, 1, [1, 0, 0]).diffuse);
});
test('normal and material images never enter emotion lists or replace missing artwork', async t => {
    const files = ['characters/nina/sprites/joy_normal.png', 'characters/nina/sprites/joy_material.png'];
    assert.deepEqual(inventoryCharacters(files).nina.expressions, []);
    const resolver = new AssetResolver(new URL('https://local.test/world/'), { files });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false }));
    assert.equal(await resolver.sprite('nina', ['joy', 'default']), null);
    assert.equal(resolver.semanticImage('joy', ['characters/nina'], true), null);
});
test('maps follow the resolved sprite path and stay local with no semantic or cross-character fallback', async t => {
    const files = ['characters/nina/sprites/JOY_normal.png', 'characters/nina/sprites/joy_material.png', 'characters/ashley/sprites/joy_normal.png'];
    const resolver = new AssetResolver(new URL('https://local.test/world/'), { files }); let probes = 0;
    t.mock.method(globalThis, 'fetch', async () => { probes++; return { ok: false }; });
    const maps = await resolver.spriteMaps('https://local.test/world/characters/nina/sprites/joy.png');
    assert.equal(maps.normal, 'https://local.test/world/characters/nina/sprites/JOY_normal.png'); assert.ok(maps.material.endsWith('joy_material.png')); assert.equal(probes, 0);
    assert.deepEqual(await resolver.spriteMaps('https://evil.test/characters/nina/joy.png'), {});
    assert.deepEqual(await resolver.spriteMaps('https://local.test/world/backgrounds/joy.png'), {});
    assert.deepEqual(await resolver.spriteMaps('https://local.test/world/characters/nina/sprites/sad.png'), {}); assert.equal(probes, 2);
    await resolver.spriteMaps('https://local.test/world/characters/nina/sprites/sad.png'); assert.equal(probes, 2); assert.equal(resolver.diagnostics.size, 0);
});
test('resolved background metadata carries only its own authored light definition', async () => {
    const resolver = new AssetResolver(new URL('https://local.test/world/'));
    const light = { position: { x: .1 }, color: '#abcdef' };
    resolver.json = async path => path.endsWith('properties.json') ? { 'Room.png': { inside: true, light, unrelated: 'PRIVATE' } } : null;
    assert.deepEqual(await resolver.backgroundProperties('https://local.test/world/backgrounds/Room.png'), { inside: true, light });
    assert.deepEqual(await resolver.backgroundProperties('https://local.test/world/backgrounds/Other.png'), { inside: false });
});
test('extra scene snapshots include the same authored light without retaining private character data', () => {
    const settings = { ...structuredClone(DEFAULT_SETTINGS), ...options }, registry = new CharacterRegistry({ inventory: {} }, settings);
    const state = emptyState('vn'); state.scene = { minutes: 720 }; state.background = 'room';
    const value = sceneSnapshot({ state, settings, registry, environment: { id: 'test', name: 'Test' }, source: {}, audio: { channels: {} }, stage: {
        variables: { lighting: { inside: true } }, backgroundProperties: { inside: true, light: { color: '#aabbcc', position: { x: .1 } } },
    } });
    assert.equal(value.lighting.light.color, '#aabbcc'); assert.equal(value.lighting.light.position.x, .1); assert.equal(value.lighting.light.kind, 'indoor');
});
