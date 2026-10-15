/** Deliberately narrow: transformer output supplies diary content, never arbitrary extra writes. */
export function parseJournal(source) {
    if (new TextEncoder().encode(source).byteLength > 32768) throw new Error('Journal block exceeds 32 KiB.');
    const value = JSON.parse(source);
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!object(value) || Object.keys(value).some(key => key !== 'entries') || !Array.isArray(value.entries) || value.entries.length > 3) throw new Error('Journal block requires {"entries":[...]} with at most three entries.');
    const ids = new Set();
    return value.entries.map(entry => {
        if (!object(entry) || Object.keys(entry).some(key => !['id', 'title', 'text'].includes(key)) || typeof entry.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(entry.id) || ids.has(entry.id)) throw new Error('Journal entries require unique local IDs.');
        if (typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 8000 || (entry.title !== undefined && (typeof entry.title !== 'string' || entry.title.length > 160))) throw new Error('Journal entries require text (1–8000 characters) and an optional title (up to 160).');
        ids.add(entry.id);
        return { id: entry.id, ...(entry.title?.trim() ? { title: entry.title.trim() } : {}), text: entry.text.trim() };
    });
}

export function appendJournal(data, journal) {
    if (!journal?.entries?.length) return;
    data.entries ??= [];
    if (!Array.isArray(data.entries)) return;
    const normalized = text => String(text || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
    for (const entry of journal.entries) {
        if (data.entries.some(previous => previous?.id === entry.id || normalized(previous?.text) === normalized(entry.text))) continue;
        data.entries.push(structuredClone(entry));
    }
}
