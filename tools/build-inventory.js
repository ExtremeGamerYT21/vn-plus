import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEFAULT_ENVIRONMENT, validEnvironmentId } from '../core/content-environments.js';
import { inventoryCharacters, localInventoryAdditions } from '../core/content-inventory.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const folders = ['characters', 'backgrounds', 'music', 'ambient', 'sfx', 'fonts', 'scenes', 'artifacts'];
async function scan(base, relative = '') {
    let entries;
    try { entries = await readdir(path.join(base, relative), { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const files = [];
    for (const entry of entries) {
        const name = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) files.push(...await scan(base, name));
        else if (!entry.name.startsWith('.') && !/^backgrounds\/properties\.json$/i.test(name) && /\.(webp|png|jpe?g|gif|avif|ogg|mp3|wav|m4a|opus|woff2?|ttf|otf|json|html|txt)$/i.test(entry.name)) files.push(name);
    }
    return files;
}
const environments = Object.create(null), files = [];
let directories = [];
try { directories = await readdir(path.join(root, 'environments'), { withFileTypes: true }); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const directory of directories.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!directory.isDirectory() || directory.isSymbolicLink() || !validEnvironmentId(directory.name)) continue;
    const relative = `environments/${directory.name}`, base = path.join(root, relative);
    let metadata = {};
    try { metadata = JSON.parse(await readFile(path.join(base, 'environment.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const localFiles = (await Promise.all(folders.map(folder => scan(base, folder)))).flat().sort();
    environments[directory.name] = { path: relative, name: typeof metadata.name === 'string' ? metadata.name : directory.name,
        description: typeof metadata.description === 'string' ? metadata.description : '', files: localFiles, characters: inventoryCharacters(localFiles) };
    files.push(...localFiles.map(file => `${relative}/${file}`));
}
let result;
if (Object.keys(environments).length) {
    result = { version: 2, defaultEnvironment: Object.hasOwn(environments, DEFAULT_ENVIRONMENT) ? DEFAULT_ENVIRONMENT : Object.keys(environments)[0], files: files.sort(), environments };
} else {
    const legacy = (await Promise.all(folders.map(folder => scan(root, folder)))).flat().sort();
    result = { files: legacy, characters: inventoryCharacters(legacy) };
}
const release = process.argv.includes('--release'), filename = release ? 'assets.json' : 'assets.local.json';
let output = result;
if (!release) {
    let published = {};
    try { published = JSON.parse(await readFile(path.join(root, 'assets.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    output = localInventoryAdditions(result, published);
}
await writeFile(path.join(root, filename), JSON.stringify(output, null, 2) + '\n');
console.log(`Indexed ${result.files.length} assets in ${Object.keys(environments).length || 1} content environments; wrote ${filename}.`);
