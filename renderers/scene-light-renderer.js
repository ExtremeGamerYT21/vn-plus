import { lightRGB, surfaceLight, sceneLight } from '../core/scene-light.js';

const states = new WeakMap(), NS = 'http://www.w3.org/2000/svg';
const SURFACES = '.vn-top,.vn-reply,.vn-panel,.vn-artifact,.vn-dialogue-shell,.vn-dialogue,.vn-controls,.vn-character,button,iframe';
let lightSequence = 0;
export const currentSceneLight = root => structuredClone(states.get(root.closest('#vnplus-overlay') || root) || sceneLight(null));

/** Relight existing DOM surfaces without replacing a theme's materials or controls. */
export class SceneLightRenderer {
    constructor(root, onLight = () => {}) {
        this.root = root; this.onLight = onLight; this.surfaces = new Map(); this.keys = new Map(); this.sequence = 0;
        this.id = `vn-light-${++lightSequence}`;
        this.style = document.createElement('style'); this.style.dataset.vnLightStyle = '';
        this.style.textContent = '#vnplus-overlay.vn-2d-light .vn-stage{filter:none!important}#vnplus-overlay.vn-2d-light .vn-sprite-frame:not(.vn-sprite-meshed),#vnplus-overlay.vn-2d-light .vn-no-sprite .vn-missing-bust{filter:brightness(var(--vn-light-fallback,1))}';
        this.svg = document.createElementNS(NS, 'svg'); this.svg.dataset.vnLightStyle = ''; this.svg.setAttribute('aria-hidden', 'true');
        this.svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;overflow:hidden';
        this.defs = document.createElementNS(NS, 'defs'); this.svg.append(this.defs); root.append(this.style, this.svg);
        this.schedule = () => {
            if (!this.light?.enabled || this.root.hidden || this.frame !== undefined) return;
            this.frame = requestAnimationFrame(() => { this.frame = undefined; this.paint(); this.onLight(this.light); });
        };
        this.observer = new MutationObserver(records => {
            // Typewriter spans, blinking images and mesh canvases do not change light.
            if (records.some(record => !record.target.closest?.('[data-vn-light-style],.vn-sprite-visual') && (record.type === 'attributes'
                ? record.target === root || record.target.matches?.(SURFACES)
                : [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(SURFACES) || node.querySelector(SURFACES)))))) this.schedule();
        });
        this.observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'hidden'] });
        this.inputEvents = ['pointerover', 'pointerout', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'focusin', 'focusout'];
        this.onInput = event => { const button = event.target.closest?.('button'); if (button && !button.contains(event.relatedTarget)) this.schedule(); };
        this.onTransition = event => { if (event.target.matches?.('.vn-character,.vn-dialogue-shell,.vn-top')) this.schedule(); };
        window.addEventListener('resize', this.schedule); root.addEventListener('transitionend', this.onTransition);
        for (const event of this.inputEvents) root.addEventListener(event, this.onInput);
    }
    refresh() { this.schedule(); }
    update(light) {
        const changed = JSON.stringify(light) !== JSON.stringify(this.light);
        if (!changed) return;
        this.light = structuredClone(light); states.set(this.root, this.light);
        this.root.classList.toggle('vn-2d-light', !!light.enabled);
        this.root.style.setProperty('--vn-light-fallback', surfaceLight(light).brightness);
        this.paint(); this.onLight(this.light);
        if (changed) this.root.dispatchEvent(new CustomEvent('vnplus:light-changed', { detail: structuredClone(this.light) }));
    }
    restore(node, record, property) {
        if (node.style.getPropertyValue(property) !== record.applied) return;
        if (record.inline) node.style.setProperty(property, record.inline, record.priority);
        else node.style.removeProperty(property);
    }
    base(node, record, property) {
        if (node.style.getPropertyValue(property) !== record.applied) {
            record.inline = node.style.getPropertyValue(property); record.priority = node.style.getPropertyPriority(property);
        }
        this.restore(node, record, property);
        return getComputedStyle(node).getPropertyValue(property);
    }
    paint() {
        if (!this.light?.enabled || this.root.hidden) { this.clearSurfaces(); return; }
        const root = this.root.getBoundingClientRect(); if (!root.width || !root.height) return;
        const shell = this.root.querySelector('.vn-dialogue-shell');
        const framed = shell && getComputedStyle(shell).display !== 'contents';
        const panels = this.light.hud ? [...this.root.querySelectorAll('.vn-top,.vn-reply,.vn-panel>section,.vn-artifact header'), ...(framed ? [shell] : [...this.root.querySelectorAll('.vn-dialogue,.vn-controls')])] : [];
        panels.push(...this.root.querySelectorAll('iframe[data-vn-light-host="true"]'));
        const active = new Set(panels.filter(node => node.getBoundingClientRect().width && !node.closest('[hidden]')));
        for (const [node, record] of this.surfaces) if (!active.has(node)) {
            this.restore(node, record, 'filter'); record.filter.remove(); this.surfaces.delete(node);
        }
        for (const node of active) {
            let record = this.surfaces.get(node);
            if (!record) {
                const filter = document.createElementNS(NS, 'filter'), matrix = document.createElementNS(NS, 'feColorMatrix');
                filter.id = `${this.id}-${++this.sequence}`; filter.setAttribute('x', '-30%'); filter.setAttribute('y', '-60%'); filter.setAttribute('width', '160%'); filter.setAttribute('height', '220%');
                filter.setAttribute('color-interpolation-filters', 'sRGB'); matrix.setAttribute('type', 'matrix'); filter.append(matrix); this.defs.append(filter);
                record = { filter, matrix }; this.surfaces.set(node, record);
            }
            const rect = node.getBoundingClientRect(), signature = JSON.stringify([this.light, root.width, root.height, rect.x - root.x, rect.y - root.y, rect.width, rect.height]);
            if (record.signature === signature && node.style.filter === record.applied) continue;
            record.signature = signature;
            const original = this.base(node, record, 'filter');
            const sample = surfaceLight(this.light, { x: (rect.left + rect.width / 2 - root.left) / root.width, y: (rect.top + rect.height / 2 - root.top) / root.height }, root.width / root.height);
            const rgb = lightRGB(this.light.color).map(value => Math.max(.6, Math.min(1.08, sample.brightness * (.72 + .28 * value))));
            record.matrix.setAttribute('values', `${rgb[0]} 0 0 0 0 0 ${rgb[1]} 0 0 0 0 0 ${rgb[2]} 0 0 0 0 0 1 0`);
            record.applied = `${original === 'none' ? '' : original + ' '}url("#${record.filter.id}")`;
            node.style.setProperty('filter', record.applied, 'important');
            record.applied = node.style.getPropertyValue('filter');
        }
        const keys = new Set(this.light.hud ? [...this.root.querySelectorAll('button')].filter(node => !node.closest('[hidden]')) : []);
        for (const [node, record] of this.keys) if (!keys.has(node)) { this.restore(node, record, 'box-shadow'); this.keys.delete(node); }
        for (const node of keys) {
            const record = this.keys.get(node) || {}; this.keys.set(node, record);
            const rect = node.getBoundingClientRect(), signature = JSON.stringify([this.light, root.width, root.height, rect.x - root.x, rect.y - root.y, rect.width, rect.height, node.matches(':hover'), node.matches(':active'), node.matches(':focus-visible')]);
            if (record.signature === signature && node.style.boxShadow === record.applied) continue;
            record.signature = signature;
            const original = this.base(node, record, 'box-shadow');
            const sample = surfaceLight(this.light, { x: (rect.left + rect.width / 2 - root.left) / root.width, y: (rect.top + rect.height / 2 - root.top) / root.height }, root.width / root.height);
            const x = -sample.direction.x * 2, y = -sample.direction.y * 2;
            const rgb = lightRGB(sample.color).map(value => Math.round(value * 255)).join(',');
            record.applied = `inset ${x}px ${y}px 1px rgba(${rgb},${Math.min(.36, this.light.intensity * .24)}), inset ${-x}px ${-y}px 2px #0003${original === 'none' ? '' : ', ' + original}`;
            node.style.setProperty('box-shadow', record.applied, 'important');
            record.applied = node.style.getPropertyValue('box-shadow');
        }
    }
    clearSurfaces() {
        for (const [node, record] of this.surfaces) { this.restore(node, record, 'filter'); record.filter.remove(); }
        for (const [node, record] of this.keys) this.restore(node, record, 'box-shadow');
        this.surfaces.clear(); this.keys.clear();
    }
    dispose() {
        this.observer.disconnect(); cancelAnimationFrame(this.frame); this.clearSurfaces();
        window.removeEventListener('resize', this.schedule); this.root.removeEventListener('transitionend', this.onTransition);
        for (const event of this.inputEvents) this.root.removeEventListener(event, this.onInput);
        this.root.classList.remove('vn-2d-light'); this.root.style.removeProperty('--vn-light-fallback'); this.style.remove(); this.svg.remove(); states.delete(this.root);
    }
}
