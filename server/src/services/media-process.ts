import { execFile } from 'node:child_process';

export function runMedia(command: string, args: string[], signal?: AbortSignal, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Cancelled')); return; }
    // Wait for the process callback after killing it before deleting its output (Windows holds open files).
    const child = execFile(command, args, { windowsHide: true, cwd, maxBuffer: 2 * 1024 * 1024, timeout: 60 * 60 * 1000 }, (error, stdout, stderr) => {
      signal?.removeEventListener('abort', cancel);
      if (error) reject(new Error(signal?.aborted ? 'Cancelled' : `${command} failed: ${String(stderr).slice(-1500) || error.message}`));
      else resolve(String(stdout));
    });
    const cancel = () => { child.kill('SIGKILL'); };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}
