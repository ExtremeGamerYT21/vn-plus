import { safeAssetPath } from './asset-resolver.js';

export function backgroundChoices(resolver) {
    return [...resolver.files].filter(path => safeAssetPath(path) && /^backgrounds\/.+\.(?:png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(path))
        .sort((a, b) => a.localeCompare(b)).map(path => ({ path, name: path.slice('backgrounds/'.length), url: resolver.url(path) }));
}

/** A presentation override, scoped to this chat/environment and the scripted scene it replaces. */
export class ManualBackground {
    constructor(revoke = url => URL.revokeObjectURL(url)) { this.revoke = revoke; }
    set(image, state, scope) {
        this.clear();
        this.value = { ...image, scope, original: { background: state.background, black: state.black, mode: state.mode } };
    }
    resolve(state, scope) {
        const value = this.value;
        if (!value) return null;
        if (value.scope !== scope || ['background', 'black', 'mode'].some(key => value.original[key] !== state[key])) { this.clear(); return null; }
        return value;
    }
    clear() {
        if (this.value?.temporary) this.revoke(this.value.url);
        this.value = null;
    }
}
