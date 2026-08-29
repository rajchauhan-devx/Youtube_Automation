import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMFY_URL = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '');
const WORKFLOW_PATH = process.env.COMFYUI_WORKFLOW_PATH || path.join(__dirname, '..', '..', 'workflows', 'flux_klein_t2i.json');
const PROMPT_NODE_ID = process.env.COMFYUI_PROMPT_NODE_ID || '6';
const SEED_NODE_ID = process.env.COMFYUI_SEED_NODE_ID || '';
const SEED_INPUT_KEY = process.env.COMFYUI_SEED_INPUT_KEY || 'noise_seed';
const GEN_TIMEOUT_MS = parseInt(process.env.COMFYUI_TIMEOUT_MS || '120000', 10);
const POLL_INTERVAL_MS = 1000;

export const GENERATED_DIR = path.join(__dirname, '..', '..', 'data', 'generated');

export class ComfyError extends Error {
  code: string;
  detail?: unknown;
  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export function sanitizeSegment(s: string): string {
  return /^[a-zA-Z0-9._-]+$/.test(s) ? s : '';
}

let cachedTemplate: any = null;
let comfyProcess: any = null;

function loadTemplate(): any {
  if (!cachedTemplate) {
    if (!fs.existsSync(WORKFLOW_PATH)) {
      throw new ComfyError(
        'CONFIG',
        `Workflow template not found at ${WORKFLOW_PATH}. In ComfyUI, load your working FLUX.2 Klein text-to-image workflow, then use "Workflow > Export (API)" and save it there, or point COMFYUI_WORKFLOW_PATH at it.`
      );
    }
    cachedTemplate = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8'));
  }
  return JSON.parse(JSON.stringify(cachedTemplate));
}

export async function checkComfyStatus(): Promise<{ online: boolean; detail?: string }> {
  try {
    const res = await fetch(`${COMFY_URL}/system_stats`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { online: false, detail: `ComfyUI responded with HTTP ${res.status}` };
    return { online: true };
  } catch (err: any) {
    return { online: false, detail: `Could not reach ComfyUI at ${COMFY_URL} — is it running?` };
  }
}

export type QualityPreset = 'fast' | 'standard' | 'high';

export const PRESET_CONFIG: Record<QualityPreset, { steps: number; width: number; height: number; label: string; description: string }> = {
  fast: { steps: 12, width: 768, height: 1344, label: 'Fast', description: '12 steps, 768×1344 (draft mode, ~3s)' },
  standard: { steps: 20, width: 768, height: 1344, label: 'Standard', description: '20 steps, 768×1344 (default, ~8s)' },
  high: { steps: 28, width: 768, height: 1344, label: 'High', description: '28 steps, 768×1344 (best quality, ~15s)' },
};

export async function listAvailableModels(): Promise<string[]> {
  const models = new Set<string>();

  // 1. Query ComfyUI API directly if server is running
  try {
    const res = await fetch(`${COMFY_URL}/object_info/CheckpointLoaderSimple`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      const ckptList = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
      if (Array.isArray(ckptList)) {
        for (const c of ckptList) {
          if (typeof c === 'string' && c.length > 0 && c !== 'put_checkpoints_here') {
            models.add(c);
          }
        }
      }
    }
  } catch {}

  // 2. Scan filesystem checkpoint directories
  const candidateDirs = [
    process.env.COMFYUI_PATH ? path.join(process.env.COMFYUI_PATH, 'models', 'checkpoints') : null,
    path.join(__dirname, '..', '..', 'ComfyUI', 'models', 'checkpoints'),
    path.join(process.cwd(), 'ComfyUI', 'models', 'checkpoints'),
    path.join('C:', 'Users', 'zrajc', 'Youtube_Automation', 'ComfyUI', 'models', 'checkpoints'),
    path.join('C:', 'Users', 'zrajc', 'OneDrive', 'Desktop', 'Youtube_Automation', 'Youtube_Automation', 'ComfyUI', 'models', 'checkpoints'),
  ].filter(Boolean) as string[];

  for (const dir of candidateDirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(
          (f) => (f.endsWith('.safetensors') || f.endsWith('.ckpt')) && f !== 'put_checkpoints_here'
        );
        for (const file of files) {
          models.add(file);
        }
      }
    } catch {}
  }

