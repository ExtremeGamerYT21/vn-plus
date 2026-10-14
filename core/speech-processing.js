import { SAMPLE_RATE } from './speech-segments.js';
const SIZE = 1024, HOP = 256;
const window = Float32Array.from({ length: SIZE }, (_, index) => .5 - .5 * Math.cos(2 * Math.PI * index / (SIZE - 1)));
const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / Math.max(1, values.length));
function fft(real, imaginary, inverse = false) {
    const n = real.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]]; } }
    for (let length = 2; length <= n; length <<= 1) {
        const angle = (inverse ? 2 : -2) * Math.PI / length;
        for (let start = 0; start < n; start += length) for (let offset = 0; offset < length / 2; offset++) {
            const a = start + offset, b = a + length / 2, cosine = Math.cos(angle * offset), sine = Math.sin(angle * offset);
            const r = real[b] * cosine - imaginary[b] * sine, im = real[b] * sine + imaginary[b] * cosine;
            real[b] = real[a] - r; imaginary[b] = imaginary[a] - im; real[a] += r; imaginary[a] += im;
        }
    }
    if (inverse) for (let i = 0; i < n; i++) { real[i] /= n; imaginary[i] /= n; }
}
function spectrum(samples, start) {
    const real = new Float64Array(SIZE), imaginary = new Float64Array(SIZE);
    for (let i = 0; i < SIZE; i++) real[i] = (samples[start + i] || 0) * window[i];
    fft(real, imaginary); return { real, imaginary };
}
export function noiseProfile(original, words, manual = null) {
    if (!manual && !words.length) return null;
    const duration = original.length / SAMPLE_RATE, intervals = []; let end = 0;
    if (manual && Number.isFinite(manual.start) && Number.isFinite(manual.end) && manual.start >= 0 && manual.end <= duration && manual.end - manual.start >= .06) intervals.push([manual.start, manual.end]);
    else {
        for (const word of words) { if (word.start - end >= .1) intervals.push([end + .02, word.start - .02]); end = Math.max(end, word.end); }
        if (duration - end >= .1) intervals.push([end + .02, duration]);
    }
    const profile = new Float64Array(SIZE); let frames = 0;
    for (const [left, right] of intervals) for (let start = Math.ceil(left * SAMPLE_RATE); start + SIZE <= right * SAMPLE_RATE; start += HOP) {
        if (!manual && rms(original.subarray(start, start + SIZE)) > 10 ** (-35 / 20)) continue;
        const { real, imaginary } = spectrum(original, start);
        for (let i = 0; i < SIZE; i++) profile[i] += Math.hypot(real[i], imaginary[i]);
        if (++frames >= 100) break;
    }
    if (frames < 2) return null;
    for (let i = 0; i < SIZE; i++) profile[i] /= frames; return profile;
}
function denoise(samples, profile, reduction) {
    const output = new Float64Array(samples.length), weights = new Float64Array(samples.length), floor = 10 ** (-reduction / 20);
    for (let start = -SIZE + HOP; start < samples.length; start += HOP) {
        const { real, imaginary } = spectrum(samples, start);
        for (let i = 0; i < SIZE; i++) { const magnitude = Math.hypot(real[i], imaginary[i]), gain = Math.max(floor, 1 - profile[i] / (magnitude + 1e-12)); real[i] *= gain; imaginary[i] *= gain; }
        fft(real, imaginary, true);
        for (let i = 0; i < SIZE; i++) { const position = start + i; if (position < 0 || position >= samples.length) continue; output[position] += real[i] * window[i]; weights[position] += window[i] ** 2; }
    }
    return Float32Array.from(output, (value, index) => weights[index] > 1e-8 ? value / weights[index] : samples[index]);
}
function softenHighs(samples, db) {
    const a = 10 ** (-db / 40), w = 2 * Math.PI * 5000 / SAMPLE_RATE, c = Math.cos(w), alpha = Math.sin(w) / Math.sqrt(2), k = 2 * Math.sqrt(a) * alpha;
    const a0 = a + 1 - (a - 1) * c + k, a1 = 2 * (a - 1 - (a + 1) * c) / a0, a2 = (a + 1 - (a - 1) * c - k) / a0;
    const b0 = a * (a + 1 + (a - 1) * c + k) / a0, b1 = -2 * a * (a - 1 + (a + 1) * c) / a0, b2 = a * (a + 1 + (a - 1) * c - k) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < samples.length; i++) { const x = samples[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; samples[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y; }
}
export function finishClip(original, clip, settings, profile = null) {
    if (clip.review) throw new Error('Review the timing before processing this clip.');
    const start = Math.round(clip.start * SAMPLE_RATE), end = Math.round(clip.end * SAMPLE_RATE);
    let samples = original.slice(start, end); const notes = [];
    if (!settings.processing) return { samples, notes };
    if (settings.denoise > 0) {
        if (profile) samples = denoise(samples, profile, Math.max(0, Math.min(12, settings.denoise)));
        else notes.push('Denoising skipped: no trustworthy noise-only interval.');
    }
    if (settings.soften > 0) softenHighs(samples, Math.min(8, settings.soften));
    if (settings.matchVolume) {
        const speech = samples.subarray(Math.max(0, Math.round(clip.speechStart * SAMPLE_RATE) - start), Math.min(samples.length, Math.round(clip.speechEnd * SAMPLE_RATE) - start));
        const level = rms(speech), target = 10 ** (Math.max(-30, Math.min(-12, settings.targetRms)) / 20);
        if (level > 1e-5) { const gain = 10 ** (Math.max(-24, Math.min(24, 20 * Math.log10(target / level))) / 20); for (let i = 0; i < samples.length; i++) samples[i] *= gain; }
        else notes.push('Volume matching skipped: effectively silent speech.');
    }
    const ceiling = 10 ** (Math.min(0, settings.ceiling) / 20), fade = Math.min(Math.floor(samples.length / 2), Math.round(Math.max(0, settings.edgeFade) * SAMPLE_RATE / 1000));
    for (let i = 0; i < samples.length; i++) samples[i] = Math.max(-ceiling, Math.min(ceiling, samples[i]));
    for (let i = 0; i < fade; i++) { const gain = i / Math.max(1, fade); samples[i] *= gain; samples[samples.length - 1 - i] *= gain; }
    return { samples, notes };
}
