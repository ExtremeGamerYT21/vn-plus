import { THEME_COLORS } from '../core/theme.js';
export function createThemeSettings(settings, changed) {
    const section = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Theme'; section.append(summary);
    const hint = document.createElement('p'); hint.className = 'vn-hint'; hint.textContent = 'Follows SillyTavern’s colors and font. Leave an override empty to inherit the current theme. Character properties can still customize their dialogue.'; section.append(hint);
    const fields = new Map();
    for (const key of Object.keys(THEME_COLORS)) {
        const label = document.createElement('label'); label.className = 'vn-setting';
        const caption = document.createElement('span'); caption.textContent = `${key[0].toUpperCase()}${key.slice(1)} color override`;
        const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Inherit SillyTavern'; input.value = settings.themeColors[key] || ''; input.dataset.themeColor = key;
        input.addEventListener('change', () => {
            const value = input.value.trim();
            if (value && !CSS.supports('color', value)) { input.setCustomValidity('Enter a CSS color or leave empty.'); input.reportValidity(); return; }
            input.setCustomValidity(''); settings.themeColors[key] = value; changed('themeColors');
        });
        fields.set(key, input); label.append(caption, input); section.append(label);
    }
    const reset = document.createElement('button'); reset.textContent = 'Use SillyTavern theme'; reset.addEventListener('click', () => {
        settings.themeColors = {}; settings.dialogueFont = ''; settings.textColor = ''; settings.narrationColor = '';
        for (const input of fields.values()) { input.value = ''; input.setCustomValidity(''); } changed('themeReset');
    }); section.append(reset); return section;
}
