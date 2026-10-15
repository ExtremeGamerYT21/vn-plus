import { breathingConfig, SpriteMeshRenderer } from './sprite-mesh.js';

const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

export class SpriteAnimator {
    constructor(root, resolver, settings) {
        this.root = root; this.resolver = resolver; this.settings = settings; this.records = new Map(); this.frameId = null;
        this.mesh = new SpriteMeshRenderer(() => this.stopBreathingClock());
        this.media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
        this.onMotion = () => { for (const [node, record] of this.records) { this.settle(record); this.configureBreathing(record); this.stopBlink(record); this.scheduleBlink(node, record); } };
        this.media?.addEventListener('change', this.onMotion);
        this.onVisibility = () => {
            if (document.hidden) { this.stopBreathingClock(); for (const record of this.records.values()) this.stopBlink(record); }
            else { this.startBreathingClock(); for (const [node, record] of this.records) this.scheduleBlink(node, record); }
        };
        document.addEventListener('visibilitychange', this.onVisibility);
    }
    get reduced() { return !!this.settings.reducedMotion || !!this.media?.matches; }
    createRecord(node) {
        const visual = document.createElement('div'); visual.className = 'vn-sprite-visual'; node.prepend(visual);
        const record = { visual, revision: 0, key: '', frame: null, animations: new Set(), loads: new Set() };
        this.records.set(node, record); return record;
    }
    valid(node, record, revision) { return node.isConnected && this.records.get(node) === record && record.revision === revision; }
    load(url, record) {
        return new Promise(resolve => {
            const image = document.createElement('img'); image.draggable = false;
            let settled = false;
            const finish = success => {
                if (settled) return; settled = true; clearTimeout(timer); image.onload = image.onerror = null; record.loads.delete(cancel);
                if (!success) image.removeAttribute('src'); resolve(success ? image : null);
            };
            const cancel = () => finish(false);
            const timer = setTimeout(cancel, 8000); record.loads.add(cancel);
            image.onload = () => finish(image.naturalWidth > 0); image.onerror = cancel; image.src = url;
            if (image.complete) finish(image.naturalWidth > 0);
        });
    }
    stopBlink(record) {
        clearTimeout(record.blinkTimer); clearTimeout(record.openTimer); record.blinkTimer = record.openTimer = null;
        if (record.frame) {
            record.frame.querySelector('.vn-sprite-open').hidden = false;
            const blink = record.frame.querySelector('.vn-sprite-blink'); if (blink) blink.hidden = true;
            record.frame.dataset.blinking = 'false';
            this.drawBreathing(record);
        }
    }
    settle(record) {
        for (const animation of record.animations) animation.cancel(); record.animations.clear();
        for (const frame of record.visual.querySelectorAll('.vn-sprite-frame')) if (frame !== record.frame) this.removeFrame(frame);
        if (record.frame) record.frame.style.opacity = '1';
    }
    stopBreathingClock() { if (this.frameId !== null) cancelAnimationFrame(this.frameId); this.frameId = null; }
    startBreathingClock() {
        if (this.frameId !== null || this.root.hidden || document.hidden || this.reduced || !this.mesh.surfaces.size) return;
        // One shared clock/context keeps all expressions on the same deformation,
        // including the outgoing image during a crossfade.
        this.frameId = requestAnimationFrame(time => {
            this.frameId = null;
            if (this.root.hidden || document.hidden || this.reduced) return;
            for (const record of this.records.values()) if (record.breath) {
                const breath = record.breath, phase = (time + breath.phase) / breath.duration;
                const inhale = .5 - .5 * Math.cos(phase * Math.PI * 2);
                record.inhale = inhale; this.drawBreathing(record);
            }
            this.startBreathingClock();
        });
    }
    configureBreathing(record) {
        const config = breathingConfig(record.props, this.settings);
        let hash = 0; for (const char of record.id || '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
        record.breath = !this.reduced && config.enabled && config.amount > 0 ? { ...config, phase: hash % config.duration } : null;
        for (const frame of record.visual.querySelectorAll('.vn-sprite-frame')) {
            if (record.breath) this.mesh.enable(frame); else this.mesh.remove(frame);
        }
        this.drawBreathing(record);
        if (!this.mesh.surfaces.size) this.stopBreathingClock();
        else this.startBreathingClock();
    }
    drawBreathing(record) {
        if (!record.breath) return;
        for (const frame of record.visual.querySelectorAll('.vn-sprite-frame')) this.mesh.draw(frame, record.breath, record.inhale || 0);
    }
    removeFrame(frame) { if (frame) { this.mesh.remove(frame); frame.remove(); } }
    async render(node, id, expression, emotions, props) {
        const record = this.records.get(node) || this.createRecord(node);
        record.id = id; record.props = props;
        this.configureBreathing(record);
        const key = JSON.stringify([expression, emotions, props.assetFolder || id, props.expressionAliases || null, props.defaultExpression || null, props.blink || null, this.settings.spriteBlinking, this.reduced]);
        if (key === record.key) { if (this.reduced) { this.settle(record); this.stopBlink(record); } else this.scheduleBlink(node, record); return record.pending; }
        record.key = key; const revision = ++record.revision;
        record.loading = true;
        this.stopBlink(record); this.settle(record); for (const cancel of [...record.loads]) cancel();
        record.pending = (async () => {
            const url = await this.resolver.sprite(id, emotions, props);
            if (!this.valid(node, record, revision)) return;
            if (!url) { this.removeFrame(record.frame); record.frame = null; node.classList.add('vn-no-sprite'); delete node.dataset.sprite; return; }
            if (!record.frame || record.frame.querySelector('.vn-sprite-open').src !== url) {
                const image = await this.load(url, record);
                if (!this.valid(node, record, revision)) return;
                if (!image) { this.removeFrame(record.frame); record.visual.replaceChildren(); record.frame = null; node.classList.add('vn-no-sprite'); delete node.dataset.sprite; return; }
                image.className = 'vn-sprite-open'; image.alt = node.dataset.name || id;
                const previous = record.frame, frame = document.createElement('div'); frame.className = 'vn-sprite-frame';
                frame.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`; frame.append(image); record.visual.prepend(frame); record.frame = frame;
                const duration = this.reduced ? 0 : clamp(this.settings.expressionTransition, 0, 2000, 280);
                if (previous && duration > 0) {
                    previous.classList.add('vn-sprite-outgoing'); previous.setAttribute('aria-hidden', 'true');
                    const fadeIn = frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'ease-in-out' });
                    const fadeOut = previous.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-in-out' });
                    record.animations.add(fadeIn); record.animations.add(fadeOut);
                    Promise.all([fadeIn.finished, fadeOut.finished]).then(() => this.removeFrame(previous)).catch(() => {}).finally(() => { record.animations.delete(fadeIn); record.animations.delete(fadeOut); });
                } else this.removeFrame(previous);
            }
            node.classList.remove('vn-no-sprite'); node.dataset.sprite = url; node.dataset.expression = expression;
            this.configureBreathing(record);
            void this.prepareBlink(node, record, revision, url);
        })().finally(() => { if (record.revision === revision) record.loading = false; });
        return record.pending;
    }
    async prepareBlink(node, record, revision, openURL) {
        record.blinkLoading = true;
        try {
            const old = record.frame?.querySelector('.vn-sprite-blink'); old?.remove();
            if (this.reduced || !this.settings.spriteBlinking || record.props.blink === false || record.props.blink?.enabled === false) return;
            const resolved = decodeURIComponent(new URL(openURL).pathname.split('/').at(-1)).replace(/\.[^.]+$/, '');
            const url = await this.resolver.blinkSprite(record.id, [resolved], record.props);
            if (!url || !this.valid(node, record, revision)) return;
            const image = await this.load(url, record);
            if (!image || !this.valid(node, record, revision)) return;
            image.className = 'vn-sprite-blink'; image.alt = ''; image.hidden = true; image.setAttribute('aria-hidden', 'true');
            record.frame.append(image); this.scheduleBlink(node, record);
        } finally { if (record.revision === revision) record.blinkLoading = false; }
    }
    scheduleBlink(node, record) {
        if (this.reduced || document.hidden || !this.settings.spriteBlinking || !record.frame?.querySelector('.vn-sprite-blink') || record.blinkTimer || record.openTimer) return;
        const config = record.props.blink || {};
        const min = clamp(config.intervalMin ?? this.settings.blinkIntervalMin, 500, 30000, 2800);
        const max = clamp(config.intervalMax ?? this.settings.blinkIntervalMax, min, 60000, Math.max(min, 6500));
        record.blinkTimer = setTimeout(() => { record.blinkTimer = null; this.blink(node); }, min + Math.random() * (max - min));
    }
    blink(node) {
        const record = this.records.get(node), frame = record?.frame;
        if (!record || !frame || this.reduced || !this.settings.spriteBlinking || !frame.querySelector('.vn-sprite-blink')) return;
        this.stopBlink(record);
        frame.querySelector('.vn-sprite-open').hidden = true; frame.querySelector('.vn-sprite-blink').hidden = false; frame.dataset.blinking = 'true';
        this.drawBreathing(record);
        const duration = clamp(record.props.blink?.duration ?? this.settings.blinkDuration, 60, 350, 130);
        record.openTimer = setTimeout(() => {
            record.openTimer = null;
            if (this.records.get(node) !== record || record.frame !== frame) return;
            this.stopBlink(record); this.scheduleBlink(node, record);
        }, duration);
    }
    remove(node) {
        const record = this.records.get(node); if (!record) return;
        record.revision++; this.stopBlink(record); this.settle(record); this.removeFrame(record.frame); for (const cancel of [...record.loads]) cancel(); this.records.delete(node);
        if (!this.mesh.surfaces.size) this.stopBreathingClock();
    }
    cancelPending() {
        for (const record of this.records.values()) if (record.loading || record.blinkLoading || record.loads.size) {
            record.revision++; record.key = ''; record.loading = record.blinkLoading = false;
            for (const cancel of [...record.loads]) cancel();
        }
    }
    clear() { for (const node of [...this.records.keys()]) this.remove(node); }
    dispose() { this.clear(); this.stopBreathingClock(); this.media?.removeEventListener('change', this.onMotion); document.removeEventListener('visibilitychange', this.onVisibility); this.mesh.dispose(); }
}
