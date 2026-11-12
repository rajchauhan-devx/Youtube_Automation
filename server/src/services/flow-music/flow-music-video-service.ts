import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { flowMusicDataDir, flowMusicDownloadsDir } from './flow-music-profile.js';
import { store } from '../store.js';
import { generatedDir, mediaUrl, outputDir as workspaceOutputDir } from '../workspace.js';
import { containedFile } from '../paths.js';
import {
  getCloudflareConfig,
  isCloudflareConfigured,
  generateCloudflareImage,
} from '../cloudflare-image.js';
import { isGoogleImageConfigured, generateGoogleImage } from '../google-image.js';
import { checkComfyStatus, generateImage, sanitizeSegment } from '../comfyui.js';
import { clearFlowMusicJobs } from './flow-music-worker.js';
import { chat as geminiChat, getGeminiApiKey } from '../gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface SongApprovalState {
  scriptId: string;
  approved: boolean;
  approvedAt?: string;
  songUrl: string;
  trackTitle: string;
}

export interface FlowSceneDefinition {
  line: string;
  caption: string;
  tag?: string;
  duration: number;
  effect: 'zoom-in' | 'zoom-out' | 'pan-up' | 'pan-left';
  prompt: string;
}

export interface FlowMusicStudioState {
  scriptId: string;
  title: string;
  prompt: string;
  lyrics: string;
  lyricsMode: 'custom' | 'instrumental' | 'ai';
  mood: string;
  theme: string;
  vocalProfile: string;
  sfxBooms: boolean;
  sfxRisers: boolean;
  dholPercussion: boolean;
  brassSwells: boolean;
  duration: number;
  bpm: number;
  producerModel: string;
  imageOnlyReel: boolean;
  letterboxBanner: string;
  vfxParticles: boolean;
  scenes: FlowSceneDefinition[];
  updatedAt: string;
}

export interface FlowVideoJob {
  id: string;
  scriptId: string;
  state: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  stage: string;
  progress: number;
  approved: boolean;
  images: { line: string; prompt: string; filename: string; url: string }[];
  shortsVideoUrl?: string;
  longVideoUrl?: string;
  shortsPath?: string;
  longPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const approvalMap = new Map<string, SongApprovalState>();
const videoJobs = new Map<string, FlowVideoJob>();

const STUDIO_STATE_FILE = 'studio_state.json';

export function createEmptyFlowMusicStudioState(scriptId = 'flow_studio_custom'): FlowMusicStudioState {
  return {
    scriptId,
    title: '',
    prompt: '',
    lyrics: '',
    lyricsMode: 'custom',
    mood: '',
    theme: '',
    vocalProfile: '',
    sfxBooms: true,
    sfxRisers: true,
    dholPercussion: true,
    brassSwells: true,
    duration: 60,
    bpm: 110,
    producerModel: 'Google Lyria / Flow Music',
    imageOnlyReel: true,
    letterboxBanner: '',
    vfxParticles: true,
    scenes: [],
    updatedAt: new Date().toISOString(),
  };
}

export function getFlowMusicStudioState(): FlowMusicStudioState {
  const file = path.join(flowMusicDataDir(), STUDIO_STATE_FILE);
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ...createEmptyFlowMusicStudioState(parsed?.scriptId), ...parsed };
    } catch {}
  }
  return createEmptyFlowMusicStudioState();
}

