import test from 'node:test';
import assert from 'node:assert/strict';
import { VNController } from '../controller.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { chatIdentity } from '../core/message-reader.js';
import { CharacterRegistry } from '../core/character-registry.js';

function fixture() {
    const context = { chatId: 'automatic', characterId: 0, chat: [{ mes: 'PRIVATE\n/////\nNina: "Hello."' }] };
    const controller = Object.create(VNController.prototype), calls = [];
    Object.assign(controller, { host: { context: () => context }, settings: structuredClone(DEFAULT_SETTINGS),
        root: { hidden: true }, selected: 0, followLatest: true, chatId: chatIdentity(context), generation: 0,
        speech: { requestAutomatic() { calls.push('generate'); } }, log(message) { calls.push(['log', message]); },
        async open(index) { calls.push(['open', index]); this.selected = index; this.root.hidden = false; this.followLatest = index === context.chat.length - 1; this.observedSource = this.sourceFingerprint(context); },
        async prepareSpeech(index) { calls.push(['prepare', index]); },
    });
    return { context, controller, calls, async tick() { await controller.checkSource(); await controller.checkSource(); } };
}

test('automatic opening follows a stable completed POV without reading document visibility', async () => {
    const h = fixture(); h.controller.settings.automaticPlayback = true;
    // There is no document in this Node process. Visibility must not gate the pipeline.
    await h.tick(); assert.deepEqual(h.calls, [['open', 0]]);
    await h.tick(); assert.equal(h.calls.length, 1);
    h.context.chat.push({ mes: 'PRIVATE\n/////\nNina: "Next."' });
    await h.tick(); assert.deepEqual(h.calls.at(-1), ['open', 1]);
});

test('automatic voices prepare the latest response with VN closed and automatic opening off', async () => {
    const h = fixture(); Object.assign(h.controller.settings.tts, { enabled: true, autoGenerate: true });
    h.context.chat.push({ mes: 'PRIVATE\n/////\nNina: "Latest."' });
    await h.tick(); assert.deepEqual(h.calls, [['prepare', 1], 'generate']); assert.ok(h.controller.root.hidden);
    await h.tick(); assert.equal(h.calls.length, 2);
});

test('disabled automatic modes disabled extension and active generation cannot trigger work', async () => {
    for (const configure of [() => {}, c => { c.settings.tts.autoGenerate = true; }, c => { c.settings.automaticPlayback = true; c.settings.enabled = false; },
        c => { c.settings.automaticPlayback = true; c.busy = true; }, c => { c.settings.automaticPlayback = true; c.disposed = true; }]) {
        const h = fixture(); configure(h.controller); await h.tick(); assert.deepEqual(h.calls, []);
    }
});

test('missing empty and unfinished POVs wait until valid replacement rather than generating partial dialogue', async () => {
    const h = fixture(); h.controller.settings.automaticPlayback = true;
    for (const mes of ['PRIVATE', 'PRIVATE\n/////\n', 'PRIVATE\n/////\nNina: "Complete."\nNina: "Still writing',
        'PRIVATE\n/////\nNina: "Complete."\n```html\n<div>Unclosed']) {
        h.context.chat[0].mes = mes; await h.tick(); assert.deepEqual(h.calls, [], mes);
    }
    h.context.chat[0].mes = 'PRIVATE\n/////\nNina: "Final."'; await h.tick(); assert.deepEqual(h.calls, [['open', 0]]);
});

test('a changing transformer revision must settle again and overlapping checks share one preparation', async () => {
    const h = fixture(); h.controller.settings.automaticPlayback = true;
    await h.controller.checkSource(); h.context.chat[0].mes = 'PRIVATE\n/////\nNina: "Changed."';
    await h.controller.checkSource(); assert.deepEqual(h.calls, []);
    let release; h.controller.open = async index => { h.calls.push(['open', index]); await new Promise(resolve => release = resolve); };
    const pending = h.controller.checkSource(); await h.controller.checkSource(); await h.controller.checkSource();
    assert.deepEqual(h.calls, [['open', 0]]); release(); await pending; assert.equal(h.controller.sourceChecking, false);
});

test('visible historical playback retains its selected scene while later responses arrive', async () => {
    const h = fixture(); h.controller.root.hidden = false; h.controller.followLatest = false;
    h.controller.observedSource = h.controller.sourceFingerprint();
    h.context.chat.push({ mes: 'PRIVATE\n/////\nNina: "Latest."' }); await h.tick(); assert.deepEqual(h.calls, []);
    h.context.chat[0].mes = 'PRIVATE\n/////\nNina: "Edited history."'; await h.tick(); assert.deepEqual(h.calls, [['open', 0]]);
});

test('deferred speech preparation rejects changed chat source swipe registry generation or disposal', async () => {
    for (const change of [h => { h.context.chatId = 'another'; }, h => { h.context.chat[0].mes += ' Changed.'; }, h => { h.context.chat[0].swipe_id = 1; },
        h => { h.controller.registry = {}; }, h => { h.controller.generation++; }, h => { h.controller.disposed = true; }]) {
        const h = fixture(), prepared = []; let release;
        h.controller.environment = { id: 'test' };
        h.controller.registry = new CharacterRegistry({ inventory: {}, json: async () => null }, h.controller.settings);
        h.controller.registry.prepare = async () => new Promise(resolve => release = resolve);
        h.controller.speech.prepare = (...args) => prepared.push(args);
        const promise = VNController.prototype.prepareSpeech.call(h.controller, 0); change(h); release();
        await assert.rejects(promise, /scene changed/); assert.equal(prepared.length, 0);
    }
});

test('even an already open scene cannot send completed lines ahead of an unfinished quote or artifact', () => {
    const h = fixture(), messages = []; let cleared = 0, prepared = 0, generated = 0;
    h.controller.speech = { clearScene() { cleared++; }, notify(value) { messages.push(value); }, prepare() { prepared++; }, requestAutomatic() { generated++; } };
    for (const message of ['Incomplete quoted dialogue withheld.', 'Unclosed artifact/code block withheld until complete.']) {
        h.controller.prepareSceneSpeech({}, {}, { errors: [{ message }] });
    }
    assert.equal(cleared, 2); assert.equal(prepared, 0); assert.equal(generated, 0);
    assert.ok(messages.every(value => value.includes('unfinished')));
});

test('generation completion can prepare an unchanged scene after its parser reference was reset', () => {
    const h = fixture(); let prepared = 0, generated = 0;
    h.controller.speechSceneId = () => 'restored-scene';
    h.controller.speech = { clearScene() { assert.fail('Completed POV was rejected'); }, notify() {}, prepare() { prepared++; }, requestAutomatic() { generated++; } };
    h.controller.prepareSceneSpeech({ pov: 'Nina: "Hello."' }, {}, null);
    assert.equal(prepared, 1); assert.equal(generated, 1);
});
