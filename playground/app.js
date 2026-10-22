import { VoicePlayground } from './model.js';
import { localBridge } from './bridge.js';
import { fishVoiceId } from '../core/speech-segments.js';
import { youngifySettings } from '../core/speech-youngify.js';
import { wavBytes } from '../core/speech-pcm.js';

const $ = id => document.getElementById(id), model = new VoicePlayground(localBridge());
const presets = { natural: { pitchSemitones: 0, formantRatio: 1, pitchRange: 1 }, gentle: { pitchSemitones: 3, formantRatio: 1.1, pitchRange: 1 },
    younger: { pitchSemitones: 4, formantRatio: 1.15, pitchRange: 1 }, strong: { pitchSemitones: 7, formantRatio: 1.24, pitchRange: 1.05 } };
const fields = { pitchSemitones: $('pitch'), formantRatio: $('formants'), pitchRange: $('pitch-range') }, storageKey = 'vnplus.voice-workbench.v1';
let sourceRef = null, resultRef = null, originalURL = null, processedURL = null, selected = 'original', applyTimer, switchEpoch = 0;
const settings = () => youngifySettings(Object.fromEntries(Object.entries(fields).map(([key, node]) => [key, Number(node.value)])));
const currentResult = () => model.result?.source === model.source && model.result?.key === JSON.stringify(settings()) ? model.result : null;
const busy = () => ['generating', 'processing'].includes(model.phase);

function savePreferences() {
    let voice = ''; try { voice = fishVoiceId($('voice-id').value) || ''; } catch { /* never retain arbitrary pasted values */ }
    try { localStorage.setItem(storageKey, JSON.stringify({ voice, text: $('sample-text').value, model: $('fish-model').value, settings: settings(), volume: Number($('volume').value), autoApply: $('auto-apply').checked })); } catch { /* private browsing */ }
}
try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') {
        if (typeof saved.voice === 'string') $('voice-id').value = fishVoiceId(saved.voice) || '';
        if (typeof saved.text === 'string' && saved.text.trim()) $('sample-text').value = saved.text.slice(0, 2000);
        if (['s2.1-pro-free', 's2.1-pro'].includes(saved.model)) $('fish-model').value = saved.model;
        const values = youngifySettings(saved.settings); if (values) for (const [key, value] of Object.entries(values)) fields[key].value = value;
        if (Number.isFinite(saved.volume)) $('volume').value = Math.max(0, Math.min(1, saved.volume));
        if (typeof saved.autoApply === 'boolean') $('auto-apply').checked = saved.autoApply;
    }
} catch { /* defaults are usable even with old or invalid preferences */ }