export function saveFlowMusicStudioState(patch: Partial<FlowMusicStudioState>): FlowMusicStudioState {
  const next: FlowMusicStudioState = {
    ...getFlowMusicStudioState(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const file = path.join(flowMusicDataDir(), STUDIO_STATE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function getSongApproval(scriptId: string): SongApprovalState {
  const safeId = sanitizeSegment(scriptId) || 'flow_studio_custom';
  const existing = approvalMap.get(safeId) || approvalMap.get(scriptId);
  if (existing) return existing;

  const approvalFile = path.join(flowMusicDataDir(), `approval_${safeId}.json`);
  if (fs.existsSync(approvalFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
      approvalMap.set(safeId, data);
      return data;
    } catch {}
  }

  return {
    scriptId: safeId,
    approved: false,
    songUrl: '',
    trackTitle: '',
  };
}

export function setSongApproval(scriptId: string, approved: boolean, songUrl = '', trackTitle = ''): SongApprovalState {
  const safeId = sanitizeSegment(scriptId) || 'flow_studio_custom';
  const state: SongApprovalState = {
    scriptId: safeId,
    approved,
    approvedAt: approved ? new Date().toISOString() : undefined,
    songUrl: songUrl || '',
    trackTitle: trackTitle || (songUrl ? 'Approved Audio Track' : ''),
  };
  approvalMap.set(safeId, state);

  const approvalFile = path.join(flowMusicDataDir(), `approval_${safeId}.json`);
  fs.mkdirSync(path.dirname(approvalFile), { recursive: true });
  fs.writeFileSync(approvalFile, JSON.stringify(state, null, 2), 'utf8');

  return state;
}

export function getFlowVideoJob(jobId: string): FlowVideoJob | undefined {
  return videoJobs.get(jobId);
}

export function listFlowVideoJobs(scriptId?: string): FlowVideoJob[] {
  const all = Array.from(videoJobs.values());
  if (!scriptId) return all;
  return all.filter((j) => j.scriptId === scriptId);
}

export function cancelFlowVideoJob(jobId: string): FlowVideoJob | undefined {
  const job = videoJobs.get(jobId);
  if (!job) return undefined;
  if (job.state === 'idle' || job.state === 'running') {
    job.state = 'cancelled';
    job.stage = 'Cancelled by user';
    job.updatedAt = new Date().toISOString();
  }
  return job;
}

export function clearFlowVideoJobs(): void {
  for (const job of videoJobs.values()) {
    if (job.state === 'idle' || job.state === 'running') {
      job.state = 'cancelled';
      job.stage = 'Reset by user';
      job.updatedAt = new Date().toISOString();
    }
  }
  videoJobs.clear();
}

function unlinkSafe(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {}
  return false;
}

/**
 * Resets generated Flow Music artifacts, approvals, and saved draft state while keeping browser sign-in intact.
 */
export function resetFlowMusicWorkspace(opts: {
  scriptId?: string;
  scope?: 'all' | 'videos';
} = {}): {
  clearedTracks: number;
  clearedVideoFiles: number;
  clearedApprovals: number;
  stateReset: boolean;
} {
  const scope = opts.scope || 'all';
  clearFlowVideoJobs();
  if (scope === 'all') {
    clearFlowMusicJobs();
  }

  let clearedApprovals = 0;
  let clearedVideoFiles = 0;
  let clearedTracks = 0;
  const dataDir = flowMusicDataDir();
  const downloadsDir = flowMusicDownloadsDir();
  const videosDir = path.join(downloadsDir, 'videos');

  // Clear video & keyframe artifacts
  if (fs.existsSync(videosDir)) {
    for (const entry of fs.readdirSync(videosDir)) {
      if (unlinkSafe(path.join(videosDir, entry))) {
        clearedVideoFiles += 1;
      }
    }
  }

  // Clear approval files
  approvalMap.clear();
  if (fs.existsSync(dataDir)) {
    for (const entry of fs.readdirSync(dataDir)) {
      if (entry.startsWith('approval_') && entry.endsWith('.json')) {
        if (unlinkSafe(path.join(dataDir, entry))) {
          clearedApprovals += 1;
        }
      }
    }
  }

  if (scope === 'all') {
    if (fs.existsSync(downloadsDir)) {
      for (const entry of fs.readdirSync(downloadsDir)) {
        if (/\.(mp3|wav|m4a|ogg|aac|json|png|jpg|jpeg)$/i.test(entry)) {
          if (unlinkSafe(path.join(downloadsDir, entry))) {
            clearedTracks += 1;
          }
        }
      }
    }

    unlinkSafe(path.join(dataDir, STUDIO_STATE_FILE));

    if (opts.scriptId) {
      try {
        const script = store.getById<any>('scripts', opts.scriptId);
        if (script) {
          const next = { ...script };
          delete next.generatedMusic;
          if (next.autoPilotSettings?.flowMusic) {
            next.autoPilotSettings = { ...next.autoPilotSettings };
            delete next.autoPilotSettings.flowMusic;
          }
          store.add('scripts', next);
        }
      } catch {}
    }
  }

  return {
    clearedTracks,
    clearedVideoFiles,
    clearedApprovals,
    stateReset: scope === 'all',
  };
}

const HD_MYTHOLOGY_STYLE =
  'Ultra-detailed cinematic mythological concept painting, razor-sharp 8K focus, intricate sacred gold jewelry and woven silk textures, dramatic volumetric golden-hour and ember rim lighting, rich shadow detail, crisp 2K clarity, zero text, zero watermarks';

// 8 Epic HD Mythological Scenes corresponding to each line of dialogue & sacred Sanskrit war chants
export const HANUMAN_SCENE_DEFINITIONS: FlowSceneDefinition[] = [
  {
    line: 'राम जी: "हनुमान, अगर सूर्य निकल गया तो लक्ष्मण मर जाएगा।"',
    caption: 'हनुमान, अगर सूर्य निकल गया तो लक्ष्मण मर जाएगा',
    tag: '[Dilemma Hook]',
    duration: 8,
    effect: 'zoom-in',
    prompt:
      `Wide cinematic composition of compassionate Lord Rama kneeling in sorrow beside unconscious wounded Lakshmana on the rocky ancient battlefield of Lanka at pre-dawn twilight, royal crown and silk dhoti with fine embroidery, warm torchlight dancing across determined faces against deep storm clouds with a sliver of dawn light, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'हनुमान जी: "प्रभु, सूर्यदेव मेरा स्वभाव जानते हैं... जब तक जड़ी-बूटी लेकर नहीं आऊँगा, सूरज को उगने नहीं दूंगा।"',
    caption: 'प्रभु, जब तक जड़ी-बूटी नहीं लाऊंगा, सूरज को उगने नहीं दूंगा',
    tag: '[Sacred Vow]',
    duration: 10,
    effect: 'pan-up',
    prompt:
      `Heroic low-angle medium shot of mighty Lord Hanuman gazing fiercely toward the eastern horizon in sacred vow, powerful defined musculature, gleaming golden crown and engraved heavy iron Gada resting on shoulder, crimson silk dhoti catching wind, dramatic sunrise rim light bursting behind dark war clouds, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'राम जी: "हनुमान, मौत आगे बढ़ रही है..."',
    caption: 'हनुमान, मौत आगे बढ़ रही है...',
    tag: '[Rising Stakes]',
    duration: 7,
    effect: 'zoom-in',
    prompt:
      `Intimate dramatic close-wide shot of Lord Rama gently clasping Lakshmanas pale hand on the mist-covered Lanka battlefield, glowing embers drifting through warm amber firelight, ominous lengthening shadows creeping across ancient stones symbolizing approaching mortality, deep emotional expression, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'हनुमान जी: "प्रभु, आप कहते हैं मौत लक्ष्मण को खा जाएगी? मैं आपकी कसम खा के कहता हूँ... आज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!"',
    caption: 'आज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!',
    tag: '[Cosmic Roar]',
    duration: 12,
    effect: 'zoom-out',
    prompt:
      `Monumental epic shot of colossal Lord Hanuman expanding to titanic cosmic stature, roaring with fearless devotion, radiant golden fire aura erupting around him, raising the massive intricately carved iron Gada against crackling lightning in dark monsoon clouds, wind-whipped sacred cape, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'राम रामं जपती...',
    caption: 'राम रामं जपती...',
    tag: '[Flight Across Ocean]',
    duration: 8,
    effect: 'pan-left',
    prompt:
      `Dynamic high-speed aerial vista of Lord Hanuman soaring like a blazing comet high above the churning emerald ocean at night, supersonic wind trails and golden shockwave rings carving through towering storm clouds illuminated by celestial lightning, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'हनुमान अतुलितबलधामम्...',
    caption: 'हनुमान अतुलितबलधामम्...',
    tag: '[Lifting Dronagiri]',
    duration: 9,
    effect: 'zoom-in',
    prompt:
      `Majestic wide shot of radiant Lord Hanuman hovering in the star-strewn night sky while effortlessly lifting the colossal craggy Dronagiri mountain overhead on one palm, glowing emerald and golden Sanjeevani medicinal herbs illuminating rugged cliffside waterfalls and drifting mist, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'हनुमान महाकाल शंभोरावतारः...',
    caption: 'हनुमान महाकाल शंभोरावतारः...',
    tag: '[Mahakal Rudra Avatar]',
    duration: 10,
    effect: 'zoom-out',
    prompt:
      `Awe-inspiring cosmic fantasy scene of Lord Hanuman in his fierce Rudra Mahakal avatar standing between the dark earth and rising dawn sun, glowing divine trident aura and sacred Rudraksha beads around chest and arms, coronal solar flares silhouetting his mighty form, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'बजरंगबली... जय श्री राम!',
    caption: 'बजरंगबली... जय श्री राम!',
    tag: '[Divine Triumph]',
    duration: 9,
    effect: 'zoom-in',
    prompt:
      `Radiant golden sunrise over ancient Lanka with Lakshmana awakened and smiling joyfully while serene Lord Rama warmly embraces victorious Lord Hanuman, showers of luminous flower petals drifting in crisp morning sunbeams across tranquil battlefield hills, ${HD_MYTHOLOGY_STYLE}`,
  },
];

type SceneImageProvider = 'google' | 'cloudflare' | 'local';

export interface FlowMusicImageGenerationResult {
  provider: SceneImageProvider;
  model: string;
  filePath: string;
  bytes: number;
}

const MIN_VALID_SCENE_IMAGE_BYTES = 10_000;

function resolveProviderOrder(preferred: SceneImageProvider): SceneImageProvider[] {
  const fallbackOrder: SceneImageProvider[] = ['google', 'cloudflare', 'local'];
  return [preferred, ...fallbackOrder.filter((p) => p !== preferred)];
}

function selectGoogleHdModel(configuredModel?: string): string {
  if (configuredModel === 'gemini-3-pro-image') return 'gemini-3-pro-image';
  if (configuredModel && configuredModel.startsWith('gemini-3')) return configuredModel;
  return 'gemini-3.1-flash-image';
}

/**
 * Generates an HD keyframe image using configured high-clarity providers
 * (`google` -> `cloudflare` -> `local`), never falling back to Pollinations or blank boxes.
 */
export async function generateFlowMusicSceneImage(opts: {
  prompt: string;
  outputPath: string;
  seed: number;
  aspectRatio?: '9:16' | '16:9';
  index?: number;
  scriptId?: string;
}): Promise<FlowMusicImageGenerationResult> {
  const aspectRatio = opts.aspectRatio || '16:9';
  const index = opts.index ?? 0;
  const cfCfg = getCloudflareConfig();
  const order = resolveProviderOrder((cfCfg.provider || 'google') as SceneImageProvider);
  const googleModel = selectGoogleHdModel(cfCfg.googleModel);
  const tempScriptId =
    sanitizeSegment(opts.scriptId || `flow_music_${randomUUID().replace(/-/g, '').slice(0, 10)}`) ||
    'flow_music_tmp';
  const tempDir = path.join(generatedDir(), tempScriptId);
  const errors: string[] = [];

  try {
    for (const provider of order) {
      if (provider === 'google' && !isGoogleImageConfigured()) {
        errors.push('google: not configured');
        continue;
      }
      if (provider === 'cloudflare' && !isCloudflareConfigured(cfCfg)) {
        errors.push('cloudflare: not configured');
        continue;
      }
      if (provider === 'local') {
        const status = await checkComfyStatus().catch(() => ({ online: false }));
        if (!status.online) {
          errors.push('local: ComfyUI offline');
          continue;
        }
      }

      try {
        let result: { fileName: string; model?: string };
        if (provider === 'google') {
          result = await generateGoogleImage({
            scriptId: tempScriptId,
            index,
            prompt: opts.prompt,
            seed: opts.seed,
            preset: 'high',
            imageSize: '2K',
            aspectRatio,
            modelName: googleModel,
            force2dStylized: false,
          });
        } else if (provider === 'cloudflare') {
          result = await generateCloudflareImage({
            scriptId: tempScriptId,
            index,
            prompt: opts.prompt,
            seed: opts.seed,
            preset: 'high',
            aspectRatio,
            force2dStylized: false,
          });
        } else {
          const localResult = await generateImage({
            scriptId: tempScriptId,
            index,
            prompt: opts.prompt,
            seed: opts.seed,
            preset: 'high',
            aspectRatio,
            force2dStylized: false,
          });
          result = { fileName: localResult.fileName, model: 'comfyui-local' };
        }

        const producedPath = containedFile(tempDir, result.fileName);
        if (!producedPath || !fs.existsSync(producedPath)) {
          throw new Error(`Provider "${provider}" returned no output file.`);
        }
        const stat = fs.statSync(producedPath);
        if (stat.size < MIN_VALID_SCENE_IMAGE_BYTES) {
          throw new Error(`Provider "${provider}" returned undersized output (${stat.size} bytes).`);
        }

        fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
        fs.copyFileSync(producedPath, opts.outputPath);
        return {
          provider,
          model: result.model || provider,
          filePath: opts.outputPath,
          bytes: stat.size,
        };
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn(`[Flow Music Image] Provider "${provider}" failed: ${msg}`);
        errors.push(`${provider}: ${msg}`);
      }
    }
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }

  throw new Error(
    `HD scene image generation failed across configured providers (${errors.join(' | ')}). Check your Google Cloud, Cloudflare, or local ComfyUI image settings.`
  );
}

/** Builds an oversampled Lanczos Ken Burns filter for 9:16 letterboxed Shorts scenes. */
export function buildShortsSceneFilter(dur: number, zoomIn: boolean): string {
  const numFrames = dur * 30;
  const zoomExpr = zoomIn ? `'min(zoom+0.00055,1.14)'` : `'max(1.14-0.00055*on,1.0)'`;
  return [
    `color=c=black:s=1080x1920:d=${dur}[bg]`,
    `[0:v]scale=2560:1440:flags=lanczos:force_original_aspect_ratio=increase,zoompan=z=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${numFrames}:s=1080x608:fps=30,unsharp=5:5:0.45:3:3:0.2,eq=contrast=1.06:saturation=1.12:brightness=0.0[fg]`,
    `[bg][fg]overlay=0:656[out]`,
  ].join(';');
}

/** Builds a 4K-oversampled Lanczos Ken Burns filter for 16:9 widescreen scenes. */
export function buildLongSceneFilter(dur: number, zoomIn: boolean, width = 1920, height = 1080): string {
  const numFrames = dur * 30;
  const zoomExpr = zoomIn ? `'min(zoom+0.00055,1.14)'` : `'max(1.14-0.00055*on,1.0)'`;
  return [
    `scale=3840:2160:flags=lanczos:force_original_aspect_ratio=increase`,
    `zoompan=z=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${numFrames}:s=${width}x${height}:fps=30`,
    `unsharp=5:5:0.5:3:3:0.25`,
    `eq=contrast=1.06:saturation=1.12:brightness=0.0`,
    `colorbalance=rs=0.03:gs=0.0:bs=-0.02`,
    `format=yuv420p`,
  ].join(',');
}

async function concatAndBurnVideo(opts: {
  clipPaths: string[];
  concatListPath: string;
  rawOutputPath: string;
  assPath: string;
  audioPath: string;
  finalOutputPath: string;
}): Promise<void> {
  fs.writeFileSync(
    opts.concatListPath,
    opts.clipPaths.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n')
  );
  await runFFmpegCommand([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', opts.concatListPath,
    '-c:v', 'copy',
    opts.rawOutputPath,
  ]);

  const escapedAss = opts.assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  await runFFmpegCommand([
    '-y',
    '-i', opts.rawOutputPath,
    '-i', opts.audioPath,
    '-vf', `ass='${escapedAss}'`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-shortest',
    opts.finalOutputPath,
  ]);

  for (const clip of opts.clipPaths) {
    try { fs.unlinkSync(clip); } catch {}
  }
  try { fs.unlinkSync(opts.concatListPath); } catch {}
  try { fs.unlinkSync(opts.rawOutputPath); } catch {}
}

function runFFmpegCommand(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-600)}`));
    });
    proc.on('error', reject);
  });
}

