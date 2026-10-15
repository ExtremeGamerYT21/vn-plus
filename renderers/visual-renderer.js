import { HTMLRenderer } from './html-renderer.js';
import { resolveReaction } from '../core/narrative-timing.js';

/** Independent sandboxed objects. Keeping an ID preserves its DOM and interaction state. */
export class VisualRenderer {
    constructor(root, settings, createSession, readLocal) {
        this.root = root; this.settings = settings; this.createSession = createSession; this.readLocal = readLocal;
        this.items = new Map(); this.dismissed = new Set();
        this.layer = document.createElement('div'); this.layer.className = 'vn-visuals'; root.append(this.layer);
    }
    sync(visuals = {}, profile = resolveReaction('normal')) {
        for (const id of [...this.dismissed]) if (!Object.hasOwn(visuals, id)) this.dismissed.delete(id);
        for (const id of [...this.items.keys()]) if (!Object.hasOwn(visuals, id)) this.close(id, profile);
        for (const [id, token] of Object.entries(visuals)) {
            if (this.dismissed.has(id)) continue;
            const previous = this.items.get(id);
            if (previous && !previous.closing) continue;
            if (previous) { previous.animation?.cancel(); previous.renderer.close(); previous.node.remove(); this.items.delete(id); }
            const node = document.createElement('section'); node.className = 'vn-visual'; node.dataset.visualId = id;
            node.setAttribute('aria-label', `Visual: ${id}`); node.style.setProperty('--vn-visual-index', this.items.size);
            node.innerHTML = '<div class="vn-artifact" hidden><section role="region"><header><span></span><button data-action="close-artifact" title="Close this object">Close object</button></header><div class="vn-artifact-content"></div></section></div>';
            node.querySelector('header span').textContent = id.replace(/[_-]/g, ' ');
            node.addEventListener('click', event => {
                if (event.target.closest('[data-action="close-artifact"]')) { event.stopPropagation(); this.dismissed.add(id); this.close(id); }
            });
            node.addEventListener('keydown', event => {
                if (event.key === 'Escape') { event.preventDefault(); this.dismissed.add(id); this.close(id); }
                event.stopPropagation();
            });
            this.layer.append(node);
            const renderer = new HTMLRenderer(node, this.settings, (token, alive) => this.createSession(token, alive), (id, signal) => this.readLocal(id, signal), { focus: false, transparent: true });
            const item = { node, renderer, closing: false }; this.items.set(id, item); renderer.open(token);
            if (!this.settings.reducedMotion) item.animation = node.animate([{ opacity: 0, transform: 'translateY(12px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: profile.animation, easing: profile.easing });
        }
    }
    close(id, profile = resolveReaction('normal')) {
        const item = this.items.get(id); if (!item || item.closing) return;
        item.closing = true; item.animation?.cancel(); item.renderer.revoke(); item.node.style.pointerEvents = 'none';
        // Revoke the bridge immediately; retain the image until the close animation ends.
        const remove = () => { if (this.items.get(id) === item && item.closing) { item.renderer.close(); item.node.remove(); this.items.delete(id); } };
        if (this.settings.reducedMotion) remove();
        else {
            item.animation = item.node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(18px) scale(.95)' }], { duration: profile.animation, easing: profile.easing, fill: 'forwards' });
            item.animation.finished.then(remove).catch(() => {});
        }
    }
    clear() { for (const item of this.items.values()) { item.animation?.cancel(); item.renderer.close(); item.node.remove(); } this.items.clear(); this.dismissed.clear(); }
}
