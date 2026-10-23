import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { parsePOV } from '../core/vn-parser.js';
import { splitMessage } from '../core/message-reader.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS, loadSettings } from '../ui/settings.js';
import { fishVoiceId, speechSegments, chapterRequests, SAMPLE_RATE, SPEECH_DEFAULTS } from '../core/speech-segments.js';
import { collectFishStream } from '../core/fish-stream.js';
import { alignChapter, applyMargins, approveCut } from '../core/speech-alignment.js';
import { joinPCM, wavBytes } from '../core/speech-pcm.js';
import { finishClip, noiseProfile } from '../core/speech-processing.js';
import { SpeechEngine } from '../renderers/speech-engine.js';
import { shouldShakeText } from '../renderers/emotion-flair.js';
import { speechRevealCues } from '../core/speech-reveal.js';
import { validateRequest, registerBridge, SECRET_KEY } from '../server/index.mjs';

const settings = () => structuredClone(DEFAULT_SETTINGS);
const fixture = (text, voices = { nina: { voiceId: 'voice-nina' } }) => {
    const config = settings(); config.characters = voices; config.tts.enabled = true; config.tts.isolateVoices = false;
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, config);
    const timeline = compileTimeline(parsePOV(text).tokens, registry, config); return { config, registry, timeline };
};
const body = (text, fragments = [3, 7, 1, 9]) => {
    const bytes = new TextEncoder().encode(text); let offset = 0, index = 0;
    return new ReadableStream({ pull(controller) { if (offset === bytes.length) return controller.close(); const end = Math.min(bytes.length, offset + fragments[index++ % fragments.length]); controller.enqueue(bytes.slice(offset, end)); offset = end; } });
};
const event = (payload, ending = '\n\n') => `data: ${JSON.stringify(payload)}${ending}`;
const response = text => new Response(body(text), { headers: { 'Content-Type': 'text/event-stream' } });
const simpleStream = (word = 'Hello') => event({ audio_base64: btoa('audio'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: [{ text: word, start: .1, end: .5 }] } });
const engineFor = (input, request, dependencies = {}) => {
    const engine = new SpeechEngine({ request }, input.config, { decode: async () => new Float32Array(SAMPLE_RATE), ...dependencies });
    engine.prepare('chat:message:swipe', input.timeline, input.registry); return engine;
};
const fakeVoiceAudio = () => ({ currentTime: 0, paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} });
const fakeFinish = async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(4410), notes: [] }));

test('narrator properties load without inventory entries and optional narration uses one reserved voice', async () => {
    const input = fixture('You wait.\nNarrator: "A door opens."\nNina: "(Stay quiet.)"', {});
    input.registry.resolver.json = async path => path === 'characters/narrator/properties.json' ? { name: 'Storyteller', textColor: '#abcdef', font: 'Georgia', voiceId: 'story-voice' } : null;
    await input.registry.prepare([]);
    assert.equal(input.registry.get('narrator').displayName, 'Storyteller');
    assert.equal(speechSegments(input.timeline, input.registry, 'scene').length, 0);
    const lines = speechSegments(input.timeline, input.registry, 'scene', { narratorEnabled: true });
    assert.deepEqual(lines.map(line => line.character), ['narrator', 'narrator']);
    assert.ok(lines.every(line => line.voice === 'story-voice' && line.name === 'Storyteller'));
    assert.ok(!input.timeline.beats.some(beat => beat.state.characters.narrator));
});

test('automatic generation is opt-in and needs both voices enabled and eligible segments', () => {
    const input = fixture('Nina: "Hello"'); let calls = 0;
    const engine = engineFor(input, async () => { calls++; throw new Error('Must not request'); });
    engine.requestAutomatic(); input.config.tts.autoGenerate = true; input.config.tts.enabled = false; engine.requestAutomatic();
    input.config.tts.enabled = true; engine.prepare('mute', fixture('Unknown: "Hello"').timeline, input.registry); engine.requestAutomatic();
    assert.equal(calls, 0); engine.dispose();
});

