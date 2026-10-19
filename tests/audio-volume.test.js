import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../renderers/audio-engine.js';
import { SpeechEngine } from '../renderers/speech-engine.js';
import { DEFAULT_SETTINGS, loadSettings } from '../ui/settings.js';

class FakeAudio {
    constructor() { this.volume = 1; this.paused = true; this.currentTime = 0; this.plays = 0; this.loop = false; }
    async play() { this.paused = false; this.plays++; }
    pause() { this.paused = true; }
    removeAttribute() {} load() {}
}
const fixture = () => {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.crossfadeDuration = 0;
    return new AudioEngine({ audio: async (kind, name) => `${kind}/${name}` }, settings, () => {}, () => new FakeAudio());
};

test('live sliders change independent active channels without restarting or seeking them', async () => {
    const engine = fixture(); await engine.unlock();
    try {
        await engine.sync({ music: { name: 'music', rate: 1 }, ambient: { name: 'rain', rate: 1 } }); await engine.sfx('bell');
        const music = engine.channels.music.audio, ambient = engine.channels.ambient.audio, effect = [...engine.sources].find(audio => !audio.loop);
        music.currentTime = 42; ambient.currentTime = 13;
        engine.setVolume('music', .17); engine.setVolume('ambient', .28); engine.setVolume('sfx', .39);
        assert.equal(music.volume, .17); assert.equal(ambient.volume, .28); assert.equal(effect.volume, .39);
        assert.equal(music.currentTime, 42); assert.equal(ambient.currentTime, 13); assert.equal(music.plays, 1); assert.equal(ambient.plays, 1);
        engine.setMusicMuted(true); engine.setVolume('music', .61); assert.ok(music.muted); assert.equal(engine.settings.musicVolume, .61);
        engine.setMusicMuted(false); assert.equal(music.volume, .61); assert.equal(music.plays, 1);
    } finally { engine.close(); }
});

test('volume changes retarget both sides of a crossfade including zero without stale timer gains', async () => {
    const engine = fixture(); await engine.unlock();
    try {
        await engine.setChannel('music', { name: 'old', rate: 1 }); engine.settings.crossfadeDuration = 60000;
        await engine.setChannel('music', { name: 'new', rate: 1 });
        const current = engine.channels.music.audio, old = engine.channels.music.fading;
        engine.fades.get(current).start -= 30000; engine.fades.get(old).start -= 30000;
        engine.setVolume('music', 0); assert.equal(current.volume, 0); assert.equal(old.volume, 0);
        await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(current.volume, 0); assert.equal(old.volume, 0);
        engine.setVolume('music', .2); assert.equal(engine.fades.get(current).target, .2); assert.equal(engine.fades.get(old).target, 0);
        await new Promise(resolve => setTimeout(resolve, 40)); assert.ok(current.volume > 0 && current.volume <= .2); assert.equal(old.volume, 0);
        engine.finishLoopFades(); assert.equal(current.volume, .2); assert.equal(current.plays, 1); assert.equal(engine.fades.size, 0);
    } finally { engine.close(); }
});

test('voice volume and mute preserve the playback clock, synthesis and finishing cache', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS), engine = new SpeechEngine({}, settings, { audioFactory: () => new FakeAudio() });
    try {
        const chapter = { clips: [], noise: null }, key = engine.processingKey(chapter); let cancelled = 0;
        engine.abort = { abort() { cancelled++; } }; engine.cache.set('recording', { chapters: [chapter] });
        await engine.beginAudio(new Float32Array(4410), {}); const audio = engine.audio; audio.currentTime = .35;
        engine.setVolume(.23); engine.setMuted(true);
        assert.equal(engine.audio, audio); assert.equal(audio.volume, .23); assert.ok(audio.muted); assert.equal(audio.currentTime, .35); assert.equal(audio.plays, 1);
        assert.equal(cancelled, 0); assert.ok(engine.cache.has('recording')); assert.equal(engine.processingKey(chapter), key);
        engine.setMuted(false); assert.equal(audio.volume, .23); assert.equal(audio.plays, 1);
        engine.stop(); engine.setMuted(true); await engine.beginAudio(new Float32Array(4410), {});
        assert.equal(engine.audio.volume, .23); assert.ok(engine.audio.muted);
    } finally { engine.dispose(); }
});

test('saved audio levels retain zero and normalize invalid values before reaching sliders', () => {
    const settings = loadSettings({ extensionSettings: { visual_novel_plus: { musicVolume: 0, ambientVolume: 7, sfxVolume: NaN, tts: { volume: -.5, muted: true } } } });
    assert.equal(settings.musicVolume, 0); assert.equal(settings.ambientVolume, 1); assert.equal(settings.sfxVolume, DEFAULT_SETTINGS.sfxVolume);
    assert.equal(settings.tts.volume, 0); assert.ok(settings.tts.muted);
});
