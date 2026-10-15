export function artifactPolicy(interactive) {
    return `default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; script-src ${interactive ? "'unsafe-inline'" : "'none'"}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
}

function artifactClient(nonce) {
    let port, sequence = 0, resolveReady;
    const pending = new Map(), ready = new Promise(resolve => resolveReady = resolve);
    window.addEventListener('message', event => {
        if (port || event.source !== parent || event.data?.type !== 'vnplus:artifact-init' || event.data.nonce !== nonce || !event.ports[0]) return;
        port = event.ports[0]; port.onmessage = event => {
            const job = pending.get(event.data?.id); if (!job) return;
            pending.delete(event.data.id); clearTimeout(job.timer);
            if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.result);
        }; port.start(); resolveReady();
    });
    const request = async (method, args = {}) => {
        await ready;
        if (pending.size >= 32) throw new Error('Too many pending artifact requests.');
        return new Promise((resolve, reject) => {
            const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('The artifact session expired or the save timed out.')); }, 30000);
            pending.set(id, { resolve, reject, timer }); port.postMessage({ id, method, args });
        });
    };
    const read = () => request('read'), get = async (key, fallback = null) => { const { data } = await read(); return Object.hasOwn(data, key) ? data[key] : fallback; };
    const extra = Object.freeze({ read, get, set: (key, value) => request('set', { key, value }), push: (key, value) => request('push', { key, value }), remove: key => request('delete', { key }) });
    Object.defineProperty(window, 'VNPlus', { value: Object.freeze({ ready, read, getScene: async () => (await read()).scene, extra, get, set: extra.set, push: extra.push, remove: extra.remove }), writable: false });
}

export function isolatedDocument(html, interactive = false, bootstrap = '') {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    parsed.querySelectorAll('iframe,object,embed,base,meta,link,form').forEach(node => node.remove());
    if (!interactive) parsed.querySelectorAll('script').forEach(node => node.remove());
    parsed.querySelectorAll('*').forEach(node => {
        for (const attr of [...node.attributes]) {
            if ((!interactive && /^on/i.test(attr.name)) || ['srcdoc', 'action', 'formaction', 'target', 'ping'].includes(attr.name)) node.removeAttribute(attr.name);
            if (['href', 'xlink:href', 'src', 'poster', 'srcset'].includes(attr.name) && !/^(?:data:|blob:|#)/i.test(attr.value.trim())) node.removeAttribute(attr.name);
        }
    });
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${artifactPolicy(interactive)}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:24px;color:#292533;background:#faf7ef;font-family:Georgia,serif;overflow-wrap:anywhere}img,svg{max-width:100%}</style>${interactive && bootstrap ? `<script>${bootstrap}</script>` : ''}${parsed.head.innerHTML}</head><body>${parsed.body.innerHTML}</body></html>`;
}

export class HTMLRenderer {
    constructor(root, settings, createSession = null, readLocal = null) { this.root = root; this.settings = settings; this.createSession = createSession; this.readLocal = readLocal; this.generation = 0; }
    open(token, html = token.html) {
        this.close();
        if (token.local && html === undefined) {
            const generation = this.generation, panel = this.root.querySelector('.vn-artifact'), content = panel.querySelector('.vn-artifact-content'), status = document.createElement('p');
            status.textContent = `Opening ${token.id}…`; content.append(status); panel.hidden = false; const abort = new AbortController(); this.abort = abort;
            Promise.resolve().then(() => generation === this.generation ? this.readLocal?.(token.id, abort.signal) : undefined).then(source => {
                if (generation !== this.generation) return;
                if (typeof source !== 'string') throw new Error('Local artifact loader is unavailable.');
                this.open(token, source);
            }).catch(error => { if (generation === this.generation) status.textContent = `Could not open ${token.id}: ${error.message}`; });
            return;
        }
        const panel = this.root.querySelector('.vn-artifact'), frame = document.createElement('iframe');
        // No same-origin, popups, forms, downloads, storage, top navigation or app API.
        const interactive = !!this.settings.interactiveArtifacts && !!token.interactive;
        const generation = this.generation, nonce = crypto.randomUUID();
        let session;
        if (interactive && this.createSession) {
            try { session = this.createSession(token, () => generation === this.generation && frame.isConnected); } catch { /* unbound previews stay isolated */ }
        }
        frame.setAttribute('sandbox', interactive ? 'allow-scripts' : '');
        frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
        frame.referrerPolicy = 'no-referrer'; frame.title = 'Player-visible artifact';
        frame.srcdoc = isolatedDocument(html, interactive, session ? `(${artifactClient.toString()})(${JSON.stringify(nonce)});` : '');
        if (session) frame.addEventListener('load', () => {
            if (generation !== this.generation || !frame.isConnected) return;
            const channel = new MessageChannel(); this.port = channel.port1;
            let requests = 0;
            channel.port1.onmessage = async event => {
                const request = event.data;
                if (generation !== this.generation || !frame.isConnected || !Number.isSafeInteger(request?.id) || !['read', 'set', 'delete', 'push'].includes(request.method) || requests >= 32) return;
                requests++;
                let response;
                try { response = { id: request.id, result: await session.request(request.method, request.args) }; }
                catch (error) { response = { id: request.id, error: error.message }; }
                requests--;
                if (generation === this.generation && frame.isConnected) channel.port1.postMessage(response);
            };
            channel.port1.start(); frame.contentWindow.postMessage({ type: 'vnplus:artifact-init', nonce }, '*', [channel.port2]);
        }, { once: true });
        panel.querySelector('.vn-artifact-content').append(frame); panel.hidden = false;
        this.root.querySelector('[data-action="close-artifact"]').focus();
    }
    close() { this.generation++; this.abort?.abort(); this.abort = null; this.port?.close(); this.port = null; const panel = this.root.querySelector('.vn-artifact'); panel.hidden = true; panel.querySelector('.vn-artifact-content').replaceChildren(); }
    get active() { return !this.root.querySelector('.vn-artifact').hidden; }
}
