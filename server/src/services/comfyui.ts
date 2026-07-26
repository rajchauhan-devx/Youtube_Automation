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

function buildWorkflow(prompt: string, seed: number): any {
  const wf = loadTemplate();
  if (!wf[PROMPT_NODE_ID]) {
    throw new ComfyError(
      'CONFIG',
      `Prompt node id "${PROMPT_NODE_ID}" doesn't exist in the workflow template. Open the template JSON, find your positive CLIPTextEncode node's id, and set COMFYUI_PROMPT_NODE_ID.`
    );
  }
  wf[PROMPT_NODE_ID].inputs.text = prompt;
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
    stdio: ['ignore', 'pipe', 'pipe'],
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

export async function stopComfyUI(): Promise<{ success: boolean; message: string }> {
  let killed = false;
  if (comfyProcess) {
    try {
      comfyProcess.kill();
      comfyProcess = null;
      killed = true;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }
  // Also try to kill any python process on port 8188 (Windows)
  try {
    const { spawn } = await import('child_process');
    await new Promise<void>((resolve) => {
      const proc = spawn('cmd', ['/c', 'for /f "tokens=5" %a in (\'netstat -ano ^| findstr :8188\') do taskkill /f /pid %a 2>nul'], { shell: true });
      proc.on('close', () => resolve());
      setTimeout(() => resolve(), 2000);
    });
    killed = true;
  } catch {}
  return { success: true, message: killed ? 'ComfyUI stopped' : 'No ComfyUI process found' };
}

export async function generateImage(opts: {
  prompt: string;
  scriptId: string;
  index: number;
  seed?: number;
  signal?: AbortSignal;
}): Promise<{ publicUrl: string; fileName: string; seed: number; elapsedMs: number }> {
  const started = Date.now();
  const scriptId = sanitizeSegment(opts.scriptId);
  if (!scriptId) throw new ComfyError('CONFIG', 'Invalid scriptId.');
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const clientId = `server-${scriptId}-${opts.index}-${started}`;

  const workflow = buildWorkflow(opts.prompt, seed);
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
