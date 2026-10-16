import { stagePosition } from '../core/stage-layout.js';
import { SpriteAnimator } from './sprite-animator.js';
import { createSilhouette } from './silhouette.js';
import { sceneLighting } from '../core/scene-context.js';
import { sceneLight } from '../core/scene-light.js';
import { SceneLightRenderer } from './scene-light-renderer.js';

export class StageRenderer {
    constructor(root, resolver, registry, settings) { this.root = root; this.resolver = resolver; this.registry = registry; this.settings = settings; this.generation = 0; this.nodes = new Map(); this.sprites = new SpriteAnimator(root, resolver, settings); this.lightRenderer = new SceneLightRenderer(root, light => this.sprites.setLighting(light)); }
    place(node, position) {
        const fullBody = this.settings.spriteFraming === 'full-body' && !node.classList.contains('vn-no-sprite');
        const top = !fullBody && this.settings.stageAlignment === 'top';
        node.dataset.framing = fullBody ? 'full-body' : 'bust';
        node.style.bottom = top ? 'auto' : fullBody ? `calc(${position.lift}vh - var(--vn-stage-bottom))` : `${position.lift}vh`;
        node.style.top = top ? `${position.lift}vh` : 'auto';
        node.style.transformOrigin = top ? 'top center' : 'bottom center';
    }
    publishContext(state, properties = {}) {
        if (typeof properties === 'boolean') properties = { inside: properties };
        const inside = properties.inside === true; this.backgroundProperties = properties;
        const tint = this.root.querySelector('.vn-tint');
        this.appliedTint = tint.style.background || 'transparent';
        const color = getComputedStyle(tint).backgroundColor;
        this.ambientColor = this.appliedTint === 'transparent' || color === 'rgba(0, 0, 0, 0)' ? '#ffffff' : color;
        const lighting = sceneLighting(state.scene, inside);
        const light = sceneLight(state.scene, inside, this.settings, properties);
        if (!state.characters) light.enabled = false;
        if (light.enabled) lighting.light = light;
        this.lightRenderer.update(light);
        this.root.style.setProperty('--vn-scene-brightness', lighting.brightness);
        const variables = { ...structuredClone(state.scene || {}), background: state.background || null, lighting };
        if (JSON.stringify(variables) === JSON.stringify(this.variables)) return;
        this.variables = variables;
        this.root.dispatchEvent(new CustomEvent('vnplus:scene-context', { bubbles: true, detail: structuredClone(variables) }));
    }
    async render(state, maxSlots) {
        const generation = ++this.generation, current = () => generation === this.generation;
        const background = this.root.querySelector('.vn-background'), stage = this.root.querySelector('.vn-stage');
        this.root.dataset.mode = state.mode;
        this.root.dataset.spriteFraming = this.settings.spriteFraming || 'bust';
        this.root.classList.toggle('vn-black', state.black || state.mode === 'black');
        this.root.classList.toggle('vn-reduced-motion', this.settings.reducedMotion);
        this.root.style.setProperty('--vn-height', `${this.settings.bustHeight}vh`);
        this.root.style.setProperty('--vn-dim', this.settings.inactiveBrightness);
        this.root.style.setProperty('--vn-align', this.settings.stageAlignment === 'top' ? 'flex-start' : 'flex-end');
        background.style.transform = this.settings.reducedMotion || !this.settings.screenEffects ? '' : `translate(${state.camera.x}%, ${state.camera.y}%) scale(${state.camera.zoom})`;
        this.root.querySelector('.vn-tint').style.background = CSS.supports('color', state.tint) ? state.tint : 'transparent';
        background.dataset.asset = state.background || '';
        const backgroundRequest = state.background ? this.resolver.background(state.background).then(async url => {
            const properties = url ? await this.resolver.backgroundProperties(url) : { inside: false };
            if (current()) {
                if (url !== this.backgroundUrl) { background.style.backgroundImage = url ? `url("${url}")` : ''; this.backgroundUrl = url; }
                this.publishContext(state, properties);
            }
        }) : Promise.resolve();
        if (!state.background) { background.style.backgroundImage = ''; this.backgroundUrl = null; this.publishContext(state, false); }
        const characters = Object.values(state.characters).filter(character => !this.registry.isNarrator(character.id) && !this.registry.isNarrator(character.name)
            && (this.settings.showPlayerBust || !this.registry.isPlayer(character.id)));
        const visibleIds = new Set(characters.map(character => character.id));
        for (const [id, node] of this.nodes) if (!visibleIds.has(id)) { this.sprites.remove(node); node.remove(); this.nodes.delete(id); }
        const count = Math.max(maxSlots, ...characters.map(char => char.slot + 1));
        await Promise.all([backgroundRequest, ...characters.map(async character => {
            const props = this.registry.get(character.id);
            let node = this.nodes.get(character.id);
            if (!node) {
                node = document.createElement('div'); node.className = 'vn-character vn-no-sprite'; node.dataset.character = character.id;
                const fallback = createSilhouette(character.name);
                node.append(fallback); stage.append(node); this.nodes.set(character.id, node);
            }
            node.dataset.name = character.name;
            node.classList.toggle('vn-speaking', character.id === state.speaker);
            node.classList.toggle('vn-inactive', !!state.speaker && character.id !== state.speaker);
            const position = stagePosition(character.slot, count, this.settings);
            node.dataset.side = position.side; node.dataset.depth = position.depth;
            node.style.left = `${position.x}%`; node.style.width = `${position.width}vw`;
            this.place(node, position);
            node.style.setProperty('--vn-scale', this.settings.bustScale * (Number(props.bustScale) || 1) * position.scale);
            node.style.setProperty('--vn-offset-x', `${Number(props.offsetX) || 0}px`);
            node.style.setProperty('--vn-offset-y', `${Number(props.offsetY) || 0}px`);
            node.style.zIndex = String(position.z);
            node.classList.toggle('vn-hide-missing', this.settings.missingAsset === 'hide');
            await this.sprites.render(node, character.id, character.expression, this.registry.expressionCandidates(character.id, character.expression), props);
            // Image availability can change during loading. Shadows keep the bust baseline.
            if (current()) this.place(node, position);
        })]);
        if (current()) this.lightRenderer.refresh();
    }
    cancelPending() { this.generation++; this.sprites.cancelPending(); }
    clear() {
        this.generation++;
        this.sprites.clear();
        this.nodes.forEach(node => node.remove()); this.nodes.clear();
        const background = this.root.querySelector('.vn-background'); background.style.backgroundImage = ''; background.dataset.asset = ''; this.backgroundUrl = null;
        this.root.querySelector('.vn-tint').style.background = ''; this.root.classList.remove('vn-black', 'vn-narrating');
        this.publishContext({}, false);
    }
    dispose() { this.clear(); this.lightRenderer.dispose(); this.sprites.dispose(); }
}
