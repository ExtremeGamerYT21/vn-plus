/** A neutral, featureless bust used until actual character artwork resolves. */
export function createSilhouette(name) {
    const container = document.createElement('div'); container.className = 'vn-missing-bust';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 300 440'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${name} — silhouette`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', 'M150 16C110 16 91 47 93 87L96 118C99 143 110 158 127 165L124 191C103 209 55 209 37 239C20 266 14 339 10 440H290C286 339 280 266 263 239C245 209 197 209 176 191L173 165C190 158 201 143 204 118L207 87C209 47 190 16 150 16Z');
    svg.append(path);
    const label = document.createElement('span'); label.className = 'vn-silhouette-name'; label.textContent = name;
    container.append(svg, label); return container;
}
