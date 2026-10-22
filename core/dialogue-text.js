const word = "[\\p{L}][\\p{L}\\p{M}'’.-]*";
const subject = `${word}(?:[ \\t]+${word}){0,4}`;
const verbs = 'said|says|asked|asks|replied|replies|answered|answers|repeated|repeats|added|adds|continued|continues|whispered|whispers|muttered|mutters|murmured|murmurs|shouted|shouts|yelled|yells|snapped|snaps|remarked|remarks|called|calls|noted|notes|responded|responds|exclaimed|exclaims|insisted|insists|explained|explains'.split('|');
const verb = `(?:${verbs.join('|')})`;
const delivery = '(?:quietly|softly|flatly|dryly|sharply|firmly|briskly|calmly|loudly|slowly|quickly|gently|angrily|sadly|happily|wearily|evenly|tersely|simply|again|back)';
const attribution = new RegExp(`^(?:${subject}(?:[ \\t]+${delivery})?[ \\t]+${verb}|${verb}[ \\t]+${subject})(?:[ \\t]+${delivery}){0,2}[.!?,;:]?$`, 'iu');
const partialAttribution = new RegExp(`^${subject}[ \\t]+(${word})$`, 'u');
export function isDialogueAttribution(text, partial = false) {
    const tail = String(text || '').trim().replace(/^[,—–-]\s*/, '');
    if (tail.length > 240) return false;
    if (!partial) return attribution.test(tail);
    const match = partialAttribution.exec(tail);
    return !!match && verbs.some(value => value.startsWith(match[1].toLowerCase()) && value !== match[1].toLowerCase());
}

/** Ignore quote/emphasis wrappers and delivery tags when checking an interrupted utterance. */
export const endsWithEmDash = text => /—$/.test(String(text || '').replace(/\s*\[[^\]\r\n]*\]\s*$/, '').replace(/[\s"”'’)*_]+$/u, ''));

/** Bracketed delivery instructions belong to speech input, never the dialogue box. */
export function dialogueDisplayText(text) {
    const source = String(text || '');
    if (!/\[[^\[\]\r\n]*\]/.test(source)) return source;
    const visible = source.replace(/\[[^\[\]\r\n]*\]/g, ' ')
        .replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.;:!?…—–)])/g, '$1')
        .replace(/([“‘(])[ \t]+/g, '$1').replace(/^([ \t]*["'])[ \t]+/, '$1')
        .replace(/[ \t]+(["”'’])[ \t]*$/, '$1').trim();
    return /[^\s"'“”‘’*_]/.test(visible) ? visible : '';
}

/** Remove only a short, standalone speech attribution outside a completed quote.
 * Quoted content, independent narration and action clauses are left alone. */
export function stripDialogueAttribution(text) {
    const value = text.trimEnd(), offset = value.length - value.trimStart().length;
    const closing = { '"': '"', '“': '”', "'": "'", '‘': '’' }[value[offset]];
    if (!closing || value.endsWith(closing)) return text;
    for (let index = value.length - 1; index > offset; index--) {
        if (value[index] !== closing) continue;
        let escapes = 0; for (let at = index - 1; value[at] === '\\'; at--) escapes++;
        if (escapes % 2) continue;
        const tail = value.slice(index + 1).trim().replace(/^[,—–-]\s*/, '');
        return isDialogueAttribution(tail) ? value.slice(0, index + 1) : text;
    }
    return text;
}