test('automatic generation holds the current line, prepares ahead and reuses completed recordings', async () => {
    const input = fixture('Nina: "Hello"'); input.config.tts.autoGenerate = true; let posts = 0;
    const engine = engineFor(input, async url => url.endsWith('/status') ? Response.json({ configured: true }) : (posts++, response(simpleStream())), { audioFactory: fakeVoiceAudio, process: fakeFinish });
    const line = engine.prepared.segments[0], playback = engine.playBeat(line.beat);
    assert.equal(playback.status, 'loading'); engine.requestAutomatic();
    await engine.running; await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(posts, 1); assert.equal(playback.status, 'playing'); assert.equal(engine.lineStatus(line.beat).state, 'ready');
    engine.stop(); engine.prepare('chat:message:swipe', input.timeline, input.registry); engine.requestAutomatic(); engine.playBeat(line.beat);
    await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(posts, 1); engine.dispose();
});

test('failed automatic voicing releases text and never repeatedly bills retries on navigation', async () => {
    const input = fixture('Nina: "Hello"'); input.config.tts.autoGenerate = true; let posts = 0;
    const engine = engineFor(input, async url => url.endsWith('/status') ? Response.json({ configured: true }) : (posts++, new Response('', { status: 503 })), { process: fakeFinish });
    const beat = engine.prepared.segments[0].beat, playback = engine.playBeat(beat);
    await engine.running; assert.equal(playback.status, 'failed'); assert.equal(engine.lineStatus(beat).state, 'failed');
    engine.playBeat(beat); engine.requestAutomatic(); assert.equal(posts, 1);
    await engine.generate(); assert.equal(posts, 2); engine.dispose();
});

test('untrusted transcript cuts show review instead of auto-playing guessed speech', async () => {
    const input = fixture('Nina: "Hello"'); input.config.tts.autoGenerate = true;
    const engine = engineFor(input, async url => url.endsWith('/status') ? Response.json({ configured: true }) : response(simpleStream('Different')), { audioFactory: () => { throw new Error('Do not play an unreviewed cut'); }, process: fakeFinish });
    const beat = engine.prepared.segments[0].beat, playback = engine.playBeat(beat);
    await engine.running; assert.equal(playback.status, 'failed'); assert.equal(engine.lineStatus(beat).state, 'review'); engine.dispose();
});

test('navigating away cancels a waiting voice without interrupting ahead generation', async () => {
    const input = fixture('Nina: "Hello"'); input.config.tts.autoGenerate = true;
    let release, played = 0;
    const engine = engineFor(input, async url => url.endsWith('/status') ? Response.json({ configured: true }) : new Promise(resolve => release = () => resolve(response(simpleStream()))), { audioFactory: () => { played++; return fakeVoiceAudio(); }, process: fakeFinish });
    const playback = engine.playBeat(engine.prepared.segments[0].beat), generation = engine.running;
    await new Promise(resolve => setTimeout(resolve, 0)); engine.playBeat(-1); release(); await generation;
    assert.equal(playback.status, 'cancelled'); assert.equal(played, 0); assert.equal(engine.job.status, 'complete'); engine.dispose();
});

