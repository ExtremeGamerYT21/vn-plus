/** Reserve the actual toolbar/buttons, leaving the rest of the screen for text. */
export class DialogueLayout {
    constructor(root) {
        this.root = root;
        this.observer = new ResizeObserver(() => this.fit());
        for (const node of [root, ...root.querySelectorAll('.vn-top,.vn-controls,.vn-dialogue-shell')]) this.observer.observe(node, { box: 'border-box' });
    }
    fit() {
        if (this.disposed || this.root.hidden || !this.root.isConnected) return;
        const root = this.root, bounds = root.getBoundingClientRect();
        const box = root.querySelector('.vn-dialogue'), shell = root.querySelector('.vn-dialogue-shell'), controls = root.querySelector('.vn-controls'), header = root.querySelector('.vn-top');
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
    }
    dispose() { this.disposed = true; this.observer.disconnect(); }
}
