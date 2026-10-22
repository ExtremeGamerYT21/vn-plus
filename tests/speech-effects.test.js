import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceEffectsFixture } from './voice-effects-fixture.js';

test('effect status describes actual cached audio, including old settings, skips and fallback', async () => {
    const h = voiceEffectsFixture(), id = 'effect-cache:0';
    try {
        assert.equal(h.engine.voiceEffectStatus(id).state, 'pending'); assert.equal(h.engine.voiceEffectStatus('effect-cache:1'), null);
        await h.engine.reprocessCachedEffects(); assert.equal(h.engine.voiceEffectStatus(id).state, 'applied');
        h.properties.ttsYoungify.pitchSemitones = 7; h.prepare(); assert.equal(h.engine.voiceEffectStatus(id).state, 'pending');
        const previous = await h.engine.clipSamples(id, false); await h.engine.reprocessCachedEffects();
        assert.ok(Math.abs((await h.engine.clipSamples(id))[0] - .35) < 1e-6); assert.deepEqual(await h.engine.clipSamples(id, false), previous);
        h.mode = 'fail'; h.properties.ttsYoungify.pitchSemitones = 8; h.prepare(); await h.engine.reprocessCachedEffects();
        assert.equal(h.engine.voiceEffectStatus(id).state, 'fallback'); assert.match(h.engine.voiceEffectStatus(id).note, /Bridge unavailable/);
        h.mode = 'unchanged'; await h.engine.reprocessCachedEffects(); assert.equal(h.engine.voiceEffectStatus(id).state, 'unchanged');
        assert.equal(h.requests, 0); assert.equal(h.effects, 4); assert.equal(h.engine.running, null);
    } finally { h.engine.dispose(); }
});
test('refreshing effects never synthesizes a missing recording or changed voice ID', async () => {
    const h = voiceEffectsFixture(false);
    try {
        assert.equal(await h.engine.reprocessCachedEffects(), false); assert.equal(h.engine.voiceEffectStatus('effect-cache:0').state, 'pending');
        assert.equal(h.requests, 0); assert.match(h.engine.status, /Generate selected dialogue/);
        h.properties.voiceId = 'changed'; h.prepare(); assert.equal(await h.engine.reprocessCachedEffects(), false); assert.equal(h.requests, 0);
    } finally { h.engine.dispose(); }
});
test('effect refresh handles partial recordings without generating the missing chapters', async () => {
    const h = voiceEffectsFixture(); h.engine.job.plan.push({ lines: [] }); h.engine.job.status = 'failed';
    try { await h.engine.reprocessCachedEffects(); assert.equal(h.engine.voiceEffectStatus('effect-cache:0').state, 'applied'); assert.equal(h.requests, 0); }
    finally { h.engine.dispose(); }
});
