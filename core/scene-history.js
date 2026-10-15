import { readMessage } from './message-reader.js';
import { parsePOV } from './vn-parser.js';
import { trackSpec, compileTimeline } from './scene-timeline.js';
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
    const result = { background: null, music: null }, found = new Set();
    if (!Number.isInteger(index) || index < 0 || index >= (context.chat?.length || 0)) return result;
    for (let i = index - 1; i >= 0 && found.size < 2; i--) {
        const message = readMessage(context, i);
        if (message?.status !== 'ready') continue;
        const tokens = parsePOV(message.pov).tokens;
        for (let j = tokens.length - 1; j >= 0 && found.size < 2; j--) {
            const token = tokens[j];
            if (token.type !== 'command') continue;
            if (token.name === 'SCENE' && /^RESET$/i.test(token.args)) {
                // Reset is a boundary even if older messages contain usable media commands.
                found.add('background'); found.add('music');
            } else if (token.name === 'BACKGROUND' && !found.has('background')) {
                result.background = /^(NONE|CLEAR)$/i.test(token.args) ? null : token.args || null;
                found.add('background');
            } else if (token.name === 'MUSIC' && !found.has('music')) {
                result.music = trackSpec(token.args); found.add('music');
            }
        }
    }
    return result;
}
