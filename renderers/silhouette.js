import { silhouetteProfile } from '../core/silhouette-profile.js';

const figures = Object.freeze(Object.fromEntries(['man', 'woman', 'boy', 'girl', 'neutral', 'child']
    .map(type => [type, new URL(`../assets/fallback-figures/${type}.png`, import.meta.url).href])));

export function createSilhouette(name, profile = silhouetteProfile(name)) {
    const type = Object.hasOwn(figures, profile.type) ? profile.type : 'neutral';
    const container = document.createElement('div'); container.className = 'vn-missing-bust'; container.dataset.silhouette = type;
    const image = document.createElement('div'); image.className = 'vn-fallback-figure';
    image.style.backgroundImage = `url("${figures[type]}")`;
    image.setAttribute('role', 'img'); image.setAttribute('aria-label', `${name} — ${profile.label} silhouette`);
    // Names remain plain text; artwork always comes from the bundled asset list.
    const label = document.createElement('span'); label.className = 'vn-silhouette-name'; label.textContent = name;
    container.append(image, label); return container;
}