  if (models.size === 0) {
    models.add('Juggernaut_XIII_Ragnarok.safetensors');
  }

  return Array.from(models);
}

export interface WorkflowOptions {
  promptStr: string;
  seed: number;
  preset?: QualityPreset;
  modelName?: string;
  stylePreset?: string;
  enableQualityBooster?: boolean;
  enableNegativeGuardrails?: boolean;
}

function buildWorkflow(opts: WorkflowOptions): any {
  const { promptStr, seed, preset = 'standard', modelName, stylePreset = 'cinematic', enableQualityBooster = true, enableNegativeGuardrails = true } = opts;
  const wf = loadTemplate();
  const cfg = PRESET_CONFIG[preset] || PRESET_CONFIG.standard;

  // Set model checkpoint
  if (wf['4'] && wf['4'].class_type === 'CheckpointLoaderSimple') {
    if (modelName && modelName.trim()) {
      wf['4'].inputs.ckpt_name = modelName.trim();
    } else {
      // Auto-detect downloaded checkpoint in ComfyUI/models/checkpoints
      const comfyPath = process.env.COMFYUI_PATH || 'C:\\Users\\zrajc\\Youtube_Automation\\ComfyUI';
      const ckptDir = path.join(comfyPath, 'models', 'checkpoints');
      if (fs.existsSync(ckptDir)) {
        const ckpts = fs.readdirSync(ckptDir).filter(
          (f) => (f.endsWith('.safetensors') || f.endsWith('.ckpt')) && f !== 'put_checkpoints_here'
        );
        if (ckpts.length > 0) {
          wf['4'].inputs.ckpt_name = ckpts[0];
        }
      }
    }
  }

  let positivePrompt = promptStr;
  let extraNegative = '';

  // Separate inline "Negative prompt:" if present
  const negMatch = promptStr.match(/Negative prompt:\s*(.*)/i);
  if (negMatch) {
    positivePrompt = promptStr.replace(/Negative prompt:\s*.*/i, '').trim();
    extraNegative = negMatch[1].trim();
  }

  // Style boosters (only when enableQualityBooster is true and not raw mode)
  const style = (stylePreset || 'cinematic').toLowerCase();

  if (enableQualityBooster && style !== 'raw' && style !== 'none') {
    if (style === 'cinematic') {
      if (!positivePrompt.toLowerCase().includes('cinematic photo') && !positivePrompt.toLowerCase().includes('card')) {
        positivePrompt = `cinematic photo, 8k uhd, highly detailed, film grain, ${positivePrompt}`;
      }
    } else if (style === 'anime') {
      if (!positivePrompt.toLowerCase().includes('anime')) {
        positivePrompt = `anime artwork, masterpiece, vibrant colors, detailed line art, studio anime aesthetic, ${positivePrompt}`;
      }
    } else if (style === 'cartoon') {
      if (!positivePrompt.toLowerCase().includes('cartoon') && !positivePrompt.toLowerCase().includes('animation')) {
        positivePrompt = `3d animation style, pixar render, vibrant expressive characters, high quality 3d cartoon, ${positivePrompt}`;
      }
    } else if (style === 'digital_art') {
      if (!positivePrompt.toLowerCase().includes('digital painting')) {
        positivePrompt = `concept digital painting, highly detailed, dramatic lighting, artstation trending, ${positivePrompt}`;
      }
    }
  }

  if (wf['6']) {
    wf['6'].inputs.text = positivePrompt;
  }

  // Universal Negative Prompt Guardrails
  if (wf['15']) {
    if (!enableNegativeGuardrails) {
      // Clean mode: Only custom negative prompt, without forced restrictions
      wf['15'].inputs.text = extraNegative || 'ugly, blurry, low quality, distorted, bad hands, deformed';
    } else {
      let defaultNeg = 'ugly, blurry, low quality, distorted, bad hands, deformed, noise, artifacts, cropped, out of frame, low resolution, bad anatomy';
      // If user wants anime/cartoon, do NOT ban cartoon, anime, or 3d render
      if (style !== 'anime' && style !== 'cartoon') {
        defaultNeg += ', cartoon, anime, 3d render, illustration, oversaturated';
      }
      wf['15'].inputs.text = extraNegative ? `${defaultNeg}, ${extraNegative}` : defaultNeg;
    }
  }

  if (wf['13']) {
    wf['13'].inputs.steps = cfg.steps;
    wf['13'].inputs.seed = seed;
  }

  if (wf['14']) {
    wf['14'].inputs.width = cfg.width;
    wf['14'].inputs.height = cfg.height;
  }

  if (SEED_NODE_ID && wf[SEED_NODE_ID]) {
    wf[SEED_NODE_ID].inputs[SEED_INPUT_KEY] = seed;
  }
  return wf;
}

