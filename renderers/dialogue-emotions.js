import { emotionKey, emotionProfile } from '../core/emotion-routing.js';
import { EMOTION_FLAIR, shouldShakeText } from './emotion-flair.js';

const shouting = new Set('shout shouting shouted yell yelling yelled scream screaming screamed roar roaring bellow bellowing holler hollering calling_out'.split(' '));
const whispering = new Set('whisper whispering whispered murmuring muttering sotto_voce'.split(' '));
const adverbs = { angrily: 'anger', sadly: 'sadness', lovingly: 'love', affectionately: 'love', excitedly: 'excitement' };
const legacy = { anger: 'mad', sadness: 'sad', grief: 'cry', love: 'gentle', excitement: 'excited', embarrassment: 'embarrassed', disappointment: 'down', fear: 'fearful' };

/** Visual delivery follows semantic tags, independently of whichever sprite was available. */
export function dialogueEmotionStyle(token, effect, settings) {
    if (!settings.textEffects) return { fontScale: 1, tracking: 0, jitter: false, scatter: false, glow: false, whisper: false, shout: false, flair: {} };
    const directions = token.type === 'dialogue' ? [token.emotion, token.direction, ...String(token.text || '').matchAll(/\[([^\[\]\r\n]+)\]/g)] : [];
    const cues = directions.flatMap(value => {
        const cue = typeof value === 'string' ? value : value?.[1];
        // Negated instructions must never turn into their positive delivery style.
        if (/(?:^|[\s_,;-])(?:not|never|without|no)(?:$|[\s_,;-])/i.test(cue || '')) return [];
        return String(cue || '').split(/[,;|]+/).map(emotionKey);
    });
    const profiles = cues.map(cue => emotionProfile(cue) || adverbs[cue]).filter(Boolean);
    const has = group => cues.some(cue => group.has(cue) || cue.split('_').some(word => group.has(word)));
    const shout = effect !== 'whisper' && (effect === 'shout' || has(shouting));
    const whisper = !shout && (effect === 'whisper' || has(whispering));
    const primary = profiles[0], flair = token.type === 'dialogue' ? EMOTION_FLAIR[emotionKey(token.emotion)] || EMOTION_FLAIR[legacy[primary]] || {} : {};
    const sad = profiles.includes('sadness') || profiles.includes('grief');
    const fontScale = shout ? 1.35 : whisper ? .76 : sad ? (profiles.includes('grief') ? .74 : .8) : flair.fontScale || 1;
    return { fontScale, tracking: shout ? .075 : 0, jitter: cues.some(cue => shouldShakeText(adverbs[cue] || cue, settings)), scatter: shout,
        glow: profiles.includes('love'), whisper, shout, flair };
}

/** Stable per-letter noise avoids re-rolling a sentence during reveal, replay or layout changes. */
export function letterVariations(text) {
    let seed = 2166136261;
    for (const char of text) seed = Math.imul(seed ^ char.codePointAt(0), 16777619) >>> 0;
    return Array.from(text, (_, index) => {
        let hash = Math.imul(seed ^ (index + 1), 0x45d9f3b) >>> 0;
        hash = Math.imul(hash ^ hash >>> 16, 0x45d9f3b) >>> 0;
        const centered = shift => ((hash >>> shift & 255) / 255 * 2 - 1);
        return { x: `${(centered(0) * .055).toFixed(3)}em`, y: `${(centered(8) * .11).toFixed(3)}em`,
            angle: `${(centered(16) * 8).toFixed(2)}deg`, duration: `${180 + hash % 100}ms`, delay: `${-(hash % 700)}ms` };
    });
}
