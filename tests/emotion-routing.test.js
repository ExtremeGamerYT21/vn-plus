import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_EMOTIONS, EMOTION_RANKINGS, EMOTION_ADJECTIVES, EMOTION_ROUTES, emotionProfile, emotionRanking, rankEmotions } from '../core/emotion-routing.js';
import { AssetResolver } from '../core/asset-resolver.js';
import { CharacterRegistry } from '../core/character-registry.js';

const base = new URL('http://localhost/vn/');
const missing = async run => {
    const original = globalThis.fetch, requests = [];
    globalThis.fetch = async url => { requests.push(String(url)); return { ok: false }; };
    try { await run(requests); } finally { globalThis.fetch = original; }
};
const resolverFor = files => new AssetResolver(base, { files });
const winner = (tag, available) => rankEmotions(tag, available)[0]?.name;

test('all 28 ST labels have complete unique rankings headed by their identical label', () => {
    assert.equal(BASE_EMOTIONS.length, 28);
    assert.equal(Object.keys(EMOTION_RANKINGS).length, 28);
    for (const emotion of BASE_EMOTIONS) {
        const row = EMOTION_RANKINGS[emotion];
        assert.equal(row[0], emotion); assert.equal(row.length, 28);
        assert.deepEqual([...new Set(row)].sort(), [...BASE_EMOTIONS].sort());
        assert.equal(winner(emotion, [...BASE_EMOTIONS].reverse()), emotion);
    }
    for (const [tag, profile] of Object.entries(EMOTION_ADJECTIVES)) {
        assert.ok(BASE_EMOTIONS.includes(profile)); assert.equal(EMOTION_ROUTES[tag], EMOTION_RANKINGS[profile]);
    }
});

test('adjectives rank the closest available ST labels instead of applying a single synonym', () => {
    assert.equal(winner('happy', ['anger', 'amusement', 'joy']), 'joy');
    assert.equal(winner('happy', ['anger', 'amusement']), 'amusement');
    assert.equal(winner('annoyed', ['disapproval', 'disgust', 'anger']), 'anger');
    assert.equal(winner('annoyed', ['disapproval', 'disgust']), 'disgust');
    assert.equal(winner('annoyed', ['anger', 'annoyance']), 'annoyance');
    assert.equal(winner('terrified', ['surprise', 'nervousness']), 'nervousness');
    assert.equal(winner('heartbroken', ['disappointment', 'sadness']), 'sadness');
    assert.equal(winner('flustered', ['nervousness', 'embarrassment']), 'embarrassment');
    assert.equal(winner('thankful', ['approval', 'love', 'caring']), 'caring');
    assert.equal(winner('calm', ['joy', 'neutral', 'relief']), 'relief');
});

test('literal custom and base labels win before ranked synonyms, independent of catalog order', () => {
    assert.equal(winner('happy', ['joy', 'happy']), 'happy');
    assert.equal(winner('joy', ['happy', 'joy']), 'joy');
    const names = ['smiling', 'happy', 'joy', 'amusement'];
    assert.deepEqual(rankEmotions('cheerful', names), rankEmotions('cheerful', [...names].reverse()));
    assert.equal(winner('cheerful', names), 'joy');
});

test('emotion lookup normalizes case and simple modifiers without guessing unknown or negated tags', () => {
    assert.equal(emotionProfile(' VERY HAPPY '), 'joy');
    assert.equal(emotionProfile('slightly-annoyed'), 'annoyance');
    assert.equal(emotionProfile('grossed out'), 'disgust');
    for (const tag of ['not_happy', 'never_angry', 'joy_and_fear', 'intergalactic', '__proto__', 'constructor']) {
        assert.equal(emotionProfile(tag), null); assert.deepEqual(emotionRanking(tag), []);
    }
    assert.deepEqual(rankEmotions('happy', ['joy_blink', 'joy.blink', 'happyBlink']), []);
});