async function queuePrompt(workflow: any, clientId: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${COMFY_URL}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      throw new ComfyError('TIMEOUT', 'Timed out connecting to ComfyUI (it may be overloaded or hung).');
    }
    throw new ComfyError('OFFLINE', `Could not reach ComfyUI at ${COMFY_URL}. Make sure it's running.`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ComfyError(
      'QUEUE_FAILED',
      `ComfyUI rejected the workflow (HTTP ${res.status}). This usually means the exported workflow JSON doesn't match the nodes you have installed.`,
      text
    );
  }
  const data = await res.json();
  if (data.error) {
    throw new ComfyError('WORKFLOW_INVALID', `ComfyUI reported a workflow error: ${data.error.message || JSON.stringify(data.error)}`, data);
  }
  if (!data.prompt_id) {
    throw new ComfyError('QUEUE_FAILED', 'ComfyUI accepted the request but returned no prompt_id.', data);
  }
  return data.prompt_id;
}

async function pollHistory(promptId: string, timeoutMs: number, signal?: AbortSignal): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) throw new ComfyError('CANCELLED', 'Generation cancelled by user.');
    const res = await fetch(`${COMFY_URL}/history/${promptId}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      const entry = data[promptId];
      if (entry) {
        if (entry.status?.status_str === 'error') {
          throw new ComfyError('GENERATION_ERROR', 'ComfyUI errored while generating this image (check node config / VRAM).', entry.status?.messages);
        }
        if (entry.outputs && Object.keys(entry.outputs).length > 0) return entry;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new ComfyError('TIMEOUT', `Image generation timed out after ${Math.round(timeoutMs / 1000)}s.`);
}

function extractImageRef(historyEntry: any): { filename: string; subfolder: string; type: string } {
  const outputs = historyEntry.outputs || {};
  for (const nodeId of Object.keys(outputs)) {
    const images = outputs[nodeId]?.images;
    if (images?.length > 0) return images[0];
  }
  throw new ComfyError('NO_OUTPUT', 'ComfyUI finished but produced no image. Check the workflow ends in a SaveImage node.');
}

async function downloadImage(ref: { filename: string; subfolder: string; type: string }): Promise<Buffer> {
  const params = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder || '', type: ref.type || 'output' });
  const res = await fetch(`${COMFY_URL}/view?${params}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new ComfyError('DOWNLOAD_FAILED', `Failed to download the generated image (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

export async function startComfyUI(): Promise<{ success: boolean; message: string }> {
  const already = await checkComfyStatus();
  if (already.online) return { success: true, message: 'ComfyUI is already running' };

  const comfyPath = process.env.COMFYUI_PATH;
  if (!comfyPath) {
    return { success: false, message: 'COMFYUI_PATH not set in server/.env. Set it to the directory containing ComfyUI\'s main.py (e.g. C:\\ComfyUI\\ComfyUI).' };
  }

  const mainPy = path.join(comfyPath, 'main.py');
  if (!fs.existsSync(mainPy)) {
    return { success: false, message: `main.py not found at "${mainPy}". Check COMFYUI_PATH.` };
  }

  if (comfyProcess) {
    try { comfyProcess.kill(); } catch {}
    comfyProcess = null;
  }

  comfyProcess = spawn('python', [mainPy, '--listen', '--port', '8188'], {
    cwd: comfyPath,
    env: { ...process.env, TQDM_DISABLE: '1' },
    stdio: 'ignore',
    detached: true,
  });
  comfyProcess.unref();

  const start = Date.now();
  const timeout = 120000;
  while (Date.now() - start < timeout) {
    const s = await checkComfyStatus();
    if (s.online) return { success: true, message: 'ComfyUI started successfully' };
    await new Promise((r) => setTimeout(r, 2000));
  }

  return { success: false, message: 'Timed out waiting for ComfyUI to start (120s). Check the ComfyUI console for errors.' };
}

export async function interruptComfyUI(): Promise<void> {
  try {
    await fetch(`${COMFY_URL}/interrupt`, { method: 'POST', signal: AbortSignal.timeout(2000) });
  } catch {}
  try {
    await fetch(`${COMFY_URL}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {}
}

export async function stopComfyUI(): Promise<{ success: boolean; message: string }> {
  let killed = false;

  // 1. Interrupt running generation and clear queue
  await interruptComfyUI();

  // 2. Kill tracked child process
  if (comfyProcess) {
    try {
      if (comfyProcess.pid && process.platform === 'win32') {
        const { execSync } = await import('child_process');
        try {
          execSync(`taskkill /F /T /PID ${comfyProcess.pid}`);
          killed = true;
        } catch {}
      }
      comfyProcess.kill();
      killed = true;
    } catch {}
    comfyProcess = null;
  }

  // 3. Find and kill any process listening on the ComfyUI port (Windows & Unix)
  try {
    const { execSync } = await import('child_process');
    let port = '8188';
    try {
      port = new URL(COMFY_URL).port || '8188';
    } catch {}

    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      const lines = out.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4) {
          const localAddr = parts[1] || '';
          const pid = parts[parts.length - 1] || '';
          if (localAddr.endsWith(`:${port}`) && /^\d+$/.test(pid) && pid !== '0') {
            try {
              execSync(`taskkill /F /T /PID ${pid}`);
              killed = true;
            } catch {}
          }
        }
      }
    } else {
      try {
        const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
        if (pids) {
          for (const pid of pids.split(/\s+/)) {
            if (/^\d+$/.test(pid)) {
              execSync(`kill -9 ${pid}`);
              killed = true;
            }
          }
        }
      } catch {}
    }
  } catch (err: any) {
    console.error('Error stopping ComfyUI processes:', err);
  }

  // Verify status after short delay
  await new Promise((r) => setTimeout(r, 1000));
  const s = await checkComfyStatus();
  if (s.online) {
    return { success: false, message: 'ComfyUI is still responding after stop attempt' };
  }

  return { success: true, message: killed ? 'ComfyUI stopped successfully' : 'No ComfyUI process found' };
}

