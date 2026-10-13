import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../renderers/audio-engine.js';
const settings = { musicVolume: .5, ambientVolume: .4, sfxVolume: .8, crossfadeDuration: 0 };
class FakeAudio {
    constructor() { this.volume = 1; this.paused = true; this.plays = 0; }
    async play() { this.paused = false; this.plays++; }
    pause() { this.paused = true; }
    removeAttribute() {} load() {}
}
const make = resolver => { const audio = []; const engine = new AudioEngine(resolver || { audio: async (kind, name) => `/${kind}/${name}`, voice: async (id, name) => `/${id}/${name}` }, { ...settings }, () => {}, () => { const item = new FakeAudio(); audio.push(item); return item; }); return { engine, audio }; };
test('music and ambient persist independently, repeated tracks do not restart', async () => {
    const { engine, audio } = make(); await engine.unlock();
    const state = { music: { name: 'buzz', rate: 1 }, ambient: { name: 'fire', rate: 1 } };
    await engine.sync(state); await engine.sync(state); assert.equal(audio.length, 2); assert.equal(audio[0].plays, 1);
    await engine.setChannel('music', { name: 'buzz', rate: .75 }); assert.equal(audio.length, 2); assert.equal(audio[0].playbackRate, .75);
    engine.close(); assert.equal(engine.sources.size, 0); assert.ok(audio.every(item => item.paused));
});
test('browser interaction unlock starts pending loops once; reopen cannot multiply sources', async () => {
    const { engine, audio } = make(); await engine.setChannel('music', { name: 'buzz', rate: 1 }); assert.equal(audio[0].plays, 0);
    await engine.unlock(); await engine.unlock(); assert.equal(audio[0].plays, 1); engine.close();
    await engine.setChannel('music', { name: 'buzz', rate: 1 }); assert.equal(engine.sources.size, 1); engine.close();
});
test('obsolete loop and one-shot asset resolutions cannot play after navigation/close', async () => {
    let release; const pending = new Promise(resolve => release = resolve);
    const { engine, audio } = make({ audio: async (kind, name) => name === 'old' ? pending : '/new' }); await engine.unlock();
    const old = engine.setChannel('music', { name: 'old', rate: 1 }); await engine.setChannel('music', { name: 'new', rate: 1 }); release('/old'); await old;
    assert.equal(audio.length, 1); assert.equal(audio[0].src, '/new'); engine.close();
    let resolveEffect; engine.resolver.audio = () => new Promise(resolve => resolveEffect = resolve);
    const effect = engine.sfx('old'); engine.cancelOneShots(); resolveEffect('/old'); await effect; assert.equal(engine.sources.size, 0);
});
test('cancelling transient effects does not cancel pending music restoration', async () => {
    let release; const { engine } = make({ audio: () => new Promise(resolve => release = resolve) });
    const load = engine.setChannel('music', { name: 'buzz', rate: 1 }); engine.cancelOneShots(); release('/buzz'); await load;
    assert.equal(engine.sources.size, 1); engine.close();
});
test('speed change during a pending track load cannot preserve the previous track', async () => {
    let release; const waiting = new Promise(resolve => release = resolve);
    const { engine, audio } = make({ audio: async (kind, name) => name === 'new' ? waiting : '/old' });
    await engine.setChannel('music', { name: 'old', rate: 1 });
    const first = engine.setChannel('music', { name: 'new', rate: 1 });
    const changed = engine.setChannel('music', { name: 'new', rate: .75 }); release('/new');
    await Promise.all([first, changed]); assert.equal(audio.at(-1).src, '/new'); assert.equal(audio.at(-1).playbackRate, .75); engine.close();
});
test('music mute preserves track progress and volume without muting ambience or SFX', async () => {
    const { engine, audio } = make(); await engine.unlock();
    await engine.sync({ music: { name: 'buzz', rate: 1 }, ambient: { name: 'fire', rate: 1 } }); await engine.sfx('door');
    audio[0].currentTime = 42; engine.setMusicMuted(true);
    assert.equal(audio[0].muted, true); assert.equal(audio[1].muted, false); assert.notEqual(audio[2].muted, true);
    assert.equal(audio[0].volume, .5); assert.equal(audio[0].currentTime, 42);
    engine.setMusicMuted(false); assert.equal(audio[0].muted, false); assert.equal(audio[0].plays, 1); assert.equal(audio[0].currentTime, 42); engine.close();
});
test('music mute applies to fading and pending tracks and survives reopening', async () => {
    const { engine, audio } = make(); engine.settings.crossfadeDuration = 1000;
    await engine.setChannel('music', { name: 'old', rate: 1 }); await engine.setChannel('music', { name: 'new', rate: 1 });
    engine.setMusicMuted(true); assert.ok(audio.every(source => source.muted)); engine.close();
    await engine.setChannel('music', { name: 'new', rate: 1 }); assert.equal(audio.at(-1).muted, true); engine.close();
    let release; const pending = make({ audio: () => new Promise(resolve => release = resolve) });
    const load = pending.engine.setChannel('music', { name: 'waiting', rate: 1 }); pending.engine.setMusicMuted(true); release('/waiting'); await load;
    assert.equal(pending.audio[0].muted, true); pending.engine.close();
});
