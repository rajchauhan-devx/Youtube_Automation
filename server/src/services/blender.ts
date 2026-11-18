import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..');

export interface BlenderStatus {
  installed: boolean;
  path?: string;
  version?: string;
  installCommand: string;
}

export interface BlenderRenderOptions {
  sceneType?: 'cross_section_explainer' | 'grease_pencil_2d' | 'master_film' | 'shot_film' | 'custom';
  blendFile?: string;
  pythonScript?: string;
  shotIndex?: number;
  action?: 'drill_down' | 'oil_gusher' | 'sponge_rock_zoom' | 'bop_clamp' | 'pump_jack' | 'custom' | string;
  durationSeconds: number;
  fps?: number;
  outputPath: string;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
}

export function actionToShotIndex(action?: string): number {
  switch (action) {
    case 'drill_down': return 1;
    case 'derrick_well': return 2;
    case 'sand_caving': return 3;
    case 'mud_pump': return 4;
    case 'mud_column': return 5;
    case 'derrick_upward': return 6;
    case 'pipe_ejection': return 7;
    case 'pipe_breaking_crown': return 8;
    case 'oil_gusher': return 9;
    case 'deep_strata_plunge': return 10;
    case 'reservoir_myth': return 11;
    case 'macro_pores_zoom': return 12;
    case 'sponge_rock_zoom': return 13;
    case 'casing_travel': return 14;
    case 'bop_clamp': return 15;
    case 'pump_jack': return 16;
    default: return 1;
  }
}

/**
 * Automatically locates the Blender executable across macOS, Linux, and Windows.
 */
export function resolveBlenderBinary(): string | undefined {
  if (process.env.BLENDER_BIN && fs.existsSync(process.env.BLENDER_BIN)) {
    return process.env.BLENDER_BIN;
  }

  const candidates: string[] = [
    // macOS Standard Application bundles
    '/Applications/Blender.app/Contents/MacOS/Blender',
    '/Applications/Blender 4.3.app/Contents/MacOS/Blender',
    '/Applications/Blender 4.2.app/Contents/MacOS/Blender',
    '/Applications/Blender 4.1.app/Contents/MacOS/Blender',
    '/Applications/Blender 4.0.app/Contents/MacOS/Blender',
    // Homebrew / Unix binary paths
    '/opt/homebrew/bin/blender',
    '/usr/local/bin/blender',
    '/usr/bin/blender',
    // Windows standard locations
    'C:\\Users\\zrajc\\blender\\blender-5.3.0-windows-x64\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender\\blender.exe',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Checks if Blender is installed and returns its version.
 */
export async function checkBlenderStatus(): Promise<BlenderStatus> {
  const binary = resolveBlenderBinary();
  const isMac = process.platform === 'darwin';
  const installCmd = isMac
    ? 'brew install --cask blender'
    : 'Download from https://www.blender.org/download/';

  if (!binary) {
    return {
      installed: false,
      installCommand: installCmd,
    };
  }

  return new Promise<BlenderStatus>((resolve) => {
    const proc = spawn(binary, ['--version']);
    let output = '';

    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { output += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && output) {
        const match = output.match(/Blender\s+([0-9]+\.[0-9]+\.[0-9]+)/i);
        resolve({
          installed: true,
          path: binary,
          version: match ? match[1] : output.split('\n')[0].trim(),
          installCommand: installCmd,
        });
      } else {
        resolve({
          installed: false,
          path: binary,
          installCommand: installCmd,
        });
      }
    });

    proc.on('error', () => {
      resolve({
        installed: false,
        path: binary,
        installCommand: installCmd,
      });
    });
  });
}

/**
 * Renders a 3D or 2D animation scene headlessly using Blender.
 */
export async function renderBlenderScene(options: BlenderRenderOptions): Promise<string> {
  const binary = resolveBlenderBinary();
  if (!binary) {
    throw new Error(
      `Blender is not installed on this system. Install it using:\n${process.platform === 'darwin' ? 'brew install --cask blender' : 'https://www.blender.org/download/'}`
    );
  }

  let defaultScriptName = 'shot_film_generator.py';
  if (options.sceneType === 'cross_section_explainer') {
    defaultScriptName = 'cross_section_explainer.py';
  } else if (options.sceneType === 'master_film') {
    defaultScriptName = 'master_film_generator.py';
  }
  const scriptPath = options.pythonScript || path.join(SERVER_ROOT, 'scripts', 'blender', defaultScriptName);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Blender Python animation script not found: ${scriptPath}`);
  }

  // Ensure output parent directory exists
  const outputDir = path.dirname(options.outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const payload = JSON.stringify({
    shot: options.shotIndex || actionToShotIndex(options.action),
    action: options.action || 'drill_down',
    duration: options.durationSeconds,
    fps: options.fps || 24,
    output_path: options.outputPath,
    params: options.params || {},
  });

  const args: string[] = [
    '-b', // Headless background mode (no GUI window opened)
  ];

  if (options.blendFile && fs.existsSync(options.blendFile)) {
    args.push(options.blendFile);
  }

  args.push('-P', scriptPath, '--', payload);

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(binary, args);
    let stderr = '';
    let stdout = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
        reject(new Error('Blender render was cancelled'));
      });
    }

    proc.on('close', (code) => {
      if (code === 0 && (fs.existsSync(options.outputPath) || fs.existsSync(`${options.outputPath}.mp4`))) {
        resolve(fs.existsSync(options.outputPath) ? options.outputPath : `${options.outputPath}.mp4`);
      } else {
        reject(
          new Error(
            `Blender render failed (exit code ${code}).\nStderr: ${stderr.slice(-400)}\nStdout: ${stdout.slice(-400)}`
          )
        );
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Blender process: ${err.message}`));
    });
  });
}
