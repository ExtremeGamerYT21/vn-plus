import { voiceEffectsFixture } from './voice-effects-fixture.js';
import { SpeechPanel } from '../ui/speech-panel.js';

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
}
