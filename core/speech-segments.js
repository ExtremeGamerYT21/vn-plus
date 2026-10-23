import { compileSpeechText } from './speech-text.js';
import { endsWithEmDash } from './dialogue-text.js';
import { detectSpeechLanguage, speechLanguageCode } from './speech-language.js';
import { narratedVocalCues } from './speech-actions.js';
import { youngifySettings } from './speech-youngify.js';

export const SAMPLE_RATE = 44100;
export const SPEECH_DEFAULTS = {
    enabled: false, autoGenerate: false, narratorEnabled: false, narratorDelivery: 'warm, expressive storytelling', autoPlay: true, syncText: true, model: 's2.1-pro-free', isolateVoices: true, splitChapters: true, chapterSize: 6, parallelBatches: 3,
    temperature: .7, topP: .7, speed: 1, chunkLength: 300, latency: 'normal', normalize: true,
    conditionPrevious: true, bitrate: 128, timeout: 180, volume: 1, muted: false, lead: .2, tail: .2,
    processing: true, matchVolume: true, targetRms: -20, denoise: 4, soften: 0, ceiling: -1.5, edgeFade: 5,
};
export function speechSettings(value = {}) {
    const result = { ...SPEECH_DEFAULTS };
    // Never copy unknown fields (especially credentials) into persisted settings.
    for (const key of Object.keys(result)) if (typeof value?.[key] === typeof result[key]) result[key] = value[key];
    result.narratorDelivery = result.narratorDelivery.trim().slice(0, 160);
    result.parallelBatches = Number.isFinite(result.parallelBatches) ? Math.max(1, Math.min(5, Math.floor(result.parallelBatches))) : SPEECH_DEFAULTS.parallelBatches;
    result.volume = Number.isFinite(result.volume) ? Math.max(0, Math.min(1, result.volume)) : SPEECH_DEFAULTS.volume;
    return result;
}
export function fishVoiceId(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw new Error('Use a Fish voice ID string.');
    if (!value.trim()) return null;
    const raw = value.trim();
    if (/^[A-Za-z0-9_-]{1,128}$/.test(raw)) return raw;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || !['fish.audio', 'www.fish.audio'].includes(url.hostname)) throw new Error();
        const id = /(?:^|\/)m\/([A-Za-z0-9_-]{1,128})\/?$/.exec(url.pathname)?.[1];
        if (id) return id;
    } catch { /* report below without reproducing user input */ }
    throw new Error('Use a Fish voice ID or a fish.audio voice-page URL.');
}
export function spokenText(text) {
    let value = String(text || '').trim();
    const close = { '"': '"', '“': '”', "'": "'", '‘': '’' }[value[0]];
    if (close && value.endsWith(close)) value = value.slice(1, -1);
    return value.replace(/<\|speaker:\d+\|>/g, '').split(/(\[[^\]\r\n]*\])/g)
        .map(part => part.startsWith('[') ? part : part.replace(/\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g, (_, bold, em, under) => bold || em || under)).join('').trim();
}
export function speechSegments(timeline, registry, sourceId, options = {}) {
    const vocalCues = narratedVocalCues(timeline, registry);
    const ids = new Set([
        ...Object.keys(registry.resolver?.inventory?.characters || {}), ...registry.properties.keys(),
        ...registry.entries().map(entry => entry.id),
        ...timeline.beats.filter(beat => beat.token.type === 'dialogue').map(beat => registry.identify(beat.token.character)),
    ]);
    const fullNames = [...ids].flatMap(id => {
        const props = registry.get(id);
        return [id, props.displayName, ...(Array.isArray(props.aliases) ? props.aliases : typeof props.aliases === 'string' ? [props.aliases] : [])].filter(Boolean);
    });
    const entries = timeline.beats.flatMap((beat, index) => {
        const token = beat.token;
        const narrator = token.type === 'narration' || token.type === 'dialogue' && registry.isNarrator(token.character);
        if (token.thought || (narrator ? !options.narratorEnabled : token.type !== 'dialogue')) return [];
        const character = narrator ? 'narrator' : registry.identify(token.character), props = registry.get(character);
        let voice;
        try { voice = fishVoiceId(props.voiceId); }
        catch { throw new Error(`Invalid voiceId for ${props.displayName || token.character}.`); }
        let voiceCharacter;
        if (!voice && !narrator) {
            try { voice = fishVoiceId(registry.get('narrator').voiceId); }
            catch { throw new Error('Invalid voiceId for the narrator fallback.'); }
            if (voice) voiceCharacter = 'narrator';
        }
        if (!voice) return [];
        const text = spokenText(token.text);
        if (!text) return [];
        const detected = detectSpeechLanguage(text), hint = speechLanguageCode(props.ttsLanguage);
        let youngify;
        try { youngify = youngifySettings(props.ttsYoungify); }
        catch (error) { throw new Error(`${props.displayName || token.character}: ${error.message}`); }
        return [{ line: { id: `${sourceId}:${index}`, beat: index, character, name: props.displayName || token.character || 'Narration',
            voice, text, ...(youngify ? { youngify } : {}), ...(voiceCharacter ? { voiceCharacter } : {}), ...(!narrator && endsWithEmDash(token.text) ? { cutOff: true } : {}) }, token, props, narrator,
            language: detected === 'und-Cyrl' && hint && hint !== 'en' ? hint : detected || hint }];
    });
    const followingByRole = new Map(), previousByRole = new Map();
    for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index], following = entry.language || followingByRole.get(entry.narrator);
        followingByRole.set(entry.narrator, following); entry.following = following;
    }
    const segments = entries.map(({ line, token, props, narrator, language: detected, following }) => {
        const language = detected || previousByRole.get(narrator) || following || 'en';
        previousByRole.set(narrator, language);
        return { ...line, language, ...compileSpeechText(line.text, { direction: token.direction, emotion: token.emotion, fullNames: narrator ? [] : fullNames,
            fixedDelivery: narrator ? options.narratorDelivery ?? SPEECH_DEFAULTS.narratorDelivery : '',
            language: language === 'en' ? props.ttsLanguage : language, vocalCues: narrator ? [] : vocalCues.get(line.beat) || [] }) };
    });
    const views = new Map(timeline.views.map((beat, index) => [beat, index]));
    for (let index = 1; index < segments.length; index++) if (segments[index - 1].cutOff && views.get(segments[index].beat) === views.get(segments[index - 1].beat) + 1) segments[index].followsCutOff = true;
    let previousDialogue;
    for (const line of segments) {
        if (line.character === 'narrator') continue;
        if (previousDialogue && line.character === previousDialogue.character && line.voice === previousDialogue.voice && line.language === previousDialogue.language) {
            const between = timeline.beats.slice(previousDialogue.beat + 1, line.beat);
            const group = timeline.beats[line.beat].token.dialogueGroup;
            const samePassage = group !== undefined && group === timeline.beats[previousDialogue.beat].token.dialogueGroup;
            if ((between.length || samePassage) && between.every(({ token }) => !token.thought && (token.type === 'narration' || token.type === 'dialogue' && registry.isNarrator(token.character)))) line.continuationOf = previousDialogue.id;
        }
        previousDialogue = line;
    }
    return segments;
}
const continuesDialogue = (previous, line) => !!line.continuationOf && line.character !== 'narrator' && line.continuationOf === previous.id
    && line.character === previous.character && line.voice === previous.voice && (line.language || 'en') === (previous.language || 'en');
