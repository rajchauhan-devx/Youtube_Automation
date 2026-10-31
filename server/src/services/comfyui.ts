import fs from 'fs';
import { safeSegment } from './paths.js';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

const COMFY_URL = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '');
const PROMPT_NODE_ID = process.env.COMFYUI_PROMPT_NODE_ID || '6';
const SEED_NODE_ID = process.env.COMFYUI_SEED_NODE_ID || '';
const SEED_INPUT_KEY = process.env.COMFYUI_SEED_INPUT_KEY || 'noise_seed';
const GEN_TIMEOUT_MS = parseInt(process.env.COMFYUI_TIMEOUT_MS || '600000', 10);
const POLL_INTERVAL_MS = 1000;

export function resolveWorkflowPath(): string {
  const envPath = process.env.COMFYUI_WORKFLOW_PATH;
  if (envPath) {
    if (path.isAbsolute(envPath) && fs.existsSync(envPath)) return path.resolve(envPath);
    const fromServer = path.resolve(SERVER_ROOT, envPath);
    if (fs.existsSync(fromServer)) return fromServer;
    const fromRepo = path.resolve(REPO_ROOT, envPath);
    if (fs.existsSync(fromRepo)) return fromRepo;
  }
  return path.join(SERVER_ROOT, 'workflows', 'flux_klein_t2i.json');
}

export function resolveComfyPath(): string | undefined {
  const envPath = process.env.COMFYUI_PATH;
  const candidates = [
    envPath && path.isAbsolute(envPath) ? path.resolve(envPath) : null,
    envPath ? path.resolve(SERVER_ROOT, envPath) : null,
    envPath ? path.resolve(REPO_ROOT, envPath) : null,
    path.join(REPO_ROOT, 'ComfyUI'),
    path.join(SERVER_ROOT, 'ComfyUI'),
    path.resolve(process.cwd(), 'ComfyUI'),
    path.join('C:', 'Users', 'zrajc', 'Youtube_Automation', 'ComfyUI'),
    path.join('C:', 'Users', 'zrajc', 'OneDrive', 'Desktop', 'Youtube_Automation', 'Youtube_Automation', 'ComfyUI'),
  ].filter(Boolean) as string[];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'main.py'))) || candidates.find((dir) => fs.existsSync(dir));
}

export function resolveComfyPython(): string {
  const envPy = process.env.COMFYUI_PYTHON;
  const candidates = [
    envPy && path.isAbsolute(envPy) ? path.resolve(envPy) : null,
    envPy ? path.resolve(SERVER_ROOT, envPy) : null,
    envPy ? path.resolve(REPO_ROOT, envPy) : null,
    process.platform === 'win32'
      ? path.join(REPO_ROOT, 'artifacts', 'comfy-venv', 'Scripts', 'python.exe')
      : path.join(REPO_ROOT, 'artifacts', 'comfy-venv', 'bin', 'python'),
    path.join(REPO_ROOT, 'artifacts', 'comfy-venv', 'Scripts', 'python.exe'),
    path.join(REPO_ROOT, 'artifacts', 'comfy-venv', 'bin', 'python'),
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) return found;
  return process.platform === 'win32' ? 'python' : 'python3';
}

import { generatedDir, mediaUrl, currentWorkspace } from './workspace.js';

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
  return safeSegment(s) ? s : '';
}

let cachedTemplate: any = null;
let comfyProcess: any = null;

