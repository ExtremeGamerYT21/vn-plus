import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf' };
const server = http.createServer(async (request, response) => {
    try {
        const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'demo/index.html';
        const target = path.resolve(root, relative), prefix = path.resolve(root) + path.sep;
        if (!target.startsWith(prefix) || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(403).end(); return; }
        const body = await readFile(target);
        response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404).end(); }
});
server.listen(Number(process.env.VN_PREVIEW_PORT || 8973), '127.0.0.1', () => console.log('VN+ preview: http://127.0.0.1:8973/demo/index.html; browser tests: /tests/browser.html'));
