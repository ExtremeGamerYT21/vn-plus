import test from 'node:test';
import assert from 'node:assert/strict';
import { BeatScheduler, resolveReaction, estimateTiming, objectDuration, applyCommandState } from '../core/narrative-timing.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { Playback } from '../core/playback.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { contextEntries, reduceContext } from '../core/context-state.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
const settings = { ...structuredClone(DEFAULT_SETTINGS), autoAdvance: true, reducedMotion: true };
const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
const compile = text => compileTimeline(parsePOV(text).tokens, registry, settings);

test('visual grammar validates local IDs and keeps close reaction directions out of asset names', () => {
    const { tokens, errors } = parsePOV('#VISUAL see_watch\nHenry: "Go!" [calling]\n#VISUAL CLOSE see_watch [closes the watch quickly]\n#VISUAL ../secret\n#VISUAL CLOSE\n#SFX door [scared]');
    assert.equal(errors.length, 2);
    assert.deepEqual(tokens[2], { type: 'command', name: 'VISUAL', args: 'CLOSE see_watch', reaction: 'closes the watch quickly', line: 3 });
    assert.equal(tokens.at(-1).reaction, 'scared');
    assert.equal(tokens.some(token => token.args?.includes('../')), false);
});
test('reaction aliases and natural language resolve locally; unknown and negated tags use normal', () => {
    for (const [tag, category, via] of [['quickly', 'hurried', 'alias'], ['closes the watch quickly', 'hurried', 'pattern'], ['drops it in fear', 'scared', 'pattern'], ['takes his time', 'lazy', 'pattern'], ['puts it away casually', 'bored', 'pattern'], ['gently', 'normal', 'default'], ['not hurried', 'normal', 'default']]) {
        assert.equal(resolveReaction(tag).category, category); assert.equal(resolveReaction(tag).via, via);
    }
    assert.equal(resolveReaction('scared').anchor, 'start');
    assert.ok(resolveReaction('hurried').animation < resolveReaction('lazy').animation);
});
test('silent dialogue uses visible character count and configured seconds, thoughts remain silent', () => {
    assert.deepEqual(estimateTiming({ type: 'dialogue', text: '"Hi!"' }, settings), { duration: 300, rule: 'dialogue' });
    assert.equal(estimateTiming({ type: 'dialogue', text: '**Hi!**', thought: true }, { dialogueSecondsPerCharacter: .2 }).duration, 600);
    assert.equal(estimateTiming({ type: 'artifact', html: 'Hi!' }, settings), null);
    assert.equal(estimateTiming({ type: 'narration', text: '…' }, settings), null);
    assert.equal(estimateTiming({ type: 'dialogue', text: '😱' }, settings).duration, 100);
});
test('narration uses reading and explicit action rules; visual inspection requires a paired close', () => {
    const token = { type: 'narration', text: 'You check the watch.', line: 2 };
    assert.equal(estimateTiming(token, settings).rule, 'narration:reading');
    const check = estimateTiming(token, settings, ['see_watch']);
    assert.equal(check.rule, 'object:watch'); assert.ok(check.duration >= 4000 && check.duration <= 7000);
    assert.deepEqual(check, estimateTiming(token, settings, ['see_watch']));
    assert.equal(estimateTiming({ ...token, text: 'Rain falls.' }, settings, ['see_watch']).rule, 'narration:reading');
    assert.equal(estimateTiming({ ...token, text: 'You wait for 5 seconds.' }, settings).duration, 5000);
    assert.equal(objectDuration('strange_orb', 'You inspect it.'), null);
    assert.equal(estimateTiming(token, settings, ['see_watch', 'newspaper']).rule, 'object:watch');
    assert.equal(estimateTiming({ ...token, text: 'You inspect it.' }, settings, ['see_watch', 'newspaper']).rule, 'narration:reading');
});
test('trailing commands share the dialogue beat, keep the opening state and execute one-shots once', () => {
    const timeline = compile('#VISUAL see_watch\nYou inspect the watch.\nHenry: "Go!" [calling]\n#VISUAL CLOSE see_watch [hurried]\n#SFX click\nYou turn toward your father.');
    const play = new Playback(timeline), first = play.forward(), speech = play.forward();
    assert.deepEqual(first.beat.visualChecks, ['see_watch']);
    assert.deepEqual(Object.keys(speech.beat.state.visuals), ['see_watch']);
    assert.deepEqual(speech.attached.map(item => item.token.name), ['VISUAL', 'SFX']);
    assert.equal(speech.attached[1].oneShots.length, 1);
    assert.deepEqual(play.forward().effects, []); // attached SFX cannot fire again next paragraph
    play.back(); play.back();
    assert.equal(play.forward().attached[1].oneShots.length, 0);
    play.replay(); assert.equal(play.forward().attached[1].oneShots.length, 1);
    assert.equal(Object.keys(timeline.finalState.visuals).length, 0);
    const resumed = new Playback(timeline, new Set([speech.beat.index])); resumed.resume(1);
    assert.deepEqual(resumed.forward().effects, []);
});
test('unpaired visuals persist across context history; close and reset remove them without HTML retention', () => {
    const chat = [{ mes: 'secret\n/////\n#VISUAL see_watch\nYou look around.' }, { mes: 'secret\n/////\nHenry: "Hi."' }];
    let state = reduceContext(contextEntries({ chat }), registry, settings);
    assert.deepEqual(Object.keys(state.visuals), ['see_watch']);
    assert.deepEqual(compile('#VISUAL see_watch\nYou check it.').beats.find(beat => beat.token.type === 'narration').visualChecks, []);
    chat.push({ mes: 'secret\n/////\n#VISUAL CLOSE see_watch\nYou leave.' });
    state = reduceContext(contextEntries({ chat }), registry, settings); assert.deepEqual(state.visuals, {});
    assert.deepEqual(compile('#VISUAL see_watch\n#SCENE RESET\nYou leave.').finalState.visuals, {});
});
test('a visual without prose or a matching close opens as an untimed interaction beat', () => {
    const timeline = compile('#VISUAL see_watch');
    assert.equal(timeline.views.length, 1);
    const beat = timeline.beats[timeline.views[0]];
    assert.equal(beat.token.type, 'interaction'); assert.equal(estimateTiming(beat.token, settings), null);
    assert.deepEqual(Object.keys(beat.state.visuals), ['see_watch']);
});
test('commands with different reaction times patch only their own changed fields', () => {
    const timeline = compile('#VISUAL see_watch\nHenry: "Go!"\n#BACKGROUND street [lazy]\n#VISUAL CLOSE see_watch [scared]\nYou leave.');
    const speech = timeline.beats[timeline.views[0]], [background, close] = speech.attached;
    let state = applyCommandState(speech.state, background.state, close.state);
    assert.equal(state.background, null); assert.deepEqual(state.visuals, {});
    state = applyCommandState(state, speech.state, background.state);
    assert.equal(state.background, 'street'); assert.deepEqual(state.visuals, {});
});

