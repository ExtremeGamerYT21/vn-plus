import { wavBytes } from '../core/speech-pcm.js';
import { speechLanguageName } from '../core/speech-language.js';

const element = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
function download(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type })), anchor = element('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export class SpeechPanel {
    constructor(engine, callbacks, { expanded = false } = {}) {
        this.engine = engine; this.callbacks = callbacks; this.node = element('details', '', 'vn-speech-settings'); this.node.open = expanded;
        this.node.append(element('summary', 'Fish Audio voices'));
        this.node.append(element('p', 'Reads voiceId from character properties. No voiceId means mute. Automatic generation prepares completed POV lines ahead; ✓ beside the text means the next voice line is ready. Narrator properties come from characters/narrator/properties.json in this environment. Internal thoughts stay silent.', 'vn-hint'));
        this.node.append(element('p', 'Automatic voices keep preparing while VN mode is closed or the SillyTavern tab is minimized/in the background. The current voice line may finish; a newly completed response plays one prepared line when automatic opening is enabled. Hidden tabs never advance to the next beat, open VN, or play music/ambience. General → Open completed responses automatically can show the prepared response when you return. Keep the tab loaded; a closed or suspended tab cannot prepare voices.', 'vn-hint'));
        const keyRow = element('label', '', 'vn-setting'); keyRow.append(element('span', 'Fish API key'));
        this.keyInput = element('input'); this.keyInput.type = 'password'; this.keyInput.autocomplete = 'new-password'; this.keyInput.placeholder = 'Saved in SillyTavern’s secret store'; keyRow.append(this.keyInput); this.node.append(keyRow);
        const credentialActions = element('div', '', 'vn-settings-actions');
        credentialActions.append(this.button('Save API key', async () => { const value = this.keyInput.value; this.keyInput.value = ''; await engine.saveKey(value); }),
            this.button('Remove API key', () => engine.removeKey()), this.button('Check bridge', () => engine.bridgeStatus())); this.node.append(credentialActions);
        const options = element('details'); options.append(element('summary', 'Voice generation and playback'));
        this.fields = new Map();
        for (const definition of [
            ['enabled', 'Enable Fish Audio voices', 'checkbox'], ['autoPlay', 'Play prepared clips during VN dialogue', 'checkbox'],
            ['autoGenerate', 'Automatically generate voices for completed POV responses', 'checkbox'],
            ['narratorEnabled', 'Voice the narrator (off = muted)', 'checkbox'],
            ['syncText', 'Reveal dialogue with voice timing', 'checkbox'],
            ['model', 'Fish model', [{ value: 's2.1-pro-free', label: 'S2.1 Pro Free' }, { value: 's2.1-pro', label: 'S2.1 Pro (paid)' }]],
            ['splitChapters', 'Split into short chapters', 'checkbox'], ['chapterSize', 'Spoken segments per chapter', 'number', 1, 200],
            ['parallelBatches', 'Parallel voice batches (1 = sequential)', 'number', 1, 5],
            ['temperature', 'Temperature', 'number', 0, 1], ['topP', 'Top P', 'number', 0, 1], ['speed', 'Voice speed', 'number', .5, 2],
            ['chunkLength', 'Fish chunk length', 'number', 100, 300], ['latency', 'Latency', ['normal', 'balanced', 'low']], ['bitrate', 'MP3 bitrate (kbps)', [64, 128, 192]],
            ['normalize', 'Normalize text', 'checkbox'], ['conditionPrevious', 'Voice consistency within each chapter', 'checkbox'],
            ['timeout', 'Request timeout (seconds)', 'number', 30, 600], ['volume', 'Voice playback volume', 'number', 0, 1],
        ]) this.field(options, definition);
        options.append(element('p', 'Up to 5 chapters can generate together; default 3 leaves room for other Fish API use. Takes effect on the next generation when the response has multiple chapters. Restart SillyTavern after a bridge update; older bridges use one batch at a time. Rate-limit rejections back off before retrying, with no paid-model fallback.', 'vn-hint'));
        options.append(element('p', 'Whole non-English lines generate separately from English. Consecutive lines in the same detected language share a batch, within the chapter-size limit, even with chapter splitting off. Short ambiguous replies use nearby speech or the character’s ttsLanguage property. Mixed English lines keep their pronunciation rules.', 'vn-hint'));
        this.node.append(options);
        const finishing = element('details'); finishing.append(element('summary', 'Clip margins and audio finishing'));
        for (const definition of [
            ['lead', 'Retain before speech (seconds)', 'number', 0, 2], ['tail', 'Retain after speech (seconds)', 'number', 0, 2],
            ['processing', 'Enable processed comparison', 'checkbox'], ['matchVolume', 'Match character speech volume', 'checkbox'],
            ['targetRms', 'Target speech RMS (dBFS)', 'number', -30, -12], ['denoise', 'Noise reduction (dB)', 'number', 0, 12],
            ['soften', 'Soften highs near 5 kHz (dB)', 'number', 0, 8], ['ceiling', 'Peak ceiling (dBFS)', 'number', -12, 0], ['edgeFade', 'Edge fade (ms)', 'number', 0, 30],
        ]) this.field(finishing, definition);
        finishing.append(element('p', 'Finishing always starts from original audio. Denoising is skipped if no trustworthy noise-only interval exists. Margins retain existing audio without inserting silence.', 'vn-hint')); this.node.append(finishing);
        const actions = element('div', '', 'vn-settings-actions');
        this.generateButton = this.button('Generate selected dialogue', async () => { await callbacks.prepare(); await engine.generate(); });
        actions.append(this.button('Prepare selected dialogue', () => callbacks.prepare()), this.generateButton,
            this.button('Cancel generation', () => engine.cancel()), this.button('Stop voice', () => engine.stop())); this.node.append(actions);
        this.status = element('p', '', 'vn-speech-status'); this.status.role = 'status'; this.node.append(this.status);
        this.segments = element('div', '', 'vn-speech-segments'); this.recordings = element('div', '', 'vn-speech-recordings'); this.node.append(this.segments, this.recordings);
        this.unsubscribe = engine.onChange(() => this.refresh()); this.refresh();
    }
    button(label, callback) {
        const button = element('button', label); button.type = 'button'; button.addEventListener('click', async () => {
            button.disabled = true;
            try { await callback(); } catch (error) { this.engine.notify(error.message); }
            finally { button.disabled = false; }
        }); return button;
    }
    field(container, [key, label, type, min, max]) {
        const row = element('label', '', 'vn-setting'); row.append(element('span', label));
        const input = element(Array.isArray(type) ? 'select' : 'input'); input.dataset.speechSetting = key;
        if (Array.isArray(type)) for (const value of type) {
            const option = element('option', typeof value === 'object' ? value.label : String(value)); option.value = typeof value === 'object' ? value.value : value; input.append(option);
        } else { input.type = type; if (type === 'number') { input.min = min; input.max = max; input.step = max <= 2 ? '.05' : '1'; } }
        if (type === 'checkbox') input.checked = this.engine.settings.tts[key]; else input.value = this.engine.settings.tts[key];
        input.addEventListener('change', () => {
            let value = type === 'checkbox' ? input.checked : type === 'number' || key === 'bitrate' ? Number(input.value) : input.value;
            if (type === 'number') { if (!Number.isFinite(value)) return; value = Math.max(min, Math.min(max, key === 'parallelBatches' ? Math.floor(value) : value)); input.value = value; }
            this.engine.settings.tts[key] = value; this.callbacks.change(key);
        }); row.append(input); container.append(row); this.fields.set(key, { input, type });
    }
    refresh() {
        const engine = this.engine; this.status.textContent = engine.status;
        this.generateButton.disabled = !!engine.running;
        this.generateButton.textContent = engine.job?.chapters.length && engine.job.chapters.length < engine.job.plan.length ? 'Generate remaining chapters' : 'Generate selected dialogue';
        for (const [key, { input, type }] of this.fields) { if (type === 'checkbox') input.checked = !!engine.settings.tts[key]; else input.value = engine.settings.tts[key]; }
        const signature = JSON.stringify([engine.prepared?.signature, [...engine.excluded]]);
        if (signature !== this.segmentSignature) {
            this.segmentSignature = signature; this.segments.replaceChildren();
            for (const segment of engine.prepared?.segments || []) {
                const label = element('label', '', 'vn-speech-segment'), input = element('input'); input.type = 'checkbox'; input.checked = !engine.excluded.has(segment.id);
                input.addEventListener('change', () => engine.include(segment.id, input.checked)); label.append(input, element('span', `${segment.name}: ${segment.text}`));
                const voice = element('small', `Voice: ${segment.voice} · ${speechLanguageName(segment.language || 'en')}`, 'vn-hint'); label.append(voice); this.segments.append(label);
            }
        }
        this.recordings.replaceChildren(); if (!engine.job?.chapters.length) return;
        const sourceActions = element('div', '', 'vn-settings-actions');
        for (const processed of [false, true]) {
            const button = this.button(`Download ${processed ? 'processed' : 'original'} scene WAV`, async () => {
                download(wavBytes(await engine.sourceSamples(processed)), `vn-plus-${processed ? 'processed' : 'original'}.wav`, 'audio/wav');
            });
            const issue = engine.sceneExportIssue();
            button.disabled = !!issue || engine.job.chapters.some((chapter, index) => chapter.index !== index);
            if (button.disabled) button.title = issue || 'An earlier chapter is still missing. Individual completed clips remain available.';
            sourceActions.append(button);
        } this.recordings.append(sourceActions);
        for (const chapter of engine.job.chapters) {
            const section = element('details'); section.open = true; section.append(element('summary', `Chapter ${chapter.index + 1} · ${speechLanguageName(chapter.language || chapter.clips[0]?.line?.language || 'en')} · ${chapter.kind === 'narration' ? 'Narration' : 'Dialogue'} · ${chapter.duration.toFixed(2)} seconds`));
            section.append(this.button('Play original chapter for timing review', () => engine.playChapter(chapter.index)));
            if (chapter.processingError) section.append(element('p', chapter.processingError, 'vn-hint'));
            const notes = [...new Set([...(chapter.processed?.results.values() || [])].flatMap(result => result.notes))];
            for (const note of notes) section.append(element('p', note, 'vn-hint'));
            const noise = element('details'); noise.append(element('summary', 'Optional noise-only interval'));
            const noiseStart = this.timeInput(noise, 'Noise start', chapter.noise?.start), noiseEnd = this.timeInput(noise, 'Noise end', chapter.noise?.end);
            noise.append(this.button('Use noise interval', () => { if (!noiseStart.value.trim() || !noiseEnd.value.trim()) throw new Error('Enter both noise interval boundaries.'); engine.setNoise(chapter.index, Number(noiseStart.value), Number(noiseEnd.value)); })); section.append(noise);
            for (const clip of chapter.clips) {
                const row = element('div', '', 'vn-speech-clip'); row.append(element('p', `${clip.line.name}: ${clip.line.text}`));
                row.append(element('p', clip.review ? `Review required: ${clip.reasons.join('; ')}` : clip.approved ? 'Manual cut approved' : `Ready · ${(clip.coverage * 100).toFixed(0)}% text coverage`, clip.review ? 'vn-speech-review' : 'vn-hint'));
                const start = this.timeInput(row, 'Clip start', clip.start), end = this.timeInput(row, 'Clip end', clip.end);
                row.append(this.button('Approve cut', () => { if (!start.value.trim() || !end.value.trim()) throw new Error('Enter both clip boundaries before approving.'); engine.reviewCut(chapter.index, clip.id, Number(start.value), Number(end.value)); }));
                for (const processed of [false, true]) {
                    const play = this.button(`Play ${processed ? 'processed' : 'original'}`, () => engine.play(clip.id, processed)); play.disabled = clip.review; row.append(play);
                    const save = this.button(`Export ${processed ? 'processed' : 'original'} MP3`, async () => {
                        const { encodeMP3 } = await import('../core/speech-mp3.js');
                        download(await encodeMP3(await engine.clipSamples(clip.id, processed), engine.settings.tts.bitrate), `vn-plus-chapter-${chapter.index + 1}-${clip.beat}-${processed ? 'processed' : 'original'}.mp3`, 'audio/mpeg');
                    }); save.disabled = clip.review; row.append(save);
                }
                section.append(row);
            }
            this.recordings.append(section);
        }
    }
    timeInput(container, caption, value) {
        const row = element('label', '', 'vn-setting'); row.append(element('span', `${caption} (chapter seconds)`));
        const input = element('input'); input.type = 'number'; input.min = '0'; input.step = '.01'; input.value = value === null || value === undefined ? '' : Number(value).toFixed(3); row.append(input); container.append(row); return input;
    }
    dispose() { this.unsubscribe(); this.keyInput.value = ''; this.node.remove(); }
}
