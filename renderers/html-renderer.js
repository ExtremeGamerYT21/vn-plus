export function artifactPolicy(interactive) {
    return `default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; script-src ${interactive ? "'unsafe-inline'" : "'none'"}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
}

export function isolatedDocument(html, interactive = false) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    parsed.querySelectorAll('iframe,object,embed,base,meta,link,form').forEach(node => node.remove());
    if (!interactive) parsed.querySelectorAll('script').forEach(node => node.remove());
    parsed.querySelectorAll('*').forEach(node => {
        for (const attr of [...node.attributes]) {
            if ((!interactive && /^on/i.test(attr.name)) || ['srcdoc', 'action', 'formaction', 'target', 'ping'].includes(attr.name)) node.removeAttribute(attr.name);
            if (['href', 'xlink:href', 'src', 'poster', 'srcset'].includes(attr.name) && !/^(?:data:|blob:|#)/i.test(attr.value.trim())) node.removeAttribute(attr.name);
        }
    });
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${artifactPolicy(interactive)}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:24px;color:#292533;background:#faf7ef;font-family:Georgia,serif;overflow-wrap:anywhere}img,svg{max-width:100%}</style>${parsed.head.innerHTML}</head><body>${parsed.body.innerHTML}</body></html>`;
}

export class HTMLRenderer {
    constructor(root, settings) { this.root = root; this.settings = settings; }
    open(token) {
        this.close();
        const panel = this.root.querySelector('.vn-artifact'), frame = document.createElement('iframe');
        // No same-origin, popups, forms, downloads, storage, top navigation or app API.
        const interactive = !!this.settings.interactiveArtifacts && !!token.interactive;
        frame.setAttribute('sandbox', interactive ? 'allow-scripts' : '');
        frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
        frame.referrerPolicy = 'no-referrer'; frame.title = 'Player-visible artifact';
        frame.srcdoc = isolatedDocument(token.html, interactive);
        panel.querySelector('.vn-artifact-content').append(frame); panel.hidden = false;
        this.root.querySelector('[data-action="close-artifact"]').focus();
    }
    close() { const panel = this.root.querySelector('.vn-artifact'); panel.hidden = true; panel.querySelector('.vn-artifact-content').replaceChildren(); }
    get active() { return !this.root.querySelector('.vn-artifact').hidden; }
}
