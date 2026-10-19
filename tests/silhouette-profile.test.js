import test from 'node:test';
import assert from 'node:assert/strict';
import { silhouetteProfile } from '../core/silhouette-profile.js';
import { castZoom } from '../core/stage-layout.js';

test('descriptive speaker names select distinct adult and child figures with the requested relative scales', () => {
    for (const [name, type, scale] of [['The man', 'man', 1], ['A woman', 'woman', .95], ['Witch', 'woman', .95], ['Wizard', 'man', 1],
        ['Small girl', 'girl', .5], ['Schoolboy', 'boy', .6], ['Young witch', 'girl', .5], ['Young wizard', 'boy', .6], ['Young woman', 'woman', .95]]) {
        const profile = silhouetteProfile(name); assert.equal(profile.type, type, name); assert.equal(profile.scale, scale, name);
    }
});
test('proper names and word substrings stay neutral while ambiguous children use an ungendered child figure', () => {
    for (const name of ['Nina', 'Jason Weber', 'Human', 'Boysenberry', 'German', 'Ladybird', 'A woman and a man']) assert.equal(silhouetteProfile(name).type, 'neutral', name);
    assert.equal(silhouetteProfile('A boy and a girl').type, 'child'); assert.equal(silhouetteProfile('A child').scale, .55);
    assert.equal(silhouetteProfile('Girlfriend').type, 'woman'); assert.equal(silhouetteProfile('Boyfriend').type, 'man');
});
test('explicit silhouette gender and age properties take precedence over name inference', () => {
    assert.equal(silhouetteProfile('Boy', { silhouette: 'woman' }).type, 'woman');
    assert.equal(silhouetteProfile('Girl', { gender: 'male' }).type, 'boy');
    assert.equal(silhouetteProfile('Lyra', { gender: 'female', age: 11 }).type, 'girl');
    assert.equal(silhouetteProfile('Someone', { gender: 'boy' }).type, 'boy');
    assert.equal(silhouetteProfile('Girl', { ageGroup: 'adult' }).type, 'woman');
    assert.equal(silhouetteProfile('Wizard', { gender: 'nonbinary', age: 12 }).type, 'child');
    assert.equal(silhouetteProfile('Girl', { silhouette: { type: 'neutral' } }).type, 'neutral');
});
test('display names and aliases can describe the figure without inventing facts about proper names', () => {
    assert.equal(silhouetteProfile('unknown_1', { displayName: 'The witch' }).type, 'woman');
    assert.equal(silhouetteProfile('unknown_2', { aliases: ['Young wizard'] }).type, 'boy');
    assert.equal(silhouetteProfile('unknown_3', { aliases: 'Little girl' }).type, 'girl');
});
test('authored bust scale wins and invalid values fall back to the selected body profile', () => {
    assert.equal(silhouetteProfile('Girl', { bustScale: 1.2 }).scale, 1.2);
    for (const value of [null, undefined, 0, -1, Infinity, 'bad']) assert.equal(silhouetteProfile('Girl', { bustScale: value }).scale, .5);
    assert.equal(silhouetteProfile('Unknown', { silhouette: 'not-a-profile' }).scale, 1);
});
test('inferred sizes participate in existing shared cast zoom without changing their ratios', () => {
    const sizes = ['Man', 'Woman', 'Boy', 'Girl'].map(name => silhouetteProfile(name).scale), zoom = castZoom(sizes);
    assert.equal(sizes[2] * zoom / (sizes[0] * zoom), .6); assert.equal(sizes[3] * zoom / (sizes[0] * zoom), .5);
    assert.equal(castZoom([.5, .5]), 2);
});
