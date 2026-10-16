export const SAMPLE_RATE = 44100;
export const SPEECH_DEFAULTS = {
    enabled: false, autoGenerate: false, narratorEnabled: false, autoPlay: true, syncText: true, model: 's2.1-pro-free', splitChapters: true, chapterSize: 6, parallelBatches: 3,
    temperature: .7, topP: .7, speed: 1, chunkLength: 300, latency: 'normal', normalize: true,
    conditionPrevious: true, bitrate: 128, timeout: 180, volume: 1, lead: .2, tail: .2,
    processing: true, matchVolume: true, targetRms: -20, denoise: 4, soften: 0, ceiling: -1.5, edgeFade: 5,
};
export function speechSettings(value = {}) {
    const result = { ...SPEECH_DEFAULTS };
    // Never copy unknown fields (especially credentials) into persisted settings.
    for (const key of Object.keys(result)) if (typeof value?.[key] === typeof result[key]) result[key] = value[key];
    result.parallelBatches = Number.isFinite(result.parallelBatches) ? Math.max(1, Math.min(5, Math.floor(result.parallelBatches))) : SPEECH_DEFAULTS.parallelBatches;
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
    return value.replace(/<\|speaker:\d+\|>/g, '').replace(/\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g, (_, bold, em, under) => bold || em || under).trim();
}
export function speechSegments(timeline, registry, sourceId, options = {}) {
    return timeline.beats.flatMap((beat, index) => {
        const token = beat.token;
        const narrator = token.type === 'narration' || token.type === 'dialogue' && registry.isNarrator(token.character);
        if (token.thought || (narrator ? !options.narratorEnabled : token.type !== 'dialogue')) return [];
        const character = narrator ? 'narrator' : registry.identify(token.character), props = registry.get(character);
        let voice;
        try { voice = fishVoiceId(props.voiceId); }
        catch { throw new Error(`Invalid voiceId for ${props.displayName || token.character}.`); }
        if (!voice) return [];
        const text = spokenText(token.text);
        if (!text) return [];
        return [{ id: `${sourceId}:${index}`, beat: index, character, name: props.displayName || token.character || 'Narration',
            voice, text, synthesisText: `${token.direction ? `[${token.direction}] ` : ''}${text}` }];
    });
}
export function chapterRequests(segments, settings) {
    validateSpeechSettings(settings);
    if (!['s2.1-pro-free', 's2.1-pro'].includes(settings.model)) throw new Error('Select a supported Fish model explicitly.');
    if (!segments.length) throw new Error('No enabled speaker has a character voiceId. Add voiceId in character properties.');
    if (segments.length > 200) throw new Error('Select at most 200 spoken segments per generation.');
    if (new Set(segments.map(segment => segment.character)).size > 8) throw new Error('Select at most eight voiced characters.');
    const count = settings.splitChapters ? Math.max(1, Math.min(200, Math.floor(settings.chapterSize))) : segments.length;
    const chapters = [];
    for (let offset = 0; offset < segments.length; offset += count) {
        const lines = segments.slice(offset, offset + count), speakers = [...new Set(lines.map(line => line.character))];
        const reference_id = speakers.map(character => lines.find(line => line.character === character).voice);
        const text = lines.map(line => `<|speaker:${speakers.indexOf(line.character)}|>${line.synthesisText}`).join('\n');
        if (text.length > 20000) throw new Error('A chapter exceeds the 20,000-character local safeguard. Use smaller chapters.');
        chapters.push({ index: chapters.length, lines, speakers, body: {
            text, reference_id, format: 'mp3', sample_rate: SAMPLE_RATE, mp3_bitrate: settings.bitrate,
            temperature: settings.temperature, top_p: settings.topP, chunk_length: settings.chunkLength,
            latency: settings.latency, normalize: settings.normalize, condition_on_previous_chunks: settings.conditionPrevious,
            prosody: { speed: settings.speed, normalize_loudness: true },
        } });
    }
    return chapters;
}
export function validateSpeechSettings(settings) {
    for (const [key, min, max] of [['chapterSize', 1, 200], ['temperature', 0, 1], ['topP', 0, 1], ['speed', .5, 2], ['chunkLength', 100, 300], ['timeout', 30, 600]]) {
        if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) throw new Error(`Invalid speech setting: ${key}.`);
    }
    if (!Number.isInteger(settings.chapterSize) || !Number.isInteger(settings.chunkLength)) throw new Error('Chapter size and chunk length must be whole numbers.');
    if (!['normal', 'low', 'balanced'].includes(settings.latency) || ![64, 128, 192].includes(settings.bitrate)) throw new Error('Invalid Fish latency or bitrate.');
}
