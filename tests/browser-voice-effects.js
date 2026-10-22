import { voiceEffectsFixture } from './voice-effects-fixture.js';
import { SpeechPanel } from '../ui/speech-panel.js';
import { createHost } from '../integration.js';
import { youngifyClip } from '../renderers/praat-voice.js';

export async function runVoiceEffectChecks({ check, assert, equal, eventually }) {
    const h = voiceEffectsFixture();
    const panel = new SpeechPanel(h.engine, { prepare: h.prepare, change() {} }, { expanded: true }); document.body.append(panel.node);
    try {
        await check('voice labels distinguish requested effects from actual applied cached clips', async () => {
            assert(panel.segments.textContent.includes('Praat requested +4 semitones'));
            assert(panel.segments.querySelector('[data-voice-effect="pending"]')); assert(!panel.segments.querySelector('[data-voice-effect="applied"]'));
            await h.engine.reprocessCachedEffects(); assert(panel.segments.querySelector('[data-voice-effect="applied"]'));
        });
        await check('Apply latest voice effects reloads properties and updates cached audio without Fish synthesis', async () => {
            h.properties.ttsYoungify.pitchSemitones = 7;
            panel.effectsButton.click(); await eventually(() => !panel.effectsButton.disabled && panel.segments.textContent.includes('requested +7 semitones'));
            assert(panel.segments.querySelector('[data-voice-effect="applied"]'));
            assert(Math.abs((await h.engine.clipSamples('effect-cache:0'))[0] - .35) < 1e-6); equal(h.requests, 0);
        });
        await check('Praat fallback and unchanged speech are visibly different from successfully applied effects', async () => {
            h.mode = 'fail'; h.properties.ttsYoungify.pitchSemitones = 8;
            panel.effectsButton.click(); await eventually(() => !panel.effectsButton.disabled && panel.segments.querySelector('[data-voice-effect="fallback"]'));
            assert(panel.segments.textContent.includes('Unmodified voice: Bridge unavailable'));
            h.mode = 'unchanged'; panel.effectsButton.click(); await eventually(() => !panel.effectsButton.disabled && panel.segments.querySelector('[data-voice-effect="unchanged"]'));
            equal(h.requests, 0);
        });
    } finally { panel.dispose(); h.engine.dispose(); }
    await check('in-game request adapter permits Praat processing with SillyTavern CSRF headers', async () => {
        const originalFetch = window.fetch, actual = voiceEffectsFixture(), calls = [];
        actual.engine.host = createHost(() => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'ST_TEST' }) }));
        actual.engine.youngify = (samples, settings, signal) => youngifyClip(actual.engine.endpoint.bind(actual.engine), samples, settings, signal);
        window.fetch = async (url, options) => {
            calls.push(url); equal(url, '/api/plugins/vn-plus-tts/praat/youngify'); equal(options.headers['X-CSRF-Token'], 'ST_TEST');
            const input = JSON.parse(options.body), bytes = Uint8Array.from(atob(input.pcm), value => value.charCodeAt(0));
            const samples = new Float32Array(bytes.buffer); return new Response(samples.map(value => value * 2).buffer, { headers: { 'X-VN-Praat-Note': 'Praat: adjusted through ST adapter.' } });
        };
        try {
            await actual.engine.reprocessCachedEffects();
            equal(actual.engine.voiceEffectStatus('effect-cache:0').state, 'applied');
            assert(Math.abs((await actual.engine.clipSamples('effect-cache:0'))[0] - .2) < 1e-6); equal(calls.length, 1);
        } finally { actual.engine.dispose(); window.fetch = originalFetch; }
    });
}