function drawWave(canvas, samples, color) {
    const ratio = Math.min(2, window.devicePixelRatio || 1), width = Math.max(1, canvas.clientWidth), height = canvas.clientHeight || 80;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d'); context.scale(ratio, ratio); context.clearRect(0, 0, width, height);
    context.strokeStyle = '#d9ded3'; context.lineWidth = 1; context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
    if (!samples) return;
    let peak = .01; for (const value of samples) peak = Math.max(peak, Math.abs(value));
    context.strokeStyle = color; context.beginPath();
    for (let x = 0; x < width; x += 2) {
        const start = Math.floor(x * samples.length / width), end = Math.min(samples.length, Math.ceil((x + 2) * samples.length / width)); let low = 0, high = 0;
        for (let index = start; index < end; index++) { low = Math.min(low, samples[index]); high = Math.max(high, samples[index]); }
        context.moveTo(x, height / 2 - high / peak * height * .43); context.lineTo(x, height / 2 - low / peak * height * .43);
    }
    context.stroke();
}
function selectAudio(kind, continuePlayback = true) {
    const player = $('player'), url = kind === 'processed' && currentResult() ? processedURL : kind === 'original' ? originalURL : null;
    if (!url) return;
    const time = player.currentTime || 0, play = continuePlayback && !player.paused, epoch = ++switchEpoch; player.pause(); selected = kind;
    $('listen-original').setAttribute('aria-pressed', String(kind === 'original')); $('listen-processed').setAttribute('aria-pressed', String(kind === 'processed'));
    $('playing-label').textContent = kind === 'processed' ? 'Processed' : 'Original';
    player.onloadedmetadata = () => {
        if (epoch !== switchEpoch) return;
        player.currentTime = Math.min(time, Math.max(0, player.duration - .01));
        if (play) void player.play().catch(() => model.notify('Press Play to start audio in this browser.'));
    };
    player.src = url; player.load();
}
function updateControls() {
    const values = settings();
    $('pitch-value').textContent = `+${values.pitchSemitones.toFixed(1)} st`; $('formants-value').textContent = `${values.formantRatio.toFixed(2)}×`; $('pitch-range-value').textContent = `${values.pitchRange.toFixed(2)}×`;
    for (const button of document.querySelectorAll('[data-preset]')) button.setAttribute('aria-pressed', String(JSON.stringify(presets[button.dataset.preset]) === JSON.stringify(values)));
    let voice = ''; try { voice = fishVoiceId($('voice-id').value) || ''; } catch { /* generate reports validation */ }
    $('properties').value = JSON.stringify({ ...(voice ? { voiceId: voice } : {}), ttsYoungify: values }, null, 2);
    $('text-count').textContent = `${$('sample-text').value.length.toLocaleString()} / 2,000`;
}
function render() {
    updateControls(); const source = model.source, result = currentResult();
    if (sourceRef !== source) {
        $('player').pause(); ++switchEpoch; if (originalURL) URL.revokeObjectURL(originalURL); if (processedURL) URL.revokeObjectURL(processedURL);
        sourceRef = source; resultRef = null; processedURL = null;
        originalURL = source ? URL.createObjectURL(new Blob([wavBytes(source.samples)], { type: 'audio/wav' })) : null;
        if (originalURL) selectAudio('original', false);
    }
    if (model.result && resultRef !== model.result) {
        if (processedURL) URL.revokeObjectURL(processedURL); resultRef = model.result;
        processedURL = URL.createObjectURL(new Blob([wavBytes(model.result.samples)], { type: 'audio/wav' }));
    }
    if (!result && selected === 'processed') selectAudio('original', false);
    $('generate').disabled = busy(); $('apply').disabled = !source || busy(); $('cancel').disabled = !busy();
    $('listen-original').disabled = !source; $('listen-processed').disabled = !result;
    $('download-original').disabled = !source; $('download-processed').disabled = !result;
    $('status').textContent = model.message; $('status').dataset.phase = model.phase;
    const pitch = estimate => estimate?.medianHz ? `${Math.round(estimate.medianHz)} Hz` : 'No voiced pitch';
    $('original-pitch').textContent = source ? pitch(source.pitch) : '— Hz'; $('processed-pitch').textContent = result ? pitch(result.pitch) : '— Hz';
    $('original-duration').textContent = source ? `${(source.samples.length / 44100).toFixed(2)} seconds · estimated median pitch` : 'No recording yet';
    $('processed-duration').textContent = result ? `${(result.samples.length / 44100).toFixed(2)} seconds · ${result.changed ? 'Praat applied' : 'Unchanged audio'}` : source ? 'Adjust settings, then apply Praat' : 'Waiting for an original';
    $('processing-note').hidden = !result?.notes.length; $('processing-note').textContent = result?.notes.join(' ') || '';
    $('source-note').textContent = source ? `Recording: ${source.label}${source.local ? ' · loaded locally' : ` · ${source.model}`}. Pitch values are estimated medians. A/B switching keeps the playhead position.` : 'Pitch values are estimated medians from voiced audio. Duration stays unchanged.';
    drawWave($('original-wave'), source?.samples, '#527266'); drawWave($('processed-wave'), result?.samples, '#bd623c');
}
async function run(callback) {
    try { await callback(); } catch (error) { if (error.name !== 'AbortError') { model.phase = 'error'; model.notify(error.message); } }
}
async function apply() { clearTimeout(applyTimer); await model.apply(settings()); selectAudio('processed', false); }
function controlsChanged() {
    $('player').pause(); updateControls(); render(); savePreferences(); clearTimeout(applyTimer);
    if (model.source && model.phase !== 'generating' && $('auto-apply').checked) applyTimer = setTimeout(() => void run(apply), 450);
}
async function checkConnection() {
    $('check-connection').disabled = true;
    try {
        const { fish, praat } = await model.connection();
        $('fish-status').textContent = fish.configured ? 'Fish key saved' : fish.error ? 'Fish unavailable' : 'Fish key missing';
        $('fish-status').dataset.ready = String(!!fish.configured); $('fish-status').title = fish.error || (fish.configured ? 'Using SillyTavern’s saved Fish key.' : 'Save a Fish key in VN+ voice settings.');
        $('praat-status').textContent = praat.available ? 'Praat ready' : 'Praat unavailable'; $('praat-status').dataset.ready = String(!!praat.available); $('praat-status').title = praat.error || `Parselmouth ${praat.version}`;
    } finally { $('check-connection').disabled = false; }
}
function download(samples, name) {
    const url = URL.createObjectURL(new Blob([wavBytes(samples)], { type: 'audio/wav' })), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('source-form').addEventListener('submit', event => {
    event.preventDefault(); clearTimeout(applyTimer); $('player').pause(); savePreferences();
    void run(async () => { await model.generate({ voice: $('voice-id').value, text: $('sample-text').value, model: $('fish-model').value }); if ($('auto-apply').checked) await apply(); });
});
$('audio-file').addEventListener('change', () => {
    const file = $('audio-file').files[0]; if (!file) return; clearTimeout(applyTimer); $('player').pause();
    void run(async () => { await model.load(new Uint8Array(await file.arrayBuffer()), file.name); if ($('auto-apply').checked) await apply(); }); $('audio-file').value = '';
});
for (const input of Object.values(fields)) input.addEventListener('input', controlsChanged);
for (const id of ['voice-id', 'sample-text', 'fish-model']) $(id).addEventListener('input', () => { updateControls(); savePreferences(); });
for (const button of document.querySelectorAll('[data-preset]')) button.addEventListener('click', () => { for (const [key, value] of Object.entries(presets[button.dataset.preset])) fields[key].value = value; controlsChanged(); });
$('reset').addEventListener('click', () => { for (const [key, value] of Object.entries(presets.younger)) fields[key].value = value; controlsChanged(); });
$('auto-apply').addEventListener('change', controlsChanged); $('apply').addEventListener('click', () => void run(apply));
$('cancel').addEventListener('click', () => { clearTimeout(applyTimer); model.cancel(); });
$('listen-original').addEventListener('click', () => selectAudio('original')); $('listen-processed').addEventListener('click', () => selectAudio('processed'));
$('volume').addEventListener('input', () => { $('player').volume = Number($('volume').value); savePreferences(); }); $('player').volume = Number($('volume').value);
$('download-original').addEventListener('click', () => { if (model.source) download(model.source.samples, 'voice-original.wav'); });
$('download-processed').addEventListener('click', () => { if (currentResult()) download(model.result.samples, 'voice-praat.wav'); });
$('copy-settings').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('properties').value); $('copy-status').textContent = 'Copied'; }
    catch { $('properties').focus(); $('properties').select(); $('copy-status').textContent = 'Press Ctrl+C to copy'; }
});
$('check-connection').addEventListener('click', () => void checkConnection());
document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key.toLowerCase() === 'a') { selectAudio('original'); event.preventDefault(); }
    if (event.key.toLowerCase() === 'b') { selectAudio('processed'); event.preventDefault(); }
});
const resize = new ResizeObserver(() => { drawWave($('original-wave'), model.source?.samples, '#527266'); drawWave($('processed-wave'), currentResult()?.samples, '#bd623c'); });
resize.observe($('original-wave')); resize.observe($('processed-wave'));
model.subscribe(render); render(); void checkConnection();
window.addEventListener('pagehide', () => { clearTimeout(applyTimer); model.cancel(); });
window.addEventListener('beforeunload', () => { if (originalURL) URL.revokeObjectURL(originalURL); if (processedURL) URL.revokeObjectURL(processedURL); resize.disconnect(); model.dispose(); });
