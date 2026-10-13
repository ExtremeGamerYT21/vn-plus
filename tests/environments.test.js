import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AssetResolver } from '../core/asset-resolver.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { Playback } from '../core/playback.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { loadSettings, DEFAULT_SETTINGS } from '../ui/settings.js';
import { contentEnvironments, activateContentProfile, DEFAULT_ENVIRONMENT } from '../core/content-environments.js';
import { mergeContentInventories, localInventoryAdditions } from '../core/content-inventory.js';

test('catalog discovers named environments and rejects roots outside the environment folder', () => {
    const list = contentEnvironments({ environments: {
        castle: { name: 'Castle', path: 'environments/castle', files: ['backgrounds/kitchen.png'] },
        escape: { path: '../private' }, '../evil': { path: 'environments/../evil' },
    } });
    assert.equal(list.length, 1); assert.equal(list[0].id, 'castle'); assert.equal(list[0].name, 'Castle');
    assert.equal(contentEnvironments({ files: ['characters/nina/default.webp'] })[0].path, '');
});
test('all media, textures, properties and same-named expressions stay inside their selected environment', async () => {
    const original = globalThis.fetch, requests = [];
    globalThis.fetch = async url => { requests.push(String(url)); return { ok: false, headers: { get: () => '' } }; };
    try {
        for (const id of ['coffin', 'castle']) {
            const base = new URL(`http://localhost/vn/environments/${id}/`);
            const resolver = new AssetResolver(base, { files: ['characters/nina/happy.webp', 'characters/nina/happy_blink.webp', 'backgrounds/kitchen.png', 'music/theme.ogg', 'ambient/rain.ogg', 'sfx/door.ogg', 'characters/nina/voice.ogg'] }, id);
            for (const url of [await resolver.sprite('nina', ['happy']), await resolver.blinkSprite('nina', ['happy']), await resolver.background('kitchen'), await resolver.audio('music', 'theme'), await resolver.audio('ambient', 'rain'), await resolver.audio('sfx', 'door'), await resolver.voice('nina', 'voice'), resolver.url('characters/shared/box.png')]) {
                assert.ok(url.startsWith(base.href), url);
            }
            await resolver.json('characters/nina/properties.json');
            assert.equal(resolver.url('../castle/backgrounds/kitchen.png'), null);
            assert.equal(await resolver.sprite('missing', ['default']), null);
            assert.notEqual(resolver.fontId('faustina'), new AssetResolver(base, {}, 'other').fontId('faustina'));
        }
        assert.ok(requests.every(url => /\/environments\/(coffin|castle)\//.test(url)));
    } finally { globalThis.fetch = original; }
});
test('legacy registry/font/texture settings migrate and remain independent per environment', () => {
    const settings = loadSettings({ extensionSettings: { visual_novel_plus: { characters: { nina: { color: '#123', breathing: { centerX: .35 } } }, dialogueFont: 'old_font', dialogueBoxTexture: 'shared/old.png', musicVolume: .23 } } });
    activateContentProfile(settings, 'harry-potter', DEFAULT_ENVIRONMENT);
    assert.deepEqual(settings.characters, {}); assert.equal(settings.dialogueBoxTexture, '');
    settings.characters.nina = { color: '#abc' }; settings.dialogueFont = 'wizard_font';
    activateContentProfile(settings, DEFAULT_ENVIRONMENT, 'harry-potter');
    assert.equal(settings.characters.nina.color, '#123'); assert.equal(settings.characters.nina.breathing.centerX, .35);
    assert.equal(settings.dialogueFont, 'old_font'); assert.equal(settings.dialogueBoxTexture, 'shared/old.png'); assert.equal(settings.musicVolume, .23);
    settings.characters.nina.color = '#456';
    activateContentProfile(settings, 'harry-potter', DEFAULT_ENVIRONMENT);
    assert.equal(settings.characters.nina.color, '#abc'); assert.equal(settings.dialogueFont, 'wizard_font');
    assert.equal(new CharacterRegistry({ inventory: {} }, settings).get('nina').breathing, undefined);
});
test('pending fonts from an exited environment cannot enter the document font set', async () => {
    const originalFont = globalThis.FontFace, originalDocument = globalThis.document;
    let loaded, additions = 0, deletions = 0;
    globalThis.FontFace = class { load() { return new Promise(resolve => { loaded = () => resolve(this); }); } };
    globalThis.document = { fonts: { add() { additions++; }, delete() { deletions++; } } };
    try {
        const resolver = new AssetResolver(new URL('http://localhost/vn/environments/castle/'), { files: ['fonts/font.ttf'] }, 'castle');
        const pending = resolver.font('font');
        await new Promise(resolve => setTimeout(resolve, 0)); resolver.dispose(); loaded(); await pending;
        assert.equal(additions, 0); assert.equal(deletions, 0);
    } finally { globalThis.FontFace = originalFont; globalThis.document = originalDocument; }
});
test('environment reconstruction preserves the paragraph and suppresses earlier one-shot effects', () => {
    const settings = structuredClone(DEFAULT_SETTINGS), registry = new CharacterRegistry({ inventory: {} }, settings);
    const timeline = compileTimeline(parsePOV('#SFX door\nNARRATION\nOne\nNARRATION\nTwo\n#SFX knock\nNARRATION\nThree').tokens, registry, settings);
    const player = new Playback(timeline); assert.equal(player.resume(1).beat.token.text.trim(), 'Two');
    assert.deepEqual(player.restore().effects, []); player.back(); assert.deepEqual(player.forward().effects, []);
    assert.equal(player.forward().effects[0].name, 'knock'); assert.ok(player.resume(99).done);
});
test('published inventory contains the supplied setting and empty named starter environments', async () => {
    const inventory = JSON.parse(await readFile(new URL('../assets.json', import.meta.url)));
    const list = contentEnvironments(inventory);
    assert.deepEqual(list.map(entry => entry.name), ['The Coffin of Andy and Leyley', 'Harry Potter', 'Re:Zero']);
    assert.ok(list[0].inventory.files.includes('characters/nina/default.webp'));
    assert.equal(list[1].inventory.files.length, 0); assert.equal(list[2].inventory.files.length, 0);
    assert.ok(inventory.files.every(file => file.startsWith('environments/')));
});
test('personal content joins shipped environments without changing the published catalog', () => {
    const published = { version: 2, defaultEnvironment: 'castle', environments: {
        castle: { path: 'environments/castle', name: 'Castle', files: ['characters/nina/default.webp'] },
    } };
    const before = JSON.stringify(published);
    const local = { environments: {
        castle: { path: 'environments/castle', files: ['characters/nina/happy_blink.webp', 'characters/nina/default.webp'] },
        forest: { path: 'environments/forest', name: 'Forest', files: ['characters/nina/sprites/angry.png'] },
        escape: { path: '../private', files: ['backgrounds/secret.png'] },
    } };
    const merged = mergeContentInventories(published, local);
    assert.equal(JSON.stringify(published), before);
    assert.equal(merged.defaultEnvironment, 'castle');
    assert.equal(merged.environments.castle.files.length, 2);
    assert.deepEqual(merged.environments.castle.characters.nina.expressions, ['default', 'happy_blink']);
    assert.deepEqual(merged.environments.forest.characters.nina.expressions, ['angry']);
    assert.equal(merged.environments.escape, undefined);
    assert.ok(!merged.files.some(file => file.includes('secret')));
});
test('a local inventory cannot bring back media removed by a later GitHub release', () => {
    const entry = files => ({ path: 'environments/castle', name: 'Castle', description: '', files });
    const oldRelease = { environments: { castle: entry(['backgrounds/retired.png']) } };
    const scan = { environments: { castle: entry(['backgrounds/retired.png', 'backgrounds/personal.png']) } };
    const local = localInventoryAdditions(scan, oldRelease);
    assert.deepEqual(local.environments.castle.files, ['backgrounds/personal.png']);
    const newRelease = { environments: { castle: entry(['backgrounds/replacement.png']) } };
    assert.deepEqual(mergeContentInventories(newRelease, local).environments.castle.files,
        ['backgrounds/personal.png', 'backgrounds/replacement.png']);
    assert.deepEqual(Object.keys(localInventoryAdditions(oldRelease, oldRelease).environments), []);
});
test('local additions retain legacy flat inventories and reject escaping asset paths', () => {
    const published = { files: ['characters/nina/default.webp'] };
    const local = localInventoryAdditions({ files: ['characters/nina/default.webp', 'characters/nina/happy.webp', '../secret.png', 'https://example.com/x.png'] }, published);
    assert.deepEqual(local.files, ['characters/nina/happy.webp']);
    assert.deepEqual(mergeContentInventories(published, local).files,
        ['characters/nina/default.webp', 'characters/nina/happy.webp']);
});
