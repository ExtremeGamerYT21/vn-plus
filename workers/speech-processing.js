import { finishClip, noiseProfile } from '../core/speech-processing.js';
self.onmessage = event => {
    const { original, clips, words, settings, noise } = event.data;
    try {
        const profile = settings.denoise > 0 ? noiseProfile(original, words, noise) : null;
        const results = clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, ...finishClip(original, clip, settings, profile) }));
        self.postMessage({ results }, results.map(result => result.samples.buffer));
    } catch { self.postMessage({ error: 'Audio finishing failed. Original audio remains available.' }); }
};
