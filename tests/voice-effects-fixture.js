import { SpeechEngine } from '../renderers/speech-engine.js';
import { CharacterRegistry } from '../core/character-registry.js';
import { parsePOV } from '../core/vn-parser.js';
import { compileTimeline } from '../core/scene-timeline.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';

export function voiceEffectsFixture(cached = true) {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.characters = {}; settings.tts.enabled = true;
    const registry = new CharacterRegistry({ inventory: {}, json: async () => null }, settings);
    const properties = { displayName: 'Daphne', voiceId: 'daphne-voice', ttsYoungify: { pitchSemitones: 4 } };
    registry.acceptCharacter({ id: 'daphne', properties }); registry.acceptCharacter({ id: 'jason', properties: { voiceId: 'jason-voice' } });
    const timeline = compileTimeline(parsePOV('Daphne: "Hello there."\nJason: "Good morning."').tokens, registry, settings);
    let requests = 0, effects = 0, mode = 'apply';
    const engine = new SpeechEngine({ request: async () => { requests++; throw new Error('A cached effect refresh must not request Fish.'); } }, settings, {
        process: async chapter => chapter.clips.map(clip => ({ id: clip.id, samples: chapter.original.slice(clip.start * 44100, clip.end * 44100), notes: [] })),
        youngify: async (samples, options) => {
            effects++; if (mode === 'fail') throw new Error('Bridge unavailable');
            return { samples: mode === 'unchanged' ? samples.slice() : samples.map(value => value * options.pitchSemitones / 2),
                notes: [mode === 'unchanged' ? 'Praat: no stable voiced pitch; audio left unchanged.' : 'Praat: pitch and formants adjusted; duration preserved.'] };
        },
    });
    const prepare = () => { registry.acceptCharacter({ id: 'daphne', properties }); engine.prepare('effect-cache', timeline, registry); };
    prepare();
    const plan = engine.plan(), original = new Float32Array(40).fill(.1);
    const chapter = { index: 0, original, words: [], duration: 40 / 44100, clips: engine.prepared.segments.map((line, index) => ({ id: line.id, line, beat: line.beat,
        start: index * 20 / 44100, end: (index + 1) * 20 / 44100, coverage: 1, reasons: [] })) };
    const job = { plan, chapters: [chapter], status: 'complete' };
    if (cached) { engine.cache.set(engine.key(plan), job); engine.job = job; }
    return { engine, chapter, properties, prepare, set mode(value) { mode = value; }, get requests() { return requests; }, get effects() { return effects; } };
}
