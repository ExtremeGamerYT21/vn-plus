import test from 'node:test';
import assert from 'node:assert/strict';
import { splitMessage, readMessage, sceneKey, chatIdentity } from '../core/message-reader.js';
import { parsePOV } from '../core/vn-parser.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { AssetResolver, safeAssetPath } from '../core/asset-resolver.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { Playback } from '../core/playback.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { artifactPolicy } from '../renderers/html-renderer.js';

const settings = () => structuredClone(DEFAULT_SETTINGS);
const registry = (s = settings()) => new CharacterRegistry({ inventory: {}, json: async () => null }, s);
const compile = (text, s = settings()) => compileTimeline(parsePOV(text).tokens, registry(s), s);

test('strict separator preserves exact sections, CRLF and subsequent separators', () => {
    const raw = '  SECRET \r\n\r\n/////\r\n  NARRATION\r\n *Visible*\r\n/////\r\nend';
    assert.deepEqual(splitMessage(raw), { canonical: '  SECRET \r\n\r\n', pov: '  NARRATION\r\n *Visible*\r\n/////\r\nend', status: 'ready' });
    for (const source of ['SECRET ///// text', '//////\nSECRET', ' /////\nSECRET', '///// \nSECRET']) assert.equal(splitMessage(source).status, 'missing');
    assert.equal(splitMessage('SECRET\n/////').status, 'empty');
});
test('canonical commands and HTML never enter parser', () => {
    const combined = '#BACKGROUND SECRET\n<div>HIDDEN</div>\n/////\nNARRATION\nVisible';
    const parsed = parsePOV(splitMessage(combined).pov);
    assert.equal(parsed.tokens.length, 1); assert.equal(parsed.tokens[0].text, 'Visible');
    assert.equal(parsePOV(splitMessage('SECRET').pov).tokens.length, 0);
});
test('Unicode names, punctuation, multiline dialogue, emphasis and emotion casing', () => {
    const tokens = parsePOV('NARRATION\n  *Prose*\n\nDr. Élodie O’Neil: “Hello,\n  you.” [EXCITED]\n\nNARRATION\nEnd').tokens;
    assert.equal(tokens[0].text, '  *Prose*\n\n'); assert.equal(tokens[1].character, 'Dr. Élodie O’Neil');
    assert.equal(tokens[1].text, '“Hello,\n  you.”'); assert.equal(tokens[1].emotion, 'excited');
});
test('unknown and malformed commands cannot become visible prose', () => {
    const parsed = parsePOV('#UNKNOWN hidden command\n#MUSIC\n@background kitchen\n@soundFX door\n@music buzz slowed\nNARRATION\nHello');
    assert.equal(parsed.errors.length, 1); assert.equal(parsed.tokens.filter(token => token.type === 'narration').length, 1);
    assert.deepEqual(parsed.tokens.filter(token => token.type === 'command').map(token => token.name), ['MUSIC', 'BACKGROUND', 'SFX', 'MUSIC']);
});
test('HTML fences and nested raw HTML are automatic artifact beats', () => {
    const parsed = parsePOV('```html interactive\n<div>Clock</div>\n```\nNARRATION\nThen\n<div>\n<div>Nested</div>\n<p>Still artifact</p>\n</div>\nNARRATION\nEnd');
    assert.deepEqual(parsed.tokens.map(token => token.type), ['artifact', 'narration', 'artifact', 'narration']);
    assert.equal(parsed.tokens[0].interactive, true); assert.match(parsed.tokens[2].html, /Still artifact/);
});
test('incomplete artifacts and dialogue are withheld safely', () => {
    const parsed = parsePOV('Draco: "Unfinished\n\n```html\n<div>Incomplete');
    assert.equal(parsed.tokens.length, 0); assert.equal(parsed.errors.length, 2);
});
test('four NPCs remain staged, player takes left priority without speaker reshuffling', () => {
    const timeline = compile('#ENTER Draco\n#ENTER Hermione\n#ENTER Luna\n#ENTER Neville\nDRACO: "One" [smug]\nJASON: "Hello" [happy]\nHERMIONE: "Two" [angry]\nNARRATION\nSilence\n#EXIT Draco\nLUNA: "Three" [default]');
    const states = timeline.views.map(index => timeline.beats[index].state);
    assert.equal(Object.keys(states[0].characters).length, 4);
    assert.equal(states[1].characters.jason.slot, 0); assert.equal(Object.keys(states[1].characters).length, 5);
    assert.equal(states[1].characters.draco.slot, states[2].characters.draco.slot);
    assert.equal(states[3].characters.hermione.expression, 'angry'); assert.equal(states[3].speaker, null);
    assert.equal(states[4].characters.draco, undefined); assert.ok(states[4].characters.neville);
});
test('properties aliases and exact expressions are non-destructive', () => {
    const s = settings(); s.characters.draco = { displayName: 'Draco Malfoy', aliases: ['Malfoy'], defaultExpression: 'neutral', expressionAliases: { EXCITED: 'smile' }, color: '#abc' };
    const reg = registry(s); assert.equal(reg.identify('MALFOY'), 'draco');
    assert.deepEqual(reg.expressionCandidates('draco', 'EXCITED'), ['excited', 'smile', 'happy', 'neutral', 'default']);
    assert.equal(reg.get('draco').color, '#abc');
});
test('special object keys and malformed aliases cannot corrupt staging', () => {
    const timeline = compile('__proto__: "Hello" [rage]\nconstructor: "Hi" [happy]\nNARRATION\nEnd');
    const state = timeline.beats.at(-1).state;
    assert.ok(Object.hasOwn(state.characters, '__proto__')); assert.ok(Object.hasOwn(state.characters, 'constructor'));
    assert.equal(Object.prototype.expression, undefined);
    const reg = registry(); reg.properties.set('draco', { aliases: 4, expressionAliases: { happy: null } });
    assert.equal(reg.identify('Draco'), 'draco'); assert.deepEqual(reg.expressionCandidates('draco', 'happy'), ['happy', 'default']);
});
test('backward snapshots restore background, music, ambient, expression, staging and effects', () => {
    const timeline = compile('#BACKGROUND kitchen\n#MUSIC buzz slowed\n#AMBIENT fire\n#TEXT whisper\nDraco: "Before" [smug]\n#BACKGROUND street\n#MUSIC club\n#FADE BLACK\n#ENTER Hermione\n#TEXT shout\nDraco: "After" [rage]');
    const player = new Playback(timeline); const first = player.forward(); player.forward(); const back = player.back();
    assert.deepEqual(back.beat.state, first.beat.state); assert.equal(back.beat.state.music.rate, .75);
    assert.equal(back.beat.state.characters.hermione, undefined); assert.equal(back.beat.state.black, false);
});
test('SFX only play on first forward traversal and explicit replay', () => {
    const player = new Playback(compile('#SFX door\nNARRATION\nFirst\n#SFX knock\nDraco: "Second" [happy]'));
    assert.equal(player.forward().effects[0].name, 'door'); assert.equal(player.forward().effects[0].name, 'knock');
    assert.deepEqual(player.back().effects, []); assert.deepEqual(player.forward().effects, []);
    assert.equal(player.replay().effects[0].name, 'door');
});
test('trailing presentation commands execute before scene end', () => {
    const player = new Playback(compile('NARRATION\nBye\n#MUSIC STOP\n#SFX end_day'));
    player.forward(); const result = player.forward(); assert.equal(result.done, true); assert.equal(result.effects[0].name, 'end_day'); assert.equal(result.beat.state.music, null);
});
test('swipe edits, branches and refresh reconstruct only authoritative selected source', () => {
    const ctx = { characterId: 1, chatId: 'branch-a', chat: [{ mes: 'SECRET\n/////\nNARRATION\nSelected edit', swipes: ['Rejected'], swipe_id: 2 }] };
    const selected = readMessage(ctx, 0); assert.equal(selected.pov, 'NARRATION\nSelected edit');
    const key = sceneKey(ctx, selected); ctx.chat[0].swipe_id = 1; assert.notEqual(key, sceneKey(ctx, readMessage(ctx, 0)));
    ctx.chatId = 'branch-b'; assert.notEqual(chatIdentity(ctx), chatIdentity({ ...ctx, chatId: 'branch-a' }));
    const a = compile(selected.pov), b = compile(selected.pov); assert.deepEqual(a, b);
    assert.equal(compile('NARRATION\nNew scene').beats[0].state.background, null);
});
test('skip viewed navigation has no one-shot effects', () => {
    const player = new Playback(compile('NARRATION\nA\n#SFX knock\nDraco: "B" [default]\nNARRATION\nC'));
    player.forward(); player.forward(); player.forward(); player.replay();
    assert.deepEqual(player.skipViewed().effects, []); assert.equal(player.position, 2);
});
test('legacy flat and new sprite layouts resolve with exact emotion first', async () => {
    const resolver = new AssetResolver(new URL('http://localhost/extensions/vn/'), { files: ['characters/nina/excited.webp', 'characters/nina/happy.webp', 'characters/nina/default.webp', 'sfx/music/buzz.mp3', 'backgrounds/kitchen.png'] });
    assert.match(await resolver.sprite('nina', ['excited', 'happy', 'default']), /excited.webp$/);
    assert.match(await resolver.background('KITCHEN'), /kitchen.png$/); assert.match(await resolver.audio('music', 'BUZZ'), /sfx\/music\/buzz.mp3$/);
});
test('asset paths cannot escape extension or request external URLs', () => {
    for (const value of ['../secret', 'http://evil/image', '/secret', 'foo/../bar', 'a?token=secret']) assert.equal(safeAssetPath(value), null);
    assert.equal(safeAssetPath('shared/box_texture.png'), 'shared/box_texture.png');
});
test('newly added exact sprites take priority over inventoried fallback assets', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async url => ({ ok: String(url).endsWith('/excited.webp'), headers: { get: () => 'image/webp' } });
    try {
        const resolver = new AssetResolver(new URL('http://localhost/vn/'), { files: ['characters/nina/happy.webp', 'characters/nina/default.webp'] });
        assert.match(await resolver.sprite('nina', ['excited', 'happy', 'default']), /excited.webp$/);
    } finally { globalThis.fetch = original; }
});
test('artifact policies block application, network and embedded frame access', () => {
    assert.match(artifactPolicy(false), /script-src 'none'/); assert.match(artifactPolicy(true), /script-src 'unsafe-inline'/);
    for (const policy of [artifactPolicy(false), artifactPolicy(true)]) { assert.match(policy, /connect-src 'none'/); assert.match(policy, /frame-src 'none'/); assert.match(policy, /form-action 'none'/); }
});
