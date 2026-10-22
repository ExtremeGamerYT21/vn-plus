import { fishVoiceId, speechSettings, chapterRequests, SAMPLE_RATE } from '../core/speech-segments.js';
import { compileSpeechText } from '../core/speech-text.js';
import { collectFishStream } from '../core/fish-stream.js';
import { decodeChapter } from '../core/speech-pcm.js';
import { youngifySettings } from '../core/speech-youngify.js';
import { youngifyClip } from '../renderers/praat-voice.js';
import { measurePitch } from './pitch-client.js';

function validSamples(samples) {
    if (!(samples instanceof Float32Array) || !samples.length) throw new Error('The recording contains no decodable audio.');
    if (samples.length > SAMPLE_RATE * 120) throw new Error('Use a sample under two minutes.');
    for (const value of samples) if (!Number.isFinite(value)) throw new Error('The recording contains invalid samples.');
    return samples;
}
export class VoicePlayground {
    constructor(request, dependencies = {}) {
        this.request = request; this.decode = dependencies.decode || decodeChapter; this.measure = dependencies.measure || measurePitch;
        this.transform = dependencies.transform || ((samples, settings, signal) => youngifyClip(request, samples, settings, signal));
        this.listeners = new Set(); this.variants = new Map(); this.epoch = 0; this.phase = 'idle'; this.message = 'Start with a voice ID and a short sample.';
    }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    notify(message) { if (message) this.message = message; for (const fn of this.listeners) fn(); }
    cancel() { this.epoch++; this.abort?.abort(); this.abort = null; this.phase = 'idle'; this.notify('Cancelled. Your last recording is still available.'); }
    current(epoch, signal) { if (epoch !== this.epoch || signal.aborted) throw new DOMException('Cancelled', 'AbortError'); }
    async connection() {
        const results = await Promise.allSettled(['status', 'praat/status'].map(async path => (await this.request(path)).json()));
        return { fish: results[0].status === 'fulfilled' ? results[0].value : { error: results[0].reason.message },
            praat: results[1].status === 'fulfilled' ? results[1].value : { error: results[1].reason.message } };
    }
    async load(bytes, name = 'Local recording') {
        if (bytes.byteLength > 40 * 1024 * 1024) throw new Error('Choose an audio file smaller than 40 MB.');
        return this.record(async () => this.decode(bytes), { label: name, voice: '', text: '', local: true });
    }
    async generate({ voice, text, model = 's2.1-pro-free' }) {
        const id = fishVoiceId(voice), clean = String(text || '').trim();
        if (!id) throw new Error('Enter a Fish voice ID or its fish.audio page URL.');
        if (!clean || clean.length > 2000) throw new Error('Enter 1–2,000 characters of sample text.');
        const settings = speechSettings({ model });
        const [chapter] = chapterRequests([{ id: 'sample', beat: 0, character: 'sample', voice: id, text: clean, ...compileSpeechText(clean) }], settings);
        return this.record(async signal => {
            const response = await this.request('synthesize', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, timeout: 120, body: chapter.body }) });
            const stream = await collectFishStream(response.body, signal); return this.decode(stream.data);
        }, { label: id, voice: id, text: clean, model });
    }
    async record(getSamples, info) {
        this.cancel(); const epoch = this.epoch, abort = new AbortController(); this.abort = abort; this.phase = 'generating';
        this.notify(info.local ? 'Decoding your local recording…' : 'Generating the original recording with Fish…');
        try {
            const samples = validSamples(await getSamples(abort.signal)); this.current(epoch, abort.signal);
            const pitch = await this.measure(samples, abort.signal); this.current(epoch, abort.signal);
            this.source = { ...info, samples, pitch, revision: epoch }; this.result = null; this.variants.clear();
            this.phase = 'idle'; this.notify('Original recording ready. Apply Praat to compare.'); return this.source;
        } catch (error) { if (epoch === this.epoch) { this.phase = error.name === 'AbortError' ? 'idle' : 'error'; this.notify(error.message); } throw error; }
        finally { if (this.abort === abort) this.abort = null; }
    }
    async apply(value) {
        if (!this.source) throw new Error('Generate or load an original recording first.');
        if (this.phase === 'generating') throw new Error('Wait for the original recording to finish.');
        const settings = youngifySettings(value); if (!settings) throw new Error('Choose enabled Praat settings.');
        const key = JSON.stringify(settings), source = this.source;
        this.cancel(); const epoch = this.epoch, abort = new AbortController(); this.abort = abort; this.phase = 'processing'; this.notify('Applying Praat to the same original recording…');
        try {
            let result = this.variants.get(key);
            if (!result) {
                const output = await this.transform(source.samples, settings, abort.signal); this.current(epoch, abort.signal);
                const samples = validSamples(output.samples);
                if (samples.length !== source.samples.length) throw new Error('Praat changed the recording length. The original remains available.');
                let peak = 0; for (const value of samples) peak = Math.max(peak, Math.abs(value));
                const ceiling = 10 ** (-1.5 / 20), gain = peak > ceiling ? ceiling / peak : 1;
                const protectedSamples = samples.map(value => value * gain);
                const pitch = await this.measure(protectedSamples, abort.signal); this.current(epoch, abort.signal);
                const changed = samples.some((value, index) => value !== source.samples[index]);
                result = { key, settings, samples: protectedSamples, pitch, notes: output.notes || [], changed, source };
                this.variants.set(key, result);
                while (this.variants.size > 4 || [...this.variants.values()].reduce((sum, entry) => sum + entry.samples.length, 0) > SAMPLE_RATE * 180 && this.variants.size > 1) this.variants.delete(this.variants.keys().next().value);
            }
            this.current(epoch, abort.signal); this.result = result; this.phase = 'idle';
            this.notify(result.changed ? 'Praat applied. Compare Original and Processed below.' : 'Praat returned unchanged audio. Check the processing note below.'); return result;
        } catch (error) { if (epoch === this.epoch) { this.phase = error.name === 'AbortError' ? 'idle' : 'error'; this.notify(error.message); } throw error; }
        finally { if (this.abort === abort) this.abort = null; }
    }
    dispose() { this.cancel(); this.listeners.clear(); this.variants.clear(); this.source = null; this.result = null; }
}
