export const DEFAULT_ENVIRONMENT = 'coffin-of-andy-and-leyley';
export const CONTENT_PROFILE_KEYS = ['characters', 'dialogueFont', 'dialogueBoxTexture'];
export const BUILTIN_ENVIRONMENTS = [
    { id: DEFAULT_ENVIRONMENT, name: 'The Coffin of Andy and Leyley', description: 'The supplied character artwork, locations, sound and fonts.' },
    { id: 'harry-potter', name: 'Harry Potter', description: 'Ready for your Harry Potter artwork and audio.' },
    { id: 're-zero', name: 'Re:Zero', description: 'Ready for your Re:Zero artwork and audio.' },
];
export const validEnvironmentId = id => typeof id === 'string' && /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(id);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const profile = value => ({
    characters: object(value?.characters) ? structuredClone(value.characters) : {},
    dialogueFont: typeof value?.dialogueFont === 'string' ? value.dialogueFont : '',
    dialogueBoxTexture: typeof value?.dialogueBoxTexture === 'string' ? value.dialogueBoxTexture : '',
});

/** Only declared environment roots can be selected. Older flat inventories remain readable. */
export function contentEnvironments(inventory = {}) {
    const entries = Object.entries(object(inventory.environments) ? inventory.environments : {}).flatMap(([id, value]) => {
        if (!validEnvironmentId(id) || !object(value) || value.path !== `environments/${id}`) return [];
        return [{ id, name: typeof value.name === 'string' && value.name.trim() ? value.name : id,
            description: typeof value.description === 'string' ? value.description : '', path: value.path,
            inventory: { files: Array.isArray(value.files) ? value.files : [], characters: object(value.characters) ? value.characters : {} } }];
    });
    if (entries.length) return entries;
    if (Array.isArray(inventory.files) && inventory.files.some(path => /^(characters|backgrounds|sfx|music|ambient|fonts)\//.test(path))) {
        return [{ id: DEFAULT_ENVIRONMENT, name: 'Legacy content', description: 'Assets from an older flat installation.', path: '', inventory }];
    }
    return BUILTIN_ENVIRONMENTS.map(entry => ({ ...entry, path: `environments/${entry.id}`, inventory: { files: [], characters: {} } }));
}

export function initializeContentProfiles(settings) {
    settings.environment = validEnvironmentId(settings.environment) ? settings.environment : DEFAULT_ENVIRONMENT;
    settings.environmentProfiles = Object.fromEntries(Object.entries(object(settings.environmentProfiles) ? settings.environmentProfiles : {})
        .filter(([id, value]) => validEnvironmentId(id) && object(value)).map(([id, value]) => [id, profile(value)]));
    // Migrate the current registry/theme once; it belongs to the existing content set.
    if (!Object.hasOwn(settings.environmentProfiles, settings.environment)) saveContentProfile(settings, settings.environment);
}
export function saveContentProfile(settings, id = settings.environment) {
    if (!validEnvironmentId(id)) return;
    settings.environmentProfiles = { ...settings.environmentProfiles, [id]: profile(settings) };
}
export function activateContentProfile(settings, id, previousId = null) {
    if (!validEnvironmentId(id)) return false;
    if (previousId) saveContentProfile(settings, previousId);
    const selected = profile(Object.hasOwn(settings.environmentProfiles, id) ? settings.environmentProfiles[id] : null);
    Object.assign(settings, selected, { environment: id });
    saveContentProfile(settings, id); return true;
}
