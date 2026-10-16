/** Widen complete dialogue before reveal, keeping the chosen box height. */
export class DialogueLayout {
    constructor(root) {
        this.root = root;
        this.observer = new ResizeObserver(() => this.schedule());
        for (const node of [root, ...root.querySelectorAll('.vn-top,.vn-controls,.vn-dialogue-shell,.vn-text')]) this.observer.observe(node, { box: 'border-box' });
    }
    schedule() {
        if (this.frame != null || this.disposed || this.root.hidden) return;
        this.frame = requestAnimationFrame(() => { this.frame = null; this.fit(); });
    }
    fit() {
        if (this.disposed || this.root.hidden || !this.root.isConnected) return;
        const root = this.root, bounds = root.getBoundingClientRect();
        const box = root.querySelector('.vn-dialogue'), shell = root.querySelector('.vn-dialogue-shell'), controls = root.querySelector('.vn-controls'), header = root.querySelector('.vn-top');
        const scrollTop = box.scrollTop;
        root.style.removeProperty('--vn-dialogue-auto-width');
        const number = value => Number.parseFloat(value) || 0;
        const margins = style => number(style.marginTop) + number(style.marginBottom);
        const shellStyle = getComputedStyle(shell), boxStyle = getComputedStyle(box), controlStyle = getComputedStyle(controls);
        const framed = shellStyle.display !== 'contents';
        const headerBottom = header.getClientRects().length ? Math.max(0, header.getBoundingClientRect().bottom - bounds.top) : 0;
        const shellRoom = Math.max(32, Math.floor(bounds.height - headerBottom - 12 - (framed ? margins(shellStyle) : 0)));
        const frame = framed ? number(shellStyle.paddingTop) + number(shellStyle.paddingBottom) + number(shellStyle.borderTopWidth) + number(shellStyle.borderBottomWidth) : 0;
        const boxRoom = Math.max(32, Math.floor(shellRoom - frame - controls.getBoundingClientRect().height - margins(controlStyle) - margins(boxStyle)));
        for (const [key, value] of [['--vn-dialogue-shell-max-height', shellRoom], ['--vn-dialogue-max-height', boxRoom]]) {
            const pixels = `${value}px`;
            if (root.style.getPropertyValue(key) !== pixels) root.style.setProperty(key, pixels);
        }
        const host = framed ? shell : box, baseWidth = Math.ceil(host.getBoundingClientRect().width);
        const maxWidth = Math.max(baseWidth, Math.floor(bounds.width * .94));
        const fits = () => box.scrollHeight <= box.clientHeight + 1;
        if (!fits() && maxWidth > baseWidth) {
            const width = value => root.style.setProperty('--vn-dialogue-auto-width', `${value}px`);
            width(maxWidth);
            if (fits()) {
                let lower = baseWidth, upper = maxWidth;
                while (upper - lower > 1) { const middle = Math.floor((lower + upper) / 2); width(middle); if (fits()) upper = middle; else lower = middle; }
                width(upper);
            }
        }
        box.scrollTop = scrollTop;
    }
    dispose() { this.disposed = true; this.observer.disconnect(); cancelAnimationFrame(this.frame); }
}
