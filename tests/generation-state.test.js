import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../integration.js';

test('generation state is read live, and an unavailable ST helper is distinct from idle', () => {
    let active = true; const context = {};
    assert.equal(createHost(() => context).isGenerating(), null);
    const host = createHost(() => context, { generationActive: () => active });
    assert.equal(host.isGenerating(), true); active = false; assert.equal(host.isGenerating(), false);
    context.isGenerating = () => true; assert.equal(createHost(() => context).isGenerating(), true);
});
