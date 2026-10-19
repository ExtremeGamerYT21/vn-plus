import test from 'node:test';
import assert from 'node:assert/strict';
import { dialogueEmotionStyle, letterVariations } from '../renderers/dialogue-emotions.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

const settings = () => structuredClone(DEFAULT_SETTINGS);
const style = (emotion, text = 'Hello.', config = settings(), effect = 'normal') => dialogueEmotionStyle({ type: 'dialogue', text, emotion }, effect, config);

test('anger adjectives shake independently of sprite fallback, without shaking mild or unrelated emotions', () => {
    for (const emotion of ['anger', 'angry', 'angrily', 'furious', 'irate', 'VERY ANGRY']) assert.ok(style(emotion).jitter, emotion);
    for (const emotion of ['joy', 'nervous', 'annoyed', 'sadness', 'neutral', 'not angry']) assert.equal(style(emotion).jitter, false, emotion);
    const config = settings(); config.intenseEmotions = []; assert.equal(style('angry', '', config).jitter, false);
    config.intenseEmotions = ['custom_fury']; assert.ok(style('custom fury', '', config).jitter);
});

test('shouting and combined delivery tags use large scattered lettering and preserve independent emotions', () => {
    for (const cue of ['shout', 'shouting', 'yelling', 'screaming', 'bellowing']) {
        const value = style(cue); assert.ok(value.shout && value.scatter && value.fontScale > 1 && value.tracking > 0, cue);
    }
    const combined = style('angry, shouting'); assert.ok(combined.jitter && combined.scatter);
    const inline = style('loving', '"[shouting] I love you!"'); assert.ok(inline.glow && inline.shout);
    assert.equal(style('normal', '"[not shouting] Quiet."').shout, false);
    assert.ok(style('normal', '', settings(), 'shout').shout);
});

test('sadness and grief shrink text while love glows and whispers remain small even with reduced motion', () => {
    for (const cue of ['sad', 'sadness', 'sorrowful', 'grief', 'heartbroken']) assert.ok(style(cue).fontScale <= .8, cue);
    for (const cue of ['love', 'loving', 'romantic', 'affectionate']) assert.ok(style(cue).glow, cue);
    const config = settings(); config.reducedMotion = true;
    assert.equal(style('angry', '', config).jitter, false);
    assert.ok(style('shouting', '', config).scatter); assert.ok(style('love', '', config).glow);
    const whisper = style('angry', '', config, 'whisper'); assert.ok(whisper.whisper && whisper.fontScale < 1);
    assert.equal(style('not sad').fontScale, 1); assert.equal(style('normal').fontScale, 1);
});

test('effects off clears presentation and narration never inherits a speaker emotion', () => {
    const config = settings(); config.textEffects = false;
    const result = style('angry, shouting, love', '', config); assert.equal(result.fontScale, 1);
    for (const key of ['jitter', 'scatter', 'glow', 'shout', 'whisper']) assert.equal(result[key], false);
    assert.equal(dialogueEmotionStyle({ type: 'narration', emotion: 'sad', text: '[shouting] A noise.' }, 'normal', settings()).fontScale, 1);
    assert.ok(dialogueEmotionStyle({ type: 'narration', text: 'A noise.' }, 'shout', settings()).shout);
});

test('per-letter placement is varied bounded and deterministic without changing Unicode text', () => {
    const text = 'STOP, **Nina**! Grüße. 😮', first = letterVariations(text);
    assert.equal(first.length, Array.from(text).length); assert.deepEqual(first, letterVariations(text));
    assert.ok(new Set(first.map(value => value.angle)).size > 5);
    assert.notDeepEqual(first, letterVariations('Different text'));
    for (const value of first) { assert.ok(Math.abs(parseFloat(value.x)) <= .055); assert.ok(Math.abs(parseFloat(value.y)) <= .11); assert.ok(Math.abs(parseFloat(value.angle)) <= 8); }
});