export interface GenerateOptions {
  prompt: string;
  scriptId: string;
  index: number;
  seed?: number;
  signal?: AbortSignal;
  preset?: QualityPreset;
  modelName?: string;
  stylePreset?: string;
  enableQualityBooster?: boolean;
  enableNegativeGuardrails?: boolean;
}

export async function generateImage(opts: GenerateOptions): Promise<{ publicUrl: string; fileName: string; seed: number; elapsedMs: number }> {
  const started = Date.now();
  const scriptId = sanitizeSegment(opts.scriptId);
  if (!scriptId) throw new ComfyError('CONFIG', 'Invalid scriptId.');
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const clientId = `server-${scriptId}-${opts.index}-${started}`;

  const workflow = buildWorkflow({
    promptStr: opts.prompt,
    seed,
    preset: opts.preset || 'standard',
    modelName: opts.modelName,
    stylePreset: opts.stylePreset,
    enableQualityBooster: opts.enableQualityBooster,
    enableNegativeGuardrails: opts.enableNegativeGuardrails,
  });
  const promptId = await queuePrompt(workflow, clientId);
  const historyEntry = await pollHistory(promptId, GEN_TIMEOUT_MS, opts.signal);
  const imageRef = extractImageRef(historyEntry);
  const buffer = await downloadImage(imageRef);

  const outDir = path.join(GENERATED_DIR, scriptId);
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `image-${String(opts.index).padStart(2, '0')}-${started}.png`;
  fs.writeFileSync(path.join(outDir, fileName), buffer);

  return {
    publicUrl: `/api/generate/file/${scriptId}/${fileName}`,
    fileName,
    seed,
    elapsedMs: Date.now() - started,
  };
}
