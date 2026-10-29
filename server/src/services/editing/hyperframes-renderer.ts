import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EditingProject } from '@tubeflow/editing-contracts';
import type { LegacyCamera } from '@tubeflow/video-composition';
import { buildHyperFramesComposition } from './hyperframes-builder.js';

export interface HyperFramesRenderOptions {
  project: EditingProject;
  outputPath: string;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  legacyCameras?: Record<string, LegacyCamera>;
}

/**
 * Resolves the Node 22+ binary path required by HyperFrames.
 */
function resolveNode22Path(): string {
  // Check known NVM path first
  const nvmNode22 = '/Users/laheri/.nvm/versions/node/v22.23.3/bin/node';
  if (fs.existsSync(nvmNode22)) return nvmNode22;

  // Fallback to process.execPath if running Node >= 22
  const currentMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (currentMajor >= 22) return process.execPath;

  return 'node';
}

/**
 * Resolves the HyperFrames CLI binary.
 */
function resolveHyperFramesCli(): string {
  const localBin = path.resolve('node_modules/hyperframes/bin/hyperframes.mjs');
  if (fs.existsSync(localBin)) return localBin;

  const serverBin = path.resolve('server/node_modules/hyperframes/bin/hyperframes.mjs');
  if (fs.existsSync(serverBin)) return serverBin;

  const parentBin = path.resolve('../node_modules/hyperframes/bin/hyperframes.mjs');
  if (fs.existsSync(parentBin)) return parentBin;

  return 'hyperframes';
}

/**
 * Renders an EditingProject into a transparent alpha WebM overlay using HyperFrames + GSAP.
 */
export async function renderHyperFramesOverlay(opts: HyperFramesRenderOptions): Promise<string> {
  const { project, outputPath, signal, onProgress } = opts;
  signal?.throwIfAborted();

  const nodeBin = resolveNode22Path();
  const cliBin = resolveHyperFramesCli();

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  // Create temporary project staging folder in os.tmpdir() to avoid Windows MAX_PATH (260 char)
  // limits with deep project/account directories and sibling transaction files created by HyperFrames CLI.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-render-'));
  const compDir = path.join(workDir, 'comp');
  const pending = path.join(workDir, 'overlay.webm');

  try {
    // 1. Build the HTML + GSAP composition
    buildHyperFramesComposition({
      project,
      outputDir: compDir,
      legacyCameras: opts.legacyCameras,
    });

    signal?.throwIfAborted();

    const fps = project.inputs.fps || 30;
    const args = [
      cliBin,
      'render',
      '--format', 'webm',
      '-o', pending,
      '--fps', String(fps),
      '--workers', '1',
      compDir,
    ];

    onProgress?.(5);

    // 2. Execute HyperFrames with Node 22 and non-interactive CI env
    await new Promise<void>((resolve, reject) => {
      const child = spawn(nodeBin, args, {
        env: {
          ...process.env,
          CI: 'true',
          HYPERFRAMES_TELEMETRY: 'off',
          PATH: [path.dirname(nodeBin), process.env.PATH || process.env.Path || ''].filter(Boolean).join(path.delimiter),
          Path: [path.dirname(nodeBin), process.env.PATH || process.env.Path || ''].filter(Boolean).join(path.delimiter),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true,
      });

      let errorOutput = '';
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const kill = (force = false) => {
        if (!child.pid) return;
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill('SIGKILL'));
          } else process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
        } catch { child.kill(force ? 'SIGKILL' : 'SIGTERM'); }
      };
      const onAbort = () => {
        kill();
        killTimer = setTimeout(() => kill(true), 2000);
        killTimer.unref();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        if (killTimer) clearTimeout(killTimer);
      };

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        // Parse progress e.g. "  ██████░░░░░░░░░░░░░░░░░░░  25%  Capturing frame 26/300"
        const percentMatch = text.match(/(\d+)%\s+(?:Capturing|Encoding|Starting|Render)/i);
        if (percentMatch) {
          const pct = parseInt(percentMatch[1], 10);
          onProgress?.(pct);
        }
      });

      child.stderr.on('data', (chunk) => {
        errorOutput = (errorOutput + chunk.toString()).slice(-8000);
      });

      child.on('error', (err) => {
        cleanup();
        reject(err);
      });

      child.on('close', (code) => {
        cleanup();
        if (signal?.aborted) { reject(new Error('HyperFrames render cancelled')); return; }
        if (code === 0 && fs.existsSync(pending) && fs.statSync(pending).size > 0) {
          onProgress?.(100);
          resolve();
        } else {
          reject(new Error(`HyperFrames failed with code ${code}: ${errorOutput.slice(-800)}`));
        }
      });
    });

    signal?.throwIfAborted();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(pending, outputPath);
    return outputPath;
  } finally {
    // Cleanup staging folder (including pending overlay and any CLI scratch files)
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (_) {}
  }
}