test('Fish voice IDs accept official voice URLs and reject arbitrary destinations', () => {
    assert.equal(fishVoiceId('https://fish.audio/pt/m/4744963f03b24efeb8e29b86aca419a0/'), '4744963f03b24efeb8e29b86aca419a0');
    assert.equal(fishVoiceId('voice_A-1'), 'voice_A-1'); assert.equal(fishVoiceId(''), null); assert.equal(fishVoiceId(undefined), null);
    for (const value of ['https://evil.test/m/id', 'http://fish.audio/m/id', '../secret', 'id with spaces', 'https://fish.audio/m/id/more']) assert.throws(() => fishVoiceId(value));
});
test('text reveal uses real chapter word times relative to retained clip silence', () => {
    const cues = speechRevealCues('"Hello, world!"', { first: 1, last: 2, start: 1, end: 2.4 }, [
        { text: 'Previous', start: 0, end: .5 }, { text: 'Hello', start: 1.2, end: 1.5 }, { text: 'world', start: 1.8, end: 2.2 },
    ]);
    assert.deepEqual(cues.map(cue => cue.through), [8, 15]);
    assert.ok(Math.abs(cues[0].at - .2) < .00001); assert.ok(Math.abs(cues[1].at - .8) < .00001);
});
test('text reveal preserves Unicode punctuation, contractions and non-spoken inline directions', () => {
    const text = '“Don’t 👋 go, [whispering] friend!”';
    const cues = speechRevealCues(text, { first: 0, last: 2, start: 0, end: 2 }, [
        { text: "don't", start: .1, end: .3 }, { text: 'go', start: .6, end: .8 }, { text: 'friend', start: 1.4, end: 1.8 },
    ]);
    const visible = count => Array.from(text).slice(0, count).join('');
    assert.equal(visible(cues[0].through), '“Don’t 👋 '); assert.equal(visible(cues[1].through), '“Don’t 👋 go, ');
    assert.equal(visible(cues[2].through), text); assert.deepEqual(cues.map(cue => cue.at), [.1, .6, 1.4]);
});
test('unsafe or missing word times fall back instead of estimating text timing from clip duration', () => {
    const clip = { first: 0, last: 0, start: 0, end: 1 }, good = [{ text: 'Hello', start: .2, end: .6 }];
    assert.equal(speechRevealCues('Hello', { ...clip, review: true }, good), null);
    assert.equal(speechRevealCues('Hello', clip, []), null);
    assert.equal(speechRevealCues('Different words', clip, good), null);
    assert.equal(speechRevealCues('Hello', clip, [{ text: 'Hello', start: NaN, end: .6 }]), null);
    assert.equal(speechRevealCues('Hello', { ...clip, start: .3 }, good), null);
    assert.equal(speechRevealCues('Hello', { ...clip, end: .5 }, good), null);
});
test('voice playback exposes its actual clip clock and finishes obsolete sessions independently', async () => {
    const input = fixture('Nina: "Hello."'); input.config.tts.enabled = true;
    const engine = engineFor(input, async () => { throw new Error('No synthesis expected'); }, {
        audioFactory: () => ({ currentTime: 0, paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} }),
    });
    const line = engine.prepared.segments[0];
    engine.job = { chapters: [{ clips: [{ id: line.id, first: 0, last: 0, start: 0, end: 1 }], words: [{ text: 'Hello', start: .2, end: .6 }] }] };
    let ready; engine.clipSamples = () => new Promise(resolve => ready = resolve);
    const playback = engine.playBeat(line.beat); assert.equal(playback.status, 'loading'); assert.equal(playback.audio, null);
    ready(new Float32Array(SAMPLE_RATE)); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(playback.status, 'playing'); assert.equal(playback.audio, engine.audio); engine.audio.currentTime = .4;
    assert.equal(playback.audio.currentTime, .4); const previousEnd = engine.audio.onended;
    engine.stop(); assert.equal(playback.status, 'cancelled');
    engine.clipSamples = async () => new Float32Array(SAMPLE_RATE); const next = engine.playBeat(line.beat);
    await new Promise(resolve => setTimeout(resolve, 0)); previousEnd(); assert.equal(next.status, 'playing');
    engine.audio.onended(); assert.equal(next.status, 'ended'); assert.equal(engine.audio, null); engine.dispose();
});
test('only voiced spoken POV dialogue reaches Fish, preserving emotion directions', () => {
    const input = fixture(splitMessage('PRIVATE CANONICAL\n/////\nYou hear footsteps.\nNina: "Hello." [curious]\nNina: "(Keep quiet.)" [nervous]\nUnknown: "Mute."\nAshley: "Hi." [laughing]').pov,
        { nina: { voiceId: 'voice-nina' }, ashley: { voiceId: 'https://fish.audio/m/voice-ashley/' } });
    const lines = speechSegments(input.timeline, input.registry, 'stable-scene');
    assert.deepEqual(lines.map(line => line.character), ['nina', 'ashley']);
    assert.equal(lines[0].synthesisText, '[curious] Hello.'); assert.equal(lines[1].synthesisText, '[laughing] Hi.');
    assert.ok(!JSON.stringify(lines).includes('PRIVATE')); assert.ok(!JSON.stringify(lines).includes('Keep quiet'));
    assert.equal(lines[0].id, `stable-scene:${lines[0].beat}`);
});
test('each short chapter maps only its voiced characters to fresh speaker indices', () => {
    const input = fixture('Nina: "One."\nAshley: "Two."\nAshley: "Three."\nNina: "Four."\nNina: "Five."', { nina: { voiceId: 'n' }, ashley: { voiceId: 'a' } });
    const plan = chapterRequests(speechSegments(input.timeline, input.registry, 'scene'), { ...SPEECH_DEFAULTS, isolateVoices: false, chapterSize: 2 });
    assert.deepEqual(plan.map(chapter => chapter.body.reference_id), [['n', 'a'], ['a', 'n'], ['n']]);
    assert.match(plan[1].body.text, /^<\|speaker:0\|>Three\.\n<\|speaker:1\|>Four\./);
    assert.ok(plan.every(chapter => chapter.body.prosody.normalize_loudness));
    assert.equal(chapterRequests(speechSegments(input.timeline, input.registry, 'scene'), { ...SPEECH_DEFAULTS, isolateVoices: false, splitChapters: false }).length, 1);
});
test('unindexed player aliases resolve to the real character voice instead of a virtual Jason override', async () => {
    const config = settings(); config.characters = { jason: { displayName: 'Jason', assetFolder: 'andrew' } }; let currentVoice = 'jason-voice-one';
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, config, async () => ({ characters: [
        { id: 'jason_weber', properties: { displayName: 'Jason', aliases: ['Jason Weber', 'J. Weber', 'Weber'], voiceId: currentVoice } },
    ] }));
    const text = 'Jason: "One."\nJason Weber: "Two."\nJ. Weber: "Three."\nWeber: "Four."';
    await registry.prepare(['Jason']);
    assert.equal(registry.identify('Jason'), 'jason_weber'); assert.ok(registry.isPlayer('jason_weber'));
    const lines = () => speechSegments(compileTimeline(parsePOV(text).tokens, registry, config), registry, 'scene');
    assert.deepEqual(lines().map(line => line.character), Array(4).fill('jason_weber'));
    assert.deepEqual(chapterRequests(lines(), config.tts)[0].body.reference_id, ['jason-voice-one']);
    currentVoice = 'jason-voice-two'; await registry.prepare(['Jason']);
    assert.ok(lines().every(line => line.voice === 'jason-voice-two'));
});
test('real folder IDs precede colliding aliases and discovery failure preserves indexed voices', async () => {
    const config = settings(), registry = new CharacterRegistry({ inventory: { characters: { jason_weber: {} } }, json: async file => file.includes('/jason_weber/') ? { displayName: 'Jason', aliases: ['Jason'], voiceId: 'kept-voice' } : null }, config, async () => { throw new Error('Discovery offline'); });
    await registry.prepare(['Jason']); assert.equal(registry.discoveryError, 'Discovery offline');
    assert.equal(registry.identify('Jason'), 'jason_weber');
    registry.acceptCharacter({ id: 'a_different_character', properties: { aliases: ['jason_weber'] } });
    assert.equal(registry.identify('jason_weber'), 'jason_weber');
    assert.equal(speechSegments(compileTimeline(parsePOV('Jason: "Hello."').tokens, registry, config), registry, 'scene')[0].voice, 'kept-voice');
});
test('a narrator voice property cannot turn narration into a voiced character', () => {
    const input = fixture('Narrator: "A moment passes."\nStory voice: "Another moment."\nNina: "Hello."', {
        narrator: { voiceId: 'narrator-voice' }, story: { displayName: 'Narrator', aliases: ['Story voice'], voiceId: 'story-voice' }, nina: { voiceId: 'nina-voice' },
    });
    assert.deepEqual(speechSegments(input.timeline, input.registry, 'scene').map(line => line.character), ['nina']);
});
test('all chapters are validated before the first bridge or synthesis request', async () => {
    const input = fixture(`Nina: "Hello"\nNina: "${'a'.repeat(20001)}"`); input.config.tts.chapterSize = 1; let calls = 0;
    const engine = engineFor(input, async () => { calls++; throw new Error(); });
    await assert.rejects(engine.generate(), /20,000/); assert.equal(calls, 0); engine.dispose();
    const mute = fixture('Nina: "Hello"', {}); assert.equal(speechSegments(mute.timeline, mute.registry, 'scene').length, 0);
});
test('fragmented SSE preserves ordered audio and replaces cumulative alignment snapshots', async () => {
    const first = { audio_base64: btoa('\x01\x02'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: [{ text: 'Olá', start: 0, end: .2 }] } };
    const second = { audio_base64: btoa('\x03'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: [...first.alignment.segments, { text: 'world', start: .2, end: .4 }] } };
    const last = { audio_base64: btoa('\x04'), chunk_seq: 1, chunk_audio_offset_sec: 1.5, alignment: { segments: [{ text: 'Next', start: .1, end: .3 }] } };
    const multiline = JSON.stringify(second).replace(',"chunk_seq"', ',\r\ndata: "chunk_seq"');
    const stream = `: heartbeat\r\n\r\n${event(first, '\r\n\r\n')}data: ${multiline}\r\n\r\n${event(last)}data: [DONE]\n\n`;
    const result = await collectFishStream(body(stream, [1]));
    assert.deepEqual([...result.data], [1, 2, 3, 4]); assert.deepEqual(result.words.map(word => word.text), ['Olá', 'world', 'Next']);
    assert.equal(result.words[2].start, 1.6); assert.equal(result.words[2].end, 1.8);
});
test('stream failures, malformed timings and empty audio are visible errors', async () => {
    await assert.rejects(collectFishStream(body('event: error\ndata: {"error":"bad"}\n\n')), /synthesis error/);
    await assert.rejects(collectFishStream(body(event({ alignment: { segments: [] }, chunk_seq: -1, chunk_audio_offset_sec: 0 }))), /invalid alignment/);
    await assert.rejects(collectFishStream(body('data: [DONE]\n\n')), /empty audio/);
});
test('chapter-local alignment handles repeated phrases and never guesses missing or ambiguous cuts', () => {
    const line = (id, text) => ({ id, beat: Number(id), text });
    const words = [{ text: 'Hello', start: .1, end: .3 }, { text: 'Hello', start: .7, end: .9 }];
    const clips = alignChapter([line('0', 'Hello'), line('1', 'Hello')], words, 1);
    assert.ok(clips.every(clip => !clip.review)); assert.equal(clips[1].speechStart, .7);
    const nextChapter = alignChapter([line('0', 'Hello')], [words[0]], 1); assert.equal(nextChapter[0].speechStart, .1);
    assert.ok(alignChapter([line('0', 'Hello world')], [words[0]], 1)[0].review);
    assert.ok(alignChapter([line('0', 'Hello')], words, 1)[0].review);
    assert.ok(alignChapter([line('0', 'Hello')], [{ text: 'Hello', start: 2, end: 1 }], 1)[0].review);
    assert.ok(alignChapter([line('0', 'one'), line('1', 'two')], [{ text: 'one two', start: .2, end: .5 }], 1).every(clip => clip.review));
});
test('silence margins share short gaps, preserve long-gap tails and never overlap', () => {
    const lines = [{ id: 'a', text: 'One' }, { id: 'b', text: 'Two' }];
    let clips = alignChapter(lines, [{ text: 'One', start: .2, end: .4 }, { text: 'Two', start: .5, end: .7 }], 1, { lead: .1, tail: .3 });
    assert.ok(Math.abs(clips[0].end - .475) < 1e-9); assert.equal(clips[0].end, clips[1].start);
    clips = alignChapter(lines, [{ text: 'One', start: .3, end: .5 }, { text: 'Two', start: 2, end: 2.2 }], 3);
    assert.equal(clips[0].end, .7); assert.equal(clips[1].start, 1.8);
    assert.throws(() => approveCut(clips, 'a', .1, 2, 3), /overlaps/);
});

