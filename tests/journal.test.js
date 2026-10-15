import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePOV } from '../core/vn-parser.js';
import { parseJournal } from '../core/journal-format.js';
import { collectJournals } from '../core/journal-collector.js';
import { createHost } from '../integration.js';
import { messageRevision } from '../core/message-extra.js';

const entry = { id: 'first-wand', title: 'My first wand', text: 'My wand chose me today.' };
const block = (entries = [entry]) => `\`\`\`vnplus-journal\n${JSON.stringify({ entries })}\n\`\`\``;
const raw = (body, metadata = block()) => `CANONICAL_SECRET\n/////\n${body}\n${metadata}`;
function fixture(...messages) {
    const context = { characterId: 0, chatId: 'journal-test', chat: messages.map(mes => ({ mes, extra: { unrelated: 'keep' } })), chatMetadata: {}, saves: 0, async saveChat() { this.saves++; } };
    const host = createHost(() => context, { localContent: false });
    const read = (index, beat = 1000, environment = 'world', id = 'diary') => host.extra.artifactSession({ index, beat, environment, id, scene: () => ({ available: false }) }).read().data.entries || [];
    return { host, context, read };
}
test('trailing journal JSON is metadata, with no narration dialogue artifact or command tokens', () => {
    const parsed = parsePOV(`Henry: "We made it."\n${block()}`);
    assert.equal(parsed.tokens.length, 1); assert.equal(parsed.tokens[0].type, 'dialogue');
    assert.deepEqual(parsed.journal.entries, [entry]); assert.deepEqual(parsed.errors, []);
    assert.equal(parsePOV(block([])).journal.entries.length, 0);
});
test('malformed incomplete duplicate and non-trailing journal blocks stay hidden and never import', () => {
    for (const source of ['```vnplus-journal\n{invalid}\n```', '```vnplus-journal\n{"entries":', block() + '\nYou leave.', block() + '\n' + block()]) {
        const parsed = parsePOV(source); assert.equal(parsed.journal, undefined); assert.ok(parsed.errors.length);
        assert.ok(parsed.tokens.every(token => !token.text?.includes('entries') && !token.text?.includes('first-wand')));
    }
});
test('journal-like text inside HTML or another code fence cannot create diary metadata', () => {
    const html = parsePOV('<article>\n' + block() + '\n</article>');
    assert.equal(html.journal, undefined); assert.equal(html.tokens[0].type, 'artifact'); assert.ok(html.tokens[0].html.includes('vnplus-journal'));
    const code = parsePOV('~~~~text\n' + block() + '\n~~~~'); assert.equal(code.journal, undefined); assert.equal(code.tokens[0].type, 'narration');
    assert.equal(parsePOV('Henry: "A quoted example:\n' + block() + '\nEnd."').journal, undefined);
});
test('the journal schema bounds data and rejects arbitrary fields keys repeated IDs and invalid content', () => {
    for (const value of [{ entries: [{ ...entry, extra: {} }] }, { extra: {} }, { entries: [entry, entry] }, { entries: [{ ...entry, id: '../other' }] }, { entries: [{ ...entry, text: '' }] }, { entries: [{ ...entry, title: 'x'.repeat(161) }] }, { entries: [{ ...entry, text: 'x'.repeat(8001) }] }, { entries: Array.from({ length: 4 }, (_, i) => ({ ...entry, id: `entry-${i}` })) }]) assert.throws(() => parseJournal(JSON.stringify(value)));
    assert.throws(() => parseJournal(' '.repeat(32769)), /32 KiB/);
    assert.equal(parseJournal(JSON.stringify({ entries: [{ id: 'valid', text: '<script>unsafe()</script>' }] }))[0].text, '<script>unsafe()</script>'); // data only; diary renders textContent
});
test('collection saves only source-owned per-response deltas and preserves prose unrelated metadata and manual events', async t => {
    const f = fixture(raw('You inspect your wand.')); t.after(() => f.host.extra.dispose());
    const original = f.context.chat[0].mes;
    const manual = f.host.extra.artifactSession({ index: 0, beat: 0, environment: 'world', id: 'diary', scene: () => ({}) });
    await manual.request('push', { key: 'entries', value: { text: 'My own note.', when: 'Earlier' } });
    assert.equal(collectJournals(f.host, 'world'), 1);
    const record = f.context.chat[0].extra.vn_plus.revisions[messageRevision(f.context.chat[0])];
    assert.equal(record.journals.world.entries.length, 1); assert.equal(record.events.length, 1);
    assert.equal(f.context.chat[0].mes, original); assert.equal(f.context.chat[0].extra.unrelated, 'keep');
    assert.equal(f.read(0).length, 2); assert.equal(f.read(0)[0].text, 'My own note.'); assert.equal(f.read(0)[1].id, 'first-wand');
    assert.equal(collectJournals(f.host, 'world'), 0); assert.equal(record.events.length, 1);
});
test('a manual diary replacement before the source boundary cannot erase a later imported entry', async t => {
    const f = fixture(raw('You find the wand.')); t.after(() => f.host.extra.dispose());
    collectJournals(f.host, 'world');
    await f.host.extra.artifactSession({ index: 0, beat: 0, environment: 'world', id: 'diary', scene: () => ({}) }).request('set', { key: 'entries', value: [{ text: 'My own note.' }] });
    assert.deepEqual(f.read(0, 0).map(entry => entry.text), ['My own note.']);
    assert.deepEqual(f.read(0, 1).map(entry => entry.text), ['My own note.', 'My wand chose me today.']);
});
test('the current response journal is unavailable before its boundary and readable in following responses', () => {
    const f = fixture(raw('You find the wand.'), raw('Next morning.', '')); try {
        collectJournals(f.host, 'world');
        assert.deepEqual(f.read(0, 0), []); assert.equal(f.read(0, 1).length, 1); assert.equal(f.read(1, 0).length, 1);
    } finally { f.host.extra.dispose(); }
});
test('journal dates follow selected canonical/POV headers with inherited time and environment isolation', () => {
    const first = raw('[3 August 1991 | Before First Year | 12:26 p.m. | Summer | Shop]\nYou find the wand.');
    const f = fixture(first, raw('You keep thinking.', block([{ id: 'plan', text: 'I have decided to go.' }]))); try {
        collectJournals(f.host, 'world');
        assert.equal(f.read(1)[1].when, '3 August 1991 · 12:26 p.m.');
        assert.deepEqual(f.read(1, 1000, 'other'), []); assert.deepEqual(f.read(1, 1000, 'world', 'watch'), []);
    } finally { f.host.extra.dispose(); }
});
test('repeated milestone IDs or equivalent entry text cannot duplicate diary pages across messages', () => {
    const f = fixture(raw('First.'), raw('Again.', block([{ ...entry, text: 'Same milestone, reworded.' }])), raw('Again.', block([{ ...entry, id: 'different', text: '  MY WAND chose me today.  ' }]))); try {
        collectJournals(f.host, 'world'); assert.equal(f.read(2).length, 1); assert.equal(f.read(2)[0].id, entry.id);
    } finally { f.host.extra.dispose(); }
});
test('selected swipe edits and source revision restoration rebuild the correct journal without deleting old histories', () => {
    const f = fixture(raw('First.')); try {
        const original = f.context.chat[0].mes;
        collectJournals(f.host, 'world'); assert.equal(f.read(0).length, 1);
        f.context.chat[0].mes = raw('Changed scene.', block([{ id: 'different', text: 'A different event occurred.' }])); f.context.chat[0].swipe_id = 1;
        collectJournals(f.host, 'world'); assert.equal(f.read(0)[0].id, 'different');
        f.context.chat[0].mes = raw('No journal.', ''); collectJournals(f.host, 'world'); assert.deepEqual(f.read(0), []);
        f.context.chat[0].mes = original; f.context.chat[0].swipe_id = 0;
        collectJournals(f.host, 'world'); assert.equal(f.read(0)[0].id, entry.id);
    } finally { f.host.extra.dispose(); }
});
test('a branch inherits its diary prefix and can collect different future milestones without changing its parent', () => {
    const f = fixture(raw('First.')); try {
        collectJournals(f.host, 'world'); const parent = structuredClone(f.context.chat);
        f.context.chat = structuredClone(parent); f.context.chatId = 'branch'; f.context.chat.push({ mes: raw('A new choice.', block([{ id: 'choice', text: 'I chose a different path.' }])) });
        collectJournals(f.host, 'world'); assert.equal(f.read(1).length, 2); assert.equal(parent.length, 1);
        f.context.chat = parent; f.context.chatId = 'journal-test'; assert.equal(f.read(0).length, 1);
    } finally { f.host.extra.dispose(); }
});
test('canonical user and system journal blocks cannot supply entries', () => {
    const f = fixture(block() + '\n/////\nYou continue.', raw('User.'), raw('System.')); try {
        f.context.chat[1].is_user = true; f.context.chat[2].is_system = true;
        assert.equal(collectJournals(f.host, 'world'), 0); assert.deepEqual(f.read(0), []);
    } finally { f.host.extra.dispose(); }
});
test('the optional display regex hides trailing and streaming metadata while preserving POV prose and raw storage', async () => {
    const preset = JSON.parse(await readFile(new URL('../regex/vn-plus-journal-display.json', import.meta.url))), [, pattern, flags] = /^\/(.*)\/([a-z]*)$/s.exec(preset.findRegex);
    const source = 'You continue.\n' + block(); assert.equal(source.replace(new RegExp(pattern, flags), preset.replaceString), 'You continue.\n');
    assert.equal('You continue.\n```vnplus-journal\n{"entries":'.replace(new RegExp(pattern, flags), preset.replaceString), 'You continue.\n');
    assert.ok(source.includes('first-wand')); assert.equal(preset.markdownOnly, true); assert.equal(preset.promptOnly, false);
});
