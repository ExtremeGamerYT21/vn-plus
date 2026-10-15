import { readMessage, latestAssistant } from './message-reader.js';
import { parsePOV } from './vn-parser.js';
import { lastSceneHeader } from './scene-context.js';

/** Derive per-response diary deltas from finalized selected POVs, including while VN is closed. */
export function collectJournals(host, environment) {
    const context = host.context(); let scene = null, changed = 0;
    for (let index = 0; index <= latestAssistant(context); index++) {
        const message = readMessage(context, index); if (!message) continue;
        scene = lastSceneHeader(message.canonical) || scene;
        if (message.status !== 'ready') continue;
        const parsed = parsePOV(message.pov);
        for (const token of parsed.tokens) if (token.type === 'header') scene = token.value;
        const entries = (parsed.journal?.entries || []).map(entry => ({ ...entry, source: 'pov',
            when: [scene?.dateLabel, scene?.timeLabel].filter(Boolean).join(' · ') || 'Undated' }));
        // Source metadata is available only after this response's presentation beats.
        if (host.extra.syncJournal(index, environment, entries.length ? { beat: parsed.tokens.length, entries } : null)) changed++;
    }
    return changed;
}
