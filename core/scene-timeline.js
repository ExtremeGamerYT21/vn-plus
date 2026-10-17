import { characterPresent, characterSilence, SILENT_BEAT_GRACE, QUIET_FADE_BEATS } from './character-presence.js';
export const SPEEDS = { normal: 1, slowed: .75, slow: .75, half: .5, sped: 1.4, fast: 1.4, double: 2 };
const clone = value => structuredClone(value);

export function emptyState(mode = 'vn') {
    return { background: null, music: null, ambient: null, scene: null, visuals: {}, characters: Object.create(null), playerEmotion: null, speaker: null, textEffect: 'normal', mode, black: false, camera: { zoom: 1, x: 0, y: 0 }, tint: 'transparent' };
}

export function trackSpec(args) {
    if (/^(stop|none)$/i.test(args)) return null;
    const match = /\s+(normal|slowed|slow|half|sped|fast|double)$/i.exec(args);
    return args ? { name: match ? args.slice(0, match.index) : args, rate: SPEEDS[match?.[1]?.toLowerCase()] || 1 } : null;
}

// Old clearing/stopping directives are inert; persistent media changes only to a named asset.
export const backgroundSpec = args => args && !/^(NONE|CLEAR|STOP)$/i.test(args) ? args : null;
export const musicSpec = args => /^(NONE|CLEAR|STOP)$/i.test(args) ? null : trackSpec(args);

