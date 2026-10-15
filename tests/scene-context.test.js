import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSceneHeader, lastSceneHeader, sceneLighting, backgroundEntry } from '../core/scene-context.js';
import { inheritedScene } from '../core/scene-history.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { parsePOV } from '../core/vn-parser.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { Playback } from '../core/playback.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { AssetResolver } from '../core/asset-resolver.js';
import { buildBackgroundProperties } from '../tools/build-background-properties.js';

const header = (time = '12:26 p.m.', date = '3 August 1991') => `[${date} | Before First Year | ${time} | Summer | Madam Malkin's Robes for All Occasions, Diagon Alley]`;
const compile = (text, seed) => { const settings = structuredClone(DEFAULT_SETTINGS); return compileTimeline(parsePOV(text).tokens, new CharacterRegistry({ inventory: {} }, settings), settings, seed); };

test('the supplied header becomes explicit timezone-independent scene variables', () => {
    assert.deepEqual(parseSceneHeader(header()), { date: '1991-08-03', dateLabel: '3 August 1991', phase: 'Before First Year', time: '12:26', timeLabel: '12:26 p.m.',
        year: 1991, month: 8, day: 3, hour: 12, minute: 26, minutes: 746, season: 'Summer', location: "Madam Malkin's Robes for All Occasions, Diagon Alley" });
});
test('header validation handles noon midnight 24-hour time leap days and malformed input', () => {
    assert.equal(parseSceneHeader(header('12:00 a.m.')).hour, 0); assert.equal(parseSceneHeader(header('12:00 PM')).hour, 12);
    assert.equal(parseSceneHeader(header('23:59')).minutes, 1439); assert.equal(parseSceneHeader(header('01:01', '29 Feb. 2000')).day, 29);
    for (const value of [header('13:00 p.m.'), header('00:00 a.m.'), header('24:00'), header('1:60'), header('12:00', '29 February 1900'), header('12:00', '31 April 1991'), '[happy]', `[${header()}]`, `${header()} extra`]) assert.equal(parseSceneHeader(value), null);
});
test('canonical extraction returns only the last standalone header outside code and HTML', () => {
    const text = `PRIVATE_CANONICAL\n${header('08:00')}\n~~~text\n${header('09:00')}\n~~~\n<div>\n${header('10:00')}\n</div>\n${header('11:00')}\n[malformed]`;
    assert.equal(lastSceneHeader(text).time, '11:00'); assert(!JSON.stringify(lastSceneHeader(text)).includes('PRIVATE_CANONICAL'));
});
test('header history uses the selected assistant messages and current canonical header without POV lookahead', () => {
    const context = { chat: [{ mes: `${header('08:00')}\n/////\n${header('09:00')}\nOld.` }, { is_user: true, mes: header('10:00') }, { mes: `PRIVATE\n/////\nFirst.\n${header('11:00')}\nSecond.` }] };
    assert.equal(inheritedScene(context, 2).scene.time, '09:00');
    context.chat[2].mes = `${header('10:30')}\nPRIVATE\n/////\n${header('11:00')}\nNow.`;
    assert.equal(inheritedScene(context, 2).scene.time, '10:30');
    context.chat[2].mes = '/////\nNow.'; context.chat[0].mes = header('07:00');
    assert.equal(inheritedScene(context, 2).scene.time, '07:00');
    assert.equal(inheritedScene({ chat: [{ mes: '/////\nNew chat.' }] }, 0).scene, null);
});
test('POV headers update snapshots without visible header beats and backward restores the earlier clock', () => {
    const timeline = compile(`${header('06:00')}\nFirst.\n${header('22:00')}\nSecond.\n#SCENE RESET\nNARRATION\nThird.`);
    const playback = new Playback(timeline);
    assert.equal(timeline.views.length, 3); assert.equal(playback.forward().beat.state.scene.time, '06:00');
    assert.equal(playback.forward().beat.state.scene.time, '22:00'); assert.equal(playback.forward().beat.state.scene.time, '22:00');
    playback.back(); assert.equal(playback.back().beat.state.scene.time, '06:00');
    const quoted = parsePOV(`Nina: "A header:\n${header()}\nEnd."`); assert.equal(quoted.tokens.length, 1); assert.equal(quoted.tokens[0].type, 'dialogue');
});
test('outdoor lighting varies smoothly with story time while indoors and unknown time stay unchanged', () => {
    const lighting = time => sceneLighting(parseSceneHeader(header(time)));
    assert.equal(lighting('12:26').brightness, 1); assert.equal(lighting('00:00').level, 0); assert.equal(lighting('00:00').brightness, .45);
    assert(lighting('06:01').level > lighting('06:00').level); assert(lighting('18:01').level < lighting('18:00').level);
    assert.deepEqual(sceneLighting(parseSceneHeader(header('23:00')), true), { inside: true, level: 1, brightness: 1, period: 'indoor' });
    assert.equal(sceneLighting(null).brightness, 1);
});
test('background properties use exact case-insensitive relative names or stems', () => {
    const catalog = { 'Rooms/Kitchen.png': { inside: true }, street: { inside: false }, 'backgrounds/Room.jpg': { inside: true } };
    assert.equal(backgroundEntry(catalog, 'backgrounds/rooms/kitchen.png').inside, true);
    assert.equal(backgroundEntry(catalog, 'street.webp').inside, false); assert.equal(backgroundEntry(catalog, 'Room.jpg').inside, true);
    assert.equal(backgroundEntry(catalog, 'garden.png'), null);
});
test('metadata follows the actual semantic background match and local missing entries default to outside', async () => {
    const resolver = new AssetResolver(new URL('http://localhost/castle/'), { files: ['backgrounds/Hogwarts - Corridor - Night.png'] });
    const original = globalThis.fetch; globalThis.fetch = async () => ({ ok: false });
    const requests = []; let local = null;
    resolver.json = async name => { requests.push(name); return name === 'backgrounds/properties.json' ? local : { 'Hogwarts - Corridor - Night.png': { inside: true } }; };
    try {
        const url = await resolver.background('Hogwarts hallway at night');
        assert.equal((await resolver.backgroundProperties(url)).inside, true);
        local = {}; assert.equal((await resolver.backgroundProperties(url)).inside, false);
        local = { 'Hogwarts - Corridor - Night': { inside: true } }; assert.equal((await resolver.backgroundProperties(url)).inside, true);
        local = { 'Hogwarts - Corridor - Night': { inside: 'true' } }; assert.equal((await resolver.backgroundProperties(url)).inside, false);
        assert.equal((await resolver.backgroundProperties('http://elsewhere/secret.png')).inside, false);
        assert(requests.every(name => name.startsWith('backgrounds/')));
    } finally { globalThis.fetch = original; }
});

