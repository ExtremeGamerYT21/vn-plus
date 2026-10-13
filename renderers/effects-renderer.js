export class EffectsRenderer {
    constructor(root, settings) { this.root = root; this.settings = settings; this.animations = new Set(); }
    trigger(effect) {
        if (!this.settings.screenEffects || this.settings.reducedMotion) return;
        let animation;
        if (effect.type === 'flash') {
            const layer = this.root.querySelector('.vn-flash');
            const color = effect.value?.toLowerCase();
            layer.style.background = CSS.supports('color', color || '') ? color : 'white';
            animation = layer.animate([{ opacity: 0 }, { opacity: .45, offset: .2 }, { opacity: 0 }], { duration: 450 });
        } else if (effect.type === 'shake') {
            const distance = effect.value?.toUpperCase() === 'STRONG' ? 9 : 3;
            animation = this.root.querySelector('.vn-world').animate([{ transform: 'translate(0)' }, { transform: `translate(${distance}px, -2px)` }, { transform: `translate(-${distance}px, 2px)` }, { transform: 'translate(0)' }], { duration: 220, iterations: 2 });
        }
        if (animation) { this.animations.add(animation); animation.finished.then(() => this.animations.delete(animation)).catch(() => this.animations.delete(animation)); }
    }
    clear() { this.animations.forEach(animation => animation.cancel()); this.animations.clear(); }
}
