import { speechTokens, speechWordMatches } from './speech-text.js';
export { speechTokens } from './speech-text.js';
/** Monotonic minimum-edit alignment; ambiguous paths never produce automatic cuts. */
export function alignChapter(lines, words, duration, margins = {}) {
    const expected = lines.flatMap((line, lineIndex) => speechTokens(line.text).map((text, word) => ({ text, lineIndex, line, word })));
    const timed = words.flatMap((word, index) => speechTokens(word.text).map(text => ({ ...word, text, index })));
    const matchesWord = (a, b) => speechWordMatches(b.text, a.text, a.line, a.word);
    const n = expected.length, m = timed.length;
    if (n > 6000 || m > 6000) throw new Error('Chapter has too many alignment tokens. Use smaller chapters.');
    const directions = new Uint8Array((n + 1) * (m + 1));
    let previous = Uint16Array.from({ length: m + 1 }, (_, j) => j), previousWays = new Uint8Array(m + 1).fill(1);
    for (let j = 1; j <= m; j++) directions[j] = 4;
    for (let i = 1; i <= n; i++) {
        const current = new Uint16Array(m + 1), ways = new Uint8Array(m + 1); current[0] = i; ways[0] = 1; directions[i * (m + 1)] = 2;
        for (let j = 1; j <= m; j++) {
            const diagonal = previous[j - 1] + (matchesWord(expected[i - 1], timed[j - 1]) ? 0 : 1);
            const up = previous[j] + 1, left = current[j - 1] + 1, cost = Math.min(diagonal, up, left);
            let direction = 0, count = 0;
            if (diagonal === cost) { direction |= 1; count += previousWays[j - 1]; }
            if (up === cost) { direction |= 2; count += previousWays[j]; }
            if (left === cost) { direction |= 4; count += ways[j - 1]; }
            directions[i * (m + 1) + j] = direction; current[j] = cost; ways[j] = Math.min(2, count);
        }
        previous = current; previousWays = ways;
    }
    const matches = new Map(); let i = n, j = m;
    while (i || j) {
        const direction = directions[i * (m + 1) + j];
        if (direction & 1) { if (matchesWord(expected[i - 1], timed[j - 1])) matches.set(i - 1, j - 1); i--; j--; }
        else if (direction & 2) i--; else j--;
    }
    const invalidTiming = timed.some((word, index) => !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end < word.start || word.end > duration + 1 / 44100 || (index && (word.start < timed[index - 1].start || word.end < timed[index - 1].end)));
    const clips = lines.map((line, lineIndex) => {
        const indices = expected.flatMap((token, index) => token.lineIndex === lineIndex ? [index] : []);
        const found = indices.filter(index => matches.has(index)), coverage = indices.length ? found.length / indices.length : 0;
        const positions = found.map(index => matches.get(index));
        const first = positions.length ? Math.min(...positions) : null, last = positions.length ? Math.max(...positions) : null;
        const start = first === null ? null : timed[first].start, end = last === null ? null : timed[last].end;
        const reasons = [];
        if (coverage < .95 || !matches.has(indices[0]) || !matches.has(indices.at(-1))) reasons.push('Incomplete text alignment');
        if (previousWays[m] > 1) reasons.push('Ambiguous word alignment');
        if (invalidTiming || start === null || end === null || end <= start) reasons.push('Missing or invalid word times');
        return { id: line.id, beat: line.beat, line, coverage, speechStart: start, speechEnd: end,
            first, last, start, end, boundaryLeft: timed[first - 1]?.end ?? 0, boundaryRight: timed[last + 1]?.start ?? duration,
            review: reasons.length > 0, reasons, approved: false };
    });
    for (let index = 1; index < clips.length; index++) {
        const a = clips[index - 1], b = clips[index];
        if (a.speechEnd !== null && b.speechStart !== null && a.speechEnd > b.speechStart) {
            for (const clip of [a, b]) { clip.review = true; clip.reasons.push('Overlapping dialogue times'); }
        }
    }
    return applyMargins(clips, timed, duration, margins);
}
export function applyMargins(clips, words, duration, { lead = .2, tail = .2 } = {}) {
    lead = Math.max(0, Math.min(2, Number(lead) || 0)); tail = Math.max(0, Math.min(2, Number(tail) || 0));
    const result = clips.map(clip => {
        if (clip.review || clip.approved) return { ...clip };
        const previousEnd = clip.boundaryLeft ?? words[clip.first - 1]?.end ?? 0, nextStart = clip.boundaryRight ?? words[clip.last + 1]?.start ?? duration;
        return { ...clip, start: Math.max(0, previousEnd, clip.speechStart - lead), end: Math.min(duration, nextStart, clip.speechEnd + tail) };
    });
    for (let index = 1; index < result.length; index++) {
        const a = result[index - 1], b = result[index];
        if (a.review || b.review || a.approved || b.approved || a.end <= b.start) continue;
        const gap = Math.max(0, b.speechStart - a.speechEnd), boundary = a.speechEnd + gap * (tail / (lead + tail || 1));
        a.end = boundary; b.start = boundary;
    }
    return result;
}
export function approveCut(clips, id, start, end, duration) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration) throw new Error('Choose valid start/end times inside this chapter.');
    const index = clips.findIndex(clip => clip.id === id); if (index < 0) throw new Error('Dialogue segment no longer exists.');
    if (clips.some((clip, other) => other !== index && !clip.review && start < clip.end && end > clip.start)) throw new Error('This cut overlaps another approved dialogue clip.');
    return { ...clips[index], start, end, speechStart: start, speechEnd: end, review: false, approved: true, reasons: [] };
}
