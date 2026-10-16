import { rankAssetNames } from './asset-matching.js';
import { backgroundEntry } from './scene-context.js';
import { emotionKey, emotionRanking, rankEmotions } from './emotion-routing.js';

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
    semanticAsset(name, folders, extensions, accepts = () => true) {
        if (!safeAssetPath(name)) return null;
        const files = [...this.files].filter(file => safeAssetPath(file) && folders.some(folder => file.startsWith(`${folder}/`))
            && extensions.includes(file.split('.').pop().toLowerCase()) && accepts(file));
        const folderIndex = file => folders.findIndex(folder => file.startsWith(`${folder}/`));
        files.sort((a, b) => folderIndex(a) - folderIndex(b) || (a < b ? -1 : a > b ? 1 : 0));
        // Keep descriptive subfolders, but remove category/character names from ranking.
        const names = files.map(file => { const folder = folders.find(folder => file.startsWith(`${folder}/`)); return { file, name: file.slice(folder.length + 1).replace(/^sprites\//, '') }; });
        const ranked = rankAssetNames(name, names.map(entry => entry.name), extensions === AUDIO_EXTS);
        if (!ranked.length) return null;
        const best = ranked[0], path = names.find(entry => entry.name === best.path).file, url = this.url(path);
        this.report(`match:${folders.join('|')}:${name}`, { url, method: 'keywords', requested: name, matched: path, score: best.score, keywords: best.matched });
        return url;
    }
    semanticImage(name, folders, excludeBlink = false) {
        return this.semanticAsset(name, folders, IMAGE_EXTS, file => !excludeBlink || !/blink/i.test(file.slice(file.lastIndexOf('/') + 1)));
    }
    sprite(id, emotions, props = {}) {
        const folder = safeAssetPath(props.assetFolder || id);
        if (!folder) return Promise.resolve(null);
        return this.remember(`sprite:${folder}:${JSON.stringify([emotions, props.defaultExpression || '', props.expressionAliases || null])}`, async () => {
            const requested = emotions[0] || 'default', route = emotionRanking(requested);
            const paths = emotion => [`characters/${folder}/sprites/${emotion}`, `characters/${folder}/${emotion}`].flatMap(path => this.variants(path, IMAGE_EXTS));
            const open = name => !/blink/i.test(name);
            const available = [...this.files].flatMap(file => {
                const prefix = `characters/${folder}/`; if (!file.toLowerCase().startsWith(prefix.toLowerCase()) || !safeAssetPath(file)) return [];
                const relative = file.slice(prefix.length).replace(/^sprites\//i, ''), match = /^([^/]+)\.([a-z\d]+)$/i.exec(relative);
                return match && IMAGE_EXTS.includes(match[2].toLowerCase()) && open(match[1]) ? [match[1]] : [];
            });
            const finish = (url, method, rank = null, canonical = null) => {
                this.report(`emotion:${folder}:${requested}`, { requested, matched: url ? decodeURIComponent(new URL(url).pathname.split('/').at(-1)) : null,
                    url, method, rank, canonical, ranking: [...route], available: [...new Set(available)].sort() });
                return url;
            };
            // A literal always wins, including newly added files absent from the catalog.
            if (open(requested)) { const url = await this.resolve(paths(requested)); if (url) return finish(url, 'exact', 0); }
            const local = Object.entries(props.expressionAliases || {}).find(([key]) => emotionKey(key) === emotionKey(requested))?.[1];
            const configured = (Array.isArray(local) ? local : typeof local === 'string' ? [local] : []).filter(name => typeof name === 'string');
            const aliases = [...new Set([...configured, ...emotions.slice(1).filter(name => name !== 'default' && name !== props.defaultExpression)])].filter(open);
            for (const alias of aliases) { const url = await this.resolve(paths(alias)); if (url) return finish(url, 'character-alias'); }
            const ranked = rankEmotions(requested, available.filter(name => emotionKey(name) !== 'default' || emotions.includes('default') || props.defaultExpression === 'default'));
            const best = ranked[0], through = best ? route.indexOf(best.profile) : Math.min(0, route.length - 1);
            // Try absent canonical labels above the indexed winner as well: a freshly
            // added closer ST emotion can supersede a cached inventory fallback.
            for (let index = 0; index <= through; index++) {
                const canonical = route[index];
                if (canonical !== requested) { const url = await this.resolve(paths(canonical)); if (url) return finish(url, 'emotion-ranking', index + 1, canonical); }
                if (best?.profile === canonical) {
                    const url = await this.resolve(paths(best.name)); if (url) return finish(url, 'emotion-ranking', index + 1, canonical);
                }
            }
            // Preserve descriptive/custom artwork when no named emotion is available.
            for (const emotion of [requested, ...aliases]) {
                const url = this.semanticImage(emotion, [`characters/${folder}`], true);
                if (url) return finish(url, 'keywords');
            }
            // Unknown story tags still have a safe face when the configured
            // default filename is absent. Probe neutral even in a stale catalog.
            for (const fallback of [...new Set([props.defaultExpression, ...(emotions.includes('default') ? ['default'] : []), 'neutral'].filter(Boolean))]) {
                if (!open(fallback)) continue;
                const url = await this.resolve(paths(fallback)); if (url) return finish(url, 'fallback');
            }
            return finish(null, 'missing');
        });
    }
    background(name) {
        if (!safeAssetPath(name)) return Promise.resolve(null);
        return this.remember(`background:${name}`, async () => await this.resolve(this.variants(`backgrounds/${name}`, IMAGE_EXTS)) || this.semanticImage(name, ['backgrounds']));
    }
    async backgroundProperties(url) {
        if (!url || !url.startsWith(this.base.href)) return { inside: false };
        let path;
        try { path = decodeURIComponent(new URL(url).pathname.slice(this.base.pathname.length)); } catch { return { inside: false }; }
        if (!safeAssetPath(path) || !path.startsWith('backgrounds/')) return { inside: false };
        const [defaults, local] = await Promise.all([this.json('backgrounds/properties.default.json'), this.json('backgrounds/properties.json')]);
        const catalog = local && typeof local === 'object' && !Array.isArray(local) ? local : defaults;
        return { inside: backgroundEntry(catalog, path)?.inside === true };
    }
    blinkSprite(id, emotions, props = {}) {
        const folder = safeAssetPath(props.assetFolder || id), config = props.blink;
        if (!folder || config === false || config?.enabled === false) return Promise.resolve(null);
        const base = `characters/${folder}`;
        const files = emotions.map(emotion => Object.entries(config?.images || {}).find(([key]) => key.toLowerCase() === emotion.toLowerCase())?.[1]).filter(value => typeof value === 'string');
        if (typeof config?.image === 'string') files.push(config.image);
        const explicit = files.flatMap(file => (file.includes('/') ? [`${base}/${file}`] : [`${base}/sprites/${file}`, `${base}/${file}`]).flatMap(path => this.variants(path, IMAGE_EXTS)));
        const automatic = [...new Set(emotions)].flatMap(emotion => [`${emotion}_blink`, `${emotion}.blink`].flatMap(name => [`${base}/sprites/${name}`, `${base}/${name}`].flatMap(path => this.variants(path, ['webp', 'png']))));
        return this.remember(`blink:${folder}:${JSON.stringify([emotions, config || null])}`, async () => {
            if (explicit.length) { const url = await this.resolve(explicit); if (url) return url; }
            const known = automatic.filter(path => [...this.files].some(file => file.toLowerCase() === path.toLowerCase()));
            // Optional blinking causes no asset probes unless configured or inventoried.
            return known.length || config?.enabled === true ? this.resolve(known.length ? known : automatic) : null;
        });
    }
    audio(kind, name) {
        if (!safeAssetPath(name)) return Promise.resolve(null);
        const folders = kind === 'music' ? ['sfx/music', 'music', 'sfx'] : kind === 'ambient' ? ['ambient', 'sfx/ambient', 'sfx/music', 'sfx'] : ['sfx'];
        return this.remember(`audio:${kind}:${name}`, async () => await this.resolve(folders.flatMap(folder => this.variants(`${folder}/${name}`, AUDIO_EXTS)))
            || this.semanticAsset(name, folders, AUDIO_EXTS, file => !(kind === 'sfx' && /^sfx\/(?:music|ambient)\//i.test(file)) && !(kind === 'music' && /^sfx\/ambient\//i.test(file))));
    }
    voice(id, name) {
        const character = safeAssetPath(id);
        if (!character || !safeAssetPath(name)) return Promise.resolve(null);
        const folders = [`characters/${character}`, 'characters/shared', 'sfx'];
        return this.remember(`voice:${character}:${name}`, async () => await this.resolve(folders.flatMap(folder => this.variants(`${folder}/${name}`, AUDIO_EXTS)))
            || this.semanticAsset(name, folders, AUDIO_EXTS, file => !/^sfx\/(?:music|ambient)\//i.test(file)));
    }
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
