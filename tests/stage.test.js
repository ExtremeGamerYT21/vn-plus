import test from 'node:test';
import assert from 'node:assert/strict';
import { stagePosition, characterBustScale, castZoom } from '../core/stage-layout.js';
import { breathingConfig, createBreathingMesh, deformBreathingMesh } from '../renderers/sprite-mesh.js';
import { AssetResolver } from '../core/asset-resolver.js';
import { DEFAULT_SETTINGS, loadSettings } from '../ui/settings.js';

test('cast zoom makes equally large or equally small characters normal sized together', () => {
    for (const sizes of [[2, 2], [.5, .5], [3], [.25]]) {
        const zoom = castZoom(sizes);
        for (const size of sizes) assert.ok(Math.abs(size * zoom - 1) < 1e-12);
    }
    assert.equal(castZoom([]), 1);
});

test('introducing a small character zooms the large cast up while preserving every size ratio', () => {
    const zoom = castZoom([2, 2, .5]);
    assert.ok(2 * zoom > 1); assert.ok(.5 * zoom < 1);
    assert.equal(2 * zoom / (.5 * zoom), 4);
    assert.ok(Math.abs(castZoom([20, 20, 5]) * 10 - zoom) < 1e-12);
    assert.equal(castZoom([2, .5]), 1);
    assert.equal(castZoom([2, 2]), .5);
});

test('character size parsing defaults missing or invalid scales without accepting nonpositive sizes', () => {
    for (const value of [undefined, null, '', 'bad', 0, -1, NaN, Infinity]) assert.equal(characterBustScale(value), 1);
    assert.equal(characterBustScale('0.75'), .75);
    assert.equal(castZoom([undefined, -1, 0]), 1);
});

