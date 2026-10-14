/** One abortable listener set for the overlay's entire lifetime. */
export function bindControls(root, callbacks) {
    const abort = new AbortController(), options = { signal: abort.signal };
    root.addEventListener('pointerdown', () => callbacks.unlock(), { ...options, capture: true });
    root.addEventListener('change', event => {
        if (event.target.matches?.('[data-layout-picker]')) callbacks.layout(event.target.value);
        if (event.target.matches?.('[data-environment-picker]')) callbacks.environment(event.target.value);
    }, options);
    root.addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (button) { callbacks.action(button.dataset.action); return; }
        if (event.target.closest('.vn-dialogue')) callbacks.action('next');
    }, options);
    root.querySelector('#vnplus-reply').addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); callbacks.action('send'); }
    }, options);
    document.addEventListener('keydown', event => {
        if (root.hidden || event.isComposing) return;
        const editable = event.target.closest?.('input,textarea,select,[contenteditable="true"]');
        if (event.key === 'Escape') { event.preventDefault(); callbacks.escape(); return; }
        if (editable) return;
        if (event.key === 'Tab') {
            const visibleLayer = [...root.querySelectorAll('.vn-artifact,.vn-panel,.vn-reply')].find(node => !node.hidden) || root;
            const targets = [...visibleLayer.querySelectorAll('button,input,textarea,select,summary,[tabindex="0"]')].filter(node => !node.disabled && node.getClientRects().length);
            const first = targets[0], last = targets.at(-1);
            if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
            return;
        }
        if (event.target.closest?.('button') && [' ', 'Enter'].includes(event.key)) return;
        if ([' ', 'Enter', 'ArrowRight'].includes(event.key)) { event.preventDefault(); callbacks.action('next'); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); callbacks.action('back'); }
    }, options);
    return () => abort.abort();
}
