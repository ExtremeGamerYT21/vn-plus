import { SAMPLE_RATE } from './speech-segments.js';
export async function decodeChapter(bytes) {
    const context = new OfflineAudioContext(1, 1, SAMPLE_RATE);
    const buffer = await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const length = Math.round(buffer.length * SAMPLE_RATE / buffer.sampleRate), mono = new Float32Array(length);
    for (let index = 0; index < length; index++) {
        const position = index * buffer.sampleRate / SAMPLE_RATE, left = Math.min(buffer.length - 1, Math.floor(position)), right = Math.min(buffer.length - 1, left + 1), fraction = position - left;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const source = buffer.getChannelData(channel); mono[index] += (source[left] * (1 - fraction) + source[right] * fraction) / buffer.numberOfChannels;
        }
    }
    return mono;
}
export function joinPCM(chapters) {
    const output = new Float32Array(chapters.reduce((length, chapter) => length + chapter.original.length, 0));
    let offset = 0; for (const chapter of chapters) { output.set(chapter.original, offset); offset += chapter.original.length; } return output;
}
export function wavBytes(samples, rate = SAMPLE_RATE) {
    const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
    const text = (position, value) => { for (let i = 0; i < value.length; i++) view.setUint8(position + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) { const value = Math.max(-1, Math.min(1, samples[i])); view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true); }
    return new Uint8Array(buffer);
}