async function tempScene(run) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'vn-background-props-'));
    try { await run(directory); } finally {
        const resolved = path.resolve(directory), parent = path.resolve(os.tmpdir()) + path.sep;
        if (!resolved.startsWith(parent) || !path.basename(resolved).startsWith('vn-background-props-')) throw new Error('Unexpected temporary directory');
        await rm(resolved, { recursive: true, force: true });
    }
}
test('background property builder creates every image entry and preserves authored overrides and defaults', async () => tempScene(async root => {
    const folder = path.join(root, 'environments', 'castle', 'backgrounds'); await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'kitchen.png'), 'fake'); await writeFile(path.join(folder, 'street.jpg'), 'fake');
    await writeFile(path.join(folder, 'properties.default.json'), JSON.stringify({ 'kitchen.png': { inside: true } }));
    await buildBackgroundProperties(root);
    const file = path.join(folder, 'properties.json'); assert.deepEqual(JSON.parse(await readFile(file)), { 'kitchen.png': { inside: true }, 'street.jpg': { inside: false } });
    await writeFile(file, JSON.stringify({ KITCHEN: { inside: false, authored: 'preserve' }, 'street.jpg': { inside: true } }));
    const before = await readFile(file, 'utf8'); await buildBackgroundProperties(root); assert.equal(await readFile(file, 'utf8'), before);
    await writeFile(path.join(folder, 'garden.webp'), 'fake'); await buildBackgroundProperties(root);
    const after = JSON.parse(await readFile(file)); assert.equal(after.KITCHEN.authored, 'preserve'); assert.equal(after['garden.webp'].inside, false);
}));
test('background property builder supports flat installs and refuses to replace invalid properties', async () => tempScene(async root => {
    const folder = path.join(root, 'backgrounds'); await mkdir(folder); await writeFile(path.join(folder, 'street.png'), 'fake');
    await buildBackgroundProperties(root); const file = path.join(folder, 'properties.json');
    await writeFile(file, '{invalid'); await assert.rejects(buildBackgroundProperties(root)); assert.equal(await readFile(file, 'utf8'), '{invalid');
}));
