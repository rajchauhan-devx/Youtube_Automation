import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const installed = path.join(root, 'MuseTalk-Demo/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const choices = process.env.MUSETALK_SETUP_PYTHON ? [[process.env.MUSETALK_SETUP_PYTHON]] : [
  ...(fs.existsSync(installed) ? [[installed]] : []),
  ...(process.platform === 'win32' ? [['py', '-3.12'], ['py', '-3.11'], ['py', '-3.10']] : []),
  ['python3.12'], ['python3.11'], ['python3.10'], ['python3'], ['python'],
];
const selected = choices.find(([command, ...args]) => spawnSync(command, [...args, '-c',
  'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)'], { stdio: 'ignore' }).status === 0);
if (!selected) {
  console.error('Install Python 3.10–3.12, or set MUSETALK_SETUP_PYTHON to that interpreter.');
  process.exit(1);
}
const child = spawn(selected[0], [...selected.slice(1), path.join(root, 'server/scripts/setup-musetalk.py'), ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
