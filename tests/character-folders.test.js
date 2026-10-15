import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCharacterFolders, characterFolderId, registerCharacterFolders } from '../server/character-folders.mjs';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { createHost } from '../integration.js';

async function removeFixture(root) {
    const relative = path.relative(os.tmpdir(), root);
    if (path.isAbsolute(relative) || !/^vn-character-(folders|outside)-[^/\\]+$/.test(relative)) throw new Error('Refusing to remove a non-fixture directory.');
    await rm(root, { recursive: true, force: true });
}

async function fixture(t) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vn-character-folders-'));
    t.after(() => removeFixture(root));
    for (const id of ['world-one', 'world-two']) await mkdir(path.join(root, 'environments', id, 'characters'), { recursive: true });
    const published = { version: 2, environments: { 'world-one': { path: 'environments/world-one', files: [] } } };
    await writeFile(path.join(root, 'assets.json'), JSON.stringify(published));
    return { root, create: createCharacterFolders(root), folder: (id, world = 'world-one') => path.join(root, 'environments', world, 'characters', id) };
}
test('unknown speakers get a real folder, empty sprites directory, persistent color and a local catalog entry', async t => {
    const { root, create, folder } = await fixture(t), originalCatalog = await readFile(path.join(root, 'assets.json'), 'utf8');
    await writeFile(path.join(root, 'assets.local.json'), JSON.stringify({ version: 2, customMetadata: { kept: true }, environments: { 'world-one': { path: 'environments/world-one', files: ['backgrounds/custom.png'] } } }));
    const result = await create({ environment: 'world-one', names: ['New Person', 'NARRATOR', 'Narration'] });
    assert.equal(result.characters.length, 1); const entry = result.characters[0];
    assert.equal(entry.id, 'new_person'); assert.equal(entry.created, true);
    const properties = JSON.parse(await readFile(path.join(folder('new_person'), 'properties.json'), 'utf8'));
    assert.equal(properties.displayName, 'New Person'); assert.match(properties.textColor, /^#[a-f\d]{6}$/i);
    assert.equal(properties.color, properties.textColor); assert.equal(properties.voiceId, '');
    assert.deepEqual(await readdir(path.join(folder('new_person'), 'sprites')), []);
    assert.deepEqual(await readdir(path.dirname(folder('new_person'))), ['new_person']);
    const local = JSON.parse(await readFile(path.join(root, 'assets.local.json'), 'utf8'));
    assert.deepEqual(local.environments['world-one'].files, ['backgrounds/custom.png', 'characters/new_person/properties.json']); assert.deepEqual(local.customMetadata, { kept: true });
    assert.ok(Object.hasOwn(local.environments['world-one'].characters, 'new_person'));
    assert.equal(await readFile(path.join(root, 'assets.json'), 'utf8'), originalCatalog);
    const again = await createCharacterFolders(root)({ environment: 'world-one', names: ['NEW PERSON'] });
    assert.equal(again.characters[0].created, false); assert.deepEqual(again.characters[0].properties, properties);
});
test('disk aliases and folder names resolve even without an inventory and existing content is never overwritten', async t => {
    const { create, folder } = await fixture(t);
    await mkdir(path.join(folder('nina'), 'sprites'), { recursive: true });
    const source = '{ "displayName":"Nina Hopkins", "aliases":["Nina"], "textColor":"#123456", "voiceId":"existing-voice" }\n';
    await writeFile(path.join(folder('nina'), 'properties.json'), source);
    await writeFile(path.join(folder('nina'), 'sprites', 'default.png'), 'authored-art');
    const result = await create({ environment: 'world-one', names: ['NINA', 'Nina Hopkins', 'nina'] });
    assert.ok(result.characters.every(entry => entry.id === 'nina' && !entry.created));
    assert.equal(await readFile(path.join(folder('nina'), 'properties.json'), 'utf8'), source);
    assert.equal(await readFile(path.join(folder('nina'), 'sprites', 'default.png'), 'utf8'), 'authored-art');
    assert.deepEqual(await readdir(path.dirname(folder('nina'))), ['nina']);
});
test('simultaneous requests reuse one color and retain every catalog addition across environments', async t => {
    const { root, create } = await fixture(t);
    const results = await Promise.all(['world-one', 'world-one', 'world-two'].map(environment => create({ environment, names: ['Someone'] })));
    assert.equal(results[0].characters[0].properties.textColor, results[1].characters[0].properties.textColor);
    assert.equal(results[1].characters[0].created, false);
    const catalog = JSON.parse(await readFile(path.join(root, 'assets.local.json'), 'utf8'));
    assert.deepEqual(Object.keys(catalog.environments).sort(), ['world-one', 'world-two']);
});
test('generated IDs handle Unicode and Windows reserved names while rejecting traversal', async t => {
    const { root, create } = await fixture(t);
    assert.equal(characterFolderId('Dr. Élodie'), 'dr_élodie');
    assert.equal(characterFolderId('CON'), 'character_con'); assert.equal(characterFolderId('Shared'), 'character_shared');
    for (const name of ['../outside', '..\\outside', '', 'bad\u0000name']) assert.throws(() => characterFolderId(name));
    for (const environment of ['../outside', '', '__proto__', undefined]) await assert.rejects(create({ environment, names: ['Somebody'] }));
    await assert.rejects(create({ environment: 'world-one', names: ['Good', '../outside'] }));
    assert.deepEqual(await readdir(path.join(root, 'environments/world-one/characters')), []);
    const result = await create({ environment: 'world-one', names: ['CON', '__proto__'] });
    assert.deepEqual(result.characters.map(entry => entry.id), ['character_con', '__proto__']);
});
test('linked directories cannot redirect character writes outside the environment', async t => {
    const { root, create, folder } = await fixture(t), outside = await mkdtemp(path.join(os.tmpdir(), 'vn-character-outside-'));
    t.after(() => removeFixture(outside));
    await symlink(outside, folder('linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(create({ environment: 'world-one', names: ['Linked'] }));
    assert.deepEqual(await readdir(outside), []);
    await symlink(outside, path.join(root, 'environments', 'linked-world'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(create({ environment: 'linked-world', names: ['Escape'] }));
    assert.deepEqual(await readdir(outside), []);
});
test('invalid local catalogs fail before any character files are created', async t => {
    const { root, create } = await fixture(t);
    await writeFile(path.join(root, 'assets.local.json'), 'BROKEN JSON');
    await assert.rejects(create({ environment: 'world-one', names: ['Someone'] }));
    assert.deepEqual(await readdir(path.join(root, 'environments/world-one/characters')), []);
    assert.equal(await readFile(path.join(root, 'assets.local.json'), 'utf8'), 'BROKEN JSON');
});
test('punctuation-only mystery speakers receive distinct stable folders and never match empty aliases', async t => {
    const { root, create } = await fixture(t);
    const result = await create({ environment: 'world-one', names: ['???', '!!!'] });
    assert.equal(result.characters.length, 2); assert.match(result.characters[0].id, /^unknown_[a-f\d]{12}$/);
    assert.notEqual(result.characters[0].id, result.characters[1].id);
    const registry = new CharacterRegistry({ inventory: { characters: { nina: {} } }, json: async () => ({ color: '#123456' }) }, structuredClone(DEFAULT_SETTINGS));
    await registry.prepare(['Nina']); assert.equal(registry.identify('???'), 'unknown'); assert.equal(registry.knows('???'), false);
    for (const entry of result.characters) registry.acceptCharacter(entry);
    assert.equal(registry.identify('???'), result.characters[0].id); assert.equal(registry.identify('!!!'), result.characters[1].id);
    const again = await createCharacterFolders(root)({ environment: 'world-one', names: ['???'] });
    assert.equal(again.characters[0].id, result.characters[0].id); assert.equal(again.characters[0].created, false);
});
test('legacy flat installations can scaffold characters without crossing into environment mode', async t => {
    const { root, create } = await fixture(t); await writeFile(path.join(root, 'assets.json'), '{"files":[]}');
    await create({ environment: null, names: ['Legacy Person'] });
    assert.equal(JSON.parse(await readFile(path.join(root, 'characters/legacy_person/properties.json'), 'utf8')).displayName, 'Legacy Person');
    assert.deepEqual(JSON.parse(await readFile(path.join(root, 'assets.local.json'), 'utf8')).files, ['characters/legacy_person/properties.json']);
});
test('folder creation route requires an authenticated administrator and never requires a Fish key', async t => {
    const { root } = await fixture(t), routes = new Map(); registerCharacterFolders({ post: (url, handler) => routes.set(url, handler) }, root);
    const response = () => ({ code: 200, status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; }, json(value) { this.value = value; } });
    const anonymous = response(); await routes.get('/characters')({}, anonymous); assert.equal(anonymous.code, 401);
    const nonAdmin = response(); await routes.get('/characters')({ user: { directories: {}, profile: { admin: false } } }, nonAdmin); assert.equal(nonAdmin.code, 403);
    const admin = response(); await routes.get('/characters')({ user: { directories: {}, profile: { admin: true } }, body: { environment: 'world-one', names: ['New Speaker'] } }, admin);
    assert.equal(admin.code, 200); assert.equal(admin.value.characters[0].id, 'new_speaker');
});
test('registry distinguishes truly unknown speakers from property, inventory, configured and player identities', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.characters.author = { aliases: ['Writer'] };
    const registry = new CharacterRegistry({ inventory: { characters: { nina: {} } }, json: async file => file.includes('/resident/') ? { displayName: 'Known Resident', aliases: ['Resident'] } : null }, settings);
    await registry.prepare(['Stranger', 'Resident']);
    for (const name of ['Writer', 'Nina', 'Resident', 'Known Resident', 'Jason', 'Narrator']) assert.ok(registry.knows(name), name);
    assert.equal(registry.knows('Stranger'), false);
    registry.acceptCharacter({ id: 'stranger', properties: { displayName: 'Stranger', textColor: '#abcdef' } });
    assert.ok(registry.knows('Stranger')); assert.equal(registry.get('stranger').textColor, '#abcdef');
});
test('host sends the selected environment and names only through the local character route', async () => {
    const context = { getRequestHeaders: () => ({ 'X-CSRF-Token': 'fake-test-token' }) }, host = createHost(() => context);
    let captured;
    host.request = async (url, options) => { captured = { url, options }; return Response.json({ characters: [] }); };
    await host.scaffoldCharacters({ environment: 'world-one', names: ['Someone'] });
    assert.equal(captured.url, '/api/plugins/vn-plus-tts/characters');
    assert.deepEqual(JSON.parse(captured.options.body), { environment: 'world-one', names: ['Someone'] });
    assert.equal(createHost(() => context, { localContent: false }).scaffoldCharacters, undefined);
    host.request = async () => new Response('', { status: 404 }); await assert.rejects(host.scaffoldCharacters({}), /Restart SillyTavern/);
});
test('live discovery reads every folder and alias without creating files or changing a catalog', async t => {
    const { root, create, folder } = await fixture(t);
    await mkdir(folder('jason_weber')); const properties = '{"displayName":"Jason","aliases":["Jason Weber"],"voiceId":"test-jason-voice"}';
    await writeFile(path.join(folder('jason_weber'), 'properties.json'), properties);
    await writeFile(path.join(root, 'assets.local.json'), 'INVALID LOCAL CATALOG');
    const result = await create({ environment: 'world-one', names: [], createMissing: false });
    assert.equal(result.characters.length, 1); assert.equal(result.characters[0].id, 'jason_weber');
    assert.equal(await readFile(path.join(root, 'assets.local.json'), 'utf8'), 'INVALID LOCAL CATALOG');
    assert.deepEqual(await readdir(folder('jason_weber')), ['properties.json']);
    assert.deepEqual(await readdir(path.dirname(folder('jason_weber'))), ['jason_weber']);
    assert.equal(await readFile(path.join(folder('jason_weber'), 'properties.json'), 'utf8'), properties);
});
test('read-only discovery accepts authenticated non-admins and cannot be switched to file creation', async t => {
    const { root } = await fixture(t), routes = new Map(); registerCharacterFolders({ post: (url, handler) => routes.set(url, handler) }, root);
    const response = () => ({ status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; }, json(value) { this.value = value; } });
    const anonymous = response(); await routes.get('/characters/resolve')({}, anonymous); assert.equal(anonymous.code, 401);
    const result = response(); await routes.get('/characters/resolve')({ user: { directories: {}, profile: { admin: false } }, body: { environment: 'world-one', names: ['Do Not Create'], createMissing: true } }, result);
    assert.deepEqual(result.value, { characters: [] }); assert.deepEqual(await readdir(path.join(root, 'environments/world-one/characters')), []);
});
