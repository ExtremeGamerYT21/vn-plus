/** Keep source discovery independent of the hidden page's chained timer budget. */
export class SourceMonitor {
    constructor(check, { workerFactory = () => new Worker(new URL('../workers/source-monitor.js', import.meta.url), { type: 'module' }),
        set = setInterval, clear = clearInterval, onError = () => {} } = {}) {
        this.check = check; this.set = set; this.clear = clear; this.onError = onError;
        try {
            this.worker = workerFactory();
            this.worker.onmessage = () => {
                this.worker?.postMessage('received'); this.wake(true);
            };
            this.worker.onerror = event => { event.preventDefault?.(); this.fallback(); };
            this.mode = 'worker';
        } catch { this.fallback(); }
    }
    fallback() {
        if (this.disposed || this.mode === 'timer') return;
        this.worker?.terminate(); this.worker = null; this.mode = 'timer';
        this.timer = this.set(() => this.wake(true), 500);
    }
    wake(confirm = false) {
        if (this.disposed) return;
        try { Promise.resolve(this.check(confirm)).catch(this.onError); } catch (error) { this.onError(error); }
    }
    dispose() {
        this.disposed = true; this.worker?.terminate(); this.worker = null;
        if (this.timer !== undefined) this.clear(this.timer);
    }
}
