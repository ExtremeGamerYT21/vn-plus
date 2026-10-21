import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const target = process.argv[2];
if (!target) throw new Error('Usage: node tools/install-praat.js /path/to/SillyTavern [python-executable]');
const root = path.resolve(target), environment = path.join(root, 'plugins', 'vn-plus-praat', '.venv');
await access(path.join(root, 'src/plugin-loader.js'));
const python = path.join(environment, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const run = (executable, args) => new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: 'inherit', windowsHide: true, shell: false });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Python setup failed (${code}).`)));
});
await mkdir(path.dirname(environment), { recursive: true });
try { await access(python); }
catch { await run(process.argv[3] || (process.platform === 'win32' ? 'python' : 'python3'), ['-m', 'venv', environment]); }
await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', 'praat-parselmouth==0.4.7', 'numpy<3']);
await run(python, ['-c', 'import parselmouth; print("Praat ready (Parselmouth " + parselmouth.__version__ + ")")']);
console.log('Installed outside the extension checkout. Install/update the VN+ server bridge and restart SillyTavern once.');
