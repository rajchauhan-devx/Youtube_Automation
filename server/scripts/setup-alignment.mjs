import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const base = path.resolve('services/alignment'), windows = process.platform === 'win32';
const python = path.join(base, '.venv', windows ? 'Scripts/python.exe' : 'bin/python');
const run = (command, args) => { const result = spawnSync(command, args, { stdio: 'inherit' }); if (result.error) throw result.error; if (result.status !== 0) process.exit(result.status || 1); };
if (!fs.existsSync(python)) {
  const candidates = [process.env.ALIGNMENT_BOOTSTRAP_PYTHON, path.resolve('artifacts/comfy-venv', windows ? 'Scripts/python.exe' : 'bin/python'), 'python3.12', 'python3.11', windows ? 'python' : 'python3'].filter(Boolean);
  const bootstrap = candidates.find(candidate => { const result = spawnSync(candidate, ['-c', 'import sys; assert (3,10) <= sys.version_info[:2] <= (3,13)'], { stdio: 'ignore' }); return !result.error && result.status === 0; });
  if (!bootstrap) throw new Error('Install Python 3.10–3.13 or set ALIGNMENT_BOOTSTRAP_PYTHON.');
  run(bootstrap, ['-m', 'venv', path.join(base, '.venv')]);
}
run(python, ['-m', 'pip', 'install', '-r', path.join(base, 'requirements.txt')]);
run(python, [path.join(base, 'align.py'), '--health']);
console.log('Local speech alignment installed. Language models download on first alignment.');
