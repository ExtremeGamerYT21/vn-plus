// Bounded YIN estimate for the workbench's before/after comparison.
// Unvoiced frames are omitted; the returned median is an estimate, not a target.
export function estimatePitch(samples, sampleRate = 44100) {
    if (!(samples instanceof Float32Array) || !samples.length || !Number.isFinite(sampleRate) || sampleRate < 8000) return { medianHz: null, voicedFrames: 0, frames: 0 };
    const step = Math.max(1, Math.floor(sampleRate / 11025)), rate = sampleRate / step;
    const size = 1024, low = Math.ceil(rate / 600), high = Math.floor(rate / 60);
    if (samples.length < size * step) return { medianHz: null, voicedFrames: 0, frames: 0 };
    const count = Math.min(100, Math.max(1, Math.floor(samples.length / (size * step / 2)))), pitches = [];
    const frame = new Float64Array(size), normalized = new Float64Array(high + 2);
    for (let index = 0; index < count; index++) {
        const start = Math.floor((samples.length - size * step) * index / Math.max(1, count - 1)); let energy = 0;
        for (let position = 0; position < size; position++) { const value = samples[start + position * step]; frame[position] = value; energy += value * value; }
        if (!Number.isFinite(energy) || energy / size < 1e-7) continue;
        let sum = 0; normalized[0] = 1;
        for (let lag = 1; lag <= high + 1; lag++) {
            let value = 0;
            for (let position = 0; position < size - high - 1; position++) value += (frame[position] - frame[position + lag]) ** 2;
            sum += value; normalized[lag] = sum ? value * lag / sum : 1;
        }
        let lag = low;
        while (lag <= high && normalized[lag] >= .15) lag++;
        if (lag > high) continue;
        while (lag < high && normalized[lag + 1] < normalized[lag]) lag++;
        const denominator = normalized[lag - 1] - 2 * normalized[lag] + normalized[lag + 1];
        const correction = denominator ? .5 * (normalized[lag - 1] - normalized[lag + 1]) / denominator : 0;
        const hz = rate / (lag + Math.max(-.5, Math.min(.5, correction)));
        if (hz >= 60 && hz <= 600) pitches.push(hz);
    }
    pitches.sort((a, b) => a - b);
    return { medianHz: pitches.length ? pitches[Math.floor(pitches.length / 2)] : null, voicedFrames: pitches.length, frames: count };
}
