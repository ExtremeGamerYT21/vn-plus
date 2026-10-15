const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = value => String(value).padStart(2, '0');

/** A complete standalone five-field header, never free-form canonical prose. */
export function parseSceneHeader(line) {
    const match = /^\s*\[([^\[\]\r\n]{1,1000})\]\s*$/.exec(line);
    const fields = match?.[1].split('|').map(field => field.trim());
    if (fields?.length !== 5 || fields.some(field => !field)) return null;
    const [dateLabel, phase, timeLabel, season, location] = fields;
    const date = /^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/i.exec(dateLabel);
    const time = /^(\d{1,2}):(\d{2})\s*(?:([ap])\.?m\.?)?$/i.exec(timeLabel);
    if (!date || !time) return null;
    const month = MONTHS.findIndex(name => name === date[2].toLowerCase() || name.slice(0, 3) === date[2].toLowerCase()) + 1;
    const day = Number(date[1]), year = Number(date[3]), minute = Number(time[2]);
    let hour = Number(time[1]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (!year || !month || day < 1 || day > days || minute > 59 || (time[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
    if (time[3]) hour = hour % 12 + (time[3].toLowerCase() === 'p' ? 12 : 0);
    return { date: `${date[3]}-${pad(month)}-${pad(day)}`, dateLabel, phase, time: `${pad(hour)}:${pad(minute)}`, timeLabel,
        year, month, day, hour, minute, minutes: hour * 60 + minute, season, location };
}

/** Canonical text may supply only explicitly requested header metadata, outside code/HTML. */
export function lastSceneHeader(source) {
    let latest = null, fence = null, html = null, depth = 0;
    for (const line of String(source || '').split(/\r?\n/)) {
        if (fence) { if (new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null; continue; }
        const startFence = /^\s*(`{3,}|~{3,})/.exec(line);
        if (startFence) { fence = startFence[1]; continue; }
        if (!html) { const root = /^\s*<(html|article|section|div|main|svg|table|canvas|figure|pre|p|style|h[1-6]|details)\b/i.exec(line); if (root) { html = root[1]; depth = 0; } }
        if (html) {
            for (const tag of line.match(new RegExp(`<\\/?${html}\\b[^>]*>`, 'gi')) || []) depth += tag.startsWith('</') ? -1 : /\/\s*>$/.test(tag) ? 0 : 1;
            if (depth <= 0) html = null;
            continue;
        }
        latest = parseSceneHeader(line) || latest;
    }
    return latest;
}

export function sceneLighting(scene, inside = false) {
    const minutes = scene?.minutes;
    if (inside || !Number.isFinite(minutes)) return { inside, level: 1, brightness: 1, period: inside ? 'indoor' : 'unknown' };
    const points = [[0, 0], [300, 0], [360, .35], [480, 1], [960, 1], [1080, .35], [1140, 0], [1440, 0]];
    const at = Math.max(0, Math.min(1439, minutes)), upper = points.findIndex(point => point[0] >= at);
    const [a, b] = upper > 0 ? [points[upper - 1], points[upper]] : [points[0], points[0]];
    const level = a[1] + (b[1] - a[1]) * (b[0] === a[0] ? 0 : (at - a[0]) / (b[0] - a[0]));
    return { inside: false, level, brightness: .45 + .55 * level, period: at < 300 || at >= 1140 ? 'night' : at < 480 ? 'dawn' : at < 960 ? 'day' : 'dusk' };
}

export function backgroundEntry(catalog, path) {
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return null;
    const key = String(path).replace(/^backgrounds\//i, '').toLowerCase(), stem = key.replace(/\.[a-z\d]+$/i, '');
    for (const candidate of [key, stem]) {
        const entry = Object.entries(catalog).find(([name]) => name.replace(/^backgrounds\//i, '').toLowerCase() === candidate)?.[1];
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) return entry;
    }
    return null;
}
