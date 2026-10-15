import { lstat, mkdir, readdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { slug, characterNameKey, isNarratorName } from '../core/character-registry.js';
import { validEnvironmentId } from '../core/content-environments.js';
import { inventoryCharacters } from '../core/content-inventory.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const colors = ['#edb582', '#e5cb77', '#c6d97d', '#90d6a7', '#7ed4c5', '#86cee5', '#a8bfea', '#c2afe6', '#dca8ce', '#e9a5af'];
export function characterFolderId(name) {
    if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\u0000-\u001f\u007f/\\]/.test(name) || name.includes('..')) throw new Error('Invalid character name.');
    const id = slug(name) || `unknown_${createHash('sha256').update(name.normalize('NFKC').trim().toLowerCase()).digest('hex').slice(0, 12)}`;
    return /^(shared|con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/iu.test(id) ? `character_${id}` : id;
}
async function stat(file) { try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function directory(parent, name, create = false) {
    const target = path.join(parent, name);
    let info = await stat(target);
    if (!info && create) { await mkdir(target); info = await lstat(target); }
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error('Character folders must be ordinary directories inside the selected environment.');
    const resolved = await realpath(target), relative = path.relative(parent, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid content directory.');
    return resolved;
}
async function json(file, fallback) {
    const info = await stat(file);
    if (!info) return fallback;
    if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024 * 1024) throw new Error('Invalid character properties or local catalog file.');
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!object(value)) throw new Error('Character properties and catalogs must be JSON objects.');
    return value;
}

/** One queue per installed extension serializes folder creation and local catalog updates. */
export function createCharacterFolders(root, color = () => colors[randomInt(colors.length)]) {
    let queue = Promise.resolve();
    const run = async input => {
        const createMissing = input?.createMissing !== false;
        const environment = input?.environment;
        if (environment !== null && !validEnvironmentId(environment)) throw new Error('Invalid content environment.');
        if (!Array.isArray(input?.names) || input.names.length > 128) throw new Error('Supply up to 128 character names.');
        const names = [...new Set(input.names.map(name => { characterFolderId(name); return name.trim(); }))].filter(name => !isNarratorName(name));
        const contentRoot = await realpath(root), published = await json(path.join(contentRoot, 'assets.json'), {});
        const catalogPath = path.join(contentRoot, 'assets.local.json'), local = createMissing ? await json(catalogPath, {}) : {};
        if (environment === null && local.files !== undefined && !Array.isArray(local.files)) throw new Error('Invalid local catalog.');
        if (environment !== null && local.environments !== undefined && !object(local.environments)) throw new Error('Invalid local environment catalog.');
        const previous = environment === null || !Object.hasOwn(local.environments || {}, environment) ? {} : local.environments[environment];
        if (!object(previous) || (previous.files !== undefined && !Array.isArray(previous.files))) throw new Error('Invalid local environment catalog.');
        let environmentRoot;
        if (environment === null) {
            if (object(published.environments) && Object.keys(published.environments).length) throw new Error('Select a content environment.');
            environmentRoot = contentRoot;
        } else {
            const environments = await directory(contentRoot, 'environments');
            environmentRoot = await directory(environments, environment);
        }
        if (!createMissing && !await stat(path.join(environmentRoot, 'characters'))) return { characters: [] };
        const charactersRoot = await directory(environmentRoot, 'characters', createMissing);
        const metadata = !createMissing || environment === null ? {} : await json(path.join(environmentRoot, 'environment.json'), {});
        const entries = [];
        for (const entry of await readdir(charactersRoot, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === 'shared') continue;
            const folder = await directory(charactersRoot, entry.name);
            const properties = await json(path.join(folder, 'properties.json'), {});
            entries.push({ id: entry.name, properties });
        }
        if (!createMissing) return { characters: entries.map(entry => ({ ...entry, created: false })) };
        const result = [], indexed = [];
        for (const name of names) {
            const key = characterNameKey(name);
            let entry = entries.find(item => [item.id, item.properties.displayName, ...(Array.isArray(item.properties.aliases) ? item.properties.aliases : typeof item.properties.aliases === 'string' ? [item.properties.aliases] : [])].some(alias => typeof alias === 'string' && characterNameKey(alias) === key));
            let created = false;
            if (!entry) {
                const id = characterFolderId(name), folder = await directory(charactersRoot, id, true);
                await directory(folder, 'sprites', true);
                const textColor = color();
                const defaults = { displayName: name, aliases: [], defaultExpression: 'default', color: textColor, textColor, voiceId: '', breathing: { centerX: .5, centerY: .62 } };
                try { await writeFile(path.join(folder, 'properties.json'), JSON.stringify(defaults, null, 2) + '\n', { flag: 'wx' }); created = true; }
                catch (error) { if (error.code !== 'EEXIST') throw error; }
                entry = { id, properties: await json(path.join(folder, 'properties.json'), {}) }; entries.push(entry);
            }
            if (isNarratorName(entry.id) || isNarratorName(entry.properties.displayName)) continue;
            const file = `characters/${entry.id}/properties.json`;
            if (await stat(path.join(charactersRoot, entry.id, 'properties.json'))) indexed.push(file);
            result.push({ name, ...entry, created });
        }
        if (indexed.length) {
            if (environment === null) {
                local.files = [...new Set([...(local.files || []), ...indexed])].sort(); local.characters = inventoryCharacters(local.files);
            } else {
                local.version = 2; local.environments = { ...local.environments };
                const files = [...new Set([...(previous.files || []), ...indexed])].sort();
                local.environments[environment] = { ...previous, path: `environments/${environment}`, name: previous.name || metadata.name || environment, description: previous.description ?? metadata.description ?? '', files, characters: inventoryCharacters(files) };
            }
            const temporary = path.join(contentRoot, `.vn-plus-catalog-${randomUUID()}.tmp`);
            await writeFile(temporary, JSON.stringify(local, null, 2) + '\n', { flag: 'wx' }); await rename(temporary, catalogPath);
        }
        return { characters: result };
    };
    return input => { const pending = queue.then(() => run(input)); queue = pending.catch(() => {}); return pending; };
}

export function registerCharacterFolders(router, root) {
    const create = createCharacterFolders(root);
    router.post('/characters/resolve', async (req, res) => {
        if (!req.user?.directories) return res.sendStatus(401);
        try { res.json(await create({ environment: req.body?.environment, names: [], createMissing: false })); }
        catch { res.status(400).json({ error: 'Unable to read character aliases. Check this environment and its properties.json files.' }); }
    });
    router.post('/characters', async (req, res) => {
        if (!req.user?.directories) return res.sendStatus(401);
        if (!req.user.profile?.admin) return res.status(403).json({ error: 'Automatic character folders require a SillyTavern administrator account for this shared installation.' });
        try { res.json(await create({ ...req.body, createMissing: true })); }
        catch (error) { res.status(400).json({ error: error instanceof SyntaxError ? 'Fix the invalid JSON in character properties or assets.local.json first.' : 'Unable to create character folders. Check the selected environment, names and folder permissions.' }); }
    });
}
