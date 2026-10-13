import { stagePosition } from '../core/stage-layout.js';
import { SpriteAnimator } from './sprite-animator.js';

export class StageRenderer {
    constructor(root, resolver, registry, settings) { this.root = root; this.resolver = resolver; this.registry = registry; this.settings = settings; this.generation = 0; this.nodes = new Map(); this.sprites = new SpriteAnimator(root, resolver, settings); }
    async render(state, maxSlots) {
        const generation = ++this.generation, current = () => generation === this.generation;
        const background = this.root.querySelector('.vn-background'), stage = this.root.querySelector('.vn-stage');
        this.root.dataset.mode = state.mode;
        this.root.classList.toggle('vn-black', state.black || state.mode === 'black');
        this.root.classList.toggle('vn-reduced-motion', this.settings.reducedMotion);
        this.root.style.setProperty('--vn-height', `${this.settings.bustHeight}vh`);
        this.root.style.setProperty('--vn-dim', this.settings.inactiveBrightness);
        this.root.style.setProperty('--vn-align', this.settings.stageAlignment === 'top' ? 'flex-start' : 'flex-end');
        background.style.transform = this.settings.reducedMotion || !this.settings.screenEffects ? '' : `translate(${state.camera.x}%, ${state.camera.y}%) scale(${state.camera.zoom})`;
        this.root.querySelector('.vn-tint').style.background = CSS.supports('color', state.tint) ? state.tint : 'transparent';
        if (background.dataset.asset !== (state.background || '')) background.style.backgroundImage = '';
        background.dataset.asset = state.background || '';
        const backgroundRequest = state.background ? this.resolver.background(state.background).then(url => {
            if (current()) background.style.backgroundImage = url ? `url("${url}")` : '';
        }) : Promise.resolve();
        if (!state.background) background.style.backgroundImage = '';
        for (const [id, node] of this.nodes) if (!state.characters[id]) { this.sprites.remove(node); node.remove(); this.nodes.delete(id); }
        const count = Math.max(maxSlots, ...Object.values(state.characters).map(char => char.slot + 1));
        await Promise.all([backgroundRequest, ...Object.values(state.characters).map(async character => {
            const props = this.registry.get(character.id);
            let node = this.nodes.get(character.id);
            if (!node) {
                node = document.createElement('div'); node.className = 'vn-character'; node.dataset.character = character.id;
                const fallback = document.createElement('div'); fallback.className = 'vn-missing-bust'; fallback.textContent = character.name;
                node.append(fallback); stage.append(node); this.nodes.set(character.id, node);
            }
            node.dataset.name = character.name;
            node.classList.toggle('vn-speaking', character.id === state.speaker);
            node.classList.toggle('vn-inactive', !!state.speaker && character.id !== state.speaker);
            const position = stagePosition(character.slot, count, this.settings);
            node.dataset.side = position.side; node.dataset.depth = position.depth;
            node.style.left = `${position.x}%`; node.style.width = `${position.width}vw`;
            node.style.bottom = this.settings.stageAlignment === 'top' ? 'auto' : `${position.lift}vh`;
            node.style.top = this.settings.stageAlignment === 'top' ? `${position.lift}vh` : 'auto';
            node.style.transformOrigin = this.settings.stageAlignment === 'top' ? 'top center' : 'bottom center';
            node.style.setProperty('--vn-scale', this.settings.bustScale * (Number(props.bustScale) || 1) * position.scale);
            node.style.setProperty('--vn-offset-x', `${Number(props.offsetX) || 0}px`);
            node.style.setProperty('--vn-offset-y', `${Number(props.offsetY) || 0}px`);
            node.style.zIndex = String(position.z);
            if (!this.sprites.records.has(node)) node.classList.add('vn-no-sprite');
            node.classList.toggle('vn-hide-missing', this.settings.missingAsset === 'hide');
            await this.sprites.render(node, character.id, character.expression, this.registry.expressionCandidates(character.id, character.expression), props);
        })]);
    }
    clear() {
        this.generation++;
        this.sprites.clear();
        this.nodes.forEach(node => node.remove()); this.nodes.clear();
        const background = this.root.querySelector('.vn-background'); background.style.backgroundImage = ''; background.dataset.asset = '';
        this.root.querySelector('.vn-tint').style.background = ''; this.root.classList.remove('vn-black');
    }
    dispose() { this.clear(); this.sprites.dispose(); }
}
