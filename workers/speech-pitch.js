import { estimatePitch } from '../core/speech-pitch.js';
self.onmessage = event => {
    try { self.postMessage(estimatePitch(event.data.samples)); }
    catch { self.postMessage({ medianHz: null, voicedFrames: 0, frames: 0 }); }
};
