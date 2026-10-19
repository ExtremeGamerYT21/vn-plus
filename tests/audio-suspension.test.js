import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../renderers/audio-engine.js';
import { SpeechEngine } from '../renderers/speech-engine.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

class FakeAudio {
    constructor() { this.paused = true; this.currentTime = 0; this.plays = 0; this.loop = false; }
    async play() { this.plays++; this.paused = false; }
    pause() { this.paused = true; }
    removeAttribute() {} load() {}
}
const turn = () => new Promise(resolve => setImmediate(resolve));
function audioFixture(resolver = { audio: async (kind, name) => `${kind}/${name}.mp3` }) {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.crossfadeDuration = 0;
    const engine = new AudioEngine(resolver, settings, () => {}, () => new FakeAudio()); engine.unlocked = true;
    return engine;
}
function speechFixture() { return new SpeechEngine({}, structuredClone(DEFAULT_SETTINGS), { audioFactory: () => new FakeAudio() }); }

test('background music and ambience pause and resume the same source positions and mute preference', async () => {
    const engine = audioFixture();
    try {
        await engine.sync({ music: { name: 'song', rate: 1 }, ambient: { name: 'rain', rate: 1 } }); await turn();
        const music = engine.channels.music.audio, ambient = engine.channels.ambient.audio;
        music.currentTime = 12.5; ambient.currentTime = 7;
        engine.setSuspended(true); assert.ok(music.paused && ambient.paused);
        engine.setMusicMuted(true); engine.setSuspended(false); await turn();
        assert.equal(engine.channels.music.audio, music); assert.equal(music.currentTime, 12.5); assert.equal(ambient.currentTime, 7);
        assert.equal(music.plays, 2); assert.equal(ambient.plays, 2); assert.equal(music.muted, true);
        engine.setSuspended(true); engine.close(); engine.setSuspended(false); await turn();
        assert.equal(music.plays, 2); assert.equal(ambient.plays, 2);
    } finally { engine.close(); }
});

test('late loop loads stay silent while hidden and discarded loops cannot resume', async () => {
    let release; const engine = audioFixture({ audio: async () => new Promise(resolve => release = resolve) });
    try {
        const pending = engine.setChannel('music', { name: 'song', rate: 1 });
        engine.setSuspended(true); release('song.mp3'); await pending; await turn();
        const music = engine.channels.music.audio; assert.equal(music.plays, 0); assert.ok(music.paused);
        engine.setSuspended(false); await turn(); assert.equal(music.plays, 1);
        engine.setSuspended(true); engine.close(); engine.setSuspended(false); await turn(); assert.equal(music.plays, 1);
    } finally { engine.close(); }
});

test('background voice cues can finish loop fades without restarting music or ignoring mute', async () => {
    const engine = audioFixture(); engine.settings.crossfadeDuration = 60000;
    try {
        await engine.sync({ music: { name: 'old', rate: 1 } });
        const old = engine.channels.music.audio;
        await engine.sync({ music: { name: 'new', rate: 1 }, ambient: { name: 'rain', rate: 1 } });
        const music = engine.channels.music.audio; music.currentTime = 12; engine.setMusicMuted(true);
        engine.finishLoopFades();
        assert.equal(engine.sources.has(old), false); assert.ok(old.paused);
        assert.equal(music.volume, engine.settings.musicVolume); assert.equal(music.currentTime, 12); assert.ok(music.muted);
        assert.equal(engine.channels.ambient.audio.volume, engine.settings.ambientVolume); assert.equal(engine.timers.size, 0);
    } finally { engine.close(); }
});

test('background one-shots are dropped including effects whose asset load was already pending', async () => {
    let release, made = 0; const engine = audioFixture({ audio: async () => new Promise(resolve => release = resolve) });
    engine.audioFactory = () => { made++; return new FakeAudio(); };
    try {
        const pending = engine.sfx('door'); engine.setSuspended(true); release('door.mp3'); await pending;
        assert.equal(made, 0); assert.equal(engine.sources.size, 0);
        const source = new FakeAudio(); await source.play(); engine.sources.add(source);
        engine.setSuspended(false); engine.setSuspended(true); engine.setSuspended(false); await turn();
        assert.ok(source.paused); assert.equal(source.plays, 1); assert.equal(engine.sources.size, 0);
    } finally { engine.close(); }
});

test('speech pauses its actual clock without cancelling synthesis or losing the cached recording', async () => {
    const engine = speechFixture(), playback = { status: 'loading' }; let aborted = 0;
    try {
        engine.playback = playback; await engine.beginAudio(new Float32Array(4410), playback);
        const audio = engine.audio; audio.currentTime = .35;
        engine.abort = { abort() { aborted++; } }; engine.cache.set('cached', { chapters: [] });
        engine.setSuspended(true); assert.ok(audio.paused); assert.equal(aborted, 0); assert.ok(engine.cache.has('cached'));
        engine.setSuspended(false); await turn(); assert.equal(engine.audio, audio); assert.equal(audio.currentTime, .35);
        assert.equal(audio.plays, 2); assert.equal(playback.status, 'playing');
        engine.setSuspended(true); engine.stop(); engine.setSuspended(false); await turn(); assert.equal(audio.plays, 2);
    } finally { engine.dispose(); }
});

test('a voice that becomes ready while hidden waits silently until foreground playback is allowed', async () => {
    const engine = speechFixture(); let release;
    engine.clipSamples = async () => new Promise(resolve => release = resolve);
    try {
        const playing = engine.play('pending'); engine.setSuspended(true); release(new Float32Array(4410)); await playing;
        const audio = engine.audio; assert.ok(audio.paused); assert.equal(audio.plays, 0); assert.equal(engine.playback.status, 'loading');
        engine.setSuspended(false); await turn(); assert.equal(audio.plays, 1); assert.equal(engine.playback.status, 'playing');
    } finally { engine.dispose(); }
});
