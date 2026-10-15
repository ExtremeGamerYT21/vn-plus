import { readMessage } from './message-reader.js';
import { parsePOV } from './vn-parser.js';
import { trackSpec } from './scene-timeline.js';

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
