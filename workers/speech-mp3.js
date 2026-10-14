/* global lamejs */
importScripts('../vendor/lame.all.js');
self.onmessage = event => {
    try {
        const { samples, bitrate } = event.data, encoder = new lamejs.Mp3Encoder(1, 44100, [64, 128, 192].includes(bitrate) ? bitrate : 128);
        const pcm = Int16Array.from(samples, sample => Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)));
        const chunks = []; let length = 0;
        for (let offset = 0; offset < pcm.length; offset += 1152) { const chunk = encoder.encodeBuffer(pcm.subarray(offset, offset + 1152)); chunks.push(chunk); length += chunk.length; }
        const final = encoder.flush(); chunks.push(final); length += final.length;
        const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), offset); offset += chunk.length; }
        self.postMessage({ bytes: bytes.buffer }, [bytes.buffer]);
    } catch { self.postMessage({ error: true }); }
};
