import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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

  // Create temporary project staging folder
  const workDir = fs.mkdtempSync(path.join(path.dirname(outputPath), 'hf-render-'));
  const compDir = path.join(workDir, 'comp');

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
      '-o', outputPath,
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
          PATH: `${path.dirname(nodeBin)}:${process.env.PATH || ''}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const onAbort = () => {
        child.kill('SIGTERM');
        reject(new Error('HyperFrames render cancelled'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      let errorOutput = '';

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
        errorOutput += chunk.toString();
      });

      child.on('error', (err) => {
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      });

      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort);
        if (code === 0 && fs.existsSync(outputPath)) {
          onProgress?.(100);
          resolve();
        } else {
          reject(new Error(`HyperFrames failed with code ${code}: ${errorOutput.slice(-800)}`));
        }
      });
    });

    return outputPath;
  } finally {
    // Cleanup staging folder
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (_) {}
  }
}
