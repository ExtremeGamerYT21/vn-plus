import { readMessage, latestAssistant, sceneKey } from './message-reader.js';
import { parsePOV } from './vn-parser.js';
import { lastSceneHeader } from './scene-context.js';
import { emptyState, compileTimeline } from './scene-timeline.js';
import { restorePresentation } from './scene-history.js';
import { characterPresent } from './character-presence.js';

/** Only structured scene information crosses this boundary; prose and artifacts never do. */
export function contextEntries(context, end = latestAssistant(context)) {
    const entries = [];
    for (let index = 0; index <= end && index < (context.chat?.length || 0); index++) {
        const message = readMessage(context, index);
        if (!message) continue;
        const header = lastSceneHeader(message.canonical);
        const tokens = message.status === 'ready' ? parsePOV(message.pov).tokens.flatMap(token => {
            if (token.type === 'dialogue') return [{ type: 'dialogue', character: token.character, emotion: token.emotion, ...(token.direction && token.emotion === 'default' ? { explicitEmotion: true } : {}) }];
            if (token.type === 'command') return ['SFX', 'FLASH', 'SHAKE'].includes(token.name) ? [] : [token];
            if (token.type === 'header') return [token];
            return [{ type: 'narration' }]; // Clear speaker without retaining text/HTML.
        }) : [];
        entries.push({ index, swipe: message.swipe, ready: message.status === 'ready', revision: sceneKey(context, message), header, tokens });
    }
    return entries;
}

const location = scene => String(scene?.location || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export function applyContextHeader(state, header) {
    if (!header) return state;
    if (location(state.scene) && location(state.scene) !== location(header)) { state.characters = Object.create(null); state.speaker = null; }
    state.scene = structuredClone(header);
    return state;
}

/** Last N completed POV responses cache cast identities/emotions; each message controls visible presence. */
export function reduceContext(entries, registry, settings, { beforeLast = false } = {}) {
    let state = emptyState(settings.displayMode), turn = -1;
    const seen = new Map(), limit = Math.max(0, Math.min(50, Math.floor(Number(settings.castMemoryTurns) || 0)));
    const names = entry => entry.tokens.filter(token => token.type === 'dialogue' || token.name === 'ENTER').map(token => token.character || token.args);
    for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        if (entry.ready) {
            turn++;
            if (limit) for (const id of Object.keys(state.characters)) if (!characterPresent(state.characters[id]) && turn - (seen.get(id) ?? -Infinity) >= limit) delete state.characters[id];
        }
        applyContextHeader(state, entry.header);
        if (beforeLast && index === entries.length - 1) break;
        if (entry.ready) state = compileTimeline(entry.tokens, registry, settings, state, false).finalState;
        for (const name of names(entry)) if (!registry.isNarrator(name)) seen.set(registry.identify(name), turn);
    }
    if (state.background && state.music) return state;
    function* earlier() {
        for (let index = entries.length - (beforeLast ? 2 : 1); index >= 0; index--) yield entries[index].tokens;
    }
    return restorePresentation(earlier(), state);
}

export const contextNames = entries => entries.flatMap(entry => entry.tokens.filter(token => token.character || token.name === 'ENTER' || token.name === 'EXIT').map(token => token.character || token.args));
