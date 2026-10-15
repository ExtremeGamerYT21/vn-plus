/** Local semantic rules only. Unknown tags never make a model request. */
export const REACTIONS = Object.freeze({
    hurried: { anchor: 'end', delay: 180, animation: 160, easing: 'cubic-bezier(.2,.8,.3,1)' },
    scared: { anchor: 'start', delay: 80, animation: 120, easing: 'ease-out' },
    lazy: { anchor: 'end', delay: 1800, animation: 1000, easing: 'ease-in-out' },
    bored: { anchor: 'end', delay: 900, animation: 650, easing: 'ease-out' },
    normal: { anchor: 'end', delay: 450, animation: 350, easing: 'ease-in-out' },
});
const aliases = new Map(Object.entries({
    hurried: ['hurried', 'hurry', 'quick', 'quickly', 'urgent', 'urgently', 'rushed', 'fast'],
    scared: ['scared', 'afraid', 'frightened', 'startled', 'terrified', 'panicked'],
    lazy: ['lazy', 'lazily', 'sluggish', 'sluggishly', 'reluctant', 'slow', 'slowly'],
    bored: ['bored', 'casual', 'casually', 'uninterested', 'nonchalant', 'nonchalantly'],
    normal: ['normal', 'normally', 'neutral', 'standard', 'calm', 'calmly'],
}).flatMap(([category, words]) => words.map(word => [word, category])));
const patterns = [
    ['scared', /\b(?:scared|afraid|fright\w*|startl\w*|terrifi\w*|panic\w*|in fear)\b/],
    ['hurried', /\b(?:quick\w*|hurr\w*|urgent\w*|rush\w*|hast\w*|rapid\w*|immediately|at once)\b/],
    ['lazy', /\b(?:laz\w*|sluggish\w*|slow\w*|reluctant\w*|takes? (?:his|her|their|your) time)\b/],
    ['bored', /\b(?:bor(?:ed|ing)|casual\w*|uninterested|nonchalant\w*)\b/],
    ['normal', /\b(?:normal\w*|neutral\w*|standard|calm\w*)\b/],
];
export function resolveReaction(tag = '') {
    const text = String(tag).normalize('NFKC').toLowerCase().replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ' ');
    const exact = aliases.get(text), match = exact || patterns.find(([, pattern]) => pattern.test(text))?.[0];
    // Natural-language matches are deliberately not cached: negation/context may differ.
    const negated = /\b(?:not|never|without|isn't|isnt)\b/.test(text);
    const category = negated && !exact ? 'normal' : match || 'normal';
    return { category, ...REACTIONS[category], resolved: !!match && !negated, via: exact ? 'alias' : match && !negated ? 'pattern' : 'default' };
}

