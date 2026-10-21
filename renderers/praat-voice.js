import { SAMPLE_RATE } from '../core/speech-segments.js';

export async function youngifyClip(endpoint, samples, settings, signal) {
    if (!(samples instanceof Float32Array) || !samples.length || samples.length > SAMPLE_RATE * 120) throw new Error('Praat supports voice clips up to 120 seconds. Shorten the clip before processing.');
    const bytes = new Uint8Array(samples.length * 4), view = new DataView(bytes.buffer);
    for (let index = 0; index < samples.length; index++) view.setFloat32(index * 4, samples[index], true);
    let binary = '';
    for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
    const response = await endpoint('praat/youngify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ sampleRate: SAMPLE_RATE, pcm: btoa(binary), settings }) });
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== bytes.length) throw new Error('Praat changed clip duration. Original audio remains available.');
    const result = new Float32Array(samples.length), output = new DataView(buffer);
    for (let index = 0; index < result.length; index++) {
        result[index] = output.getFloat32(index * 4, true);
        if (!Number.isFinite(result[index])) throw new Error('Praat returned invalid audio.');
    }
    return { samples: result, notes: [response.headers.get('X-VN-Praat-Note') || 'Praat voice adjustment applied.'] };
}