function escapeAssText(text: string): string {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N')
    .trim();
}

function wrapAssCaption(text: string, maxChars = 42): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxChars) return escapeAssText(clean);
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + 1 + word.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3).map(escapeAssText).join('\\N');
}

function isHanumanPresetScenes(scenes: FlowSceneDefinition[]): boolean {
  return (
    scenes.length === HANUMAN_SCENE_DEFINITIONS.length &&
    scenes.every((s, idx) => s.caption === HANUMAN_SCENE_DEFINITIONS[idx].caption)
  );
}

const HANUMAN_SHORTS_HIGHLIGHTS = [
  '{\\c&H00FFFFFF&}राम जी: {\\c&H00D4FF&}हनुमान{\\c&H00FFFFFF&}, अगर\\N{\\c&H00D4FF&}सूर्य निकल गया{\\c&H00FFFFFF&} तो लक्ष्मण {\\c&H00D4FF&}मर जाएगा',
  '{\\c&H00FFFFFF&}प्रभु, सूर्यदेव मेरा {\\c&H00D4FF&}स्वभाव{\\c&H00FFFFFF&} जानते हैं...\\Nजब तक जड़ी-बूटी नहीं लाऊंगा, {\\c&H00D4FF&}सूरज को उगने नहीं दूंगा!',
  '{\\c&H00FFFFFF&}राम जी: "हनुमान, {\\c&H00D4FF&}मौत आगे बढ़ रही है..."',
  '{\\c&H00D4FF&}मैं आपकी कसम{\\c&H00FFFFFF&} खा के कहता हूँ...\\Nआज {\\c&H00D4FF&}मौत को ही मार दूंगा!{\\c&H00FFFFFF&}\\Nदुनिया में कभी कोई {\\c&H00D4FF&}मरेगा नहीं!',
  '{\\c&H00D4FF&}राम रामं जपती...{\\c&H00FFFFFF&}',
  '{\\c&H00FFFFFF&}हनुमान {\\c&H00D4FF&}अतुलितबलधामम्...{\\c&H00FFFFFF&}',
  '{\\c&H00FFFFFF&}हनुमान {\\c&H00D4FF&}महाकाल शंभोरावतारः...{\\c&H00FFFFFF&}',
  '{\\c&H00D4FF&}बजरंगबली... {\\c&H00FFFFFF&}जय श्री राम! 🚩',
];

