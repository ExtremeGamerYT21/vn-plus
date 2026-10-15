// Local filename semantics: no model requests or inspection of image contents.
const GROUPS = [
    'corridor hallway passage passageway', 'forest woods woodland woodlands', 'path trail pathway',
    'outside exterior outdoors outdoor', 'inside interior indoors indoor', 'bedroom bedchamber',
    'lounge livingroom sittingroom', 'entrance entry entryway', 'shore shoreline lakeshore bank',
    'jetty dock pier', 'shop store storefront shopfront', 'courtyard yard',
    'night nighttime evening nocturnal', 'day daytime daylight', 'dusk sunset twilight', 'dawn sunrise',
    'fog foggy mist misty', 'rain rainy raining rainfall', 'snow snowy snowing snowfall',
    'happy cheerful joyful joy smiling smile', 'sad unhappy depressed sorrowful',
    'angry mad furious enraged rage', 'scared afraid frightened terrified fearful',
    'surprised shocked startled astonished', 'nervous anxious worried uneasy',
    'embarrassed shy flustered blushing', 'tired sleepy exhausted', 'laughing amused laughter',
    'crying weeping sobbing', 'love loving affectionate', 'default neutral normal',
];
const synonyms = new Map(GROUPS.flatMap(group => { const words = group.split(' '); return words.map(word => [word, words[0]]); }));
const STOP = new Set('a an the of in on at to for with and from by image picture background scene sprite art view showing looking very'.split(' '));
const FACETS = [['day', 'night', 'dusk', 'dawn'], ['inside', 'outside'], ['rain', 'snow', 'fog', 'clear']];
const qualifiers = new Set(FACETS.flat());

export function assetKeywords(value) {
    return [...new Set(String(value).replace(/([\p{Ll}\d])([\p{Lu}])/gu, '$1 $2')
        .normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
        .replace(/living[\s_-]+room|sitting[\s_-]+room/g, 'livingroom')
        .match(/[\p{L}\p{N}]+/gu)?.filter(word => !STOP.has(word)).map(word => synonyms.get(word) || word) || [])].slice(0, 40);
}
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** Candidates must already be restricted to the correct environment, kind and character. */
export function rankAssetNames(query, paths) {
    const wanted = assetKeywords(query.replace(/\.[a-z\d]{2,5}$/i, ''));
    if (!wanted.length) return [];
    const entries = paths.map(path => ({ path, words: assetKeywords(path.replace(/\.[a-z\d]{2,5}$/i, '')) }));
    const frequency = new Map();
    for (const { words } of entries) for (const word of words) frequency.set(word, (frequency.get(word) || 0) + 1);
    const weight = word => 1 + Math.log(1 + entries.length / (1 + (frequency.get(word) || 0)));
    const total = wanted.reduce((sum, word) => sum + weight(word), 0);
    const anchors = wanted.filter(word => !qualifiers.has(word));
    return entries.flatMap(({ path, words }) => {
        const matched = wanted.filter(word => words.includes(word));
        if (FACETS.some(facet => { const asked = facet.filter(word => wanted.includes(word)), present = facet.filter(word => words.includes(word)); return asked.length && present.length && !asked.some(word => present.includes(word)); })) return [];
        const coverage = matched.reduce((sum, word) => sum + weight(word), 0) / total;
        // Shared atmosphere alone must not turn an unrelated location into a match.
        if (coverage < .6 || (anchors.length && matched.filter(word => anchors.includes(word)).length / anchors.length < .6)) return [];
        const precision = matched.length / Math.max(1, words.length);
        return [{ path, score: coverage * .85 + precision * .15, matched, coverage }];
    }).sort((a, b) => b.score - a.score || compare(a.path, b.path));
}
