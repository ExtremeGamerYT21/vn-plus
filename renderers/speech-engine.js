import { speechSegments, chapterRequests, speechSettings, SAMPLE_RATE } from '../core/speech-segments.js';
import { collectFishStream } from '../core/fish-stream.js';
import { alignChapter, applyMargins, approveCut } from '../core/speech-alignment.js';
import { decodeChapter, joinPCM, wavBytes } from '../core/speech-pcm.js';
import { finishClip, noiseProfile } from '../core/speech-processing.js';

function waitForRetry(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Cancelled', 'AbortError')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
        signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    });
}

async function processChapter(chapter, settings, signal) {
    if (typeof Worker === 'undefined') {
        const profile = noiseProfile(chapter.original, chapter.words, chapter.noise);
        return chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, ...finishClip(chapter.original, clip, settings, profile) }));
    }
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../workers/speech-processing.js', import.meta.url), { type: 'module' });
        const finish = (value, error) => { signal?.removeEventListener('abort', abort); worker.terminate(); if (error) reject(error); else resolve(value); };
        const abort = () => finish(null, new DOMException('Cancelled', 'AbortError'));
        worker.onmessage = event => event.data.error ? finish(null, new Error(event.data.error)) : finish(event.data.results);
        worker.onerror = () => finish(null, new Error('Audio finishing failed. Original audio remains available.'));
        signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) { abort(); return; }
        worker.postMessage({ original: chapter.original, clips: chapter.clips, words: chapter.words, noise: chapter.noise, settings });
    });
}
export class SpeechEngine {
    constructor(host, settings, dependencies = {}) {
        this.host = host; this.settings = settings; this.decode = dependencies.decode || decodeChapter; this.process = dependencies.process || processChapter; this.wait = dependencies.wait || waitForRetry;
        this.audioFactory = dependencies.audioFactory || (() => new Audio()); this.cache = new Map(); this.listeners = new Set(); this.excluded = new Set(); this.playEpoch = 0;
        this.autoAttempts = new Set(); this.status = 'Prepare spoken dialogue, then generate voices when you choose.';
    }
    onChange(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
    notify(message) { if (message) this.status = message; this.resumePending(); for (const callback of this.listeners) callback(); }
    async endpoint(path, options = {}) {
        const request = this.host.request || ((url, init) => fetch(url, init));
        const response = await request(`/api/plugins/vn-plus-tts/${path}`, options);
        if (!response.ok) {
            let detail; try { detail = await response.json(); } catch { /* missing plugin */ }
            const error = new Error(detail?.error || (response.status === 404 ? 'Fish bridge is unavailable. Install the bundled server bridge and restart SillyTavern.' : `Speech bridge request failed (HTTP ${response.status}).`));
            error.status = response.status;
            const retry = response.headers?.get('retry-after');
            error.retryAfter = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
            throw error;
        }
        return response;
    }
    async bridgeStatus() {
        const status = await (await this.endpoint('status')).json();
        this.notify((status.configured ? 'Fish key is saved in SillyTavern’s secret store.' : 'Fish bridge is ready. Save your API key.')
            + (status.maxParallelBatches > 1 ? ` Up to ${status.maxParallelBatches} parallel batches supported.` : ' Restart SillyTavern to enable parallel voice batches.'));
        return status;
    }
    async saveKey(value) { await this.endpoint('secret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) }); this.notify('Fish key saved in SillyTavern’s secret store.'); }
    async removeKey() { await this.endpoint('secret', { method: 'DELETE' }); this.notify('Saved Fish key removed.'); }
    prepare(sourceId, timeline, registry) {
        const segments = speechSegments(timeline, registry, sourceId, this.settings.tts), signature = JSON.stringify([sourceId, segments]);
        if (signature !== this.prepared?.signature) { this.cancel(); this.excluded.clear(); this.job = null; }
        this.prepared = { sourceId, segments, signature };
        this.selectCachedJob(); this.notify(`${segments.length} segments have voice IDs. ${this.settings.tts.narratorEnabled ? 'Narrator voicing is enabled.' : 'Narrator is muted.'} Thoughts stay silent.`); return segments;
    }
    requestAutomatic() {
        if (!this.settings.tts.enabled || !this.settings.tts.autoGenerate || !this.prepared?.segments.length) return;
        try {
            const key = this.key(this.plan());
            if (this.autoAttempts.has(key)) return;
            this.autoAttempts.add(key);
            if (this.autoAttempts.size > 32) this.autoAttempts.delete(this.autoAttempts.values().next().value);
            // One attempt per finalized response/configuration. Failures require an explicit retry.
            void this.generate().catch(error => { this.notify(error.message); if (this.pending) { this.stop('failed'); this.onEnded?.(); } });
        } catch (error) { this.notify(error.message); }
    }
    lineStatus(beat, next = false) {
        if (!this.settings.tts.enabled) return null;
        const line = this.prepared?.segments.find(segment => (next ? segment.beat > beat : segment.beat === beat) && !this.excluded.has(segment.id));
        if (!line) return null;
        const found = this.clip(line.id);
        const state = found?.clip.review ? 'review' : found?.chapter.processingError ? 'failed'
            : found && (found.chapter.processed?.results.has(line.id) || !this.settings.tts.processing) ? 'ready'
            : this.job?.status === 'failed' || this.job?.status === 'cancelled' ? 'failed'
            : this.job?.status === 'generating' || found ? 'generating' : 'pending';
        return { state, line };
    }
    resumePending() {
        const pending = this.pending; if (!pending) return;
        const found = this.clip(pending.id);
        if (found && !found.clip.review && !found.chapter.processingError) {
            this.pending = null; void this.play(pending.id, true, pending.playback);
        } else if (found?.clip.review || found?.chapter.processingError || ['failed', 'cancelled', 'complete'].includes(this.job?.status)) {
            this.stop('failed'); this.onEnded?.();
        }
    }
    plan() {
        if (!this.prepared) throw new Error('Prepare the selected final dialogue first.');
        return chapterRequests(this.prepared.segments.filter(segment => !this.excluded.has(segment.id)), speechSettings(this.settings.tts));
    }
    key(plan) { return JSON.stringify([this.prepared.signature, this.settings.tts.model, plan.map(chapter => chapter.body)]); }
    selectCachedJob() { try { this.job = this.cache.get(this.key(this.plan())) || null; } catch { this.job = null; } }
    include(id, value) { if (value) this.excluded.delete(id); else this.excluded.add(id); this.cancel(); this.selectCachedJob(); this.notify(); }
    async generate() {
        if (!this.settings.tts.enabled) throw new Error('Enable Fish Audio voices first.');
        if (this.running) return this.running;
        const plan = this.plan(), key = this.key(plan), settings = speechSettings(this.settings.tts);
        let job = this.cache.get(key);
        if (!job) { job = { key, sourceId: this.prepared.sourceId, plan, chapters: [], status: 'ready' }; this.cache.set(key, job); this.trimCache(job); }
        this.job = job;
        if (job.chapters.length === plan.length) { job.run = null; job.status = 'complete'; this.notify('Using the completed voice recording; no new Fish request.'); return job; }
        const abort = new AbortController(); this.abort = abort; job.run = abort; job.status = 'generating';
        const publish = message => { if (this.job === job && job.run === abort) this.notify(message); };
        const run = async () => {
            try {
                const status = await (await this.endpoint('status', { signal: abort.signal })).json();
                if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
                if (!status.configured) throw new Error('Save your Fish API key first.');
                const capacity = Number.isInteger(status.maxParallelBatches) && status.maxParallelBatches > 0 ? Math.min(5, status.maxParallelBatches) : 1;
                const limit = Math.min(settings.parallelBatches, capacity);
                const legacy = settings.parallelBatches > 1 && capacity === 1 ? ' Restart SillyTavern to enable parallel voice batches.' : '';
                const remaining = plan.filter(chapter => !job.chapters.some(completed => completed.index === chapter.index));
                let next = 0, failure = null;
                const worker = async () => {
                    while (!failure && !abort.signal.aborted && next < remaining.length) {
                        const { index } = remaining[next++];
                        try {
                            publish(`${job.chapters.length}/${plan.length} chapters ready · generating chapter ${index + 1} · up to ${limit} parallel.${legacy}`);
                            let response;
                            for (let attempt = 0; ; attempt++) {
                                if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
                                try {
                                    response = await this.endpoint('synthesize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
                                        body: JSON.stringify({ model: settings.model, timeout: settings.timeout, body: plan[index].body }) });
                                    break;
                                } catch (error) {
                                    if (error.status !== 429 || attempt >= 2) throw error;
                                    const delay = Math.min(30000, Math.max(1000 * 2 ** attempt, Number(error.retryAfter) || 0));
                                    publish(`Fish rate limit: chapter ${index + 1} will retry in ${Math.ceil(delay / 1000)} seconds. Lower parallel batches if this persists.`);
                                    await this.wait(delay, abort.signal);
                                }
                            }
                            const stream = await collectFishStream(response.body, abort.signal), original = await this.decode(stream.data);
                            if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
                            if (!(original instanceof Float32Array) || !original.length) throw new Error('Unable to decode chapter audio.');
                            const samples = job.chapters.reduce((sum, chapter) => sum + chapter.original.length, 0);
                            if ((samples + original.length) / SAMPLE_RATE > 600) throw new Error('Recording exceeds the ten-minute local safeguard. Completed chapters remain available.');
                            const words = stream.words.map(word => ({ ...word, chunk: `${index}:${word.chunk}` }));
                            const chapter = { index, language: plan[index].language, original, words, offsetSamples: null, duration: original.length / SAMPLE_RATE, noise: null,
                                clips: alignChapter(plan[index].lines, words, original.length / SAMPLE_RATE, settings), processed: null };
                            job.chapters.push(chapter); job.chapters.sort((a, b) => a.index - b.index);
                            let offset = 0, contiguous = true;
                            job.chapters.forEach((value, position) => { contiguous &&= value.index === position; value.offsetSamples = contiguous ? offset : null; offset += value.original.length; });
                            this.trimCache(job);
                            try { await this.ensureProcessed(chapter, abort.signal); } catch (error) { if (error.name === 'AbortError') throw error; chapter.processingError = error.message; }
                            publish(`${job.chapters.length}/${plan.length} chapters ready · up to ${limit} parallel.${legacy}`);
                        } catch (error) { failure ||= error; }
                    }
                };
                await Promise.all(Array.from({ length: Math.min(limit, remaining.length) }, worker));
                if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
                if (failure) throw failure;
                if (job.run !== abort) return job;
                job.status = 'complete'; const reviews = job.chapters.flatMap(chapter => chapter.clips).filter(clip => clip.review).length;
                publish((reviews ? `Generation complete. ${reviews} dialogue cuts need timing review before playback.` : 'Voices ready. VN playback can use the prepared dialogue clips.') + legacy);
            } catch (error) {
                if (job.run === abort) {
                    job.status = error.name === 'AbortError' ? 'cancelled' : 'failed';
                    publish(`${error.name === 'AbortError' ? 'Generation cancelled.' : error.message} ${job.chapters.length} completed chapters preserved.`);
                }
            } finally { if (this.abort === abort) { this.abort = null; this.running = null; } publish(); }
            return job;
        };
        this.running = run(); return this.running;
    }
    trimCache(current) {
        let samples = [...this.cache.values()].reduce((sum, job) => sum + job.chapters.reduce((count, chapter) => count + chapter.original.length, 0), 0);
        for (const [key, job] of this.cache) {
            if (job === current) continue;
            if (this.cache.size <= 2 && samples <= SAMPLE_RATE * 600) break;
            samples -= job.chapters.reduce((sum, chapter) => sum + chapter.original.length, 0); this.cache.delete(key);
        }
    }
    processingKey(chapter) {
        const { parallelBatches, ...settings } = speechSettings(this.settings.tts);
        return JSON.stringify([settings, chapter.clips.map(clip => [clip.id, clip.start, clip.end, clip.review]), chapter.noise]);
    }
    async ensureProcessed(chapter, signal) {
        const key = this.processingKey(chapter); if (chapter.processed?.key === key) return chapter.processed;
        if (chapter.processing?.key === key) return chapter.processing.promise;
        const settings = speechSettings(this.settings.tts);
        const promise = this.process(chapter, settings, signal).then(results => {
            if (key !== this.processingKey(chapter)) throw new Error('Finishing settings changed. Play again to use the new settings.');
            chapter.processed = { key, results: new Map(results.map(result => [result.id, result])) }; chapter.processingError = null; return chapter.processed;
        }).finally(() => { if (chapter.processing?.key === key) chapter.processing = null; });
        chapter.processing = { key, promise }; return promise;
    }
    configurationChanged() {
        this.cancel();
        for (const job of this.cache.values()) for (const chapter of job.chapters) {
            chapter.clips = applyMargins(chapter.clips, chapter.words, chapter.duration, this.settings.tts); chapter.processed = null;
        }
        this.selectCachedJob(); this.notify('Speech settings saved. Original recordings are preserved.');
    }
    reviewCut(chapterIndex, id, start, end) {
        const chapter = this.job?.chapters.find(value => value.index === chapterIndex); if (!chapter) throw new Error('Chapter is unavailable.');
        const clip = approveCut(chapter.clips, id, start, end, chapter.duration);
        chapter.clips = chapter.clips.map(value => value.id === id ? clip : value); chapter.processed = null; this.stop(); this.notify('Manual cut approved.');
    }
    setNoise(chapterIndex, start, end) {
        const chapter = this.job?.chapters.find(value => value.index === chapterIndex); if (!chapter || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > chapter.duration || end - start < .06) throw new Error('Choose a noise-only interval of at least 60 ms inside the chapter.');
        chapter.noise = { start, end }; chapter.processed = null; this.notify('Noise-only interval saved; processed audio will be rebuilt.');
    }
    clip(id) {
        for (const chapter of this.job?.chapters || []) { const clip = chapter.clips.find(value => value.id === id); if (clip) return { chapter, clip }; }
        return null;
    }
    async clipSamples(id, processed = true) {
        const found = this.clip(id); if (!found || found.clip.review) throw new Error('Review this segment’s timing before playing or exporting a voice clip.');
        if (processed) { const result = (await this.ensureProcessed(found.chapter)).results.get(id); if (!result) throw new Error('Processed clip is unavailable.'); return result.samples; }
        return found.chapter.original.slice(Math.round(found.clip.start * SAMPLE_RATE), Math.round(found.clip.end * SAMPLE_RATE));
    }
    async play(id, processed = true, existing = null) {
        this.stop(); const epoch = this.playEpoch; this.starting = true;
        const found = this.clip(id), playback = existing || {};
        Object.assign(playback, { status: 'loading', audio: null, clip: found?.clip, words: found?.chapter.words || [] });
        this.playback = playback;
        try {
            const samples = await this.clipSamples(id, processed); if (epoch !== this.playEpoch) return;
            await this.beginAudio(samples, playback);
        } catch (error) { if (epoch === this.playEpoch) { this.stop('failed'); this.notify(error.message); this.onEnded?.(); } }
        finally { if (epoch === this.playEpoch) this.starting = false; }
    }
    async beginAudio(samples, playback = null) {
        if (playback) playback.duration = samples.length / SAMPLE_RATE;
        this.url = URL.createObjectURL(new Blob([wavBytes(samples)], { type: 'audio/wav' }));
        this.audio = this.audioFactory(); this.audio.src = this.url; this.audio.volume = Math.max(0, Math.min(1, this.settings.tts.volume));
        const audio = this.audio;
        if (playback) playback.audio = audio;
        this.audio.onended = () => { if (this.audio !== audio) return; this.stop('ended'); this.onEnded?.(); };
        this.audio.onerror = () => { if (this.audio !== audio) return; this.stop('failed'); this.notify('Voice playback failed.'); this.onEnded?.(); };
        await this.audio.play();
        if (playback && this.audio === audio) playback.status = 'playing';
    }
    async playChapter(index) {
        this.stop(); const chapter = this.job?.chapters.find(value => value.index === index); if (!chapter) throw new Error('Chapter is unavailable.');
        const epoch = this.playEpoch; this.starting = true;
        try { await this.beginAudio(chapter.original); } catch (error) { if (epoch === this.playEpoch) { this.stop(); this.notify(error.message); } }
        finally { if (epoch === this.playEpoch) this.starting = false; }
    }
    playBeat(beat) {
        if (this.settings.tts.enabled && this.settings.tts.autoPlay) {
            const line = this.prepared?.segments.find(segment => segment.beat === beat && !this.excluded.has(segment.id));
            if (line && this.clip(line.id) && !this.clip(line.id).clip.review) { void this.play(line.id); return this.playback; }
            if (line && this.settings.tts.autoGenerate) {
                this.stop();
                const playback = { status: 'loading', audio: null, clip: null, words: [] };
                this.playback = playback; this.pending = { id: line.id, playback };
                this.requestAutomatic(); this.resumePending();
                // A previous failed attempt is not retried by navigation.
                if (this.pending && !this.running) this.stop('failed');
                return playback;
            }
        }
        this.stop(); return null;
    }
    get speaking() { return !!this.starting || !!this.audio && !this.audio.paused; }
    stop(reason = 'cancelled') { this.playEpoch++; this.pending = null; this.starting = false; if (this.playback) this.playback.status = reason; this.playback = null; if (this.audio) { this.audio.onended = null; this.audio.onerror = null; } this.audio?.pause(); this.audio?.removeAttribute?.('src'); this.audio?.load?.(); this.audio = null; if (this.url) URL.revokeObjectURL(this.url); this.url = null; }
    cancel() { this.abort?.abort(); this.abort = null; this.running = null; this.stop(); }
    clearScene() { this.cancel(); this.prepared = null; this.job = null; this.excluded.clear(); this.notify('Prepare the selected final dialogue to use its character voices.'); }
    async sourceSamples(processed = false) {
        if (!this.job?.chapters.length) throw new Error('Generate at least one chapter first.');
        if (this.job.chapters.some((chapter, index) => chapter.index !== index)) throw new Error('An earlier chapter is still missing. Generate remaining chapters before exporting the scene.');
        if (!processed) return joinPCM(this.job.chapters);
        const chapters = [];
        for (const chapter of this.job.chapters) {
            const samples = chapter.original.slice(), result = await this.ensureProcessed(chapter);
            for (const clip of chapter.clips) if (!clip.review) samples.set(result.results.get(clip.id).samples, Math.round(clip.start * SAMPLE_RATE));
            chapters.push({ original: samples });
        }
        return joinPCM(chapters);
    }
    dispose() { this.cancel(); this.listeners.clear(); this.cache.clear(); }
}