export function compileTimeline(tokens, registry, settings, inherited = {}, recordBeats = true) {
    let state = emptyState(settings.displayMode);
    for (const key of ['background', 'music', 'ambient', 'scene', 'visuals', 'textEffect', 'mode', 'black', 'camera', 'tint', 'playerEmotion']) if (Object.hasOwn(inherited, key)) state[key] = clone(inherited[key]);
    state.characters = Object.assign(Object.create(null), clone(inherited.characters || {}));
    for (const id of Object.keys(state.characters)) if (registry.isNarrator(id) || !settings.showPlayerBust && registry.isPlayer(id)) delete state.characters[id];
    const beats = [], errors = [], views = [];
    const names = tokens.filter(token => token.type === 'dialogue' || (token.type === 'command' && token.name === 'ENTER')).map(token => token.character || token.args);
    const participants = new Set(names.filter(name => !registry.isNarrator(name)).map(name => registry.identify(name)));
    for (const character of Object.values(state.characters)) character.present = characterPresent(character) && (participants.has(character.id) || characterSilence(character) <= SILENT_BEAT_GRACE);
    const cast = [...new Set([...participants, ...Object.values(state.characters).filter(characterPresent).map(character => character.id)])];
    const maxSlots = Math.max(1, cast.filter(id => !registry.isNarrator(id) && (settings.showPlayerBust || !registry.isPlayer(id))).length);
    const enter = (name, emotion) => {
        const id = registry.identify(name);
        if (registry.isNarrator(name)) return null;
        if (registry.isPlayer(id)) state.playerEmotion = emotion || state.playerEmotion || registry.get(id).defaultExpression || 'default';
        if (!settings.showPlayerBust && registry.isPlayer(id)) return id;
        const present = state.characters[id];
        if (present && characterPresent(present)) { if (emotion) present.expression = emotion; return id; }
        const used = () => new Set(Object.values(state.characters).filter(characterPresent).map(char => char.slot));
        let slot = 0;
        if (registry.isPlayer(id)) {
            const occupant = Object.values(state.characters).find(char => characterPresent(char) && char.slot === 0);
            if (occupant) { const occupied = used(); slot = 1; while (occupied.has(slot)) slot++; occupant.slot = slot; }
            slot = 0;
        } else { const occupied = used(); while (occupied.has(slot)) slot++; }
        state.characters[id] = { id, name: registry.get(id).displayName || name, expression: emotion || present?.expression || registry.get(id).defaultExpression || 'default', slot, present: true, silentBeats: 0 };
        return id;
    };
    for (const token of tokens) {
        const oneShots = [];
        if (token.type === 'header') {
            const location = scene => String(scene?.location || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
            if (location(state.scene) && location(state.scene) !== location(token.value)) { state.characters = Object.create(null); state.speaker = null; }
            state.scene = clone(token.value);
        }
        else if (token.type === 'dialogue') state.speaker = enter(token.character, token.emotion === 'default' && !token.direction && !token.explicitEmotion ? undefined : token.emotion);
        else if (token.type === 'narration' || token.type === 'artifact') state.speaker = null;
        else if (token.type === 'command') {
            const arg = token.args, upper = arg.toUpperCase();
            switch (token.name) {
                case 'BACKGROUND': if (backgroundSpec(arg)) state.background = backgroundSpec(arg); break;
                case 'MUSIC': if (musicSpec(arg)) state.music = musicSpec(arg); break;
                case 'AMBIENT': state.ambient = trackSpec(arg); break;
                case 'SFX': if (arg) oneShots.push({ type: 'sfx', name: arg }); break;
                case 'VISUAL': {
                    const close = /^CLOSE\s+/i.test(arg), id = arg.replace(/^CLOSE\s+/i, '');
                    if (close) delete state.visuals[id];
                    else if (!Object.hasOwn(state.visuals, id)) Object.defineProperty(state.visuals, id, { value: { id, local: true, interactive: true }, configurable: true, enumerable: true, writable: true });
                    break;
                }
                case 'ENTER': if (arg) enter(arg); break;
                case 'EXIT': delete state.characters[registry.identify(arg)]; state.speaker = null; break;
                case 'FADE': if (upper === 'BLACK') state.black = true; else if (upper === 'IN') state.black = false; else errors.push({ line: token.line, message: 'Use #FADE BLACK or #FADE IN.' }); break;
                case 'FLASH': oneShots.push({ type: 'flash', value: arg || 'WHITE' }); break;
                case 'SHAKE': oneShots.push({ type: 'shake', value: arg || 'LIGHT' }); break;
                case 'TEXT': state.textEffect = arg.toLowerCase() || 'normal'; break;
                case 'MODE': if (['vn', 'prose', 'cinematic', 'black'].includes(arg.toLowerCase())) state.mode = arg.toLowerCase(); else errors.push({ line: token.line, message: 'Unknown display mode.' }); break;
                case 'SCENE': state.characters = Object.create(null); state.speaker = null; if (upper === 'RESET') state = { ...emptyState(settings.displayMode), scene: state.scene, background: state.background, music: state.music }; break;
                case 'TINT': state.tint = arg || 'transparent'; break;
                case 'CAMERA': {
                    const [action, first, second] = arg.split(/\s+/);
                    if (action?.toUpperCase() === 'RESET') state.camera = { zoom: 1, x: 0, y: 0 };
                    else if (action?.toUpperCase() === 'ZOOM' && Number.isFinite(Number(first))) state.camera.zoom = Math.max(.5, Math.min(3, Number(first)));
                    else if (action?.toUpperCase() === 'PAN') { state.camera.x = Math.max(-30, Math.min(30, Number(first) || 0)); state.camera.y = Math.max(-30, Math.min(30, Number(second) || 0)); }
                    break;
                }
            }
        }
        if (['dialogue', 'narration', 'artifact'].includes(token.type)) for (const character of Object.values(state.characters)) if (characterPresent(character)) {
            character.silentBeats = character.id === state.speaker ? 0 : Math.min(SILENT_BEAT_GRACE + QUIET_FADE_BEATS, characterSilence(character) + 1);
            if (!participants.has(character.id) && character.silentBeats > SILENT_BEAT_GRACE) character.present = false;
        }
        if (recordBeats) {
            const index = beats.length;
            beats.push({ index, token, state: clone(state), oneShots });
            if (token.type !== 'command' && token.type !== 'header') views.push(index);
        }
    }
    if (recordBeats && !views.length && Object.keys(state.visuals).length) {
        const index = beats.length;
        beats.push({ index, token: { type: 'interaction', text: 'Inspect the object, then continue.', line: tokens.at(-1)?.line || 1 }, state: clone(state), oneShots: [] });
        views.push(index);
    }
    // Keep source command beats for context reconstruction, but execute trailing commands
    // during their dialogue beat rather than waiting for the next paragraph.
    for (const beat of beats) {
        beat.attached = [];
        if (beat.token.type === 'dialogue') for (let i = beat.index + 1; beats[i]?.token.type === 'command'; i++) {
            const command = beats[i]; command.attachedTo = beat.index;
            beat.attached.push(command);
        }
        beat.visualChecks = [];
        if (beat.token.type === 'narration') for (const id of Object.keys(beat.state.visuals)) {
            for (let i = beat.index + 1; i < beats.length; i++) {
                const token = beats[i].token;
                if (token.name === 'SCENE' && /^RESET$/i.test(token.args)) break;
                if (token.name !== 'VISUAL') continue;
                if (/^CLOSE\s+/i.test(token.args) && token.args.replace(/^CLOSE\s+/i, '') === id) { beat.visualChecks.push(id); break; }
            }
        }
    }
    return { beats, views, maxSlots, errors, finalState: clone(state) };
}
