import { readMessage } from '../core/message-reader.js';

export class OmniscientToggle {
    constructor(context, isBusy) { this.context = context; this.isBusy = isBusy; this.dialog = null; }
    toggle(index) {
        if (this.dialog?.open) { this.close(); return; }
        const message = readMessage(this.context(), index);
        if (this.isBusy() || !message || message.status !== 'ready') return;
        const dialog = document.createElement('dialog'); dialog.className = 'vnplus-ui vn-omniscient';
        const heading = document.createElement('h3'); heading.textContent = 'Omniscient narrative · deliberate reveal';
        const text = document.createElement('pre'); text.textContent = message.canonical;
        const close = document.createElement('button'); close.textContent = 'Return to player perspective'; close.addEventListener('click', () => this.close());
        dialog.append(heading, close, text); document.body.append(dialog); this.dialog = dialog;
        dialog.addEventListener('close', () => { dialog.remove(); if (this.dialog === dialog) this.dialog = null; }); dialog.showModal();
    }
    close() { if (this.dialog) { const dialog = this.dialog; this.dialog = null; dialog.close(); dialog.remove(); } }
}