test('em-dash handoffs omit adjacent clip padding across chapters while retaining spoken timestamps and approved cuts', () => {
    const source = 'Nina: "Wait—"\nAshley: "No."\nNina: "Normal."';
    const input = fixture(source, { nina: { voiceId: 'nina' }, ashley: { voiceId: 'ashley' } });
    const originalTokens = structuredClone(input.timeline.beats.map(beat => beat.token));
    const lines = speechSegments(input.timeline, input.registry, 'cutoff');
    assert.deepEqual(lines.map(line => [!!line.cutOff, !!line.followsCutOff]), [[true, false], [false, true], [false, false]]);
    const words = [{ text: 'Wait', start: .2, end: .5 }, { text: 'No', start: 1.2, end: 1.5 }, { text: 'Normal', start: 2.2, end: 2.5 }];
    const clips = alignChapter(lines, words, 3);
    assert.ok(clips.every(clip => !clip.review));
    assert.deepEqual(clips.map(clip => [clip.start, clip.end]), [[0, .5], [1.2, 1.7], [2, 2.7]]);
    assert.deepEqual(clips.map(clip => [clip.speechStart, clip.speechEnd]), words.map(word => [word.start, word.end]));
    input.config.tts.chapterSize = 1;
    const chapters = chapterRequests(lines, input.config.tts);
    assert.equal(alignChapter(chapters[0].lines, [words[0]], 1)[0].end, .5);
    assert.equal(alignChapter(chapters[1].lines, [words[1]], 2)[0].start, 1.2);
    const approved = approveCut(clips, lines[0].id, .1, .6, 3);
    assert.deepEqual(applyMargins([approved], words, 3, { lead: 1, tail: 1 })[0], approved);
    const review = { ...clips[0], review: true };
    assert.deepEqual(applyMargins([review], words, 3)[0], review);
    assert.deepEqual(input.timeline.beats.map(beat => beat.token), originalTokens);
    assert.equal(input.timeline.beats[lines[0].beat].token.text.trim(), '"Wait—"');
});