test('the same adjective chooses different highest-ranked sprites for sparse character folders', async () => missing(async () => {
    const resolver = resolverFor(['characters/a/sprites/joy.png', 'characters/a/sprites/anger.png', 'characters/b/sprites/amusement.png', 'characters/b/sprites/disgust.png']);
    assert.match(await resolver.sprite('a', ['happy', 'default']), /a\/sprites\/joy.png$/);
    assert.match(await resolver.sprite('b', ['happy', 'default']), /b\/sprites\/amusement.png$/);
    assert.match(await resolver.sprite('a', ['annoyed', 'default']), /a\/sprites\/anger.png$/);
    assert.match(await resolver.sprite('b', ['annoyed', 'default']), /b\/sprites\/disgust.png$/);
}));

test('canonical emotion filenames and character folders match without case sensitivity', async () => missing(async () => {
    const resolver = resolverFor(['characters/Art/Sprites/Joy.PNG', 'characters/Art/sprites/amusement.webp']);
    assert.match(await resolver.sprite('a', ['happy', 'default'], { assetFolder: 'art' }), /Art\/Sprites\/Joy.PNG$/);
}));

test('a new literal sprite outranks indexed canonical and legacy synonyms', async () => {
    const resolver = resolverFor(['characters/a/sprites/joy.png', 'characters/a/happy.png']);
    const original = globalThis.fetch;
    globalThis.fetch = async url => ({ ok: String(url).endsWith('/sprites/cheerful.webp'), headers: { get: () => 'image/webp' } });
    try { assert.match(await resolver.sprite('a', ['cheerful', 'default']), /cheerful.webp$/); }
    finally { globalThis.fetch = original; }
    assert.equal(resolver.diagnostics.get('emotion:a:cheerful').method, 'exact');
});

test('new closer canonical sprites supersede an inventoried weaker fallback and remain cached', async () => {
    const resolver = resolverFor(['characters/a/sprites/disgust.png']); let requests = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async url => ({ ok: (++requests, String(url).endsWith('/sprites/anger.webp')), headers: { get: () => 'image/webp' } });
    try {
        assert.match(await resolver.sprite('a', ['annoyed', 'default']), /anger.webp$/); const previous = requests;
        assert.match(await resolver.sprite('a', ['annoyed', 'default']), /anger.webp$/); assert.equal(requests, previous);
    } finally { globalThis.fetch = original; }
    const report = resolver.diagnostics.get('emotion:a:annoyed');
    assert.equal(report.method, 'emotion-ranking'); assert.equal(report.canonical, 'anger'); assert.equal(report.rank, 2);
});

test('character expression aliases override the global rankings after a literal miss', async () => missing(async () => {
    const resolver = resolverFor(['characters/a/joy.png', 'characters/a/custom_smile.png']);
    const settings = { characters: { a: { expressionAliases: { EXCITED: ['custom_smile', 'joy'] } } } };
    const registry = new CharacterRegistry(resolver, settings), props = registry.get('a');
    assert.match(await resolver.sprite('a', registry.expressionCandidates('a', 'excited'), props), /custom_smile.png$/);
    assert.equal(resolver.diagnostics.get('emotion:a:excited').method, 'character-alias');
}));

test('an explicit alias to the default wins and alias edits invalidate an otherwise identical candidate list', async () => missing(async () => {
    const resolver = resolverFor(['characters/a/joy.png', 'characters/a/neutral.png']);
    const props = { defaultExpression: 'neutral' }, candidates = ['happy', 'neutral', 'default'];
    assert.match(await resolver.sprite('a', candidates, props), /joy.png$/);
    props.expressionAliases = { happy: 'neutral' };
    assert.match(await resolver.sprite('a', candidates, props), /neutral.png$/);
    assert.equal(resolver.diagnostics.get('emotion:a:happy').method, 'character-alias');
}));

test('ranked matching retains old adjective and descriptive filenames and folder aliases', async () => missing(async () => {
    const resolver = resolverFor(['characters/art/sprites/cheerful_smile.png', 'characters/art/surprised.webp', 'characters/art/fear.png']);
    assert.match(await resolver.sprite('a', ['joyful', 'default'], { assetFolder: 'art' }), /cheerful_smile.png$/);
    assert.match(await resolver.sprite('a', ['shocked', 'default'], { assetFolder: 'art' }), /surprised.webp$/);
}));

