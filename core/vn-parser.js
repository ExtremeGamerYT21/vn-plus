import { isNarratorName } from './character-registry.js';
import { parseSceneHeader } from './scene-context.js';
import { parseJournal } from './journal-format.js';
import { stripDialogueAttribution } from './dialogue-text.js';
const COMMANDS = new Set(['BACKGROUND', 'MUSIC', 'AMBIENT', 'SFX', 'FADE', 'FLASH', 'SHAKE', 'TEXT', 'ENTER', 'EXIT', 'MODE', 'CAMERA', 'TINT', 'SCENE', 'VISUAL']);
const LEGACY = { SOUNDFX: 'SFX' };
const ROOT_HTML = /^\s*(?:<!doctype\s+html\b|<(?:html|article|section|div|main|svg|table|canvas|figure|pre|p|style|h[1-6]|details)\b)/i;

// A single outer pair must enclose the whole utterance; an aside within speech
// such as "Hello (again)." remains ordinary dialogue.
function thoughtWrapper(text) {
    if (!text.startsWith('(')) return false;
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')' && --depth === 0) return i === text.length - 1;
    }
    return null; // Streaming thought with an unfinished outer pair.
}
function completedDialogue(text) {
    const value = stripDialogueAttribution(text.trim().replace(/\s*\[[^\]\r\n]+\]\s*$/, '')).trim();
    const closing = { '"': '"', '“': '”', "'": "'", '‘': '’' }[value[0]];
    return closing ? value.length > 1 && value.endsWith(closing) : thoughtWrapper(value) === true || /\[[^\]]+\]\s*$/.test(text);
}