test('grouped rows alternate sides and recede upwards/inwards with modest scaling', () => {
    const positions = Array.from({ length: 6 }, (_, slot) => stagePosition(slot, 6, DEFAULT_SETTINGS));
    assert.deepEqual(positions.map(position => position.side), ['left', 'right', 'left', 'right', 'left', 'right']);
    assert.ok(positions[2].x > positions[0].x && positions[2].x < 50);
    assert.ok(positions[3].x < positions[1].x && positions[3].x > 50);
    assert.ok(positions[2].lift > positions[0].lift); assert.ok(positions[3].lift > positions[1].lift);
    assert.equal(positions[2].scale, .95); assert.ok(positions[4].scale < positions[2].scale);
    assert.ok(positions[2].z < positions[0].z);
});
test('stage rows remain stable when the speaker changes and leave a central gap', () => {
    const first = stagePosition(2, 8, { ...DEFAULT_SETTINGS, speaker: 'A' });
    assert.deepEqual(first, stagePosition(2, 8, { ...DEFAULT_SETTINGS, speaker: 'B' }));
    for (let slot = 0; slot < 20; slot++) {
        const position = stagePosition(slot, 20, DEFAULT_SETTINGS);
        assert.ok(position.x >= 5 && position.x <= 95); assert.ok(position.lift <= 22);
        assert.ok(position.side === 'left' ? position.x < 50 : position.x > 50);
    }
});
test('custom positions and alternative spread layout remain available', () => {
    const s = { ...DEFAULT_SETTINGS, layouts: { 4: [88, 12, 72, 28] } };
    assert.equal(stagePosition(0, 4, s).x, 12); assert.equal(stagePosition(1, 4, s).x, 88);
    assert.equal(stagePosition(2, 4, s).x, 28); assert.equal(stagePosition(3, 4, s).x, 72);
    assert.equal(stagePosition(2, 4, { ...DEFAULT_SETTINGS, layout: 'spread' }).scale, 1);
});
test('legacy layouts migrate to the selectable modes without losing preferences', () => {
    const previous = { layout: 'spread', musicVolume: .23, characters: { nina: { bustScale: .8 } } };
    const settings = loadSettings({ extensionSettings: { visual_novel_plus: previous } });
    assert.equal(settings.layout, 'separate'); assert.equal(settings.stageLayoutVersion, 3); assert.equal(settings.musicVolume, .23);
    assert.equal(settings.characters.nina.bustScale, .8);
    assert.equal(settings.spriteFraming, 'bust');
    assert.equal(loadSettings({ extensionSettings: { visual_novel_plus: { spriteFraming: 'full-body' } } }).spriteFraming, 'full-body');
    assert.equal(loadSettings({ extensionSettings: { visual_novel_plus: { ...previous, layout: 'rows', stageLayoutVersion: 2 } } }).layout, 'rows');
    assert.equal(loadSettings({ extensionSettings: { visual_novel_plus: { ...previous, layout: 'compact' } } }).layout, 'separate');
});
test('four separate busts have distinct flat stations even with fewer characters', () => {
    const settings = { ...DEFAULT_SETTINGS, layout: 'separate' };
    const positions = Array.from({ length: 4 }, (_, slot) => stagePosition(slot, 4, settings));
    const sorted = [...positions].sort((a, b) => a.x - b.x);
    assert.deepEqual(sorted.map(position => position.x), [12.5, 37.5, 62.5, 87.5]);
    assert.ok(positions.every(position => position.depth === 0 && position.lift === 0 && position.scale === 1));
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].x - sorted[i - 1].x > sorted[i].width);
    assert.equal(stagePosition(0, 1, settings).x, 12.5); assert.equal(stagePosition(1, 2, settings).x, 87.5);
    const larger = Array.from({ length: 6 }, (_, slot) => stagePosition(slot, 6, settings));
    assert.equal(new Set(larger.map(position => position.x)).size, 6);
});
test('breathing mesh has shared triangle edges, fixed UVs, and smooth fractional movement', () => {
    const mesh = createBreathingMesh(), config = breathingConfig({});
    assert.equal(mesh.uv.length, 49 * 49 * 2); assert.equal(mesh.indices.length, 48 * 48 * 6);
    assert.equal(new Set(mesh.indices).size, 49 * 49);
    assert.deepEqual(deformBreathingMesh(mesh, config, 0), mesh.uv);
    const index = (30 * 49 + 32) * 2;
    const first = deformBreathingMesh(mesh, config, .5)[index];
    const second = deformBreathingMesh(mesh, config, .5001)[index];
    assert.ok(second > first && second - first < .00001);
    const positions = deformBreathingMesh(mesh, config, 1);
    for (let i = 0; i < mesh.uv.length; i += 2) {
        const x = mesh.uv[i], y = mesh.uv[i + 1];
        if (x === 0 || x === 1 || y === 0 || y === 1 || y < .3) {
            assert.equal(positions[i], x); assert.equal(positions[i + 1], y);
        }
    }
    assert.ok(positions[(30 * 49 + 16) * 2] < mesh.uv[(30 * 49 + 16) * 2]);
    assert.ok(positions[index] > mesh.uv[index]);
});
test('per-character centers relocate the mesh and clamp invalid property values', () => {
    assert.deepEqual(breathingConfig({ breathing: { centerX: -2, centerY: 3, amount: 99, duration: 'bad' } }), { enabled: true, centerX: 0, centerY: 1, amount: .05, duration: 4200 });
    assert.equal(breathingConfig({ breathing: false }).enabled, false);
    const config = breathingConfig({ breathing: { centerX: .25, centerY: .4 } });
    const mesh = createBreathingMesh(); deformBreathingMesh(mesh, config, 1);
    const index = (19 * 49 + 16) * 2;
    assert.ok(mesh.positions[index] > mesh.uv[index]);
    assert.equal(mesh.positions[(40 * 49 + 24) * 2 + 1], mesh.uv[(40 * 49 + 24) * 2 + 1]);
});
test('maximum breathing cannot tear or invert triangles at any center', () => {
    const mesh = createBreathingMesh();
    for (const center of [[.5, .62], [0, 0], [1, 1], [.03, .62], [.97, .08]]) {
        deformBreathingMesh(mesh, { amount: .05, centerX: center[0], centerY: center[1] }, 1);
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const [a, b, c] = [...mesh.indices.slice(i, i + 3)].map(index => index * 2), p = mesh.positions;
            const area = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a]);
            assert.ok(area < -0.0001, `Fold at ${center}: ${area}`);
        }
    }
});
test('optional blink images resolve explicit paths and flat automatic variants', async () => {
    const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['characters/nina/happy_blink.webp', 'characters/nina/sprites/closed.png'] });
    assert.match(await resolver.blinkSprite('nina', ['happy'], {}), /happy_blink.webp$/);
    assert.match(await resolver.blinkSprite('nina', ['happy'], { blink: { images: { HAPPY: 'sprites/closed.png' } } }), /closed.png$/);
    assert.equal(await resolver.blinkSprite('nina', ['happy'], { blink: false }), null);
});
test('missing optional blink art causes no network probes or missing-asset errors', async () => {
    const original = globalThis.fetch; let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('No network expected'); };
    try {
        const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['characters/nina/happy.webp'] });
        assert.equal(await resolver.blinkSprite('nina', ['happy'], {}), null); assert.equal(requests, 0); assert.equal(resolver.diagnostics.size, 0);
    } finally { globalThis.fetch = original; }
});
