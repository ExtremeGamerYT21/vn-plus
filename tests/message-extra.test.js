import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../integration.js';
import { messageRevision, jsonData } from '../core/message-extra.js';
import { ChatStatePublisher } from '../core/shared-state.js';
import { parsePOV } from '../core/vn-parser.js';

const message = text => ({ mes: `PRIVATE_CANONICAL\n/////\n${text}`, extra: { unrelated: { keep: true } } });
function fixture(...texts) {
    let saves = 0;
    const context = { chatId: 'A', characterId: 0, chat: texts.map(message), chatMetadata: { variables: { unrelated: 'keep', vn_plus: 'old', vn_plus_time: 'old' } }, async saveChat() { saves++; }, saveMetadataDebounced() {} };
    const host = createHost(() => context);
    return { context, host, store: host.extra, get saves() { return saves; }, session(index, beat, id = 'diary', environment = 'test') {
        return host.extra.artifactSession({ index, beat, id, environment, scene: () => ({ available: true, environment: { id: environment }, characters: [], active: true, scene: { time: '12:26' } }) });
    } };
}
test('VN snapshots and scalar variables persist under message extra without changing prose or unrelated data', async t => {
    const f = fixture('Hello.'); t.after(() => f.store.dispose()); const original = f.context.chat[0].mes;
    const publisher = new ChatStatePublisher(f.host); publisher.bind({ id: 'test', name: 'Test' });
    const value = { ...publisher.snapshot, available: true, scene: { time: '12:26' } }; publisher.commit(value, publisher.begin());
    await publisher.binding.flush();
    const extra = f.context.chat[0].extra.vn_plus;
    assert.equal(extra.context.scene.time, '12:26'); assert.equal(extra.variables.vn_plus_time, '12:26'); assert.equal(extra.revision, messageRevision(f.context.chat[0]));
    assert.equal(f.context.chat[0].mes, original); assert.deepEqual(f.context.chat[0].extra.unrelated, { keep: true }); assert.deepEqual(f.context.chatMetadata.variables, { unrelated: 'keep' }); assert(f.saves > 0);
});
test('artifact set/get/delete survive reload and reads return independent copies', async t => {
    const f = fixture('Diary.'); t.after(() => f.store.dispose()); const session = f.session(0, 2);
    await session.request('set', { key: 'entries', value: [{ text: 'lol' }] });
    const copy = session.read(); copy.data.entries[0].text = 'changed'; assert.equal(session.read().data.entries[0].text, 'lol');
    f.context.chat = JSON.parse(JSON.stringify(f.context.chat)); const restored = f.session(0, 2); assert.equal(restored.read().data.entries[0].text, 'lol');
    await restored.request('delete', { key: 'entries' }); assert.equal(Object.hasOwn(restored.read().data, 'entries'), false);
    await restored.request('push', { key: 'entries', value: { text: 'first' } }); await restored.request('push', { key: 'entries', value: { text: 'second' } });
    assert.deepEqual(restored.read().data.entries.map(entry => entry.text), ['first', 'second']);
});
test('artifact history follows message and paragraph order, with isolated names and environments', async t => {
    const f = fixture('First.'); t.after(() => f.store.dispose()); await f.session(0, 1).request('set', { key: 'text', value: 'first' });
    await f.session(0, 4).request('set', { key: 'text', value: 'later' });
    assert.equal(f.session(0, 1).read().data.text, 'first'); assert.equal(f.session(0, 4).read().data.text, 'later');
    assert.deepEqual(Object.keys(f.session(0, 4, 'watch').read().data), []); assert.deepEqual(Object.keys(f.session(0, 4, 'diary', 'other').read().data), []);
    await assert.rejects(f.session(0, 2).request('set', { key: 'text', value: 'past' }), /Later artifact/);
    f.context.chat.push(message('Second.')); assert.equal(f.session(1, 0).read().data.text, 'later');
    await assert.rejects(f.session(0, 4).request('set', { key: 'text', value: 'past message' }), /Past messages/);
});
test('a branch inherits its prefix and first write truncates its copied future without editing the parent', async t => {
    const f = fixture('Diary.'); t.after(() => f.store.dispose()); await f.session(0, 1).request('set', { key: 'text', value: 'shared' }); await f.session(0, 4).request('set', { key: 'text', value: 'parent future' });
    const parent = JSON.stringify(f.context.chat);
    f.context.chat = JSON.parse(parent); f.context.chatId = 'Branch'; await f.session(0, 2).request('set', { key: 'text', value: 'branch choice' });
    assert.equal(f.session(0, 9).read().data.text, 'branch choice'); assert.equal(f.context.chat[0].extra.vn_plus.revisions[messageRevision(f.context.chat[0])].events.length, 2);
    f.context.chat = JSON.parse(parent); f.context.chatId = 'A'; assert.equal(f.session(0, 9).read().data.text, 'parent future');
});
test('edits select their own revision and restoring original text recovers its artifact history', async t => {
    const f = fixture('Original.'); t.after(() => f.store.dispose()); const original = f.context.chat[0].mes; const old = f.session(0, 0);
    await old.request('set', { key: 'text', value: 'original entry' }); f.context.chat[0].mes = 'SECRET\n/////\nEdited.';
    await assert.rejects(old.request('set', { key: 'text', value: 'stale' }), /expired/);
    assert.equal(f.session(0, 0).read().data.text, undefined); await f.session(0, 0).request('set', { key: 'text', value: 'edited entry' });
    f.context.chat[0].mes = original; assert.equal(f.session(0, 0).read().data.text, 'original entry');
});
test('a chat rename keeps its future while a fresh branch integrity ID permits an independent fork', async t => {
    const f = fixture('Diary.'); t.after(() => f.store.dispose()); f.context.chatMetadata.integrity = 'parent-integrity';
    await f.session(0, 1).request('push', { key: 'entries', value: 'shared' }); await f.session(0, 4).request('push', { key: 'entries', value: 'parent future' });
    f.context.chatId = 'Renamed'; await assert.rejects(f.session(0, 2).request('push', { key: 'entries', value: 'past' }), /Later artifact/);
    const parent = structuredClone(f.context.chat); f.context.chat = structuredClone(parent); f.context.chatMetadata.integrity = 'fork-integrity'; f.context.chatId = 'Fork';
    await f.session(0, 2).request('push', { key: 'entries', value: 'branch choice' }); assert.deepEqual(f.session(0, 9).read().data.entries, ['shared', 'branch choice']);
    assert.equal(parent[0].extra.vn_plus.revisions[messageRevision(parent[0])].events.length, 2);
});
test('new swipes with copied extra get distinct identities and updates mirror only the active swipe', async t => {
    const f = fixture('Same text.'); t.after(() => f.store.dispose()); const item = f.context.chat[0];
    item.swipe_id = 0; item.swipes = [item.mes, item.mes]; item.swipe_info = [{ extra: { other: 1 } }, { extra: { other: 2 } }];
    await f.session(0, 0).request('set', { key: 'text', value: 'swipe zero' }); const first = structuredClone(item.extra), variant = first.vn_plus.variantId;
    item.swipe_id = 1; item.extra = structuredClone(first); // ST can carry custom extra into a new alternative.
    assert.equal(f.session(0, 0).read().data.text, undefined); await f.session(0, 0).request('set', { key: 'text', value: 'swipe one' });
    assert.notEqual(item.extra.vn_plus.variantId, variant); assert.equal(item.swipe_info[1].extra.other, 2);
    item.swipe_id = 0; item.extra = structuredClone(item.swipe_info[0].extra); assert.equal(f.session(0, 0).read().data.text, 'swipe zero');
});
test('late sessions and publishers cannot write after chat switches, deletion, source edits or invalidation', async t => {
    const f = fixture('Hello.'); t.after(() => f.store.dispose()); const binding = f.store.capture(0), session = f.session(0, 0);
    f.context.chatId = 'B'; assert.equal(binding.write('context', { test: 1 }), false); await assert.rejects(session.request('set', { key: 'text', value: 'stale' }), /expired/);
    f.context.chatId = 'A'; f.context.chat = [message('Hello.')]; assert.equal(binding.write('context', { test: 1 }), false);
    let active = true; const current = f.store.artifactSession({ index: 0, beat: 0, environment: 'test', id: 'diary', scene: () => ({}), alive: () => active });
    active = false; await assert.rejects(current.request('set', { key: 'text', value: 'stale' }), /expired/);
});
test('invalid data and failed historical writes leave saved event history unchanged', async t => {
    const f = fixture('Hello.'); t.after(() => f.store.dispose()); const session = f.session(0, 2); await session.request('set', { key: 'text', value: 'good' });
    const before = JSON.stringify(f.context.chat[0].extra);
    for (const value of [undefined, NaN, new Date(), JSON.parse('{"__proto__":1}'), 'x'.repeat(262145), '🎲'.repeat(70000)]) await assert.rejects(session.request('set', { key: 'text', value }));
    await assert.rejects(session.request('set', { key: 123, value: 'bad key' }), /Invalid artifact/); await assert.rejects(session.request('set', null), /Invalid artifact/);
    await assert.rejects(f.session(0, 1).request('set', { key: 'text', value: 'bad past' })); assert.equal(JSON.stringify(f.context.chat[0].extra), before);
    assert.throws(() => jsonData({ nested: new Map() }), /JSON/);
});
test('named interactive fences carry artifact identity without rendering the fence label as text', () => {
    const parsed = parsePOV('```html interactive id=diary\n<div>Diary</div>\n```');
    assert.equal(parsed.tokens[0].id, 'diary'); assert.equal(parsed.tokens[0].interactive, true); assert.equal(parsed.tokens[0].type, 'artifact');
    assert.deepEqual(parsePOV('#ARTIFACT diary').tokens[0], { type: 'artifact', id: 'diary', local: true, interactive: true, line: 1 });
    assert.equal(parsePOV('#ARTIFACT ../outside').tokens.length, 0);
});