/** Only call with splitMessage(...).pov. Never with a raw combined message. */
export function parsePOV(pov) {
    const tokens = [], errors = [];
    const lines = (pov || '').match(/[^\n]*\n|[^\n]+$/g) || [];
    let current = null, html = null, fence = null, journal = null, journalBlocks = 0;
    const htmlDepth = (line, tag) => {
        const tags = line.match(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi')) || [];
        return tags.reduce((depth, value) => depth + (value.startsWith('</') ? -1 : /\/\s*>$/.test(value) ? 0 : 1), 0);
    };
    const flush = () => {
        if (!current) return;
        let text = current.text;
        let emotion = 'default', thought = false, direction;
        if (current.type === 'dialogue') {
            const tag = /\s*\[([^\]\r\n]+)\][ \t]*(?:\r?\n)?$/.exec(text);
            if (tag) { direction = tag[1].trim(); emotion = direction.toLowerCase(); text = text.slice(0, tag.index); }
            text = stripDialogueAttribution(text);
            const quote = text.trim()[0];
            const closing = { '"': '"', '“': '”', "'": "'", '‘': '’' }[quote];
            if (closing && (text.trim().length < 2 || !text.trim().endsWith(closing))) {
                errors.push({ line: current.line, message: 'Incomplete quoted dialogue withheld.' }); current = null; return;
            }
            const content = closing ? text.trim().slice(1, -1).trim() : text.trim();
            thought = thoughtWrapper(content);
            if (thought === null) {
                errors.push({ line: current.line, message: 'Incomplete internal thought withheld.' }); current = null; return;
            }
        }
        if (text.trim()) {
            if (current.type === 'dialogue' && isNarratorName(current.character)) tokens.push({ type: 'narration', text, line: current.line });
            else tokens.push({ ...current, text, ...(current.type === 'dialogue' ? { emotion, ...(direction ? { direction } : {}), ...(thought ? { thought: true } : {}) } : {}) });
        }
        current = null;
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i], clean = line.replace(/\r?\n$/, ''), trimmed = clean.trim();
        if (fence) {
            if (new RegExp(`^\\s*${fence.marker}{${fence.count},}\\s*$`).test(clean)) {
                if (fence.journal) {
                    try {
                        if (++journalBlocks > 1 || lines.slice(i + 1).some(line => line.trim())) throw new Error('Journal metadata must be a single block at the end of the POV.');
                        journal = { entries: parseJournal(fence.text), line: fence.line };
                    } catch (error) { journal = null; errors.push({ line: fence.line, message: `Journal metadata ignored: ${error.message}` }); }
                }
                else if (fence.html) tokens.push({ type: 'artifact', html: fence.text, interactive: fence.interactive, ...(fence.id ? { id: fence.id } : {}), line: fence.line });
                else if (fence.text.trim()) tokens.push({ type: 'narration', text: fence.text, line: fence.line });
                fence = null;
            } else fence.text += line;
            continue;
        }
        const startFence = /^\s*(`{3,}|~{3,})([^\r\n]*)$/.exec(clean);
        if (startFence && /^vnplus-journal(?:\s|$)/i.test(startFence[2].trim()) && current?.type === 'dialogue' && !completedDialogue(current.text)) { current.text += line; continue; }
        if (startFence && !html) {
            flush();
            fence = { marker: startFence[1][0], count: startFence[1].length, html: /^html(?:\s|$)/i.test(startFence[2].trim()), interactive: /\binteractive\b/i.test(startFence[2]), text: '', line: i + 1 };
            fence.journal = /^vnplus-journal(?:\s|$)/i.test(startFence[2].trim());
            const id = /(?:^|\s)id=([a-zA-Z0-9][a-zA-Z0-9_.-]{0,63})(?=\s|$)/.exec(startFence[2]);
            if (id) fence.id = id[1];
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
        const header = parseSceneHeader(clean);
        if (header && !(current?.type === 'dialogue' && !completedDialogue(current.text))) { flush(); tokens.push({ type: 'header', value: header, line: i + 1 }); continue; }
        const command = /^\s*([#@])([A-Z][\w]*)\b(?:[ \t]+(.*))?$/i.exec(clean);
        if (command) {
            flush();
            const name = LEGACY[command[2].toUpperCase()] || command[2].toUpperCase();
            if (name === 'ARTIFACT' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(command[3]?.trim() || '')) tokens.push({ type: 'artifact', id: command[3].trim(), local: true, interactive: true, line: i + 1 });
            else if (COMMANDS.has(name)) {
                let args = command[3]?.trim() || '';
                const tag = /\s*\[([^\]\r\n]+)\]\s*$/.exec(args), reaction = tag?.[1].trim();
                if (tag) args = args.slice(0, tag.index).trim();
                if (name === 'VISUAL' && (/^CLOSE$/i.test(args) || !/^(?:CLOSE\s+)?[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/i.test(args))) errors.push({ line: i + 1, message: 'Use #VISUAL id or #VISUAL CLOSE id [reaction].' });
                else tokens.push({ type: 'command', name, args, ...(reaction ? { reaction } : {}), line: i + 1 });
            }
            else errors.push({ line: i + 1, message: `Unknown command ${command[1]}${command[2]} ignored.` });
            continue;
        }
        if (/^NARRATION$/i.test(trimmed)) { flush(); current = { type: 'narration', text: '', line: i + 1 }; continue; }
        // Unicode and punctuation names; a quote, thought or ending expression distinguishes
        // dialogue from prose labels such as "Note: this is a room".
        const dialogue = /^\s*([^:\r\n<>]{1,100}):[ \t]*(.*)$/.exec(clean);
        if (dialogue && isNarratorName(dialogue[1]) && !/^["“'‘(]/.test(dialogue[2]) && !/\[[^\]]+\]\s*$/.test(dialogue[2])) {
            flush(); current = { type: 'narration', text: dialogue[2] + (line.endsWith('\n') ? '\n' : ''), line: i + 1 }; continue;
        }
        if (dialogue && (/^["“'‘(]/.test(dialogue[2]) || /\[[^\]]+\]\s*$/.test(dialogue[2]))) {
            flush(); current = { type: 'dialogue', character: dialogue[1].trim(), text: dialogue[2] + (line.endsWith('\n') ? '\n' : ''), line: i + 1 }; continue;
        }
        if (!trimmed && current?.type === 'dialogue') { flush(); continue; }
        if (current?.type === 'dialogue' && completedDialogue(current.text)) flush();
        if (!trimmed && !current) continue;
        current ??= { type: 'narration', text: '', line: i + 1 };
        current.text += line;
    }
    flush();
    if (fence || html) errors.push({ line: (fence || html).line, message: 'Unclosed artifact/code block withheld until complete.' });
    return { tokens, errors, ...(journal ? { journal } : {}) };
}