export function chapterRequests(segments, settings) {
    validateSpeechSettings(settings);
    if (!['s2.1-pro-free', 's2.1-pro'].includes(settings.model)) throw new Error('Select a supported Fish model explicitly.');
    if (!segments.length) throw new Error('No voice is available. Add voiceId in character properties or characters/narrator/properties.json.');
    if (segments.length > 200) throw new Error('Select at most 200 spoken segments per generation.');
    const voiceCharacter = line => line.voiceCharacter || line.character;
    const assigned = new Map();
    for (const line of segments) {
        const id = voiceCharacter(line);
        if (assigned.has(id) && assigned.get(id) !== line.voice) throw new Error(`Conflicting voice IDs for ${line.name || id}. Prepare the scene again.`);
        assigned.set(id, line.voice);
    }
    if (new Set(segments.map(voiceCharacter)).size > 8) throw new Error('Select at most eight voiced characters.');
    const count = settings.splitChapters ? Math.max(1, Math.min(200, Math.floor(settings.chapterSize))) : segments.length;
    const groups = [], order = new Map(segments.map((line, index) => [line, index]));
    // Collect each role across the scene; beat IDs restore the individual clips later.
    for (const narration of [true, false]) {
        const role = segments.filter(line => (line.character === 'narrator') === narration);
        const tracks = !narration && settings.isolateVoices ? [...new Set(role.map(line => line.voice))].map(voice => role.filter(line => line.voice === voice)) : [role];
        for (const track of tracks) {
            for (let offset = 0; offset < track.length;) {
                const language = track[offset].language || 'en';
                let end = offset + 1;
                // A narration-interrupted utterance stays intact across the chapter-size target.
                while (end < track.length && (track[end].language || 'en') === language && (end - offset < count || continuesDialogue(track[end - 1], track[end]))) end++;
                groups.push({ kind: narration ? 'narration' : 'dialogue', language, lines: track.slice(offset, end) });
                offset = end;
            }
        }
    }
    groups.sort((a, b) => order.get(a.lines[0]) - order.get(b.lines[0]));
    return groups.map(({ kind, language, lines }, index) => {
        const speakers = [...new Set(lines.map(voiceCharacter))];
        const reference_id = settings.isolateVoices ? [lines[0].voice] : speakers.map(character => lines.find(line => voiceCharacter(line) === character).voice);
        const routing = lines.map(line => ({ id: line.id, beat: line.beat, character: line.character, name: line.name, voice: line.voice,
            ...(line.voiceCharacter ? { voiceCharacter: line.voiceCharacter } : {}), speaker: settings.isolateVoices ? 0 : speakers.indexOf(voiceCharacter(line)) }));
        const utterances = [];
        for (const [position, line] of lines.entries()) {
            if (position && continuesDialogue(lines[position - 1], line)) utterances[utterances.length - 1] += ` ${line.synthesisText}`;
            else utterances.push(`<|speaker:${routing[position].speaker}|>${line.synthesisText}`);
        }
        const text = utterances.join('\n');
        if (text.length > 20000) throw new Error('A chapter exceeds the 20,000-character local safeguard. Use smaller chapters.');
        return { index, kind, language, lines, speakers, routing, body: {
            text, reference_id, format: 'mp3', sample_rate: SAMPLE_RATE, mp3_bitrate: settings.bitrate,
            temperature: settings.temperature, top_p: settings.topP, chunk_length: settings.chunkLength,
            latency: settings.latency, normalize: settings.normalize, condition_on_previous_chunks: settings.conditionPrevious,
            prosody: { speed: settings.speed, normalize_loudness: true },
        } };
    });
}
export function interleavedChapters(plan = []) {
    const beats = plan.flatMap(chapter => (chapter.lines || []).map(line => line.beat));
    return beats.some((beat, index) => index > 0 && beat < beats[index - 1]);
}
export function validateSpeechSettings(settings) {
    for (const [key, min, max] of [['chapterSize', 1, 200], ['temperature', 0, 1], ['topP', 0, 1], ['speed', .5, 2], ['chunkLength', 100, 300], ['timeout', 30, 600]]) {
        if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) throw new Error(`Invalid speech setting: ${key}.`);
    }
    if (!Number.isInteger(settings.chapterSize) || !Number.isInteger(settings.chunkLength)) throw new Error('Chapter size and chunk length must be whole numbers.');
    if (!['normal', 'low', 'balanced'].includes(settings.latency) || ![64, 128, 192].includes(settings.bitrate)) throw new Error('Invalid Fish latency or bitrate.');
}
