import { isDialogueAttribution } from './dialogue-text.js';

const quotes = { '"': '"', '“': '”', "'": "'", '‘': '’' };
const letter = value => !!value && /[\p{L}\p{N}]/u.test(value);
const apostrophe = (text, at) => /['’]/.test(text[at]) && letter(text[at - 1]) && letter(text[at + 1]);
function escaped(text, at) { let count = 0; while (text[--at] === '\\') count++; return !!(count % 2); }
function closingQuote(text, start) {
    const stack = [quotes[text[start]]];
    for (let at = start + 1; at < text.length; at++) {
        const char = text[at], close = stack.at(-1);
        if (escaped(text, at) || apostrophe(text, at)) continue;
        if (char === close) {
            // Unescaped inner quotes such as: "a \"proper\" answer".
            if (/['"]/.test(char) && /[\s(:—–]/.test(text[at - 1]) && letter(text[at + 1])) { stack.push(char); continue; }
            stack.pop(); if (!stack.length) return at;
        } else if (quotes[char] === close) stack.push(close);
    }
    return -1;
}
function openingQuote(text, start) {
    for (let at = start; at < text.length; at++) if (quotes[text[at]] && !escaped(text, at) && !apostrophe(text, at)
        && !(text[at] === "'" && letter(text[at - 1]))) return at;
    return text.length;
}

/** Split a speaker-labelled quoted passage; bare narration elsewhere is untouched. */
export function quotedDialogueParts(text) {
    const start = text.search(/\S/);
    if (start < 0 || !quotes[text[start]]) return null;
    const parts = []; let at = start, adjusted = false;
    while (at < text.length) {
        const end = closingQuote(text, at);
        if (end < 0) return { complete: false, parts: [] };
        const dialogue = { type: 'dialogue', text: text.slice(at, end + 1), offset: at }; parts.push(dialogue);
        at = end + 1;
        const punctuation = /^\s*([,;:.!?…]+)(?=\s|$)/.exec(text.slice(at));
        if (punctuation) {
            dialogue.text = dialogue.text.slice(0, -1) + punctuation[1] + dialogue.text.at(-1);
            at += punctuation[0].length; adjusted = true;
        }
        const directions = [];
        let tag;
        while ((tag = /^\s*\[([^\]\r\n]+)\]/.exec(text.slice(at)))) { directions.push(tag[1].trim()); at += tag[0].length; }
        if (directions.length) { dialogue.direction = directions.join(', '); adjusted = true; }
        const next = openingQuote(text, at), aside = text.slice(at, next).trim();
        if (next === text.length && isDialogueAttribution(aside, true)) return { complete: false, parts: [] };
        if (aside && !isDialogueAttribution(aside) && /[\p{L}\p{N}]/u.test(aside)) parts.push({ type: 'narration', text: aside, offset: at });
        at = next;
    }
    return { complete: true, parts, mixed: parts.length > 1 || adjusted };
}