const HANUMAN_LONG_HIGHLIGHTS = [
  '{\\c&H00FFFFFF&}राम जी: {\\c&H00D4FF&}हनुमान{\\c&H00FFFFFF&}, अगर {\\c&H00D4FF&}सूर्य निकल गया{\\c&H00FFFFFF&} तो लक्ष्मण {\\c&H00D4FF&}मर जाएगा',
  '{\\c&H00FFFFFF&}हनुमान जी: "प्रभु, सूर्यदेव मेरा स्वभाव जानते हैं... जब तक जड़ी-बूटी नहीं लाऊंगा, {\\c&H00D4FF&}सूरज को उगने नहीं दूंगा!{\\c&H00FFFFFF&}"',
  '{\\c&H00FFFFFF&}राम जी: "हनुमान, {\\c&H00D4FF&}मौत आगे बढ़ रही है..."',
  '{\\c&H00D4FF&}मैं आपकी कसम खा के कहता हूँ... आज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!{\\c&H00FFFFFF&}',
  '{\\c&H00D4FF&}राम रामं जपती...{\\c&H00FFFFFF&}',
  '{\\c&H00FFFFFF&}हनुमान {\\c&H00D4FF&}अतुलितबलधामम्...{\\c&H00FFFFFF&}',
  '{\\c&H00FFFFFF&}हनुमान {\\c&H00D4FF&}महाकाल शंभोरावतारः...{\\c&H00FFFFFF&}',
  '{\\c&H00D4FF&}बजरंगबली... जय श्री राम! 🚩{\\c&H00FFFFFF&}',
];

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function buildShortsAssSubtitles(
  scenes: FlowSceneDefinition[],
  totalDur: number,
  filePath: string,
  bannerText?: string
): void {
  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Banner,Georgia,54,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1,2,8,20,20,420,1',
    'Style: Caption,Nirmala UI,56,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,3,5,40,40,0,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const cleanBanner = typeof bannerText === 'string' ? bannerText.trim() : '';
  if (cleanBanner) {
    lines.push(`Dialogue: 0,0:00:00.00,${formatAssTime(totalDur)},Banner,,0,0,0,,${escapeAssText(cleanBanner)}`);
  }

  const useHanumanHighlights = isHanumanPresetScenes(scenes);
  let currentTime = 0;
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = Math.max(2, sc.duration || 8);
    const startTime = currentTime;
    const endTime = currentTime + dur;
    currentTime = endTime;

    const text = useHanumanHighlights
      ? HANUMAN_SHORTS_HIGHLIGHTS[i]
      : wrapAssCaption(sc.caption || sc.line, 34);
    if (text) {
      lines.push(`Dialogue: 1,${formatAssTime(startTime)},${formatAssTime(endTime)},Caption,,0,0,0,,${text}`);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

export function buildLongAssSubtitles(
  scenes: FlowSceneDefinition[],
  _totalDur: number,
  filePath: string
): void {
  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: LongCaption,Nirmala UI,46,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,3,2,60,60,80,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const useHanumanHighlights = isHanumanPresetScenes(scenes);
  let currentTime = 0;
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = Math.max(2, sc.duration || 8);
    const startTime = currentTime;
    const endTime = currentTime + dur;
    currentTime = endTime;

    const text = useHanumanHighlights
      ? HANUMAN_LONG_HIGHLIGHTS[i]
      : wrapAssCaption(sc.caption || sc.line, 64);
    if (text) {
      lines.push(`Dialogue: 1,${formatAssTime(startTime)},${formatAssTime(endTime)},LongCaption,,0,0,0,,${text}`);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

const EFFECTS: Array<FlowSceneDefinition['effect']> = ['zoom-in', 'pan-up', 'zoom-out', 'pan-left'];

function splitScriptLines(rawText: string, maxScenes = 10): string[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[.*\]$/.test(l));
  if (lines.length <= maxScenes) return lines;

  // Coalesce excessive lines evenly into maxScenes chunks
  const chunkSize = Math.ceil(lines.length / maxScenes);
  const grouped: string[] = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    grouped.push(lines.slice(i, i + chunkSize).join(' '));
  }
  return grouped;
}

/**
 * Converts user script/lyrics/topic into HD keyframe scene definitions, enriching visual prompts via Gemini when configured.
 */
export async function buildScenesFromScript(opts: {
  scriptText?: string;
  lyrics?: string;
  topic?: string;
  mood?: string;
  theme?: string;
  targetDuration?: number;
  offlineOnly?: boolean;
}): Promise<FlowSceneDefinition[]> {
  const rawSource = (opts.lyrics || opts.scriptText || '').trim();
  const topic = (opts.topic || opts.theme || 'Epic Cinematic Story').trim();
  const mood = (opts.mood || 'dramatic high-contrast storytelling').trim();
  const rawLines = splitScriptLines(rawSource, 10);

  const beats =
    rawLines.length > 0
      ? rawLines
      : [
          `${topic} — Opening atmospheric establishing shot`,
          `${topic} — Rising tension and emotional turning point`,
          `${topic} — Climactic heroic confrontation`,
          `${topic} — Luminous resolution and finale`,
        ];

  const totalTarget = Math.max(16, Math.min(180, opts.targetDuration || Math.max(32, beats.length * 8)));
  const perScene = Math.max(4, Math.min(14, Math.round(totalTarget / beats.length)));

  const fallbackScenes: FlowSceneDefinition[] = beats.map((line, i) => ({
    line,
    caption: line.replace(/^[^:]{1,24}:\s*/, '').replace(/^["“]|["”]$/g, ''),
    tag: `[Scene ${i + 1}]`,
    duration: perScene,
    effect: EFFECTS[i % EFFECTS.length],
    prompt: `Cinematic atmospheric frame illustrating "${line}" within theme "${topic}", mood "${mood}", dynamic composition, dramatic lighting, ${HD_MYTHOLOGY_STYLE}`,
  }));

  const apiKey = !opts.offlineOnly ? getGeminiApiKey() : '';
  if (!apiKey || rawLines.length === 0) {
    return fallbackScenes;
  }

  try {
    const response = await geminiChat(apiKey, {
      temperature: 0.4,
      max_tokens: 2048,
      json: true,
      signal: AbortSignal.timeout(15000),
      messages: [
        {
          role: 'system',
          content:
            'You are a film storyboard director. Output valid JSON array matching the input lines 1-to-1. Each item has: caption (concise overlay subtitle), visualPrompt (rich detailed scene visual description with lighting, camera framing, emotion, zero embedded text/watermarks, and NEVER use the words "graphic novel" or "cartoon").',
        },
        {
          role: 'user',
          content: JSON.stringify({
            topic,
            mood,
            theme: opts.theme || topic,
            lines: beats,
          }),
        },
      ],
    });
    const parsed = JSON.parse(response.choices?.[0]?.message?.content || '[]');
    if (Array.isArray(parsed) && parsed.length === beats.length) {
      return beats.map((line, i) => {
        const ai = parsed[i] || {};
        const safePrompt = String(ai.visualPrompt || fallbackScenes[i].prompt)
          .replace(/graphic\s+novel/gi, 'cinematic artwork')
          .trim();
        return {
          line,
          caption: String(ai.caption || fallbackScenes[i].caption).trim(),
          tag: `[Scene ${i + 1}]`,
          duration: perScene,
          effect: EFFECTS[i % EFFECTS.length],
          prompt: `${safePrompt}, ${HD_MYTHOLOGY_STYLE}`,
        };
      });
    }
  } catch (err: any) {
    console.warn(`[Flow Music Storyboard] Using deterministic scene builder (${err?.message || 'LLM unavailable'})`);
  }

  return fallbackScenes;
}

/**
 * Resolves the approved audio track path from explicit URL, approval state, or latest audio download.
 */
export function resolveApprovedAudioPath(scriptId: string, explicitSongUrl = ''): string {
  const downloadsDir = flowMusicDownloadsDir();
  const approval = getSongApproval(scriptId);
  const candidateUrl = explicitSongUrl || approval.songUrl || '';

  if (candidateUrl.includes('/api/flow-music/downloads/')) {
    const rawId = decodeURIComponent(candidateUrl.split('/api/flow-music/downloads/')[1].split('?')[0]);
    const safeId = path.basename(rawId).replace(/[^a-zA-Z0-9._-]/g, '');
    for (const candidateName of [safeId, `${safeId}.mp3`, `${safeId}.wav`, `${safeId}.m4a`]) {
      if (!candidateName) continue;
      const p = containedFile(downloadsDir, candidateName);
      if (p && fs.existsSync(p) && fs.statSync(p).isFile()) {
        return p;
      }
    }
  }

  if (candidateUrl.includes('/api/generate/file/')) {
    const rest = decodeURIComponent(candidateUrl.split('/api/generate/file/')[1].split('?')[0]);
    const parts = rest.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const p = containedFile(generatedDir(), parts[0], parts.slice(1).join('/'));
      if (p && fs.existsSync(p) && fs.statSync(p).isFile()) {
        return p;
      }
    }
  }

  // Fallback to most recent generated/uploaded audio track in downloadsDir
  if (fs.existsSync(downloadsDir)) {
    const audioFiles = fs
      .readdirSync(downloadsDir)
      .filter((f) => /\.(mp3|wav|m4a|ogg|aac)$/i.test(f))
      .map((f) => ({ path: path.join(downloadsDir, f), mtimeMs: fs.statSync(path.join(downloadsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (audioFiles.length > 0) {
      return audioFiles[0].path;
    }
  }

  throw new Error('Approved audio track not found on disk. Generate a Flow Music track or upload an MP3/WAV file first.');
}

async function probeAudioDuration(audioPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);
    let out = '';
    proc.stdout?.on('data', (d) => {
      out += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) {
        const parsed = Number.parseFloat(out.trim());
        resolve(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
      } else {
        resolve(null);
      }
    });
    proc.on('error', () => resolve(null));
  });
}

function fitScenesToAudioDuration(scenes: FlowSceneDefinition[], audioDurSec: number | null): FlowSceneDefinition[] {
  if (!audioDurSec || audioDurSec <= 4 || scenes.length === 0) return scenes;
  const currentTotal = scenes.reduce((acc, s) => acc + (s.duration || 8), 0);
  if (Math.abs(currentTotal - audioDurSec) <= 3) return scenes;

  const scale = audioDurSec / currentTotal;
  return scenes.map((s) => ({
    ...s,
    duration: Math.max(3, Math.round((s.duration || 8) * scale * 10) / 10),
  }));
}

export async function regenerateFlowMusicSceneKeyframe(opts: {
  filename: string;
  prompt: string;
  index?: number;
  jobId?: string;
}): Promise<{ filename: string; url: string; provider: string; model: string }> {
  const safeName = path.basename(opts.filename);
  if (!safeName || !/\.(png|jpg|jpeg)$/i.test(safeName)) {
    throw new Error('Invalid scene image filename');
  }
  const outDir = path.join(flowMusicDownloadsDir(), 'videos');
  const imgPath = containedFile(outDir, safeName);
  if (!imgPath) {
    throw new Error('Invalid scene image path');
  }

  const seed = Math.floor(Math.random() * 1_000_000) + (opts.index ?? 0) * 37;
  const result = await generateFlowMusicSceneImage({
    prompt: opts.prompt,
    outputPath: imgPath,
    seed,
    aspectRatio: '16:9',
    index: opts.index ?? 0,
    scriptId: `flow_regen_${Date.now()}`,
  });

  if (opts.jobId) {
    const job = videoJobs.get(opts.jobId);
    const target = job?.images.find((im) => im.filename === safeName);
    if (target) {
      target.prompt = opts.prompt;
      target.url = `/api/flow-music/videos/${safeName}?t=${Date.now()}`;
    }
  }

  return {
    filename: safeName,
    url: `/api/flow-music/videos/${safeName}?t=${Date.now()}`,
    provider: result.provider,
    model: result.model,
  };
}

export interface StartFlowVideoPipelineOptions {
  scenes?: FlowSceneDefinition[];
  lyrics?: string;
  title?: string;
  prompt?: string;
  mood?: string;
  theme?: string;
  duration?: number;
  letterboxBanner?: string;
  songUrl?: string;
}

/**
 * Start the full multi-image and dual-format video generation pipeline.
 * Gated strictly by song approval.
 */
export async function startFlowVideoPipeline(
  scriptId: string,
  opts: StartFlowVideoPipelineOptions = {}
): Promise<FlowVideoJob> {
  const approval = getSongApproval(scriptId);
  if (!approval.approved) {
    throw new Error('Song must be approved first! Please listen to the track and click "Approve Song" before starting video production.');
  }

  const jobId = `fv_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const job: FlowVideoJob = {
    id: jobId,
    scriptId,
    state: 'running',
    stage: 'Initializing 2K HD scene generation pipeline',
    progress: 5,
    approved: true,
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  videoJobs.set(jobId, job);

  const checkCancelled = () => {
    if (job.state === 'cancelled') {
      throw new Error('Video pipeline cancelled by user');
    }
  };

  // Background async execution
  void (async () => {
    const downloadsDir = flowMusicDownloadsDir();
    const outDir = path.join(downloadsDir, 'videos');
    fs.mkdirSync(outDir, { recursive: true });

    // 1. Locate approved audio track dynamically
    const audioPath = resolveApprovedAudioPath(scriptId, opts.songUrl);
    const audioDuration = await probeAudioDuration(audioPath);

    // 2. Resolve scenes (explicit custom scenes -> script/lyrics builder -> persisted draft -> preset)
    const studioDraft = getFlowMusicStudioState();
    let baseScenes: FlowSceneDefinition[];
    if (Array.isArray(opts.scenes) && opts.scenes.length > 0) {
      baseScenes = opts.scenes.map((sc, i) => ({
        line: String(sc.line || sc.caption || `Scene ${i + 1}`),
        caption: String(sc.caption || sc.line || `Scene ${i + 1}`),
        tag: sc.tag || `[Scene ${i + 1}]`,
        duration: Number(sc.duration) > 0 ? Number(sc.duration) : 8,
        effect: sc.effect || EFFECTS[i % EFFECTS.length],
        prompt: String(sc.prompt || '').trim()
          ? String(sc.prompt).replace(/graphic\s+novel/gi, 'cinematic artwork')
          : `Cinematic atmospheric frame illustrating "${sc.line || sc.caption}", ${HD_MYTHOLOGY_STYLE}`,
      }));
    } else if (opts.lyrics?.trim() || opts.title?.trim() || opts.prompt?.trim()) {
      baseScenes = await buildScenesFromScript({
        lyrics: opts.lyrics,
        topic: opts.title || opts.theme,
        mood: opts.mood || opts.prompt,
        theme: opts.theme,
        targetDuration: opts.duration || audioDuration || 60,
      });
    } else if (Array.isArray(studioDraft.scenes) && studioDraft.scenes.length > 0) {
      baseScenes = studioDraft.scenes;
    } else {
      baseScenes = HANUMAN_SCENE_DEFINITIONS;
    }

    const scenes = fitScenesToAudioDuration(baseScenes, audioDuration);
    const useHanumanPreset = isHanumanPresetScenes(scenes);
    const bannerText =
      opts.letterboxBanner !== undefined
        ? opts.letterboxBanner
        : useHanumanPreset
          ? 'Goosebumps 🚩'
          : studioDraft.letterboxBanner || '';

    job.stage = `Generating ${scenes.length} HD 2K scene keyframes...`;
    job.progress = 15;
    job.updatedAt = new Date().toISOString();

    const imageFiles: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      checkCancelled();
      const scene = scenes[i];
      const imgFilename = `${jobId}_scene_${i}.png`;
      const imgPath = path.join(outDir, imgFilename);

      job.stage = `Generating HD Scene ${i + 1}/${scenes.length}: ${scene.line.slice(0, 40)}...`;
      job.progress = 15 + Math.round((i / scenes.length) * 35);
      job.updatedAt = new Date().toISOString();

      const seed = 1008 + i * 42;
      const generated = await generateFlowMusicSceneImage({
        prompt: scene.prompt,
        outputPath: imgPath,
        seed,
        aspectRatio: '16:9',
        index: i,
        scriptId: `${jobId}_s${i}`,
      });
      console.log(
        `[Flow Music Image] Scene ${i + 1}/${scenes.length} generated via ${generated.provider} (${generated.model}, ${Math.round(generated.bytes / 1024)} KB)`
      );
      imageFiles.push(imgPath);

      job.images.push({
        line: scene.line,
        prompt: scene.prompt,
        filename: imgFilename,
        url: `/api/flow-music/videos/${imgFilename}`,
      });
    }

    checkCancelled();
    const totalDur = scenes.reduce((acc, s) => acc + (s.duration || 8), 0);

    // 3. Render Shorts Video (9:16 vertical - 1080x1920)
    job.stage = 'Rendering 9:16 Shorts Video with Lanczos Ken Burns & synced captions';
    job.progress = 55;
    job.updatedAt = new Date().toISOString();

    const shortsFilename = `${jobId}_shorts.mp4`;
    const shortsPath = path.join(outDir, shortsFilename);
    const shortsAssPath = path.join(outDir, `${jobId}_shorts.ass`);
    buildShortsAssSubtitles(scenes, totalDur, shortsAssPath, bannerText);

    const shortsClipList: string[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      checkCancelled();
      const sc = scenes[i];
      const clipFile = path.join(outDir, `${jobId}_shorts_clip_${i}.mp4`);
      const dur = sc.duration || 8;
      const filter = buildShortsSceneFilter(dur, i % 2 === 0);

      await runFFmpegCommand([
        '-y',
        '-loop', '1',
        '-framerate', '30',
        '-t', String(dur),
        '-i', imageFiles[i],
        '-filter_complex', filter,
        '-map', '[out]',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '14',
        '-pix_fmt', 'yuv420p',
        '-t', String(dur),
        clipFile,
      ]);
      shortsClipList.push(clipFile);
    }

    checkCancelled();
    await concatAndBurnVideo({
      clipPaths: shortsClipList,
      concatListPath: path.join(outDir, `${jobId}_concat_shorts.txt`),
      rawOutputPath: path.join(outDir, `${jobId}_shorts_raw.mp4`),
      assPath: shortsAssPath,
      audioPath,
      finalOutputPath: shortsPath,
    });
    job.shortsPath = shortsPath;
    job.shortsVideoUrl = `/api/flow-music/videos/${shortsFilename}`;
    try { fs.unlinkSync(shortsAssPath); } catch {}

    checkCancelled();
    // 4. Render Long Video (16:9 widescreen - 1920x1080)
    job.stage = 'Rendering 16:9 Long Video in HD cinematic widescreen presentation';
    job.progress = 80;
    job.updatedAt = new Date().toISOString();

    const longFilename = `${jobId}_long.mp4`;
    const longPath = path.join(outDir, longFilename);
    const longAssPath = path.join(outDir, `${jobId}_long.ass`);
    buildLongAssSubtitles(scenes, totalDur, longAssPath);

    const longClipList: string[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      checkCancelled();
      const sc = scenes[i];
      const clipFile = path.join(outDir, `${jobId}_long_clip_${i}.mp4`);
      const dur = sc.duration || 8;
      const filter = buildLongSceneFilter(dur, i % 2 === 0, 1920, 1080);

      await runFFmpegCommand([
        '-y',
        '-loop', '1',
        '-framerate', '30',
        '-t', String(dur),
        '-i', imageFiles[i],
        '-vf', filter,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '14',
        '-pix_fmt', 'yuv420p',
        '-t', String(dur),
        clipFile,
      ]);
      longClipList.push(clipFile);
    }

    checkCancelled();
    await concatAndBurnVideo({
      clipPaths: longClipList,
      concatListPath: path.join(outDir, `${jobId}_concat_long.txt`),
      rawOutputPath: path.join(outDir, `${jobId}_long_raw.mp4`),
      assPath: longAssPath,
      audioPath,
      finalOutputPath: longPath,
    });
    job.longPath = longPath;
    job.longVideoUrl = `/api/flow-music/videos/${longFilename}`;
    try { fs.unlinkSync(longAssPath); } catch {}

    // 5. Copy to script workspace output if script exists
    try {
      const script = store.getById<any>('scripts', scriptId);
      if (script) {
        const scriptOutDir = containedFile(workspaceOutputDir(), scriptId, '');
        fs.mkdirSync(scriptOutDir, { recursive: true });
        fs.copyFileSync(shortsPath, path.join(scriptOutDir, 'flow_shorts_final.mp4'));
        fs.copyFileSync(longPath, path.join(scriptOutDir, 'flow_long_final.mp4'));
      }
    } catch {}

    // Complete job
    job.state = 'done';
    job.stage = 'Final Shorts (9:16) & Long (16:9) videos created successfully!';
    job.progress = 100;
    job.updatedAt = new Date().toISOString();
  })().catch((err: any) => {
    if ((job.state as string) === 'cancelled') return;
    job.state = 'error';
    job.stage = 'Video pipeline failed';
    job.error = err?.message || 'Unknown error during multi-scene video rendering';
    job.updatedAt = new Date().toISOString();
  });

  return job;
}
