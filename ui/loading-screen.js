const phases = {
    generating: ['Waiting for the response', 'The response is still being written. VN+ will continue when its player perspective is ready.'],
    pov: ['Waiting for player perspective', 'Your POV workflow has not finished yet. VN+ checks automatically and will open the scene here when it is ready.'],
    preparing: ['Preparing your scene', 'Loading character properties and assembling the scene.'],
    empty: ['Nothing to play yet', 'Waiting for a response with dialogue, narration or an artifact. This screen updates automatically.'],
    error: ['Scene could not be prepared', 'You can check again or exit VN and return later.'],
};

export class LoadingScreen {
    constructor(root) {
        this.root = root; this.node = root.querySelector('.vn-status');
        this.node.setAttribute('aria-live', 'polite');
        const card = document.createElement('section'); card.className = 'vn-loading-card';
        const spinner = document.createElement('span'); spinner.className = 'vn-loading-spinner'; spinner.setAttribute('aria-hidden', 'true');
        this.title = document.createElement('h2'); this.message = document.createElement('p'); this.hint = document.createElement('p'); this.hint.className = 'vn-hint';
        this.retry = document.createElement('button'); this.retry.type = 'button'; this.retry.dataset.action = 'check-pov'; this.retry.textContent = 'Check again';
        card.append(spinner, this.title, this.message, this.hint, this.retry); this.node.append(card);
    }
    show(message, phase = 'pov') {
        const [title, hint] = phases[phase] || phases.pov;
        this.title.textContent = title; this.message.textContent = message; this.hint.textContent = hint;
        this.node.dataset.phase = phase; this.retry.disabled = phase === 'preparing' || phase === 'generating';
        this.node.hidden = false; this.root.setAttribute('aria-busy', String(!['empty', 'error'].includes(phase)));
    }
    hide() { this.node.hidden = true; this.root.removeAttribute('aria-busy'); }
}
