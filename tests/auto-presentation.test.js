import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoPresentation } from '../core/auto-presentation.js';

const ready = text => `PRIVATE\n/////\nNina: "${text}"`;
const fixture = mes => { const context = { chatId: 'one', chat: [{ mes }] }; return { context, policy: new AutoPresentation(context) }; };

test('existing completed history is a baseline, while appended replies and completed transformations are fresh output', () => {
    const { context, policy } = fixture(ready('History.'));
    assert.equal(policy.eligible(context, 0), false);
    context.chat.push({ mes: 'PRIVATE' }); policy.observe(context);
    context.chat[1].mes = ready('New.'); assert.equal(policy.eligible(context, 1), true);
    assert.equal(policy.eligible(context, 0), false);
    context.chat.push({ is_user: true, mes: 'Continue.' }); assert.equal(policy.eligible(context, 1), false);
});

test('same-message transformer completion is eligible, but browsing swipes and edits is not', () => {
    const { context, policy } = fixture('PRIVATE');
    context.chat[0].mes = ready('Transformed.'); assert.equal(policy.eligible(context, 0), true);
    policy.suppress(context);
    context.chat[0].mes = ready('Edited.'); assert.equal(policy.eligible(context, 0), false);
    context.chat[0].mes = 'PRIVATE'; policy.observe(context);
    context.chat[0].swipe_id = 1; context.chat[0].mes = ready('Old swipe.'); assert.equal(policy.eligible(context, 0), false);
});

test('deletion, history loading, chat switches and explicit exit cannot rearm automatic presentation', () => {
    const { context, policy } = fixture('PRIVATE');
    context.chat[0].mes = ready('New.'); assert.equal(policy.eligible(context, 0), true);
    policy.suppress(context); context.chat[0].mes = 'PRIVATE'; policy.observe(context);
    context.chat[0].mes = ready('Late edit after exit.'); assert.equal(policy.eligible(context, 0), false);
    context.chat.unshift({ mes: ready('Earlier.') }); assert.equal(policy.eligible(context, 1), false);
    context.chat.pop(); assert.equal(policy.eligible(context, 0), false);
    context.chatId = 'two'; context.chat = [{ mes: ready('Other chat.') }]; assert.equal(policy.eligible(context, 0), false);
});

test('an explicitly generated swipe may present even after exit, without authorizing an unchanged generation', () => {
    const { context, policy } = fixture(ready('Old.')); policy.suppress(context);
    policy.start(context); policy.finish(context); assert.equal(policy.eligible(context, 0), false);
    policy.start(context); context.chat[0].swipe_id = 1; context.chat[0].mes = ready('Regenerated.');
    policy.finish(context); assert.equal(policy.eligible(context, 0), true);
    policy.suppress(context); policy.start(context); context.chat[0].mes = 'PRIVATE'; policy.finish(context);
    context.chat[0].mes = ready('Workflow completed later.'); assert.equal(policy.eligible(context, 0), true);
});
