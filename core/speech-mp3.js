export function encodeMP3(samples, bitrate = 128) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../workers/speech-mp3.js', import.meta.url));
        worker.onmessage = event => { worker.terminate(); event.data.error ? reject(new Error('MP3 encoding failed.')) : resolve(new Uint8Array(event.data.bytes)); };
        worker.onerror = () => { worker.terminate(); reject(new Error('MP3 encoding failed.')); };
        worker.postMessage({ samples, bitrate });
    });
}