function loadTemplate(): any {
  if (!cachedTemplate) {
    const workflowPath = resolveWorkflowPath();
    if (!fs.existsSync(workflowPath)) {
      throw new ComfyError(
        'CONFIG',
        `Workflow template not found at ${workflowPath}. In ComfyUI, load your working FLUX.2 Klein text-to-image workflow, then use "Workflow > Export (API)" and save it there, or point COMFYUI_WORKFLOW_PATH at it.`
      );
    }
    cachedTemplate = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
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
  fast: { steps: 12, width: 768, height: 1344, label: 'Fast', description: '12 steps, 768×1344 (draft; speed depends on hardware)' },
  standard: { steps: 20, width: 768, height: 1344, label: 'Standard', description: '20 steps, 768×1344 (balanced)' },
  high: { steps: 28, width: 768, height: 1344, label: 'High', description: '28 steps, 768×1344 (more detail)' },
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
  const resolvedComfy = resolveComfyPath();
  const candidateDirs = [
    resolvedComfy ? path.join(resolvedComfy, 'models', 'checkpoints') : null,
    process.env.COMFYUI_PATH ? path.join(process.env.COMFYUI_PATH, 'models', 'checkpoints') : null,
    path.join(REPO_ROOT, 'ComfyUI', 'models', 'checkpoints'),
    path.join(SERVER_ROOT, 'ComfyUI', 'models', 'checkpoints'),
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


  return Array.from(models);
}


export interface ResolvedChannelLora {
  channelKey: 'ancient_dharma' | 'rule_zero' | 'against_the_odds';
  channelLabel: string;
  loraTitle: string;
  loraFileName: string;
  installed: boolean;
  strengthModel: number;
  strengthClip: number;
  triggerToken: string;
  styleDna: string;
}

const SERVER_CHANNEL_LORAS: Record<
  ResolvedChannelLora['channelKey'],
  Omit<ResolvedChannelLora, 'loraFileName' | 'installed'> & {
    preferredFile: string;
    fallbackFile: string;
  }
> = {
  ancient_dharma: {
    channelKey: 'ancient_dharma',
    channelLabel: 'Ancient Dharma',
    loraTitle: 'Chiaroscuro Fantasy XL (Sacred Temple & Mythic Glow)',
    preferredFile: 'ancient_dharma_custom_xl.safetensors',
    fallbackFile: 'ancient_dharma_chiaroscuro_xl.safetensors',
    strengthModel: 0.70,
    strengthClip: 0.70,
    triggerToken: 'dharma_sacred_chiaroscuro',
    styleDna:
      'Sacred chiaroscuro lighting, warm golden oil-lamp glow, deep carved-stone temple shadows, volumetric incense haze, burnished gold and saffron color palette, painterly mythological photorealism.',
  },
  rule_zero: {
    channelKey: 'rule_zero',
    channelLabel: 'Rule Zero',
    loraTitle: "Zavy's Dark Atmospheric Contrast XL (Neo-Noir Thriller)",
    preferredFile: 'rule_zero_custom_xl.safetensors',
    fallbackFile: 'rule_zero_dark_contrast_xl.safetensors',
    strengthModel: 0.75,
    strengthClip: 0.75,
    triggerToken: 'rulezero_noir_contrast',
    styleDna:
      'Stylized painterly graphic novel comic art, Alberto Mielgo and Spider-Verse noir aesthetic, bold charcoal ink outlines, expressive textured brushstrokes, dynamic two-step cel shading, high-contrast chiaroscuro shadows, wet pavement reflections, cold cyan and teal ambient shadows sliced by vibrant warm amber and neon rim lighting, cinematic atmospheric mystery, no 3D, no photorealism, no CGI gloss.',
  },
  against_the_odds: {
    channelKey: 'against_the_odds',
    channelLabel: 'Against the Odds',
    loraTitle: 'Analog Film XL v1 (Raw 35mm Documentary Photojournalism)',
    preferredFile: 'against_the_odds_custom_xl.safetensors',
    fallbackFile: 'against_the_odds_analog_film_xl.safetensors',
    strengthModel: 0.80,
    strengthClip: 0.80,
    triggerToken: 'odds_docu35mm_film',
    styleDna:
      'Analog Film Style, raw 1970s 35mm Kodak documentary photojournalism, gritty analog film grain, subtle halation, weathered skin pores and frost/mud micro-textures, desaturated natural storm palette.',
  },
};

export function resolveComfyLorasDir(): string {
  const comfyPath = resolveComfyPath() || process.env.COMFYUI_PATH || path.join(REPO_ROOT, 'ComfyUI');
  return path.join(comfyPath, 'models', 'loras');
}

export function resolveChannelLoraForAccount(accountId?: string): ResolvedChannelLora {
  const rawId = (accountId || currentWorkspace().accountId || 'default').toLowerCase();
  let channelKey: ResolvedChannelLora['channelKey'] = 'ancient_dharma';
  if (rawId.includes('3ea89878') || rawId.includes('rule_zero') || rawId.includes('zero rule')) {
    channelKey = 'rule_zero';
  } else if (rawId.includes('620a1d5e') || rawId.includes('against_the_odds') || rawId.includes('against the odds')) {
    channelKey = 'against_the_odds';
  } else {
    // Also check accounts.json if a custom account ID was used
    try {
      const accPath = path.join(SERVER_ROOT, 'data', 'accounts.json');
      if (fs.existsSync(accPath)) {
        const accounts = JSON.parse(fs.readFileSync(accPath, 'utf8'));
        const matched = Array.isArray(accounts)
          ? accounts.find((a: any) => String(a?.id || '').toLowerCase() === rawId)
          : null;
        if (matched) {
          const combined = `${matched.name || ''} ${matched.youtubeChannelTitle || ''}`.toLowerCase();
          if (combined.includes('rule zero') || combined.includes('zero rule')) {
            channelKey = 'rule_zero';
          } else if (combined.includes('against the odds')) {
            channelKey = 'against_the_odds';
          }
        }
      }
    } catch {}
  }

  const spec = SERVER_CHANNEL_LORAS[channelKey];
  const lorasDir = resolveComfyLorasDir();
  const preferredPath = path.join(lorasDir, spec.preferredFile);
  const fallbackPath = path.join(lorasDir, spec.fallbackFile);

  let loraFileName = spec.preferredFile;
  let installed = false;
  if (fs.existsSync(preferredPath)) {
    loraFileName = spec.preferredFile;
    installed = true;
  } else if (fs.existsSync(fallbackPath)) {
    loraFileName = spec.fallbackFile;
    installed = true;
  }

  return {
    channelKey: spec.channelKey,
    channelLabel: spec.channelLabel,
    loraTitle: spec.loraTitle,
    loraFileName,
    installed,
    strengthModel: spec.strengthModel,
    strengthClip: spec.strengthClip,
    triggerToken: spec.triggerToken,
    styleDna: spec.styleDna,
  };
}

export interface PreparedImagePrompt {
  positivePrompt: string;
  negativePrompt: string;
  is2dStylized: boolean;
}

export const TWO_D_STYLE_PATTERN =
  /\b(2d\s+animated|2d\s+animation|2d\s+cartoon|animated[- ]series\s+frame|cel[- ]shad(?:ed|ing)|charcoal\s+(?:outlines|linework)|matte\s+flat\s+colou?r|flat\s+colou?r\s+fills|graphic\s+novel|hand[- ]drawn\s+2d|stickman|stick\s+figure)\b/i;

/**
 * Separates embedded "Negative Prompt:" blocks from positive scene prompts and
 * front-loads 2D cel-shaded cartoon style anchors when a 2D animated scene is
 * detected, ensuring visual consistency across Local ComfyUI, Cloudflare Workers AI,
 * and Google Flow video scenes.
 */
export function preparePromptForImageGeneration(
  rawPrompt: string,
  options?: {
    forCloudflare?: boolean;
    injectStyleDna?: boolean;
    styleDna?: string;
    force2dStylized?: boolean;
  }
): PreparedImagePrompt {
  const input = String(rawPrompt || '');
  const is2dStylized = Boolean(options?.force2dStylized) || TWO_D_STYLE_PATTERN.test(input);

  const negativeChunks: string[] = [];
  let working = input;

  // 1. Extract multiline "Negative Prompt:" sections
  working = working.replace(
    /(?:^|\n)\s*Negative(?:\s+Prompt)?\s*:\s*([\s\S]*?)(?=\n\s*(?:Style(?:\s+Tags)?|Continuity(?:\s+Lock)?|Editor\s+Symbol\s+Treatment)\s*:|$)/gi,
    (_m, negBody: string) => {
      if (negBody && negBody.trim()) negativeChunks.push(negBody.trim());
      return '\n';
    }
  );

  // 2. Extract inline "Negative Prompt: ..." segments
  working = working.replace(
    /\bNegative(?:\s+Prompt)?\s*:\s*([\s\S]*?)(?=\b(?:Style(?:\s+Tags)?|Continuity(?:\s+Lock)?|Editor\s+Symbol\s+Treatment)\s*:|$)/gi,
    (_m, negBody: string) => {
      if (negBody && negBody.trim()) negativeChunks.push(negBody.trim());
      return ' ';
    }
  );

  // 3. Remove non-visual editor notes and duplicate trailing metadata blocks
  working = working.replace(/(?:^|\n)\s*Editor\s+Symbol\s+Treatment\s*:[^\n]*/gi, '');
  working = working.replace(/\bEditor\s+Symbol\s+Treatment\s*:\s*None\.?/gi, '');

  // Deduplicate negative terms
  const seenNeg = new Set<string>();
  const negItems: string[] = [];
  for (const chunk of negativeChunks) {
    for (const part of chunk.split(/[,;\n]+/)) {
      const cleaned = part.replace(/^no\s+/i, '').trim();
      const key = cleaned.toLowerCase();
      if (cleaned && !seenNeg.has(key)) {
        seenNeg.add(key);
        negItems.push(cleaned);
      }
    }
  }

  // Dedicated Atmospheric Stickman handler: preserves epic environment while ensuring stickman character
  const isStickman = /\b(stickman|stick\s+figure)\b/i.test(input) || /\b(stickman|stick\s+figure)\b/i.test(options?.styleDna || '');
  if (isStickman) {
    const stickmanNegative = [
      'photorealistic human faces, fleshy human skin, photorealistic portraits, 3D CGI gloss, cartoon slapstick, comedic doodles, text, watermarks, distorted anatomy, extra limbs, live-action photo',
      ...negItems,
    ].filter(Boolean).join(', ');

    let cleanWorking = working
      .replace(/Documentary reconstruction style (?:still image|video shot)[,.]?\s*/gi, '')
      .replace(/Visual Treatment Lock:[^\n]*/gi, '')
      .replace(/\bVisual Style-DNA \([^)]*\):[^\n]*/gi, '')
      .replace(/\bVisual Style:[^\n]*/gi, '')
      .replace(/Negative Prompt:[\s\S]*?(?=Style Tags:|$)/gi, '')
      .replace(/Style Tags:[\s\S]*?$/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const prefix = cleanWorking.toLowerCase().startsWith('cinematic concept art')
      ? ''
      : 'Cinematic concept art illustration of an atmospheric survival drama. ';

    const suffix = ' Stylized graphic novel and cinematic stickman animation art style, serious survival drama tone, minimalist solid black stick figure protagonist, epic atmospheric scale, dramatic lighting, high-detail landscape, no comedy, no slapstick, no photorealistic human face.';

    return {
      positivePrompt: `${prefix}${cleanWorking}.${suffix}`.trim(),
      negativePrompt: stickmanNegative,
      is2dStylized: true,
    };
  }

  if (is2dStylized) {
    // Strip duplicate Style Tags block if Render Block is already present
    if (/\bRender\s+Block\s*:/i.test(working)) {
      working = working.replace(/\bStyle\s+Tags\s*:[\s\S]*$/i, '');
    }

    // Remove positive-prompt negation traps ("no glossy 3D", "no photorealism") that trigger 3D in CLIP
    working = working.replace(
      /\bno\s+(?:painterly(?:\s+brush)?\s+texture|glossy\s+3d|photorealism|3d(?:\s+render(?:\s+appearance)?)?|glossy\s+reflections[^.;,]*)[;,.]?\s*/gi,
      ''
    );

    // Replace 3D/photo trigger words in 2D prompts
    working = working.replace(/\brealistic(\s+adult\s+human\s+proportions)\b/gi, 'natural$1');
    working = working.replace(/\bsoftly\s+blurred\s+but\s+suggests\b/gi, 'drawn with clean flat 2D linework showing');
    working = working.replace(/\bsoftly\s+blurred\b/gi, 'drawn in clean flat 2D');
    working = working.replace(/\bshallow\s+depth\s+of\s+field\b/gi, 'flat 2D staging');

    // Strip structural field headers so CLIP's first 77 tokens focus purely on art style & subject
    working = working.replace(/\bCharacter\s+C\d+\s*(?:\([^)]*\))?\s*:\s*/gi, '');
    working = working.replace(
      /\b(?:Outfit|Key\s+Accessory|Rule\s+Object|Location(?:\s+[A-Z0-9]+)?|Render\s+Block|Light\/Time\s+Line|Composition|Opening\s+Frame|Primary\s+Action|Action|Camera|Persistence|Ending\s+Frame|Continuity\s+Lock|Style\s+Tags)\s*:\s*/gi,
      ''
    );
    working = working.replace(/\bC1[’']s\b/g, 'her').replace(/\bC1\b/g, 'the character');
    working = working.replace(/\s+/g, ' ').trim();

    const stylePrefix = options?.forCloudflare
      ? '2D flat cel-shaded cartoon animation frame, bold black charcoal ink outlines, flat matte color fills, two-step cel shading, 2D adult animated series and graphic novel comic illustration style, hand-drawn 2D linework: '
      : '((2D flat cel-shaded cartoon animation frame:1.4)), ((bold black charcoal ink outlines, flat matte color fills, 2-step cel shading:1.35)), ((2D adult animated series style, western graphic novel comic illustration, hand-drawn 2D linework, flat 2D colors, stylized 2D hand-drawn ink and flat color art:1.3)). ';
    const styleSuffix = options?.forCloudflare
      ? ' Rendered strictly as a flat 2D hand-drawn cel-shaded cartoon frame with bold black charcoal ink outlines and flat matte colors.'
      : ' ((flat 2D cel-shaded cartoon illustration, bold black charcoal outlines, flat matte color fills, 2D animated series frame:1.3))';

    const anti3dPrefix =
      'photorealistic, hyperrealistic, 3D render, Pixar style, Disney 3D, CGI, glossy 3D, 3D doll, 3D model, Unreal Engine, Octane render, Blender 3D, volumetric 3D lighting, realistic skin pores, subsurface scattering, photograph, live action, plastic skin, smooth airbrushed 3D shading, depth of field, bokeh, lens blur';

    const combinedNegative = [anti3dPrefix, ...negItems].filter(Boolean).join(', ');
    return {
      positivePrompt: `${stylePrefix}${working}${styleSuffix}`,
      negativePrompt: combinedNegative,
      is2dStylized: true,
    };
  }

  let positivePrompt = working.trim() || input.trim();
  if (options?.injectStyleDna && options?.styleDna) {
    positivePrompt = `${positivePrompt}\n\nVisual Style: ${options.styleDna}`;
  }
  return {
    positivePrompt,
    negativePrompt: negItems.join(', '),
    is2dStylized: false,
  };
}

export interface WorkflowOptions {
  promptStr: string;
  negativePromptStr?: string;
  disableChannelLora?: boolean;
  cfgOverride?: number;
  seed: number;
  preset?: QualityPreset;
  modelName?: string;
  channelAccountId?: string;
  loraName?: string;
  loraStrengthModel?: number;
  loraStrengthClip?: number;
}

export function buildWorkflow(opts: WorkflowOptions): any {
  const {
    promptStr,
    negativePromptStr,
    disableChannelLora = false,
    cfgOverride,
    seed,
    preset = 'standard',
    modelName,
    channelAccountId,
    loraName,
    loraStrengthModel,
    loraStrengthClip,
  } = opts;
  const wf = loadTemplate();
  const cfg = PRESET_CONFIG[preset] || PRESET_CONFIG.standard;

  // Set model checkpoint
  if (wf['4'] && wf['4'].class_type === 'CheckpointLoaderSimple') {
    if (modelName && modelName.trim()) {
      wf['4'].inputs.ckpt_name = modelName.trim();
    } else {
      // Auto-detect downloaded checkpoint in ComfyUI/models/checkpoints
      const comfyPath = resolveComfyPath() || process.env.COMFYUI_PATH || path.join(REPO_ROOT, 'ComfyUI');
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

  // Strictly isolated per-channel LoRA loader (node "20")
  // Bypass photorealistic channel LoRAs when rendering a 2D cartoon / cel-shaded scene unless an explicit loraName was supplied.
  if (loraName || (channelAccountId && !disableChannelLora)) {
    const resolved = resolveChannelLoraForAccount(channelAccountId);
    const activeLoraName = loraName ? loraName.trim() : (resolved.installed ? resolved.loraFileName : '');
    if (activeLoraName) {
      const sm = typeof loraStrengthModel === 'number' ? loraStrengthModel : resolved.strengthModel;
      const sc = typeof loraStrengthClip === 'number' ? loraStrengthClip : resolved.strengthClip;
      wf['20'] = {
        inputs: {
          lora_name: activeLoraName,
          strength_model: sm,
          strength_clip: sc,
          model: ['4', 0],
          clip: ['4', 1],
        },
        class_type: 'LoraLoader',
        _meta: {
          title: `Channel LoRA (${resolved.channelLabel})`,
        },
      };
      if (wf['13']?.inputs) {
        wf['13'].inputs.model = ['20', 0];
      }
      if (wf[PROMPT_NODE_ID]?.inputs) {
        wf[PROMPT_NODE_ID].inputs.clip = ['20', 1];
      }
      if (wf['15']?.inputs) {
        wf['15'].inputs.clip = ['20', 1];
      }
    }
  }

  // Send the app's image prompt verbatim, including any inline instructions.
  if (wf[PROMPT_NODE_ID]) {
    wf[PROMPT_NODE_ID].inputs.text = promptStr;
  }

  // Route extracted negative prompt (or clear template default when none).
  if (wf['15']) {
    wf['15'].inputs.text = typeof negativePromptStr === 'string' ? negativePromptStr : '';
  }

  if (wf['13']) {
    const checkpoint = String(wf['4']?.inputs?.ckpt_name || '');
    const lightning = /juggernaut.*lightning|juggernaut.*rdphoto2lightning/i.test(checkpoint);
    wf['13'].inputs.steps = lightning ? ({ fast: 5, standard: 6, high: 7 }[preset]) : cfg.steps;
    if (lightning) {
      wf['13'].inputs.cfg = 1.8;
      wf['13'].inputs.sampler_name = 'dpmpp_sde';
      wf['13'].inputs.scheduler = 'karras';
    } else if (typeof cfgOverride === 'number' && Number.isFinite(cfgOverride)) {
      wf['13'].inputs.cfg = cfgOverride;
    }
    wf['13'].inputs.seed = seed;
  }

  if (wf['14']) {
    const landscape = currentWorkspace().profile !== 'shorts';
    wf['14'].inputs.width = landscape ? cfg.height : cfg.width;
    wf['14'].inputs.height = landscape ? cfg.width : cfg.height;
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

  const comfyPath = resolveComfyPath();
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

  const comfyPython = resolveComfyPython();
  comfyProcess = spawn(comfyPython, [mainPy, '--listen', '127.0.0.1', '--port', '8188', ...(process.env.COMFYUI_LOW_VRAM === 'false' ? [] : ['--lowvram'])], {
    cwd: comfyPath,
    env: { ...process.env, TQDM_DISABLE: '1' },
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  });
  let startupError = '';
  comfyProcess.on('error', (error: Error) => { startupError = error.message; });
  comfyProcess.unref();

  const start = Date.now();
  const timeout = 120000;
  while (Date.now() - start < timeout) {
    if (startupError) return { success: false, message: `Cannot start ComfyUI: ${startupError}. Configure COMFYUI_PYTHON with your Python executable.` };
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

  // 1. Interrupt running generation, free models/VRAM, and clear queue
  await interruptComfyUI();
  try {
    await fetch(`${COMFY_URL}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {}

  // 2. Kill tracked child process
  if (comfyProcess) {
    try {
      const pid = comfyProcess.pid;
      if (pid) {
        if (process.platform === 'win32') {
          const { execSync } = await import('child_process');
          try {
            execSync(`taskkill /F /T /PID ${pid}`);
            killed = true;
          } catch {}
        } else {
          try {
            process.kill(-pid, 'SIGKILL');
            killed = true;
          } catch {
            try {
              process.kill(pid, 'SIGKILL');
              killed = true;
            } catch {}
          }
        }
      }
      try { comfyProcess.kill('SIGKILL'); } catch {}
    } catch {}
    comfyProcess = null;
  }

  // 3. Find and kill ANY process listening on the ComfyUI port (macOS, Linux & Windows)
  try {
    const { execSync } = await import('child_process');
    let port = '8188';
    try {
      port = new URL(COMFY_URL).port || '8188';
    } catch {}

    if (process.platform === 'win32') {
      try {
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
      } catch {}
    } else {
      // macOS / Linux: multi-method port + process kill
      const killCommands = [
        `lsof -nP -iTCP:${port} -sTCP:LISTEN -t`,
        `lsof -ti :${port}`,
      ];
      for (const cmd of killCommands) {
        try {
          const pids = execSync(cmd, { encoding: 'utf8', env: { ...process.env, PATH: `${process.env.PATH || ''}:/usr/sbin:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin` } }).trim();
          if (pids) {
            for (const pid of pids.split(/\s+/)) {
              if (/^\d+$/.test(pid) && pid !== String(process.pid)) {
                try {
                  execSync(`kill -9 ${pid}`);
                  killed = true;
                } catch {}
              }
            }
          }
        } catch {}
      }

      // Also kill any orphaned ComfyUI main.py processes
      try {
        execSync('pkill -9 -f "ComfyUI/main\\.py"', { stdio: 'ignore' });
        killed = true;
      } catch {}
      try {
        execSync(`pkill -9 -f "main\\.py.*--port.*${port}"`, { stdio: 'ignore' });
        killed = true;
      } catch {}
    }
  } catch (err: any) {
    console.error('Error stopping ComfyUI processes:', err);
  }

  // 4. Poll status up to 3 seconds to guarantee it is offline
  const pollStart = Date.now();
  while (Date.now() - pollStart < 3000) {
    await new Promise((r) => setTimeout(r, 500));
    const s = await checkComfyStatus();
    if (!s.online) {
      return { success: true, message: 'Image model stopped successfully' };
    }
  }

  const finalCheck = await checkComfyStatus();
  if (finalCheck.online) {
    return { success: false, message: 'ComfyUI is still responding after stop attempt' };
  }

  return { success: true, message: 'Image model stopped successfully' };
}

export interface GenerateOptions {
  prompt: string;
  scriptId: string;
  index: number;
  seed?: number;
  signal?: AbortSignal;
  preset?: QualityPreset;
  modelName?: string;
  filePrefix?: 'image' | 'ref-frame';
  force2dStylized?: boolean;
}

export async function generateImage(opts: GenerateOptions): Promise<{ publicUrl: string; fileName: string; seed: number; elapsedMs: number; loraFileName?: string }> {
  const started = Date.now();
  const scriptId = sanitizeSegment(opts.scriptId);
  if (!scriptId) throw new ComfyError('CONFIG', 'Invalid scriptId.');
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const prefix = opts.filePrefix || 'image';
  const clientId = `server-${scriptId}-${prefix}-${opts.index}-${started}`;
  const accountId = currentWorkspace().accountId || 'default';
  const channelLora = resolveChannelLoraForAccount(accountId);

  const prepared = preparePromptForImageGeneration(opts.prompt, {
    forCloudflare: false,
    force2dStylized: opts.force2dStylized,
  });
  const workflow = buildWorkflow({
    promptStr: prepared.positivePrompt,
    negativePromptStr: prepared.negativePrompt,
    disableChannelLora: prepared.is2dStylized,
    cfgOverride: prepared.is2dStylized ? 7.0 : undefined,
    seed,
    preset: opts.preset || 'standard',
    modelName: opts.modelName,
    channelAccountId: accountId,
  });
  const promptId = await queuePrompt(workflow, clientId);
  const historyEntry = await pollHistory(promptId, GEN_TIMEOUT_MS, opts.signal);
  const imageRef = extractImageRef(historyEntry);
  const buffer = await downloadImage(imageRef);

  const outDir = path.join(generatedDir(), scriptId);
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `${prefix}-${String(opts.index).padStart(2, '0')}-${started}.png`;
  fs.writeFileSync(path.join(outDir, fileName), buffer);

  return {
    publicUrl: mediaUrl(`generate/file/${scriptId}/${fileName}`),
    fileName,
    seed,
    elapsedMs: Date.now() - started,
    loraFileName: channelLora.installed ? channelLora.loraFileName : undefined,
  };
}
