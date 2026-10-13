import { safeAssetPath } from './asset-resolver.js';
import { validEnvironmentId } from './content-environments.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const paths = value => Array.isArray(value) ? [...new Set(value.map(safeAssetPath).filter(Boolean))].sort() : [];
export function inventoryCharacters(files) {
    const characters = Object.create(null);
    for (const file of paths(files).filter(name => name.startsWith('characters/'))) {
        const [, id] = file.split('/'); if (!id || id === 'shared') continue;
        characters[id] ??= { expressions: [] };
        if (/\.(webp|png|jpe?g|gif|avif)$/i.test(file)) characters[id].expressions.push(file.split('/').at(-1).replace(/\.[^.]+$/, ''));
    }
    for (const props of Object.values(characters)) props.expressions = [...new Set(props.expressions)].sort();
    return characters;
}
function entries(inventory) {
    return Object.entries(object(inventory?.environments) ? inventory.environments : {})
        .filter(([id, entry]) => validEnvironmentId(id) && object(entry) && entry.path === `environments/${id}`);
}
/** Local files add to the shipped catalog; the tracked catalog stays clean for Git updates. */
export function mergeContentInventories(published = {}, local = {}) {
    const environments = Object.create(null);
    for (const [id, entry] of [...entries(published), ...entries(local)]) {
        const previous = environments[id], files = paths([...(previous?.files || []), ...paths(entry.files)]);
        environments[id] = { ...previous, ...entry, files, characters: inventoryCharacters(files) };
    }
    if (!Object.keys(environments).length) {
        const files = paths([...paths(published?.files), ...paths(local?.files)]);
        return { ...published, files, characters: inventoryCharacters(files) };
    }
    return { version: 2, defaultEnvironment: published?.defaultEnvironment || local?.defaultEnvironment,
        files: Object.entries(environments).flatMap(([id, entry]) => entry.files.map(file => `environments/${id}/${file}`)).sort(), environments };
}
/** Index only additions locally so deleted upstream assets cannot survive in a stale local catalog. */
export function localInventoryAdditions(scanned, published = {}) {
    if (!entries(scanned).length) {
        const known = new Set(paths(published?.files)), files = paths(scanned?.files).filter(file => !known.has(file));
        return { files, characters: inventoryCharacters(files) };
    }
    const environments = Object.create(null), knownEnvironments = Object.fromEntries(entries(published));
    for (const [id, entry] of entries(scanned)) {
        const known = knownEnvironments[id], knownFiles = new Set(paths(known?.files));
        const files = paths(entry.files).filter(file => !knownFiles.has(file));
        if (!known || files.length || entry.name !== known.name || entry.description !== known.description) {
            environments[id] = { ...entry, files, characters: inventoryCharacters(files) };
        }
    }
    return { version: 2, environments };
}
