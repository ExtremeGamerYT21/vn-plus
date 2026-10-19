/** Keep source discovery independent of the hidden page's chained timer budget. */
export class SourceMonitor {
    constructor(check, { workerFactory = () => new Worker(new URL('../workers/source-monitor.js', import.meta.url), { type: 'module' }),
        set = (callback, delay) => setInterval(callback, delay), clear = id => clearInterval(id),
        defer = (callback, delay) => setTimeout(callback, delay), cancel = id => clearTimeout(id), onError = () => {} } = {}) {
        this.check = check; this.set = set; this.clear = clear; this.defer = defer; this.cancel = cancel; this.onError = onError;
        this.workerFactory = workerFactory; this.connect();
    }
    connect() {
        try {
            this.worker = this.workerFactory();
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
        if (confirm) { this.cancel(this.confirmation); this.confirmation = undefined; }
        // One independent confirmation per event burst, even if worker heartbeats stall.
        else if (this.confirmation === undefined) this.confirmation = this.defer(() => this.wake(true), 650);
        try { Promise.resolve(this.check(confirm)).catch(this.onError); } catch (error) { this.onError(error); }
    }
    resume() {
        if (this.disposed) return;
        this.worker?.terminate(); this.worker = null;
        if (this.timer !== undefined) this.clear(this.timer);
        this.timer = undefined; this.mode = null; this.connect(); this.wake();
    }
    dispose() {
        this.disposed = true; this.worker?.terminate(); this.worker = null;
        this.cancel(this.confirmation); this.confirmation = undefined;
        if (this.timer !== undefined) this.clear(this.timer);
    }
}
