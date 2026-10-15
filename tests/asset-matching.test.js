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
    // With no neutral/default permitted, the only open expression is the last-ranked choice.
    assert.match(await resolver.sprite('nina', ['sad']), /cheerful_smile.png$/);
    assert.equal(await resolver.sprite('missing', ['sad']), null);
    assert.equal(await resolver.blinkSprite('nina', ['joyful']), null);
}));
test('exact expression aliases still beat a semantic sprite and fallback is environment-local', async () => withMissingFetch(async () => {
    const one = new AssetResolver(new URL('http://localhost/one/'), { files: ['characters/nina/happy.png', 'characters/nina/cheerful_smile.png', 'backgrounds/forest_trail.png'] });
    const two = new AssetResolver(new URL('http://localhost/two/'), { files: [] });
    assert.match(await one.sprite('nina', ['joyful', 'happy', 'default']), /happy.png$/);
    assert.match(await one.background('woods path'), /one\/backgrounds\/forest_trail.png$/);
    assert.equal(await two.background('woods path'), null);
}));

test('sound keywords normalize action, mood and intensity without changing image semantics', () => {
    assert.deepEqual(assetKeywords('soft glass smashing sound effect', true), ['quiet', 'glass', 'shatter']);
    assert.deepEqual(assetKeywords('peaceful music', true), ['calm']);
    assert.deepEqual(assetKeywords('opening music'), ['opening', 'music']);
    for (const [query, file] of [['door opening', 'door_closing.ogg'], ['quiet footsteps', 'loud_footsteps.wav'], ['tense music', 'calm_theme.mp3']]) assert.equal(rankAssetNames(query, [file], true).length, 0);
});
test('literal sounds win over keywords across every existing fallback folder', async () => {
    const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['sfx/quiet_knock.ogg', 'sfx/music/knock.ogg', 'sfx/knock.wav'] });
    assert.match(await resolver.audio('sfx', 'KNOCK'), /sfx\/knock.wav$/);
    assert.match(await resolver.audio('music', 'knock'), /sfx\/music\/knock.ogg$/);
    assert.match(await resolver.audio('ambient', 'knock'), /sfx\/music\/knock.ogg$/);
});
test('new exact sounds absent from the catalog still beat semantic matches', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async url => ({ ok: String(url).endsWith('/sfx/knocking.ogg'), headers: { get: () => 'audio/ogg' } });
    try {
        const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['sfx/knock.wav'] });
        assert.match(await resolver.audio('sfx', 'knocking'), /knocking.ogg$/);
    } finally { globalThis.fetch = original; }
});
test('music ambience and SFX find descriptive sounds in current and legacy folders', async () => withMissingFetch(async () => {
    const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['music/Peaceful_Piano.mp3', 'ambient/Windy_Woodland.ogg', 'sfx/glass_shatter.wav', 'sfx/music/traffic_noise.ogg'] });
    assert.match(await resolver.audio('music', 'calm piano music'), /Peaceful_Piano.mp3$/);
    assert.match(await resolver.audio('ambient', 'wind in the woods sounds'), /Windy_Woodland.ogg$/);
    assert.match(await resolver.audio('sfx', 'glass smashing effect'), /glass_shatter.wav$/);
    assert.match(await resolver.audio('ambient', 'roadway sound'), /traffic_noise.ogg$/);
    assert.equal([...resolver.diagnostics.values()].at(-1).method, 'keywords');
}));
test('semantic sound matching rejects other categories unsafe paths unsupported types and weak matches', async () => withMissingFetch(async () => {
    const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['sfx/music/glass_shatter.mp3', 'sfx/ambient/door_slam.wav', 'ambient/knock.ogg', 'sfx/door_slam.png', 'sfx/../../escape/knock.ogg'] });
    for (const name of ['glass smashing', 'door slamming', 'knocking', 'spaceship laser', '../knock', 'https://evil/knock']) assert.equal(await resolver.audio('sfx', name), null);
    assert.equal(await resolver.audio('music', 'door slamming'), null);
    assert.equal(await resolver.audio('ambient', 'image scene sound effect'), null);
}));
test('legacy character sounds use their own folder shared sounds and SFX without borrowing other characters', async () => withMissingFetch(async () => {
    const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['characters/nina/happy_laugh.ogg', 'characters/ashley/scream.ogg', 'characters/shared/quiet_sigh.wav', 'sfx/knock.ogg', 'sfx/music/roar.mp3'] });
    assert.match(await resolver.voice('nina', 'joyful laugh'), /nina\/happy_laugh.ogg$/);
    assert.match(await resolver.voice('nina', 'soft sigh'), /shared\/quiet_sigh.wav$/);
    assert.match(await resolver.voice('nina', 'knocking'), /sfx\/knock.ogg$/);
    assert.equal(await resolver.voice('nina', 'screaming'), null);
    assert.equal(await resolver.voice('nina', 'growling'), null);
    assert.equal(await resolver.voice('../ashley', 'screaming'), null);
}));
test('sound fallback caches decisions while isolating categories and environments', async () => withMissingFetch(async () => {
    const one = new AssetResolver(new URL('http://localhost/one/'), { files: ['sfx/knock.ogg', 'music/forest.mp3'] });
    const two = new AssetResolver(new URL('http://localhost/two/'), { files: [] });
    assert.equal(one.audio('sfx', 'knocking'), one.audio('sfx', 'knocking'));
    assert.match(await one.audio('sfx', 'knocking'), /one\/sfx\/knock.ogg$/);
    assert.equal(await one.audio('sfx', 'woods music'), null);
    assert.equal(await two.audio('sfx', 'knocking'), null);
}));
