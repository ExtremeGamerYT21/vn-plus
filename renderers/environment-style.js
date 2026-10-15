let sequence = 0;

function selectors(value) {
    const parts = []; let start = 0, depth = 0, quote = '', escaped = false;
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (quote) { if (char === quote) quote = ''; continue; }
        if (char === '"' || char === "'") { quote = char; continue; }
        if ('(['.includes(char)) depth++;
        if (')]'.includes(char)) depth--;
        if (!depth && char === ',') { parts.push(value.slice(start, i).trim()); start = i + 1; }
    }
    parts.push(value.slice(start).trim()); return parts.filter(Boolean);
}
export function scopeSelectors(value, scope) {
    return selectors(value).flatMap(selector => {
        const root = /^(?:#vnplus-overlay|:root|:scope|body|html)(?=$|[\s.:#\[>+~])/i.exec(selector);
        if (!root) return [`${scope} ${selector}`];
        const tail = selector.slice(root[0].length);
        // A root sibling selector would leave the VN subtree.
        let depth = 0, quote = '', escaped = false;
        for (let i = 0; i < tail.length; i++) {
            const char = tail[i];
            if (escaped) { escaped = false; continue; }
            if (char === '\\') { escaped = true; continue; }
            if (quote) { if (char === quote) quote = ''; continue; }
            if (char === '"' || char === "'") { quote = char; continue; }
            if ('(['.includes(char)) depth++;
            if (')]'.includes(char)) depth--;
            if (!depth && /[\s>+~]/.test(char)) {
                if (/^[+~]/.test(tail.slice(i).trimStart())) return [];
                break;
            }
        }
        return [`${scope}${tail}`];
    }).join(', ');
}
export function styleAssetUrl(value, base) {
    if (/^data:/i.test(value) || /^#[\w-]+$/.test(value)) return value;
    try {
        const url = new URL(value, base), root = new URL(base);
        const decoded = decodeURIComponent(url.pathname);
        if (decoded.includes('\\') || decoded.split('/').some(part => part === '..' || part === '.')) return null;
        return url.origin === root.origin && url.pathname.startsWith(root.pathname) && !url.search && !url.username && !url.password ? url.href : null;
    } catch { return null; }
}

/** Native CSS parsing keeps declaration/selector syntax intact; only VN-scoped rules are installed. */
export function compileEnvironmentCss(source, scope, base, namespace) {
    const sheet = new CSSStyleSheet(); sheet.replaceSync(source);
    const animations = new Map();
    const collect = rules => { for (const rule of rules) { if (rule.type === 7) animations.set(rule.name, `vn-${namespace}-${animations.size}`); else if (rule.cssRules) collect(rule.cssRules); } };
    collect(sheet.cssRules);
    const declarations = style => [...style].map(property => {
        let value = style.getPropertyValue(property);
        value = value.replace(/url\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^)]*?))\s*\)/gi, (_, double, single, raw) => {
            const url = styleAssetUrl((double ?? single ?? raw).trim(), base); return url ? `url(${JSON.stringify(url)})` : 'none';
        });
        // Use url(...) inside image-set; bare strings lack a reliable environment-relative URL.
        if (/image-set\(/i.test(value.replace(/url\([^)]*\)/gi, '')) && /["']/.test(value.replace(/url\([^)]*\)/gi, ''))) value = 'none';
        if (/^(?:-webkit-)?animation(?:-name)?$/.test(property)) for (const [name, local] of animations) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); value = value.replace(new RegExp(`(^|[\\s,])${escaped}(?=[\\s,]|$)`, 'g'), (_, before) => `${before}${local}`);
        }
        return `${property}:${value}${style.getPropertyPriority(property) ? ' !important' : ''};`;
    }).join('');
    const compile = rules => [...rules].map(rule => {
        if (rule.type === 1) { const selector = scopeSelectors(rule.selectorText, scope); return selector ? `${selector}{${declarations(rule.style)}}` : ''; }
        if (rule.type === 7) return `@keyframes ${animations.get(rule.name)}{${[...rule.cssRules].map(frame => `${frame.keyText}{${declarations(frame.style)}}`).join('')}}`;
        if (/^@(media|supports|container)\b/i.test(rule.cssText) && rule.cssRules) return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${compile(rule.cssRules)}}`;
        return ''; // Imports, global font/property/page rules and nested CSS are not environment UI rules.
    }).join('\n');
    return compile(sheet.cssRules);
}

export class EnvironmentStyle {
    constructor(root) {
        this.root = root; this.token = `environment-${++sequence}`; this.root.dataset.vnStyleScope = this.token; this.revision = 0;
    }
    clear() { this.revision++; this.abort?.abort(); this.style?.remove(); this.style = null; }
    async read(resolver, signal) {
        const response = await fetch(resolver.url('dialogue.css'), { cache: 'no-store', signal });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Stylesheet request failed (HTTP ${response.status}).`);
        if (response.headers.get('content-type')?.includes('text/html')) return null;
        const source = await response.text();
        if (source.length > 524288) throw new Error('Environment stylesheet exceeds 512 KB.');
        return source;
    }
    async load(resolver, enabled = true) {
        this.clear(); const revision = this.revision;
        if (!enabled) return { status: 'disabled' };
        const abort = new AbortController(); this.abort = abort;
        const timeout = setTimeout(() => abort.abort(), 5000);
        try {
            const source = await this.read(resolver, abort.signal);
            if (revision !== this.revision || resolver.disposed) return { status: 'cancelled' };
            if (source === null) return { status: 'missing' };
            const scope = `#vnplus-overlay[data-vn-style-scope="${this.token}"]`;
            const css = compileEnvironmentCss(source, scope, resolver.base, this.token);
            const style = document.createElement('style'); style.dataset.vnEnvironmentStyle = this.token; style.textContent = css;
            document.head.append(style); this.style = style;
            return { status: 'loaded', rules: style.sheet.cssRules.length };
        } catch (error) {
            return revision !== this.revision || resolver.disposed ? { status: 'cancelled' } : { status: 'error', error: error.message };
        } finally { clearTimeout(timeout); }
    }
    dispose() { this.clear(); delete this.root.dataset.vnStyleScope; }
}
