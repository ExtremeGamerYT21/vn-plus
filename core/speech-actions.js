// Local English narration hints. These never create speakers or rewrite prose.
const ACTIONS = [
    ['laughing', 'laughter', 'laugh(?:s|ed|ing)?|laughter'],
    ['chuckling', 'laughter', 'chuckl(?:e[sd]?|ing)|giggl(?:e[sd]?|ing)'],
    ['coughing', 'cough', 'cough(?:s|ed|ing)?'],
    ['sighing', 'sigh', 'sigh(?:s|ed|ing)?'],
    ['sobbing', 'cry', 'sob(?:s|bed|bing)?|cr(?:y|ies|ied|ying)'],
    ['gasping', 'gasp', 'gasp(?:s|ed|ing)?'],
    ['groaning', 'groan', 'groan(?:s|ed|ing)?'],
    ['panting', 'pant', 'pant(?:s|ed|ing)?'],
    ['yawning', 'yawn', 'yawn(?:s|ed|ing)?'],
    ['snoring', 'snore', 'snor(?:e[sd]?|ing)'],
    ['sneezing', 'sneeze', 'sneez(?:e[sd]?|ing)'],
    ['clear throat', 'throat', 'clear(?:s|ed|ing)?\\s+(?:(?:his|her|their|your|my|the)\\s+)?throat'],
].map(([cue, family, source]) => ({ cue, family, source, match: new RegExp(`^(?:${source})$`, 'iu'),
    mention: new RegExp(`(?<![\\p{L}])(?:${source})(?![\\p{L}])`, 'iu') }));
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const modifier = '(?:softly|quietly|loudly|gently|briefly|nervously|bitterly|weakly|deeply|heavily|suddenly|awkwardly|wearily|audibly|sharply|slightly)';
const gap = `(?:${modifier}\\s+){0,2}(?:(?<continuous>is|are|was|were|am)\\s+(?:${modifier}\\s+){0,2})?`;
const transparent = new Set(['SFX', 'VISUAL', 'SHAKE', 'FLASH', 'TEXT', 'CAMERA', 'TINT', 'MUSIC', 'AMBIENT']);

export function vocalCueFamilies(value) {
    const clean = String(value || '').replace(/[_-]/g, ' ');
    return [...new Set(ACTIONS.filter(action => action.mention.test(clean) || action.family === 'throat' && /\bthroat\s+clearing\b/i.test(clean)).map(action => action.family))];
}
export const vocalCueFamily = value => vocalCueFamilies(value)[0] || null;

function neighbor(beats, index, step, registry) {
    for (let at = index + step, count = 0; at >= 0 && at < beats.length && count < 4; at += step) {
        const token = beats[at].token;
        if (token.type === 'narration') { count++; continue; }
        if (token.type === 'command' && transparent.has(token.name)) continue;
        if (token.type === 'dialogue' && !token.thought && !registry.isNarrator(token.character)) return { index: at, id: registry.identify(token.character) };
        break;
    }
    return null;
}

/** Associate a narrated vocal action with one neighboring utterance by its actor.
 * Prefer the following utterance; trailing actions may use the preceding one.
 * Pronouns require a single unambiguous neighboring character. */
export function narratedVocalCues(timeline, registry) {
    const names = new Map(), addName = (name, id) => {
        if (typeof name === 'string' && name.trim() && !registry.isNarrator(id)) names.set(name.normalize('NFKC').trim(), id);
    };
    const ids = new Set([...registry.properties.keys(), ...registry.entries().map(entry => entry.id),
        ...timeline.beats.filter(beat => beat.token.type === 'dialogue').map(beat => registry.identify(beat.token.character))]);
    for (const id of ids) {
        const props = registry.get(id);
        for (const name of [id, props.displayName, ...(Array.isArray(props.aliases) ? props.aliases : [props.aliases])]) addName(name, id);
    }
    addName(registry.settings.playerName, registry.identify(registry.settings.playerName));
    for (const alias of registry.settings.playerAliases || []) addName(alias, registry.identify(registry.settings.playerName));
    const subjects = [...new Set(['you', 'I', 'he', 'she', 'they', ...names.keys()])].sort((a, b) => b.length - a.length).map(escape).join('|');
    const action = ACTIONS.map(entry => entry.source).join('|');
    const pattern = new RegExp(`(?:^|[.!?;,:—]\\s*)(?<subject>${subjects})\\s+${gap}(?<action>${action})(?![\\p{L}])`, 'giu');
    const result = new Map();
    for (let index = 0; index < timeline.beats.length; index++) {
        const token = timeline.beats[index].token;
        if (token.type !== 'narration') continue;
        const before = neighbor(timeline.beats, index, -1, registry), after = neighbor(timeline.beats, index, 1, registry);
        if (!before && !after) continue;
        // Quoted descriptions, code and bracket directions are not performed actions.
        const prose = token.text.normalize('NFKC').replace(/"[^"\n]*"|“[^”\n]*”|(?<![\p{L}])'[^'\n]+'(?![\p{L}])|`[^`\n]*`|\[[^\]\n]*\]/gu, ' ')
            .replace(/\*+/g, '').replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, '').replace(/\s+/g, ' ').trim();
        for (const match of prose.matchAll(pattern)) {
            if (match.groups.continuous && !/^\w+ing(?:\s|$)/i.test(match.groups.action)) continue;
            const prefix = prose.slice(0, match.index).split(/[.!?;]/).at(-1);
            if (/\b(?:if|unless|whether|imagine|imagines|imagined|remember|remembers|remembered)\b/i.test(prefix)) continue;
            const subject = match.groups.subject;
            let id;
            if (/^(?:you|i)$/i.test(subject)) id = registry.identify(registry.settings.playerName);
            else if (/^(?:he|she|they)$/i.test(subject)) {
                const candidates = [...new Set([before?.id, after?.id].filter(Boolean))];
                if (candidates.length === 1) id = candidates[0];
            } else id = registry.identify(subject);
            const target = after?.id === id ? after : before?.id === id ? before : null;
            if (!target) continue;
            const cue = ACTIONS.find(entry => entry.match.test(match.groups.action))?.cue;
            if (!cue) continue;
            if (!result.has(target.index)) result.set(target.index, []);
            const cues = result.get(target.index);
            if (!cues.some(existing => vocalCueFamily(existing) === vocalCueFamily(cue))) cues.push(cue);
        }
    }
    return result;
}
