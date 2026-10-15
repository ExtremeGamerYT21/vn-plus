import test from 'node:test';
import assert from 'node:assert/strict';
import { assetKeywords, rankAssetNames } from '../core/asset-matching.js';
import { AssetResolver } from '../core/asset-resolver.js';

test('keywords normalize separators, camel case, accents, phrases and synonyms', () => {
    assert.deepEqual(assetKeywords('The MístyWoodland_trail-at-Night'), ['fog', 'forest', 'path', 'night']);
    assert.deepEqual(assetKeywords('Living room interior'), ['lounge', 'inside']);
});
test('descriptive ranking prefers location and requested time over shared atmosphere', () => {
    const files = ['Hogwarts - Corridor - Day.png', 'Hogwarts - Corridor - Night.png', 'Hogwarts - Library - Night.png'];
    assert.equal(rankAssetNames('Hogwarts hallway at night', files)[0].path, files[1]);
    assert.equal(rankAssetNames('Hogwarts greenhouse at night', files).length, 0);
    assert.equal(rankAssetNames('underwater submarine', files).length, 0);
});
test('synonyms and compound words rank locally without depending on catalog order', () => {
    const files = ['Misty woodland trail.png', 'Woodland trail.png', 'Desert path.png'];
    assert.equal(rankAssetNames('foggy forest path', files)[0].path, files[0]);
    const ties = ['forest path B.png', 'forest path A.png'];
    assert.deepEqual(rankAssetNames('woods trail', ties), rankAssetNames('woods trail', [...ties].reverse()));
    assert.equal(rankAssetNames('the image of a scene', files).length, 0);
});
test('explicit conflicting inside/outside, weather and time are rejected', () => {
    for (const [query, file] of [['castle inside', 'castle exterior.png'], ['castle rain', 'castle snow.png'], ['castle night', 'castle day.png']]) assert.equal(rankAssetNames(query, [file]).length, 0);
});

const withMissingFetch = async callback => {
    const original = globalThis.fetch; globalThis.fetch = async () => ({ ok: false });
    try { await callback(); } finally { globalThis.fetch = original; }
};
test('literal and freshly added exact backgrounds beat descriptive alternatives', async () => {
    const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['backgrounds/hallway.png', 'backgrounds/Corridor night.png'] });
    assert.equal(await resolver.background('HALLWAY'), 'http://localhost/vn/backgrounds/hallway.png');
    const original = globalThis.fetch;
    globalThis.fetch = async url => ({ ok: String(url).endsWith('/hallway_night.webp'), headers: { get: () => 'image/webp' } });
    try { assert.match(await resolver.background('hallway_night'), /hallway_night.webp$/); } finally { globalThis.fetch = original; }
});
test('background keyword fallback stays in category and exposes its decision', async () => withMissingFetch(async () => {
    const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['backgrounds/Hogwarts - Corridor - Night.png', 'characters/nina/hallway_night.png', 'backgrounds/../../escape/hallway_night.png', 'backgrounds/hallway_night.mp3'] });
    assert.match(await resolver.background('Hogwarts hallway at night'), /Hogwarts%20-%20Corridor%20-%20Night.png$/);
    assert.equal([...resolver.diagnostics.values()].at(-1).method, 'keywords');
    assert.equal(await resolver.background('../hallway'), null);
    assert.equal(await resolver.background('space station'), null);
}));
test('sprites match descriptive emotions before default but never another character or blink art', async () => withMissingFetch(async () => {
    const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['characters/nina/default.png', 'characters/nina/sprites/cheerful_smile.png', 'characters/nina/sprites/sad_blink.png', 'characters/nina/sprites/sadBlink.png', 'characters/ashley/sad.png'] });
    assert.match(await resolver.sprite('nina', ['joyful', 'default']), /cheerful_smile.png$/);
    assert.match(await resolver.sprite('nina', ['sad', 'default']), /nina\/default.png$/);
    assert.equal(await resolver.sprite('nina', ['sad']), null);
    assert.equal(await resolver.blinkSprite('nina', ['joyful']), null);
}));
test('exact expression aliases still beat a semantic sprite and fallback is environment-local', async () => withMissingFetch(async () => {
    const one = new AssetResolver(new URL('http://localhost/one/'), { files: ['characters/nina/happy.png', 'characters/nina/cheerful_smile.png', 'backgrounds/forest_trail.png'] });
    const two = new AssetResolver(new URL('http://localhost/two/'), { files: [] });
    assert.match(await one.sprite('nina', ['joyful', 'happy', 'default']), /happy.png$/);
    assert.match(await one.background('woods path'), /one\/backgrounds\/forest_trail.png$/);
    assert.equal(await two.background('woods path'), null);
}));
