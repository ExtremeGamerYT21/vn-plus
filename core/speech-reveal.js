import { speechTokens } from './speech-alignment.js';
import { SAMPLE_RATE } from './speech-segments.js';
import { speechWordMatches } from './speech-text.js';

/** Map actual rendered text to provider word times; never estimate from total clip duration. */
export function speechRevealCues(text, clip, words = []) {
    if (!clip || clip.review || !Number.isInteger(clip.first) || !Number.isInteger(clip.last) || clip.first < 0 || clip.last < clip.first) return null;
    const raw = String(text), masked = raw.replace(/<\|speaker:\d+\|>|\[[^\]]*\]/g, match => ' '.repeat(match.length));
    const visible = [...masked.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{M}\p{N}]+)*/gu)]
        .flatMap(match => speechTokens(match[0]).map(token => ({ text: token, start: match.index, end: match.index + match[0].length })));
    const timed = words.flatMap(word => speechTokens(word.text).map(token => ({ ...word, text: token }))).slice(clip.first, clip.last + 1);
    if (!visible.length || visible.length !== timed.length || visible.some((word, index) => !speechWordMatches(timed[index].text, word.text, clip.line, index))) return null;
    const origin = Math.round(clip.start * SAMPLE_RATE) / SAMPLE_RATE;
    if (!Number.isFinite(origin) || !Number.isFinite(clip.end) || timed.some((word, index) => !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < origin - 1 / SAMPLE_RATE || word.end > clip.end + 1 / SAMPLE_RATE || word.end < word.start || (index && word.start < timed[index - 1].start))) return null;
    return visible.map((word, index) => {
        let end = visible[index + 1]?.start ?? raw.length;
        // An inline direction belongs with the following spoken word.
        const direction = raw.slice(word.end, end).search(/\[|<\|speaker:/);
        if (direction >= 0 && index + 1 < visible.length) end = word.end + direction;
        return { at: Math.max(0, timed[index].start - origin), through: Array.from(raw.slice(0, end)).length };
    });
}