function harness(extra = {}) {
    let now = 0, timer, advanced = 0, commands = [];
    const scheduler = new BeatScheduler({ now: () => now, set: fn => { timer = fn; return 1; }, clear: () => timer = null });
    const options = { token: { type: 'dialogue', text: 'Hello' }, settings, commands: [{ token: { reaction: 'hurried' } }], onCommand: (command, profile) => commands.push(profile.category), onAdvance: () => advanced++, canAdvance: () => true, ...extra };
    scheduler.start(options);
    return { scheduler, options, step(ms) { now += ms; const fn = timer; timer = null; fn?.(); }, get commands() { return commands; }, get advanced() { return advanced; }, get pending() { return !!timer; } };
}
test('unvoiced scheduling waits for estimated duration plus reaction delay and advances once', () => {
    const clock = harness(); clock.step(499); assert.deepEqual(clock.commands, []);
    clock.step(180); assert.equal(clock.advanced, 0); clock.step(1);
    assert.deepEqual(clock.commands, ['hurried']); assert.equal(clock.advanced, 1); assert.equal(clock.pending, false);
});
test('voiced timing waits during loading and stalled audio, using actual PCM duration and end event', () => {
    const playback = { status: 'loading', duration: 2, clip: { start: 5, end: 8 }, audio: { currentTime: 0 } };
    const clock = harness({ playback }); clock.step(5000); assert.equal(clock.advanced, 0);
    playback.status = 'playing'; playback.audio.currentTime = 1.9; clock.step(1000);
    clock.step(5000); assert.deepEqual(clock.commands, []); // stalled audio clock
    playback.status = 'ended'; clock.step(20); clock.step(160);
    assert.deepEqual(clock.commands, ['hurried']); assert.equal(clock.advanced, 1);
});
test('scared reactions occur near voice start while end reactions wait until the voice finishes', () => {
    const playback = { status: 'loading', duration: 3, audio: { currentTime: 0 } };
    const clock = harness({ playback, commands: [{ token: { reaction: 'scared' } }, { token: { reaction: 'lazy' } }] });
    clock.step(10000); assert.deepEqual(clock.commands, []);
    playback.status = 'playing'; playback.audio.currentTime = .08; clock.step(20); assert.deepEqual(clock.commands, ['scared']);
    playback.audio.currentTime = 2.9; clock.step(2000); assert.deepEqual(clock.commands, ['scared']);
    playback.status = 'ended'; clock.step(20); clock.step(1779); assert.equal(clock.advanced, 0);
    clock.step(1); assert.deepEqual(clock.commands, ['scared', 'lazy']); assert.equal(clock.advanced, 1);
});
test('manual mode still performs reactions but no rule never advances, and navigation cancels stale work', () => {
    const manual = harness({ settings: { ...settings, autoAdvance: false } }); manual.step(5000); assert.deepEqual(manual.commands, ['hurried']); assert.equal(manual.advanced, 0);
    const unknown = harness({ token: { type: 'pause' }, commands: [] }); unknown.step(60000); assert.equal(unknown.advanced, 0);
    const cancelled = harness(); cancelled.scheduler.cancel(); cancelled.step(60000); assert.deepEqual(cancelled.commands, []); assert.equal(cancelled.advanced, 0);
    const invalid = harness({ valid: () => false }); invalid.step(60000); assert.equal(invalid.pending, false);
    manual.scheduler.cancel(); unknown.scheduler.cancel();
});
test('inspector pause holds reactions, fallback handles failed voice and text reveal gates advance', () => {
    let paused = true, ready = false;
    const clock = harness({ paused: () => paused, canAdvance: () => ready, playback: { status: 'failed' } });
    clock.step(10000); assert.deepEqual(clock.commands, []); paused = false;
    clock.step(680); assert.deepEqual(clock.commands, ['hurried']); assert.equal(clock.advanced, 0);
    ready = true; clock.step(20); assert.equal(clock.advanced, 1);
});
test('Auto allows the visual close animation to finish; manual continuation flushes reactions only once', () => {
    const clock = harness({ settings: { ...settings, reducedMotion: false } });
    clock.step(680); assert.deepEqual(clock.commands, ['hurried']); assert.equal(clock.advanced, 0);
    clock.step(159); assert.equal(clock.advanced, 0); clock.step(1); assert.equal(clock.advanced, 1);
    const manual = harness({ settings: { ...settings, autoAdvance: false } }); manual.scheduler.finishCommands(); manual.scheduler.finishCommands();
    assert.deepEqual(manual.commands, ['hurried']); manual.scheduler.cancel();
});
