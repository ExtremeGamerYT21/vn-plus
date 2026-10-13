/** Raw messages stop here. Neither half is trimmed or reformatted. */
export function splitMessage(raw) {
    const source = typeof raw === 'string' ? raw : '';
    const match = /^\/{5}(?:\r?\n|$)/m.exec(source);
    if (!match) return { canonical: source, pov: '', status: 'missing' };
    const pov = source.slice(match.index + match[0].length);
    return { canonical: source.slice(0, match.index), pov, status: pov.trim() ? 'ready' : 'empty' };
}

export function chatIdentity(context) {
    return JSON.stringify([context.groupId ?? null, context.characterId ?? null,
        context.getCurrentChatId?.() ?? context.chatId ?? null]);
}

export function readMessage(context, index) {
    const message = context.chat?.[index];
    if (!Number.isInteger(index) || !message || message.is_user || message.is_system) return null;
    // SillyTavern's mes is the authoritative current edited/selected swipe.
    const raw = typeof message.mes === 'string' ? message.mes : '';
    return { index, swipe: message.swipe_id ?? 0, raw, ...splitMessage(raw) };
}

export function latestAssistant(context) {
    for (let i = (context.chat?.length ?? 0) - 1; i >= 0; i--) {
        if (readMessage(context, i)) return i;
    }
    return -1;
}

export function sceneKey(context, message) {
    // Exact source is used transiently by the controller for revision checks;
    // the bounded seen-beat cache stores only this fingerprint, never text.
    let hash = 2166136261;
    for (let i = 0; i < message.pov.length; i++) hash = Math.imul(hash ^ message.pov.charCodeAt(i), 16777619);
    return JSON.stringify([chatIdentity(context), message.index, message.swipe, message.pov.length, hash >>> 0]);
}
