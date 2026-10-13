const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const STAGE_LAYOUT_OPTIONS = [
    { value: 'rows', label: 'Left and right groups' },
    { value: 'separate', label: 'Four separate busts' },
];
export function normalizeStageLayout(value) { return ['separate', 'spread', 'compact'].includes(value) ? 'separate' : 'rows'; }

/** Stable slots alternate left/right; inner rows recede upwards and shrink. */
export function stagePosition(slot, count, settings) {
    count = Math.max(1, count);
    const rows = normalizeStageLayout(settings.layout) === 'rows';
    const side = slot % 2 === 0 ? 'left' : 'right';
    const row = Math.floor(slot / 2), depth = rows ? row : 0;
    const perSide = Math.ceil(count / 2);
    const inwardStep = Math.min(Number(settings.rowSpacing) || 8, 26 / Math.max(1, perSide - 1));
    const columns = Math.max(4, count);
    const column = side === 'left' ? row : columns - 1 - row;
    // Four stable stations, outer positions first, expand for larger casts.
    let x = rows ? (side === 'left' ? 16 + depth * inwardStep : 84 - depth * inwardStep) : (column + .5) * 100 / columns;
    const custom = settings.layouts?.[rows ? count : columns] ?? settings.layouts?.[count];
    if (Array.isArray(custom)) {
        const ordered = [...custom].sort((a, b) => a - b);
        const index = side === 'left' ? row : ordered.length - 1 - row;
        if (Number.isFinite(ordered[index])) x = ordered[index];
    }
    const spacing = Number(settings.stageSpacing) || 1;
    const recession = clamp(Number(settings.rowDepthScale) || .95, .8, 1);
    return {
        x: clamp(50 + (x - 50) * spacing, 5, 95), side, depth,
        lift: rows ? depth * Math.min(Number(settings.rowRise) || 6.5, 22 / Math.max(1, perSide - 1)) : 0,
        scale: rows ? Math.pow(recession, depth) : 1,
        width: rows ? clamp(38 - perSide * 2, 24, 36) : clamp(100 / columns - 2, 6, 23),
        z: rows ? 100 - depth : 1,
    };
}