test('cutoff lead trimming never skips intervening silent beats or treats thoughts/narration as interruptions', () => {
    for (const middle of ['A door opens.', 'Nina: "(Think.)"', 'Mute: "Wait."']) {
        const input = fixture(`Nina: "Wait—"\n${middle}\nNina: "Next."`);
        const lines = speechSegments(input.timeline, input.registry, 'cutoff');
        assert.equal(lines[0].cutOff, true); assert.equal(lines.at(-1).followsCutOff, undefined);
    }
    const input = fixture('Narrator: "Silence—"\nNina: "(Wait—)"\nNina: "Next."', { narrator: { voiceId: 'story' }, nina: { voiceId: 'nina' } });
    const lines = speechSegments(input.timeline, input.registry, 'cutoff', { narratorEnabled: true });
    assert.ok(lines.every(line => !line.cutOff && !line.followsCutOff));
});
test('PCM assembly uses actual sample counts and WAV exports contain real PCM', () => {
    const joined = joinPCM([{ original: Float32Array.of(.1, .2) }, { original: Float32Array.of(.3) }]);
    assert.equal(joined.length, 3); assert.ok(Math.abs(joined[2] - .3) < 1e-6);
    const wav = wavBytes(joined); assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
    assert.equal(new DataView(wav.buffer).getUint32(24, true), SAMPLE_RATE); assert.equal(wav.length, 50);
});
test('audio finishing matches whisper volume while preserving original PCM, count and peak ceiling', () => {
    const original = Float32Array.from({ length: SAMPLE_RATE }, (_, i) => .005 * Math.sin(2 * Math.PI * 200 * i / SAMPLE_RATE));
    const before = original.slice(), clip = { start: 0, end: 1, speechStart: .1, speechEnd: .9, review: false };
    const result = finishClip(original, clip, { ...SPEECH_DEFAULTS, denoise: 0, edgeFade: 0 });
    const level = Math.sqrt(result.samples.reduce((sum, x) => sum + x * x, 0) / result.samples.length);
    // ±24 dB gain limit intentionally caps this unusually quiet fixture.
    assert.ok(level > .04 && level < .1); assert.deepEqual(original, before); assert.equal(result.samples.length, original.length);
    assert.ok(result.samples.every(sample => Math.abs(sample) <= 10 ** (-1.5 / 20)));
    const silent = finishClip(new Float32Array(SAMPLE_RATE), clip, SPEECH_DEFAULTS); assert.ok(silent.samples.every(sample => sample === 0)); assert.match(silent.notes.join(' '), /silent/);
    assert.equal(noiseProfile(Float32Array.from({ length: SAMPLE_RATE }, () => .5), []), null);
    assert.match(finishClip(original, clip, SPEECH_DEFAULTS).notes.join(' '), /Denoising skipped/);
});
test('calm tags and old global jitter cannot shake text; intense tags respect motion preferences', () => {
    const config = settings(); config.typewriterJitter = 3;
    for (const emotion of ['happy', 'smug', 'nervous', 'uneasy', 'laugh', 'default']) assert.equal(shouldShakeText(emotion, config), false);
    assert.equal(shouldShakeText('RAGE', config), true); config.reducedMotion = true; assert.equal(shouldShakeText('rage', config), false);
});
test('speech configuration drops credentials and old theme defaults migrate to ST inheritance', () => {
    const config = loadSettings({ extensionSettings: { visual_novel_plus: { textColor: '#f4f1fa', narrationColor: '#ddd5ea', dialogueFont: 'faustina', tts: { apiKey: 'DO_NOT_PERSIST', model: 's2.1-pro-free' } } } });
    assert.equal(config.tts.apiKey, undefined); assert.equal(config.textColor, ''); assert.equal(config.dialogueFont, '');
    assert.ok(!JSON.stringify(config).includes('DO_NOT_PERSIST'));
});
test('completed chapters survive later failures, explicit resume and cached rerenders without duplicate synthesis', async () => {
    const input = fixture('Nina: "Hello"\nNina: "Hello"'); input.config.tts.chapterSize = 1; let posts = 0;
    const engine = engineFor(input, async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true });
        const payload = JSON.parse(options.body); assert.equal(payload.model, 's2.1-pro-free');
        if (++posts === 2) return Response.json({ error: 'Service busy' }, { status: 503 }); return response(simpleStream());
    });
    const first = await engine.generate(); assert.equal(first.status, 'failed'); assert.equal(first.chapters.length, 1); assert.equal(posts, 2);
    const final = await engine.generate(); assert.equal(final.status, 'complete'); assert.equal(final.chapters.length, 2); assert.equal(posts, 3);
    assert.equal(final.chapters[1].offsetSamples, SAMPLE_RATE); assert.notEqual(final.chapters[0].words[0].chunk, final.chapters[1].words[0].chunk);
    engine.prepare('chat:message:swipe', input.timeline, input.registry); await engine.generate(); assert.equal(posts, 3); engine.dispose();
});
test('cancelling an unfinished chapter preserves earlier chapters and never appends partial audio', async () => {
    const input = fixture('Nina: "Hello"\nNina: "Hello"'); input.config.tts.chapterSize = 1;
    let posts = 0, started; const ready = new Promise(resolve => started = resolve);
    const engine = engineFor(input, async (url, options) => {
        if (url.endsWith('/status')) return Response.json({ configured: true });
        if (++posts === 1) return response(simpleStream());
        return new Response(new ReadableStream({ start(controller) { options.signal.addEventListener('abort', () => controller.error(new DOMException('Cancelled', 'AbortError')), { once: true }); started(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
    });
    const generation = engine.generate(); await ready; engine.cancel(); const result = await generation;
    assert.equal(result.status, 'cancelled'); assert.equal(result.chapters.length, 1); assert.equal(posts, 2); engine.dispose();
});
test('backend validates voice IDs and model, strips unknown fields and never falls back to a paid model', () => {
    const input = fixture('Nina: "Hello"'), request = chapterRequests(speechSegments(input.timeline, input.registry, 'scene'), input.config.tts)[0];
    const good = validateRequest({ model: 's2.1-pro-free', body: { ...request.body, apiKey: 'DROP_ME' } }); assert.equal(good.body.apiKey, undefined);
    assert.throws(() => validateRequest({ model: '', body: request.body }), /explicitly/);
    assert.throws(() => validateRequest({ model: 's2.1-pro-free', body: { ...request.body, reference_id: ['https://fish.audio/m/id'] } }), /voice IDs/);
});
test('late events from an obsolete voice clip cannot stop a newer clip', async () => {
    const input = fixture('Nina: "Hello"');
    const engine = engineFor(input, async url => url.endsWith('/status') ? Response.json({ configured: true }) : response(simpleStream()), {
        audioFactory: () => ({ paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} }),
    });
    await engine.generate(); const id = engine.prepared.segments[0].id; await engine.play(id, false);
    const obsolete = engine.audio, oldEnd = obsolete.onended, oldError = obsolete.onerror;
    await engine.play(id, false); const current = engine.audio; oldEnd(); oldError();
    assert.equal(engine.audio, current); assert.equal(current.paused, false); assert.equal(obsolete.paused, true); engine.dispose();
});
test('server bridge saves a per-user secret and exposes only configured status', async () => {
    const routes = new Map(), router = Object.fromEntries(['get', 'post', 'delete'].map(method => [method, (url, callback) => routes.set(`${method}:${url}`, callback)]));
    const stored = new Map(), secrets = { writeSecret: (directories, key, value) => stored.set(`${directories.secrets}:${key}`, value), readSecret: (directories, key) => stored.get(`${directories.secrets}:${key}`), deleteSecret: (directories, key) => stored.delete(`${directories.secrets}:${key}`) };
    registerBridge(router, secrets, async () => { throw new Error('No real provider calls in tests'); });
    const res = () => ({ status() { return this; }, json(value) { this.value = value; }, sendStatus(value) { this.value = value; } });
    const request = { user: { directories: { secrets: 'user-one' } }, body: { value: 'FAKE_TEST_KEY' } }, saved = res();
    routes.get('post:/secret')(request, saved); assert.deepEqual(saved.value, { configured: true });
    const status = res(); routes.get('get:/status')(request, status); assert.equal(status.value.configured, true); assert.ok(!JSON.stringify(status.value).includes('FAKE_TEST_KEY'));
    const other = res(); routes.get('get:/status')({ user: { directories: { secrets: 'user-two' } } }, other); assert.equal(other.value.configured, false);
    const removed = res(); routes.get('delete:/secret')(request, removed); assert.equal(stored.has(`user-one:${SECRET_KEY}`), false);
});
test('server bridge forwards the timestamp stream with a server-only key and limits each user to five requests', async () => {
    const routes = new Map(), router = Object.fromEntries(['get', 'post', 'delete'].map(method => [method, (url, callback) => routes.set(`${method}:${url}`, callback)]));
    const input = fixture('Nina: "Hello"'), chapter = chapterRequests(speechSegments(input.timeline, input.registry, 'scene'), input.config.tts)[0];
    const makeRequest = () => Object.assign(new EventEmitter(), { user: { directories: { secrets: 'user-one' } }, body: { model: 's2.1-pro-free', body: chapter.body } });
    const makeResponse = () => Object.assign(new EventEmitter(), { chunks: [], headersSent: false, statusCode: 200,
        status(value) { this.statusCode = value; return this; }, json(value) { this.value = value; }, sendStatus(value) { this.statusCode = value; },
        set(value) { this.headers = value; }, flushHeaders() { this.headersSent = true; }, write(chunk) { this.chunks.push(chunk); return true; }, end() { this.ended = true; } });
    let captured;
    registerBridge(router, { readSecret: () => 'FAKE_SERVER_KEY' }, async (url, options) => { captured = { url, options }; return response(simpleStream()); });
    const result = makeResponse(); await routes.get('post:/synthesize')(makeRequest(), result);
    assert.equal(captured.url, 'https://api.fish.audio/v1/tts/stream/with-timestamp');
    assert.equal(captured.options.headers.Authorization, 'Bearer FAKE_SERVER_KEY'); assert.equal(captured.options.headers.model, 's2.1-pro-free');
    assert.equal(captured.options.redirect, 'error'); assert.equal(result.headers['Cache-Control'], 'no-store'); assert.ok(result.ended);
    const returned = result.chunks.map(chunk => new TextDecoder().decode(chunk)).join(''); assert.ok(!returned.includes('FAKE_SERVER_KEY'));
    let started; const ready = new Promise(resolve => started = resolve);
    registerBridge(router, { readSecret: () => 'FAKE_SERVER_KEY' }, async (_, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }); started();
    }));
    const requests = Array.from({ length: 5 }, makeRequest), results = requests.map(makeResponse);
    const pending = requests.map((request, index) => routes.get('post:/synthesize')(request, results[index])); await ready;
    const sixth = makeResponse(); await routes.get('post:/synthesize')(makeRequest(), sixth); assert.equal(sixth.statusCode, 429);
    requests.forEach(request => request.emit('aborted')); await Promise.all(pending); assert.ok(results.every(result => result.statusCode === 502));
});
