import { readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { backgroundEntry } from '../core/scene-context.js';

async function readMap(filename) {
    try {
        if ((await lstat(filename)).isSymbolicLink()) throw new Error(`Refusing a symbolic link at ${filename}`);
        const value = JSON.parse(await readFile(filename, 'utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected an object in ${filename}`);
        return value;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function images(folder, prefix = '') {
    let entries;
    try { entries = await readdir(folder, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const result = [];
    for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const name = `${prefix}${entry.name}`;
        if (entry.isDirectory()) result.push(...await images(path.join(folder, entry.name), `${name}/`));
        else if (/\.(webp|png|jpe?g|gif|avif)$/i.test(entry.name)) result.push(name);
    }
    return result.sort();
}
export async function buildBackgroundProperties(root) {
    let bases;
    try { bases = (await readdir(path.join(root, 'environments'), { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).map(entry => path.join(root, 'environments', entry.name)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; bases = [root]; }
    const results = [];
    for (const base of bases) {
        const folder = path.join(base, 'backgrounds');
        try { if ((await lstat(folder)).isSymbolicLink()) continue; await readdir(folder); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        const filename = path.join(folder, 'properties.json'), original = await readMap(filename), map = original || {};
        const defaults = await readMap(path.join(folder, 'properties.default.json'));
        let added = 0;
        for (const image of await images(folder)) if (!backgroundEntry(map, image)) {
            Object.defineProperty(map, image, { enumerable: true, configurable: true, writable: true, value: { inside: backgroundEntry(defaults, image)?.inside === true } }); added++;
        }
        if (!original || added) await writeFile(filename, JSON.stringify(map, null, 2) + '\n');
        results.push({ filename, added });
    }
    return results;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const root = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
    for (const result of await buildBackgroundProperties(root)) console.log(`${result.filename}: added ${result.added} background entries; existing properties preserved.`);
}
