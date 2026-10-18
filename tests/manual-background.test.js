import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundChoices, ManualBackground } from '../core/manual-background.js';
import { emptyState } from '../core/scene-timeline.js';
import { sceneSnapshot } from '../core/shared-state.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

test('manual background choices stay inside the selected environment and exclude metadata and unrelated files', () => {
    const resolver = { files: new Set(['backgrounds/Room With Spaces.PNG', 'backgrounds/night/shop.webp', 'backgrounds/properties.json',
        'characters/nina/happy.png', 'backgrounds/../secret.png', 'music/theme.mp3']), url: path => `/environment/${encodeURIComponent(path)}` };
    const choices = backgroundChoices(resolver);
    assert.deepEqual(choices.map(choice => choice.name).sort(), ['Room With Spaces.PNG', 'night/shop.webp'].sort());
    assert.ok(choices.every(choice => choice.url.startsWith('/environment/backgrounds')));
});

test('a manual image survives ordinary beats but expires on a different scripted background fade or chat/environment', () => {
    const state = emptyState(), image = { name: 'manual.png', url: '/manual.png' }, manual = new ManualBackground(); state.background = 'missing';
    for (const change of [value => { value.background = 'other'; }, value => { value.black = true; }, value => { value.mode = 'black'; }, () => {}]) {
        manual.set(image, state, 'chat-a:hp');
        assert.equal(manual.resolve({ ...state, speaker: 'nina' }, 'chat-a:hp').url, '/manual.png');
        const changed = structuredClone(state); change(changed);
        assert.equal(manual.resolve(changed, changed.background === state.background && changed.black === state.black && changed.mode === state.mode ? 'chat-b:hp' : 'chat-a:hp'), null);
        assert.equal(manual.value, null);
    }
    assert.equal(state.background, 'missing'); assert.equal(state.black, false);
});

test('temporary image URLs are released on replacement reset or scope change, while catalog files are never revoked', () => {
    const revoked = [], manual = new ManualBackground(url => revoked.push(url)), state = emptyState();
    manual.set({ name: 'a.png', url: 'blob:a', temporary: true }, state, 'a');
    manual.set({ name: 'b.png', url: '/b.png' }, state, 'a'); assert.deepEqual(revoked, ['blob:a']);
    manual.clear(); assert.deepEqual(revoked, ['blob:a']);
    manual.set({ name: 'c.png', url: 'blob:c', temporary: true }, state, 'a');
    manual.resolve(state, 'b'); manual.clear(); assert.deepEqual(revoked, ['blob:a', 'blob:c']);
});

test('playback metadata describes a temporary manual background without persisting an unusable blob URL', () => {
    const settings = structuredClone(DEFAULT_SETTINGS), registry = new CharacterRegistry({ inventory: {} }, settings);
    const state = emptyState(); state.background = 'chosen.png';
    const result = sceneSnapshot({ state, registry, settings, environment: { id: 'hp' }, source: {}, audio: { channels: { music: {}, ambient: {} } },
        stage: { manualBackground: { temporary: true }, backgroundUrl: 'blob:temporary-only', variables: { lighting: { inside: false } } } });
    assert.deepEqual(result.background, { name: 'chosen.png', asset: null, inside: false, outside: true, manual: true, temporary: true });
    assert.ok(!JSON.stringify(result).includes('blob:'));
});
