const COMMANDS = new Set(['BACKGROUND', 'MUSIC', 'AMBIENT', 'SFX', 'FADE', 'FLASH', 'SHAKE', 'TEXT', 'ENTER', 'EXIT', 'MODE', 'CAMERA', 'TINT', 'SCENE']);
const LEGACY = { SOUNDFX: 'SFX' };
const ROOT_HTML = /^\s*(?:<!doctype\s+html\b|<(?:html|article|section|div|main|svg|table|canvas|figure|pre|p|style|h[1-6]|details)\b)/i;

/** Only call with splitMessage(...).pov. Never with a raw combined message. */
export function parsePOV(pov) {
    const tokens = [], errors = [];
    const lines = (pov || '').match(/[^\n]*\n|[^\n]+$/g) || [];
    let current = null, html = null, fence = null;
    const htmlDepth = (line, tag) => {
        const tags = line.match(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi')) || [];
        return tags.reduce((depth, value) => depth + (value.startsWith('</') ? -1 : /\/\s*>$/.test(value) ? 0 : 1), 0);
    };
    const flush = () => {
        if (!current) return;
        let text = current.text;
        let emotion = 'default';
        if (current.type === 'dialogue') {
            const tag = /\s*\[([^\]\r\n]+)\][ \t]*(?:\r?\n)?$/.exec(text);
            if (tag) { emotion = tag[1].trim().toLowerCase(); text = text.slice(0, tag.index); }
            const quote = text.trim()[0];
            const closing = { '"': '"', '“': '”', "'": "'", '‘': '’' }[quote];
            if (closing && (text.trim().length < 2 || !text.trim().endsWith(closing))) {
                errors.push({ line: current.line, message: 'Incomplete quoted dialogue withheld.' }); current = null; return;
            }
        }
        if (text.trim()) tokens.push({ ...current, text, ...(current.type === 'dialogue' ? { emotion } : {}) });
        current = null;
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i], clean = line.replace(/\r?\n$/, ''), trimmed = clean.trim();
        if (fence) {
            if (new RegExp(`^\\s*${fence.marker}{${fence.count},}\\s*$`).test(clean)) {
                if (fence.html) tokens.push({ type: 'artifact', html: fence.text, interactive: fence.interactive, line: fence.line });
                else if (fence.text.trim()) tokens.push({ type: 'narration', text: fence.text, line: fence.line });
                fence = null;
            } else fence.text += line;
            continue;
        }
        const startFence = /^\s*(`{3,}|~{3,})([^\r\n]*)$/.exec(clean);
        if (startFence) {
            flush();
            fence = { marker: startFence[1][0], count: startFence[1].length, html: /^html(?:\s|$)/i.test(startFence[2].trim()), interactive: /\binteractive\b/i.test(startFence[2]), text: '', line: i + 1 };
            continue;
        }
        if (html) {
            html.text += line;
            html.depth += htmlDepth(clean, html.tag);
            if (html.depth <= 0) { tokens.push({ type: 'artifact', html: html.text, line: html.line }); html = null; }
            continue;
        }
        if (ROOT_HTML.test(clean)) {
            flush();
            const root = /<([a-z][\w-]*)\b/i.exec(clean)?.[1]?.toLowerCase() || 'html';
            const tag = /<!doctype/i.test(clean) ? 'html' : root;
            html = { tag, text: line, depth: htmlDepth(clean, tag), line: i + 1 };
            if (html.depth <= 0 && !/<!doctype/i.test(clean)) { tokens.push({ type: 'artifact', html: html.text, line: html.line }); html = null; }
            continue;
        }
        const command = /^\s*([#@])([A-Z][\w]*)\b(?:[ \t]+(.*))?$/i.exec(clean);
        if (command) {
            flush();
            const name = LEGACY[command[2].toUpperCase()] || command[2].toUpperCase();
            if (COMMANDS.has(name)) tokens.push({ type: 'command', name, args: command[3]?.trim() || '', line: i + 1 });
            else errors.push({ line: i + 1, message: `Unknown command ${command[1]}${command[2]} ignored.` });
            continue;
        }
        if (/^NARRATION$/i.test(trimmed)) { flush(); current = { type: 'narration', text: '', line: i + 1 }; continue; }
        // Unicode and punctuation names; a quote or an ending expression distinguishes
        // dialogue from prose labels such as "Note: this is a room".
        const dialogue = /^\s*([^:\r\n<>]{1,100}):[ \t]*(.*)$/.exec(clean);
        if (dialogue && (/^["“'‘]/.test(dialogue[2]) || /\[[^\]]+\]\s*$/.test(dialogue[2]))) {
            flush(); current = { type: 'dialogue', character: dialogue[1].trim(), text: dialogue[2] + (line.endsWith('\n') ? '\n' : ''), line: i + 1 }; continue;
        }
        if (!trimmed && current?.type === 'dialogue') { flush(); continue; }
        if (!trimmed && !current) continue;
        current ??= { type: 'narration', text: '', line: i + 1 };
        current.text += line;
    }
    flush();
    if (fence || html) errors.push({ line: (fence || html).line, message: 'Unclosed artifact/code block withheld until complete.' });
    return { tokens, errors };
}
