import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Playback } from '../core/playback.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { parsePOV } from '../core/vn-parser.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

test('returning to a viewed message suppresses SFX until explicit replay', () => {
    const s = structuredClone(DEFAULT_SETTINGS), reg = new CharacterRegistry({ inventory: {} }, s);
    const timeline = compileTimeline(parsePOV('#SFX knock\nNARRATION\nVisible').tokens, reg, s);
    const seen = new Set(), first = new Playback(timeline, seen); first.forward();
    const reopened = new Playback(timeline, seen); assert.deepEqual(reopened.forward().effects, []);
    assert.equal(reopened.replay().effects[0].name, 'knock');
});
test('importable RegEx presets protect pending display and canonical-only model context', async () => {
    const display = JSON.parse(await readFile(new URL('../regex/vn-plus-pov-display.json', import.meta.url)));
    const context = JSON.parse(await readFile(new URL('../regex/vn-plus-canonical-context.json', import.meta.url)));
    const run = (script, raw) => { const [, pattern, flags] = /^\/(.*)\/([a-z]*)$/s.exec(script.findRegex); return raw.replace(new RegExp(pattern, flags), script.replaceString); };
    assert.equal(run(display, 'SECRET\r\n/////\r\n  Visible\r\n'), '  Visible\r\n');
    assert.equal(run(display, 'SECRET'), ''); assert.equal(run(display, 'SECRET\n/////'), '');
    assert.equal(run(context, '  Canonical\n/////\nHIDDEN_FROM_MODEL'), '  Canonical\n');
    assert.equal(run(context, 'Ordinary narrator text'), 'Ordinary narrator text');
    assert.equal(display.markdownOnly, true); assert.equal(display.promptOnly, false);
    assert.equal(context.markdownOnly, false); assert.equal(context.promptOnly, true);
});
