export const SPEEDS = { normal: 1, slowed: .75, slow: .75, half: .5, sped: 1.4, fast: 1.4, double: 2 };
const clone = value => structuredClone(value);

export function emptyState(mode = 'vn') {
    return { background: null, music: null, ambient: null, characters: Object.create(null), speaker: null, textEffect: 'normal', mode, black: false, camera: { zoom: 1, x: 0, y: 0 }, tint: 'transparent' };
}

export function trackSpec(args) {
    if (/^(stop|none)$/i.test(args)) return null;
    const match = /\s+(normal|slowed|slow|half|sped|fast|double)$/i.exec(args);
    return args ? { name: match ? args.slice(0, match.index) : args, rate: SPEEDS[match?.[1]?.toLowerCase()] || 1 } : null;
}

export function compileTimeline(tokens, registry, settings) {
    let state = emptyState(settings.displayMode);
    const beats = [], errors = [], views = [];
    const names = tokens.filter(token => token.type === 'dialogue' || (token.type === 'command' && token.name === 'ENTER')).map(token => token.character || token.args);
    const cast = [...new Set(names.map(name => registry.identify(name)))];
    const maxSlots = Math.max(1, cast.filter(id => settings.showPlayerBust || !registry.isPlayer(id)).length);
    const enter = (name, emotion) => {
        const id = registry.identify(name);
        if (!settings.showPlayerBust && registry.isPlayer(id)) return id;
        const present = state.characters[id];
        if (present) { if (emotion) present.expression = emotion; return id; }
        const used = () => new Set(Object.values(state.characters).map(char => char.slot));
        let slot = 0;
        if (registry.isPlayer(id)) {
            const occupant = Object.values(state.characters).find(char => char.slot === 0);
            if (occupant) { const occupied = used(); slot = 1; while (occupied.has(slot)) slot++; occupant.slot = slot; }
            slot = 0;
        } else { const occupied = used(); while (occupied.has(slot)) slot++; }
        state.characters[id] = { id, name: registry.get(id).displayName || name, expression: emotion || registry.get(id).defaultExpression || 'default', slot };
        return id;
    };
    for (const token of tokens) {
        const oneShots = [];
        if (token.type === 'dialogue') state.speaker = enter(token.character, token.emotion);
        else if (token.type === 'narration' || token.type === 'artifact') state.speaker = null;
        else if (token.type === 'command') {
            const arg = token.args, upper = arg.toUpperCase();
            switch (token.name) {
                case 'BACKGROUND': state.background = /^(NONE|CLEAR)$/i.test(arg) ? null : arg || null; break;
                case 'MUSIC': state.music = trackSpec(arg); break;
                case 'AMBIENT': state.ambient = trackSpec(arg); break;
                case 'SFX': if (arg) oneShots.push({ type: 'sfx', name: arg }); break;
                case 'ENTER': if (arg) enter(arg); break;
                case 'EXIT': delete state.characters[registry.identify(arg)]; state.speaker = null; break;
                case 'FADE': if (upper === 'BLACK') state.black = true; else if (upper === 'IN') state.black = false; else errors.push({ line: token.line, message: 'Use #FADE BLACK or #FADE IN.' }); break;
                case 'FLASH': oneShots.push({ type: 'flash', value: arg || 'WHITE' }); break;
                case 'SHAKE': oneShots.push({ type: 'shake', value: arg || 'LIGHT' }); break;
                case 'TEXT': state.textEffect = arg.toLowerCase() || 'normal'; break;
                case 'MODE': if (['vn', 'prose', 'cinematic', 'black'].includes(arg.toLowerCase())) state.mode = arg.toLowerCase(); else errors.push({ line: token.line, message: 'Unknown display mode.' }); break;
                case 'SCENE': state.characters = Object.create(null); state.speaker = null; if (upper === 'RESET') state = emptyState(settings.displayMode); break;
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
        const index = beats.length;
        beats.push({ index, token, state: clone(state), oneShots });
        if (token.type !== 'command') views.push(index);
    }
    return { beats, views, maxSlots, errors };
}
