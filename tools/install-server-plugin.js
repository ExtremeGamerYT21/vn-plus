import { access, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const target = process.argv[2];
if (!target) throw new Error('Usage: node tools/install-server-plugin.js /path/to/SillyTavern [extension-directory-name]');
const root = path.resolve(target), name = process.argv[3] || 'vn-plus';
if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error('Invalid extension folder name.');
await access(path.join(root, 'src/plugin-loader.js'));
await access(path.join(root, 'public/scripts/extensions/third-party', name, 'server/index.mjs'));
const plugins = path.join(root, 'plugins'), file = path.join(plugins, 'vn-plus-tts.mjs');
const source = `// VN+ bridge: follows the extension's Git updates. Restart ST after server changes.\nexport { info, init } from '../public/scripts/extensions/third-party/${name}/server/index.mjs';\n`;
try { const existing = await readFile(file, 'utf8'); if (!existing.startsWith('// VN+ bridge:')) throw new Error('An unrelated vn-plus-tts.mjs already exists; refusing to replace it.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(plugins, { recursive: true }); await writeFile(file, source);
console.log('VN+ Fish bridge installed. enableServerPlugins must be true in config.yaml; restart SillyTavern once.');
