import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeSelectors, styleAssetUrl } from '../renderers/environment-style.js';

const scope = '#vnplus-overlay[data-vn-style-scope="test"]';
test('environment selectors scope normal rules and root declarations to the VN overlay', () => {
    assert.equal(scopeSelectors('.vn-dialogue, [data-action="next"]', scope), `${scope} .vn-dialogue, ${scope} [data-action="next"]`);
    for (const root of [':scope', ':root', 'body', 'html', '#vnplus-overlay']) assert.equal(scopeSelectors(`${root} > .vn-controls`, scope), `${scope} > .vn-controls`);
    assert.equal(scopeSelectors(':scope::before', scope), `${scope}::before`);
});
test('selector lists preserve commas inside functions quoted attributes and escaped identifiers', () => {
    assert.equal(scopeSelectors('.vn-dialogue:is(.one,.two), [title="one,two"]::before', scope), `${scope} .vn-dialogue:is(.one,.two), ${scope} [title="one,two"]::before`);
    assert.equal(scopeSelectors('.one\\,two, button', scope), `${scope} .one\\,two, ${scope} button`);
});
test('root sibling selectors cannot style outside the VN subtree', () => {
    for (const selector of [':scope + #chat', 'body~#extensions_settings', '#vnplus-overlay:hover ~ #chat', ':root:is(.one,.two) + main']) assert.equal(scopeSelectors(selector, scope), '');
    assert.equal(scopeSelectors('#chat, :root + main, .vn-dialogue', scope), `${scope} #chat, ${scope} .vn-dialogue`);
    assert.equal(scopeSelectors(':scope .vn-controls button + button', scope), `${scope} .vn-controls button + button`);
});
test('stylesheet URLs resolve relative to the selected environment without crossing its boundary', () => {
    const base = new URL('https://local.test/environments/castle/');
    assert.equal(styleAssetUrl('ui/paper texture.png', base), 'https://local.test/environments/castle/ui/paper%20texture.png');
    assert.equal(styleAssetUrl('./characters/shared/box.png', base), 'https://local.test/environments/castle/characters/shared/box.png');
    for (const value of ['../other/paper.png', '%2e%2e/secret.png', '%2e%2e%2fsecret.png', '%2e%2e%5csecret.png', '/settings', 'https://remote.test/image.png', '//remote.test/image.png', 'javascript:alert(1)', 'image.png?secret=1']) assert.equal(styleAssetUrl(value, base), null);
    assert.equal(styleAssetUrl('data:image/png;base64,AAA', base), 'data:image/png;base64,AAA'); assert.equal(styleAssetUrl('#paper-filter', base), '#paper-filter');
});