const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
const plain = text => String(text || '').trim().replace(/^["“'‘]|["”'’]$/g, '').replace(/\[[^\]]*\]|[*_]/g, '');
export const OBJECT_DURATIONS = Object.freeze([
    { kind: 'watch', pattern: /\b(?:watch|clock|timepiece)\b/i, min: 4000, max: 7000 },
    { kind: 'newspaper', pattern: /\b(?:newspaper|paper|journal)\b/i, min: 8000, max: 14000 },
    { kind: 'note', pattern: /\b(?:note|letter|diary|book)\b/i, min: 5000, max: 9000 },
]);
export function objectDuration(id, text, seed = '') {
    const rule = OBJECT_DURATIONS.find(rule => rule.pattern.test(String(id).replace(/[_-]/g, ' '))) || OBJECT_DURATIONS.find(rule => rule.pattern.test(text));
    if (!rule) return null;
    let hash = 2166136261;
    for (const char of `${id}:${text}:${seed}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return { duration: Math.round(rule.min + (rule.max - rule.min) * hash / 4294967295), rule: `object:${rule.kind}` };
}
export function estimateTiming(token, settings = {}, visualChecks = []) {
    if (!['dialogue', 'narration'].includes(token?.type)) return null;
    const text = plain(token.text); if (!text) return null;
    if (token.type === 'dialogue') return { duration: Math.round([...text].length * bounded(settings.dialogueSecondsPerCharacter, .1, .01, 1) * 1000), rule: token.thought ? 'thought' : 'dialogue' };
    if (!/[\p{L}\p{N}]/u.test(text)) return null;
    const words = text.match(/[\p{L}\p{N}]+/gu)?.length || 0;
    const reading = words * 60000 / bounded(settings.narrationWordsPerMinute, 220, 60, 1000) + (text.match(/[.!?…]/g)?.length || 0) * 180;
    const wait = /\b(?:wait\w*|pause\w*)\b[^.!?]{0,40}?\b(\d+(?:\.\d+)?)\s*(seconds?|minutes?)\b/i.exec(text);
    if (wait) return { duration: Math.max(reading, Math.min(300000, Number(wait[1]) * (/minute/i.test(wait[2]) ? 60000 : 1000))), rule: 'action:wait' };
    const mentioned = OBJECT_DURATIONS.find(rule => rule.pattern.test(text));
    const checks = mentioned ? visualChecks.filter(id => {
        const identified = OBJECT_DURATIONS.find(rule => rule.pattern.test(id.replace(/[_-]/g, ' ')));
        return !identified || identified.kind === mentioned.kind;
    }) : visualChecks.length === 1 ? visualChecks : [];
    const object = /\b(?:inspect\w*|check\w*|look\w*|read\w*|examin\w*|consult\w*)\b/i.test(text) ? checks.map(id => objectDuration(id, text, token.line)).filter(Boolean).sort((a, b) => b.duration - a.duration)[0] : null;
    if (object) return { ...object, duration: Math.max(reading, object.duration) };
    const action = /\b(?:turn(?:s|ed)? (?:toward|around)|nod(?:s|ded)?|sit(?:s)? down|stand(?:s)? up)\b/i.test(text) ? 1200 : 0;
    return { duration: Math.max(reading, action), rule: action ? 'action:gesture' : 'narration:reading' };
}

/** Apply only the fields changed by this command; differently timed reactions may overlap. */
export function applyCommandState(current, before, after) {
    const state = structuredClone(current);
    for (const key of Object.keys(after)) {
        if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
        if (['characters', 'visuals'].includes(key)) {
            for (const id of new Set([...Object.keys(before[key] || {}), ...Object.keys(after[key] || {})])) {
                if (JSON.stringify(before[key]?.[id]) === JSON.stringify(after[key]?.[id])) continue;
                if (!Object.hasOwn(after[key] || {}, id)) delete state[key][id];
                else Object.defineProperty(state[key], id, { value: structuredClone(after[key][id]), configurable: true, enumerable: true, writable: true });
            }
        } else state[key] = structuredClone(after[key]);
    }
    return state;
}

/** One cancellable beat clock; audio time remains authoritative during buffering/pause. */
export class BeatScheduler {
    constructor({ now = () => performance.now(), set = (fn, ms) => setTimeout(fn, ms), clear = id => clearTimeout(id) } = {}) { this.now = now; this.set = set; this.clear = clear; }
    start(options) {
        this.cancel(); this.options = options; this.last = this.now(); this.elapsed = 0; this.fired = new Set();
        this.estimate = estimateTiming(options.token, options.settings, options.visualChecks);
        this.tick();
    }
    duration() {
        const playback = this.options?.playback;
        return playback && !['failed', 'cancelled'].includes(playback.status) ? (Number.isFinite(playback.duration) ? playback.duration * 1000 : Math.max(0, (playback.clip?.end - playback.clip?.start) * 1000) || this.estimate?.duration || 0) : this.estimate?.duration || 0;
    }
    tick() {
        const options = this.options; if (!options) return;
        if (options.valid && !options.valid()) { this.cancel(); return; }
        const now = this.now(), delta = now - this.last; this.last = now;
        if (!options.paused?.()) {
            const playback = options.playback;
            if (playback?.status === 'cancelled') { this.cancel(); return; }
            if (playback?.status === 'loading') { this.timer = this.set(() => this.tick(), 20); return; }
            if (playback?.status === 'playing') this.elapsed = Math.max(0, (playback.audio?.currentTime || 0) * 1000);
            else if (playback?.status === 'ended') this.elapsed = Math.max(this.elapsed, this.duration()) + delta;
            else this.elapsed += delta;
            let end = this.duration();
            for (const [index, command] of (options.commands || []).entries()) {
                const profile = resolveReaction(command.token.reaction || options.token.direction);
                const due = (profile.anchor === 'start' ? 0 : this.duration()) + profile.delay;
                end = Math.max(end, due + (options.settings.reducedMotion ? 0 : profile.animation));
                if (!this.fired.has(index) && this.elapsed >= due) { this.fired.add(index); options.onCommand(command, profile); if (this.options !== options) return; }
            }
            if (options.settings.autoAdvance && (this.estimate || playback) && this.elapsed >= end && options.canAdvance()) { this.cancel(); options.onAdvance(); return; }
        }
        // Keep the clock while Auto is off so dialogue-attached reactions can still occur.
        this.timer = this.set(() => this.tick(), 20);
    }
    finishCommands() {
        const options = this.options; if (!options) return;
        for (const [index, command] of (options.commands || []).entries()) if (!this.fired.has(index)) { this.fired.add(index); options.onCommand(command, resolveReaction(command.token.reaction || options.token.direction)); }
    }
    wake() { this.clear(this.timer); if (this.options) { this.estimate = estimateTiming(this.options.token, this.options.settings, this.options.visualChecks); this.timer = this.set(() => this.tick(), 0); } }
    cancel() { this.clear(this.timer); this.timer = null; this.options = null; }
}
