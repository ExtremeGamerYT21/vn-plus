import { estimatePitch } from '../core/speech-pitch.js';

export function measurePitch(samples, signal) {
    if (typeof Worker === 'undefined') return Promise.resolve(estimatePitch(samples));
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../workers/speech-pitch.js', import.meta.url), { type: 'module' });
        const finish = (result, error) => { signal?.removeEventListener('abort', abort); worker.terminate(); error ? reject(error) : resolve(result); };
        const abort = () => finish(null, new DOMException('Cancelled', 'AbortError'));
        worker.onmessage = event => finish(event.data); worker.onerror = () => finish({ medianHz: null, voicedFrames: 0, frames: 0 });
        signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) { abort(); return; }
        const copy = samples.slice(); worker.postMessage({ samples: copy }, [copy.buffer]);
    });
}
