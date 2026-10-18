import { vocalCueFamily, vocalCueFamilies } from './speech-actions.js';

// S2.1 delivery hints are presentation instructions, never edits to chat prose.
const CUE_ALIASES = new Map(Object.entries({
    joy: 'happy', happiness: 'happy', anger: 'angry', sadness: 'sad', fear: 'scared',
    surprise: 'surprised', disgust: 'disgusted', amusement: 'amused', curiosity: 'curious',
    whisper: 'whispering', shout: 'shouting', scream: 'screaming', hurried: 'in a hurry tone',
    laugh: 'laughing', chuckle: 'chuckling', sob: 'sobbing', sigh: 'sighing', groan: 'groaning',
    gasp: 'gasping', pant: 'panting', yawn: 'yawning', cough: 'coughing', sneeze: 'sneezing', throat_clearing: 'clear throat',
    voice_break: 'voice breaking', voice_breaks: 'voice breaking', voice_crack: 'voice breaking', voice_cracks: 'voice breaking',
    breaking_voice: 'voice breaking', broken_voice: 'voice breaking',
}));
const POSITIONAL_CUE = /^(?:emphasis|break|long-break|laughing|chuckling|coughing|sneezing|sobbing|crying loudly|sighing|groaning|panting|gasping|yawning|snoring|clear throat|(?:audience|background|crowd) laugh(?:ing|ter))$/;
const TAG = /\[([^\]\r\n]+)\]/g;
const stripSpeakers = value => String(value || '').replace(/<\|speaker:\d+\|>/g, '');
const cueKey = value => value.toLowerCase().replace(/[ _-]+/g, '_');
const nameKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
export function speechTokens(text) {
    return String(text || '').normalize('NFKC').toLowerCase().replace(/<\|speaker:\d+\|>|\[[^\]]*\]/g, ' ')
        .replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
}
function cue(value) {
    const clean = stripSpeakers(value).replace(/[\[\]\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    return CUE_ALIASES.get(cueKey(clean)) || clean.replace(/_/g, ' ');
}
function unquote(value) {
    const close = { '"': '"', '“': '”', "'": "'", '‘': '’' }[value[0]];
    return close && value.endsWith(close) ? value.slice(1, -1).trim() : value;
}
function sentenceStart(text, end) {
    let start = 0;
    for (const match of text.slice(0, end).matchAll(/[.!?…]+["'”’]?(?:\s+|$)|\n+/g)) {
        const preceding = text.slice(0, match.index);
        if (match[0].startsWith('.') && /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)|\b[A-Z])$/u.test(preceding)) continue;
        start = match.index + match[0].length;
    }
    return start;
}
function nameReprimand(text, names) {
    const plain = nameKey(text.replace(TAG, ' '));
    return names.some(value => {
        const name = nameKey(value).replace(/^(?:mr\.?|mrs\.?|ms\.?|dr\.?|prof\.?)\s+/i, '');
        return speechTokens(name).length >= 2 && plain.startsWith(name) && /^[\s]*[,!.:;?—–…]/u.test(plain.slice(name.length) || '!');
    });
}
function delivery(cues, text, names) {
    let result = [...new Set(cues.filter(Boolean))];
    const strict = value => /\b(?:angry|serious|stern|annoyed|irritated|furious|displeased|strict)\b/i.test(value) && !/\b(?:not|never|without)\b/i.test(value);
    if (result.some(strict) && nameReprimand(text, names)) {
        let replaced = false;
        result = result.flatMap(value => {
            if (!strict(value)) return [value];
            const styles = value.match(/\b(?:whispering|shouting|screaming|soft tone|quietly)\b/gi) || [];
            const hints = replaced ? [] : ['stern, controlled displeasure']; replaced = true;
            return [...hints, ...styles];
        });
    }
    // A repeated syllable alone does not establish sadness or a cracking voice.
    if (!result.some(value => /voice breaking|stammer|stutter/i.test(value))) {
        const repeated = /(?:^|[^\p{L}])([\p{L}])[-—–]\1[\p{L}]*/iu.test(text);
        if (repeated && result.some(value => /\b(?:sad|tearful|crying|sobbing|heartbroken|distressed)\b/i.test(value))) result.push('voice breaking');
        else if (repeated && result.some(value => /\b(?:nervous|anxious|scared|afraid|uncertain|hesitant)\b/i.test(value))) result.push('hesitant, stammering');
    }
    const sounds = text.replace(TAG, ' ').trim();
    const sound = /^(?:ha[\s,!.-]*){2,}[!?…]*$/i.test(sounds) ? 'laughing'
        : /^(?:heh[\s,!.-]*)+[!?…]*$/i.test(sounds) || /^(?:he){2,}[.!?…]*$/i.test(sounds) ? 'chuckling'
        : /^u+g+h+[.!?…]*$/i.test(sounds) ? 'groaning'
        : /^a+h+e+m+[.!?…]*$/i.test(sounds) ? 'clear throat'
        : /^sigh[.!?…]*$/i.test(sounds) ? 'sighing'
        : /^gasp[.!?…]*$/i.test(sounds) ? 'gasping'
        : /^yawn[.!?…]*$/i.test(sounds) ? 'yawning'
        : /^(?:huff|puff)(?:[\s,!.-]+(?:huff|puff))*[.!?…]*$/i.test(sounds) ? 'panting' : null;
    if (sound && !result.some(value => POSITIONAL_CUE.test(value.toLowerCase()))) result.push(sound);
    return [...new Set(result)];
}
function preserveCase(from, to) {
    return from === from.toUpperCase() ? to.toUpperCase() : from[0] === from[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;
}
function pronounceSnippets(text, language) {
    if (language && !/^en(?:-|$)/i.test(language)) return text;
    const plain = text.replace(TAG, ' ');
    // Short code-switches in English, not a transliteration of German passages.
    if (/\b(?:ich|du|wir|sie|nicht|bin|bist|sind|habe|haben|ist|und|ein|eine|das|der|die)\b/i.test(plain)) return text;
    if (speechTokens(plain).length > 4 && !/\b(?:i|you|your|the|this|that|with|please|really|understand|we|why|yes|now)\b/i.test(plain)) return text;
    // Split tags out so directions never receive pronunciation replacements.
    return text.split(/(\[[^\]\r\n]*\])/g).map(part => part.startsWith('[') ? part : part
        .replace(/(?<![\p{L}\p{N}_])ach(\s+)so(?![\p{L}\p{N}_])/giu, (match, space) => match.slice(0, 3) + space + preserveCase(match.slice(3 + space.length), 'zo'))
        .replace(/(?<![\p{L}\p{N}_])ja(?![\p{L}\p{N}_])/giu, match => preserveCase(match, 'ya'))).join('');
}

/** Compile only the Fish prompt. Original words and source offsets remain intact. */
export function compileSpeechText(text, { direction, emotion, fullNames = [], language, vocalCues = [] } = {}) {
    let value = stripSpeakers(text).trim();
    const global = [];
    // Trailing sentence emotions describe the utterance. Timed effects stay put.
    let suffix;
    while ((suffix = /\s*\[([^\]\r\n]+)\]\s*$/.exec(value)) && !POSITIONAL_CUE.test(cue(suffix[1]).toLowerCase())) {
        global.unshift(cue(suffix[1])); value = value.slice(0, suffix.index).trimEnd();
    }
    value = unquote(value);
    const groups = new Map();
    // Move inline sentence emotions before that sentence's words; leave breaks,
    // emphasis and vocal events at their authored positions.
    let plain = '', cursor = 0;
    for (const match of value.matchAll(TAG)) {
        plain += value.slice(cursor, match.index); cursor = match.index + match[0].length;
        const hint = cue(match[1]);
        if (POSITIONAL_CUE.test(hint.toLowerCase())) { plain += `[${hint}]`; continue; }
        const start = sentenceStart(plain, plain.length);
        if (!groups.has(start)) groups.set(start, []);
        groups.get(start).push(hint);
        // A removed cue is a word boundary, including "go[angry]away".
        plain += ' ';
    }
    plain += value.slice(cursor);
    const explicit = cue(direction || (emotion && emotion !== 'default' ? emotion : ''));
    const authored = new Set([direction, emotion, ...[...String(text || '').matchAll(TAG)].map(match => match[1])].flatMap(vocalCueFamilies));
    const inferred = vocalCues.filter(value => {
        const family = vocalCueFamily(value);
        if (!family || authored.has(family)) return false;
        authored.add(family); return true;
    }).map(cue);
    const opening = [...(explicit ? [explicit] : []), ...global, ...(groups.get(0) || []), ...inferred];
    groups.set(0, delivery(opening, plain, fullNames));
    // Descending insertion preserves the offsets found before any cues are added.
    for (const [at, hints] of [...groups].sort((a, b) => b[0] - a[0])) {
        const resolved = at ? delivery(hints, plain.slice(at), fullNames) : hints;
        if (resolved.length) plain = plain.slice(0, at) + resolved.map(hint => `[${hint}]`).join('') + ' ' + plain.slice(at).trimStart();
    }
    const synthesisText = pronounceSnippets(plain.trim().replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.!?;:…])/g, '$1'), language);
    const original = speechTokens(text), spoken = speechTokens(synthesisText);
    // All built-in spellings preserve word count. Accept the original spelling
    // too: providers may transcribe the spoken pronunciation either way.
    const pronunciations = original.length === spoken.length ? original.flatMap((word, index) => word === spoken[index] ? [] : [{ word: index, from: word, text: spoken[index] }]) : [];
    return { synthesisText, ...(pronunciations.length ? { pronunciations } : {}) };
}

export function speechWordMatches(text, expected, line, word) {
    if (text === expected) return true;
    const replacement = line?.pronunciations?.find(entry => entry.word === word);
    return replacement?.from === expected && replacement.text === text;
}
