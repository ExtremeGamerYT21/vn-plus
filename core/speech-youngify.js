// Shared by the browser and local bridge. This never enters a Fish request.
export const YOUNGIFY_DEFAULTS = Object.freeze({ pitchSemitones: 4, formantRatio: 1.15, pitchRange: 1 });
export function youngifySettings(value) {
    if (value === undefined || value === null || value === false || value?.enabled === false) return null;
    if (value !== true && (typeof value !== 'object' || Array.isArray(value))) throw new Error('ttsYoungify must be true, false, or an options object.');
    if (value !== true && value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new Error('ttsYoungify.enabled must be true or false.');
    const settings = { ...YOUNGIFY_DEFAULTS };
    for (const [key, min, max] of [['pitchSemitones', 0, 12], ['formantRatio', 1, 1.4], ['pitchRange', .5, 2]]) {
        const number = value === true || value[key] === undefined ? settings[key] : value[key];
        if (!Number.isFinite(number) || number < min || number > max) throw new Error(`Invalid ttsYoungify.${key}: use ${min}–${max}.`);
        settings[key] = number;
    }
    return settings;
}
