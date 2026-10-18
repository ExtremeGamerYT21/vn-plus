import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SourceMonitor } from '../core/source-monitor.js';

function fixture({ fail = false } = {}) {
    const calls = [], worker = { postMessage(value) { calls.push(['ack', value]); }, terminate() { calls.push('terminated'); } };
    let tick;
    const monitor = new SourceMonitor(confirm => { calls.push(['check', confirm]); }, {
        workerFactory() { if (fail) throw new Error('Worker unavailable'); return worker; },
        set(callback, interval) { tick = callback; calls.push(['timer', interval]); return 12; }, clear(id) { calls.push(['clear', id]); },
    });
    return { monitor, worker, calls, tick: () => tick() };
}

test('source monitoring uses worker messages without a page timer and separates event wakes from stable confirmations', () => {
    const h = fixture(); assert.equal(h.monitor.mode, 'worker'); assert.deepEqual(h.calls, []);
    h.monitor.wake(); h.worker.onmessage();
    assert.deepEqual(h.calls, [['check', false], ['ack', 'received'], ['check', true]]);
    h.monitor.dispose(); h.worker.onmessage(); h.monitor.wake();
    assert.equal(h.calls.filter(call => Array.isArray(call) && call[0] === 'check').length, 2);
    assert.equal(h.calls.at(-1), 'terminated');
});

test('a missing or blocked worker keeps event triggers and a single fallback timer that is disposed', () => {
    for (const fail of [true, false]) {
        const h = fixture({ fail });
        if (!fail) { let prevented = false; h.worker.onerror({ preventDefault() { prevented = true; } }); assert.ok(prevented); h.worker.onerror({}); }
        assert.equal(h.monitor.mode, 'timer'); assert.equal(h.calls.filter(call => call[0] === 'timer').length, 1);
        h.monitor.wake(); h.tick(); assert.deepEqual(h.calls.slice(-2), [['check', false], ['check', true]]);
        h.monitor.dispose(); h.tick(); assert.deepEqual(h.calls.at(-1), ['clear', 12]);
    }
});

test('source monitor reports asynchronous failures without abandoning later source checks', async () => {
    const errors = [], worker = { postMessage() {}, terminate() {} }; let checks = 0;
    const monitor = new SourceMonitor(async () => { if (++checks === 1) throw new Error('Temporary failure'); }, { workerFactory: () => worker, onError: error => errors.push(error.message) });
    worker.onmessage(); await Promise.resolve(); worker.onmessage(); await Promise.resolve();
    assert.deepEqual(errors, ['Temporary failure']); assert.equal(checks, 2); monitor.dispose();
});

test('a stopped page cannot accumulate heartbeat notifications and acknowledging it permits the next check', () => {
    let tick; const messages = [], self = { postMessage(value) { messages.push(value); } };
    vm.runInNewContext(readFileSync(new URL('../workers/source-monitor.js', import.meta.url), 'utf8'), { self, setInterval(callback) { tick = callback; } });
    for (let i = 0; i < 120; i++) tick(); assert.deepEqual(messages, ['check']);
    self.onmessage(); tick(); assert.deepEqual(messages, ['check', 'check']);
});
