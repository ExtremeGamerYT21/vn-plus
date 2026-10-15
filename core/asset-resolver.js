import { rankAssetNames } from './asset-matching.js';

const IMAGE_EXTS = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'avif'];
const AUDIO_EXTS = ['ogg', 'mp3', 'wav', 'm4a', 'opus'];

export function safeAssetPath(path) {
    if (typeof path !== 'string') return null;
    const value = path.trim().replace(/\\/g, '/');
    if (!value || /[\u0000-\u001f?#:]/.test(value) || value.startsWith('/') || value.split('/').some(part => part === '..' || part === '.')) return null;
    return value;
}

export class AssetResolver {
    constructor(base, inventory = {}, namespace = 'legacy') { this.base = base; this.inventory = inventory; this.files = new Set(inventory.files || []); this.cache = new Map(); this.diagnostics = new Map(); this.fonts = new Map(); this.namespace = namespace; this.loadedFonts = new Set(); this.disposed = false; }
    url(path) { const safe = safeAssetPath(path); return safe ? new URL(safe.split('/').map(encodeURIComponent).join('/'), this.base).href : null; }
    report(key, result) {
        if (this.diagnostics.size >= 120) this.diagnostics.delete(this.diagnostics.keys().next().value);
        this.diagnostics.set(key, result);
    }
    remember(key, factory) {
        if (!this.cache.has(key)) { if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value); this.cache.set(key, factory()); }
        return this.cache.get(key);
    }
    async json(path) {
        const url = this.url(path);
        if (!url) return null;
        return this.remember(`json:${path}`, async () => {
            try { const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); return response.ok ? await response.json() : null; } catch { return null; }
        });
    }
    async resolve(candidates) {
        const paths = [...new Set(candidates.map(safeAssetPath).filter(Boolean))];
        return this.remember(`asset:${paths.join('|')}`, async () => {
            // Exact paths first, then case-insensitive inventory names (semantic UPPERCASE commands).
            for (const path of paths) {
                const known = this.files.has(path) ? path : [...this.files].find(file => file.toLowerCase() === path.toLowerCase());
                if (known) { const url = this.url(known); this.report(paths[0], { url, candidates: paths }); return url; }
            }
            for (const path of paths) {
                try { const response = await fetch(this.url(path), { method: 'HEAD', signal: AbortSignal.timeout(4000) }); if (response.ok && !response.headers.get('content-type')?.includes('text/html')) { const url = this.url(path); this.report(paths[0], { url, candidates: paths }); return url; } } catch { /* optional asset */ }
            }
            this.report(paths[0], { missing: true, candidates: paths }); return null;
        });
    }
    variants(path, extensions) { return /\.[a-z\d]{2,5}$/i.test(path) ? [path] : extensions.map(ext => `${path}.${ext}`); }
    semanticImage(name, folders, excludeBlink = false) {
        if (!safeAssetPath(name)) return null;
        const files = [...this.files].filter(file => safeAssetPath(file) && folders.some(folder => file.startsWith(`${folder}/`))
            && IMAGE_EXTS.includes(file.split('.').pop().toLowerCase()) && (!excludeBlink || !/blink/i.test(file.slice(file.lastIndexOf('/') + 1))));
        // Keep descriptive subfolders, but remove category/character names from ranking.
        const names = files.map(file => { const folder = folders.find(folder => file.startsWith(`${folder}/`)); return { file, name: file.slice(folder.length + 1).replace(/^sprites\//, '') }; });
        const ranked = rankAssetNames(name, names.map(entry => entry.name));
        if (!ranked.length) return null;
        const best = ranked[0], path = names.find(entry => entry.name === best.path).file, url = this.url(path);
        this.report(`match:${folders.join('|')}:${name}`, { url, method: 'keywords', requested: name, matched: path, score: best.score, keywords: best.matched });
        return url;
    }
    sprite(id, emotions, props = {}) {
        const folder = safeAssetPath(props.assetFolder || id);
        if (!folder) return Promise.resolve(null);
        return this.remember(`sprite:${folder}:${emotions.join('|')}`, async () => {
            // Probe the exact expression before considering aliases/defaults, including
            // sprites added since the inventory was generated.
            const requested = emotions.filter(emotion => emotion !== 'default');
            for (const emotion of requested) {
                const url = await this.resolve([`characters/${folder}/sprites/${emotion}`, `characters/${folder}/${emotion}`].flatMap(path => this.variants(path, IMAGE_EXTS)));
                if (url) return url;
            }
            for (const emotion of requested) {
                const url = this.semanticImage(emotion, [`characters/${folder}`], true);
                if (url) return url;
            }
            if (emotions.includes('default')) return this.resolve([`characters/${folder}/sprites/default`, `characters/${folder}/default`].flatMap(path => this.variants(path, IMAGE_EXTS)));
            return null;
        });
    }
    background(name) {
        if (!safeAssetPath(name)) return Promise.resolve(null);
        return this.remember(`background:${name}`, async () => await this.resolve(this.variants(`backgrounds/${name}`, IMAGE_EXTS)) || this.semanticImage(name, ['backgrounds']));
    }
    blinkSprite(id, emotions, props = {}) {
        const folder = safeAssetPath(props.assetFolder || id), config = props.blink;
        if (!folder || config === false || config?.enabled === false) return Promise.resolve(null);
        const base = `characters/${folder}`;
        const files = emotions.map(emotion => Object.entries(config?.images || {}).find(([key]) => key.toLowerCase() === emotion.toLowerCase())?.[1]).filter(value => typeof value === 'string');
        if (typeof config?.image === 'string') files.push(config.image);
        const explicit = files.flatMap(file => (file.includes('/') ? [`${base}/${file}`] : [`${base}/sprites/${file}`, `${base}/${file}`]).flatMap(path => this.variants(path, IMAGE_EXTS)));
        const automatic = [...new Set([...emotions, 'default'])].flatMap(emotion => [`${emotion}_blink`, `${emotion}.blink`].flatMap(name => [`${base}/sprites/${name}`, `${base}/${name}`].flatMap(path => this.variants(path, ['webp', 'png']))));
        return this.remember(`blink:${folder}:${JSON.stringify([emotions, config || null])}`, async () => {
            if (explicit.length) { const url = await this.resolve(explicit); if (url) return url; }
            const known = automatic.filter(path => [...this.files].some(file => file.toLowerCase() === path.toLowerCase()));
            // Optional blinking causes no asset probes unless configured or inventoried.
            return known.length || config?.enabled === true ? this.resolve(known.length ? known : automatic) : null;
        });
    }
    audio(kind, name) {
        const folders = kind === 'music' ? ['sfx/music', 'music', 'sfx'] : kind === 'ambient' ? ['ambient', 'sfx/ambient', 'sfx/music', 'sfx'] : ['sfx'];
        return this.resolve(folders.flatMap(folder => this.variants(`${folder}/${name}`, AUDIO_EXTS)));
    }
    voice(id, name) { return this.resolve([`characters/${id}/${name}`, `characters/shared/${name}`, `sfx/${name}`].flatMap(path => this.variants(path, AUDIO_EXTS))); }
    fontId(name) {
        let hash = 0; for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
        return `vn-${this.namespace}-${hash.toString(16)}`;
    }
    fontFamily(name) {
        if (typeof name !== 'string' || !name) return 'inherit';
        if (name.includes(',') || /^(inherit|initial|unset|serif|sans-serif|monospace|system-ui|cursive|fantasy|emoji)$/i.test(name)) return name;
        return `"${this.fontId(name)}", "${name.replace(/["\\]/g, '')}", serif`;
    }
    async font(name) {
        if (typeof name !== 'string') return '';
        if (!name || name.includes(',')) return name;
        if (!this.fonts.has(name)) this.fonts.set(name, (async () => {
            const url = await this.resolve(this.variants(`fonts/${name.replace(/\s+/g, '_')}`, ['woff2', 'woff', 'ttf', 'otf']));
            if (url && typeof FontFace !== 'undefined') { try { const font = new FontFace(this.fontId(name), `url("${url}")`); await font.load(); if (!this.disposed) { document.fonts.add(font); this.loadedFonts.add(font); } } catch { /* system family remains valid */ } }
            return this.fontFamily(name);
        })());
        return this.fonts.get(name);
    }
    dispose() { this.disposed = true; for (const font of this.loadedFonts) globalThis.document?.fonts?.delete(font); this.loadedFonts.clear(); this.cache.clear(); this.fonts.clear(); }
}
