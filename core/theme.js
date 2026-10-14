export const THEME_COLORS = { body: '--vn-ui-color', muted: '--vn-muted', panel: '--vn-panel', world: '--vn-world-color', border: '--vn-border', accent: '--vn-ui-accent', silhouette: '--vn-silhouette' };
export function applyTheme(root, settings) {
    for (const [key, property] of Object.entries(THEME_COLORS)) {
        const value = settings.themeColors?.[key];
        if (typeof value === 'string' && value.trim() && CSS.supports('color', value)) root.style.setProperty(property, value);
        else root.style.removeProperty(property);
    }
}