test('ranking cannot select closed-eye art, another character, another environment or unsupported files', async () => missing(async () => {
    const resolver = resolverFor(['characters/a/joy_blink.png', 'characters/a/joy.blink.webp', 'characters/a/joy.mp3', 'characters/aa/joy.png', 'characters/b/joy.png', 'characters/a/../../escape/joy.png']);
    assert.equal(await resolver.sprite('a', ['happy']), null);
    assert.equal(await resolverFor([]).sprite('b', ['happy']), null);
    assert.equal(await resolver.sprite('a', ['happy'], { assetFolder: '../b' }), null);
}));

test('unmapped custom tags use the configured default without borrowing arbitrary emotions', async () => missing(async () => {
    const resolver = resolverFor(['characters/a/anger.png', 'characters/a/resting.png', 'characters/a/default.png']);
    assert.match(await resolver.sprite('a', ['unmapped', 'resting', 'default'], { defaultExpression: 'resting' }), /resting.png$/);
    assert.equal(await resolver.sprite('a', ['unmapped']), null);
}));

test('automatic blinking uses the chosen ranked expression and never a different default expression', async () => missing(async () => {
    const resolver = resolverFor(['characters/a/joy.png', 'characters/a/joy_blink.png', 'characters/a/happy_blink.webp', 'characters/a/default_blink.png']);
    assert.match(await resolver.sprite('a', ['happy', 'default']), /joy.png$/);
    assert.match(await resolver.blinkSprite('a', ['joy']), /joy_blink.png$/);
    assert.equal(await resolver.blinkSprite('a', ['fear']), null);
}));

test('unknown story tags fall back to neutral when the configured default file is absent', async () => missing(async () => {
    const resolver = resolverFor(['characters/lyra/sprites/neutral.png', 'characters/lyra/sprites/joy.png']);
    for (const tag of ['cool', 'brisk', 'dry', 'unmapped']) {
        assert.match(await resolver.sprite('lyra', [tag, 'default'], { defaultExpression: 'default' }), /neutral.png$/);
        const report = resolver.diagnostics.get(`emotion:lyra:${tag}`);
        assert.equal(report.method, 'fallback'); assert.equal(report.requested, tag);
    }
}));

test('neutral safety fallback preserves literal custom art configured defaults overrides and ranked emotions', async () => missing(async () => {
    const resolver = resolverFor(['characters/a/cool.png', 'characters/a/resting.png', 'characters/a/neutral.png', 'characters/a/joy.png']);
    assert.match(await resolver.sprite('a', ['cool', 'default']), /cool.png$/);
    assert.match(await resolver.sprite('a', ['unmapped', 'resting', 'default'], { defaultExpression: 'resting' }), /resting.png$/);
    assert.match(await resolver.sprite('a', ['unmapped', 'default']), /neutral.png$/);
    assert.match(await resolver.sprite('a', ['happy', 'default']), /joy.png$/);
    assert.match(await resolver.sprite('a', ['unmapped', 'default'], { expressionAliases: { unmapped: 'joy' } }), /joy.png$/);
}));

test('neutral safety fallback probes unindexed artwork and respects assetFolder isolation', async () => {
    const original = globalThis.fetch, resolver = resolverFor([]);
    globalThis.fetch = async url => ({ ok: String(url).endsWith('/characters/art/sprites/neutral.png'), headers: { get: () => 'image/png' } });
    try {
        assert.match(await resolver.sprite('lyra', ['cool', 'default'], { defaultExpression: 'missing', assetFolder: 'art' }), /characters\/art\/sprites\/neutral.png$/);
        assert.equal(await resolver.sprite('other', ['cool', 'default']), null);
    } finally { globalThis.fetch = original; }
});

test('neutral safety fallback cannot borrow another character environment or blink image', async () => missing(async () => {
    const resolver = resolverFor(['characters/a/neutral_blink.png', 'characters/a/neutral.blink.webp', 'characters/b/neutral.png']);
    assert.equal(await resolver.sprite('a', ['cool', 'default']), null);
    assert.equal(await resolverFor([]).sprite('b', ['cool', 'default']), null);
}));
