import { readMessage } from './message-reader.js';
import { parsePOV } from './vn-parser.js';
import { backgroundSpec, musicSpec, compileTimeline } from './scene-timeline.js';
import { lastSceneHeader } from './scene-context.js';

export function inheritedScene(context, index) {
    const result = inheritedPresentation(context, index);
    result.scene = null;
    if (!Number.isInteger(index) || index < 0 || index >= (context.chat?.length || 0)) return result;
    for (let i = index; i >= 0 && !result.scene; i--) {
        const message = readMessage(context, i);
        if (!message) continue;
        // The current POV's headers run in timeline order; never look ahead to its end.
        if (i < index && message.status === 'ready') result.scene = parsePOV(message.pov).tokens.filter(token => token.type === 'header').at(-1)?.value || null;
        result.scene ||= lastSceneHeader(message.canonical);
    }
    return result;
}

/** Transient POV history only: no past prose/artifacts or one-shot effects enter the new scene. */
export function worldHistory(context, index) {
    const tokens = [];
    for (let i = 0; i < index && i < (context.chat?.length || 0); i++) {
        const message = readMessage(context, i);
        if (message?.status !== 'ready') continue;
        for (const token of parsePOV(message.pov).tokens) {
            if (token.type === 'dialogue') tokens.push({ type: 'dialogue', character: token.character, emotion: token.emotion });
            else if (token.type === 'command' && !['SFX', 'FLASH', 'SHAKE'].includes(token.name)) tokens.push(token);
        }
    }
    return tokens;
}

export function inheritedWorld(tokens, registry, settings, scene) {
    const state = compileTimeline(tokens, registry, settings, {}, false).finalState;
    state.scene = scene || null; state.speaker = null;
    return state;
}

/** Reconstruct only persistent background/music commands from earlier selected POV swipes. */
export function inheritedPresentation(context, index) {
    if (!Number.isInteger(index) || index < 0 || index >= (context.chat?.length || 0)) return { background: null, music: null };
    function* earlier() {
        for (let i = index - 1; i >= 0; i--) {
            const message = readMessage(context, i);
            if (message?.status === 'ready') yield parsePOV(message.pov).tokens;
        }
    }
    return restorePresentation(earlier());
}

/** Newest-first token groups fill missing media independently. Legacy clears/stops
 * and scene resets do not erase the last chosen background or music. */
export function restorePresentation(groups, state = {}) {
    const result = { ...state, background: state.background || null, music: structuredClone(state.music || null) };
    const missing = new Set(['background', 'music'].filter(key => !result[key]));
    if (!missing.size) return result;
    for (const tokens of groups) {
        for (let j = tokens.length - 1; j >= 0 && missing.size; j--) {
            const token = tokens[j];
            if (token.type !== 'command') continue;
            if (token.name === 'BACKGROUND' && missing.has('background')) {
                const value = backgroundSpec(token.args); if (!value) continue;
                result.background = value;
                missing.delete('background');
            } else if (token.name === 'MUSIC' && missing.has('music')) {
                const value = musicSpec(token.args); if (!value) continue;
                result.music = value; missing.delete('music');
            }
        }
        if (!missing.size) break;
    }
    return result;
}
