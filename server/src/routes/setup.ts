import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { LOCAL_MODELS } from '../services/local-models.js';
import { OPENCODE_MODELS } from '../services/opencode-models.js';
import { GROQ_MODELS, OPENROUTER_MODELS } from '../services/reasoning-models.js';
import { EDGE_VOICE_MAP } from '../services/edge-tts.js';
import { CLOUD_VOICE_IDS } from '../services/openrouter-tts.js';
const GEMINI_MODELS = [
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
];
import { TTS_PROVIDER, TTS_PROVIDER_NAME, TTS_PROVIDER_KIND } from '../services/omnivoice.js';
import { MUSIC_MODELS } from '../services/local-music.js';
import { editingConfig } from '../services/editing/config.js';

export const setupRouter = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..', '..');

function has(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function exists(p: string | undefined | null): boolean {
  if (!p) return false;
  try { return fs.existsSync(p); } catch { return false; }
}

function toolVersion(cmd: string, args: string[]): string {
  try {
    const out = execFileSync(cmd, args, { timeout: 8000, windowsHide: true, encoding: 'utf8' });
    return String(out).split('\n')[0].trim().slice(0, 120);
  } catch { return ''; }
}

async function liveCheck(url: string, timeoutMs = 2500): Promise<{ online: boolean; detail: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text().catch(() => '');
    return { online: res.ok, detail: res.ok ? text.slice(0, 200) : `HTTP ${res.status}` };
  } catch (err) {
    return { online: false, detail: err instanceof Error ? err.message.slice(0, 200) : 'unreachable' };
  }
}

/** Parse KEY names from .env.example so the UI can show which keys are missing from server/.env. */
function envExampleKeys(): string[] {
  try {
    const raw = fs.readFileSync(path.join(SERVER_ROOT, '..', '.env.example'), 'utf8');
    const keys: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*#?\s*([A-Z][A-Z0-9_]+)\s*=/.exec(line);
      if (m && !keys.includes(m[1])) keys.push(m[1]);
    }
    return keys;
  } catch { return []; }
}

const OLLAMA_INSTALL: Record<string, string> = {
  'ollama/qwen3.5:4b': 'ollama pull qwen3.5:4b (~3.4 GB; Thinking mode reuses this same download)',
  'ollama/qwen3.5:4b:thinking': 'no separate download — reuses ollama pull qwen3.5:4b',
  'ollama/lfm2.5:8b-a1b-q4_K_M': 'ollama pull lfm2.5:8b-a1b-q4_K_M (best local JSON for editing)',
};

/** Never return secret values — only presence + where they are stored. */
function keyStatus() {
  return [
    { key: 'GEMINI_API_KEY', savedIn: 'server/.env (server-only)', present: has(process.env.GEMINI_API_KEY), usedBy: 'Script generation, extraction, narration polish (default gemini-3.6-flash)' },
    { key: 'OPENCODE_API_KEY', savedIn: 'server/.env (server-only)', present: has(process.env.OPENCODE_API_KEY), usedBy: `Free script models: ${OPENCODE_MODELS.map(m => m.id).join(', ')}` },
    { key: 'XKIRO_API_KEY', savedIn: 'server/.env (server-only)', present: has(process.env.XKIRO_API_KEY), usedBy: 'Xkiro script generation and AI editing; live chat model catalog' },
    { key: 'GROQ_API_KEY', savedIn: 'server/.env (server-only)', present: has(process.env.GROQ_API_KEY), usedBy: `Reasoning models: ${GROQ_MODELS.map(m => m.id).join(', ')}` },
    { key: 'OPENROUTER_API_KEY (server)', savedIn: 'server/.env', present: has(process.env.OPENROUTER_API_KEY), usedBy: `Reasoning + editing: ${OPENROUTER_MODELS.map(m => m.id).join(', ')}` },
    { key: 'openrouter_key (browser)', savedIn: 'Browser localStorage key "openrouter_key", sent as x-api-key header', present: false, browserOnly: true, usedBy: 'Frontend Settings page OpenRouter key (NOT in git, per-PC browser storage)' },
    { key: 'COLAB_MEDIA_API_KEY', savedIn: 'server/.env (server-only) or Setup tab (this browser, localStorage "colab_key")', present: has(process.env.COLAB_MEDIA_API_KEY), usedBy: 'Colab/Cloudflare worker: remote IMAGE + VIDEO generation only (never scripts/audio)' },
    { key: 'HF_TOKEN', savedIn: 'server/.env (optional)', present: has(process.env.HF_TOKEN), usedBy: 'Only if Hugging Face downloads require auth (Chatterbox / ComfyUI weights are public by default)' },
    { key: 'YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET', savedIn: 'server/.env or server/data/client_secret.json', present: has(process.env.YOUTUBE_CLIENT_ID) || exists(path.join(SERVER_ROOT, 'data', 'client_secret.json')), usedBy: 'YouTube OAuth upload (callback http://localhost:3001/api/youtube/callback)' },
    { key: 'youtube-token.json', savedIn: 'server/data/youtube-token.json (git-ignored)', present: exists(path.join(SERVER_ROOT, 'data', 'youtube-token.json')), usedBy: 'Saved YouTube OAuth token — reconnect on new PC, do not expect git to carry it' },
  ];
}

setupRouter.get('/', async (_req, res) => {
  let editing: ReturnType<typeof editingConfig>;
  try { editing = editingConfig(); } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Bad editing config' });
    return;
  }

  const comfyPath = process.env.COMFYUI_PATH || path.join(SERVER_ROOT, '..', 'ComfyUI');
  const comfyCkptDir = path.join(comfyPath, 'models', 'checkpoints');
  let comfyCheckpoints: string[] = [];
  try {
    if (fs.existsSync(comfyCkptDir)) {
      comfyCheckpoints = fs.readdirSync(comfyCkptDir).filter(f => f.endsWith('.safetensors') || f.endsWith('.ckpt'));
    }
  } catch { /* ignore */ }

  const musicBase = path.join(comfyPath, 'models');
  const musicFiles = [...Object.entries(MUSIC_MODELS), ['text_encoders', 'qwen_1.7b_ace15.safetensors']].map(([folder, name]) => {
    const full = path.join(musicBase, folder, name);
    let size = 0;
    try { size = fs.statSync(full).size; } catch { /* missing */ }
    return { folder, name, path: full, installed: size > 1_000_000, bytes: size };
  });

  const chatterboxVenv = path.join(SERVER_ROOT, 'chatterbox', '.venv', 'Scripts', 'python.exe');
  const comfyVenv = process.env.COMFYUI_PYTHON || path.join(SERVER_ROOT, '..', 'artifacts', 'comfy-venv', 'Scripts', 'python.exe');
  const museTalkRoot = process.env.MUSETALK_ROOT || path.join(os.homedir(), 'OneDrive', 'Documents', 'MuseTalk-Demo');
  const dataDir = path.resolve(process.env.TUBEFLOW_DATA_DIR || path.join(SERVER_ROOT, 'data'));
  const hfCache = process.env.HF_HOME || process.env.HF_HUB_CACHE || path.join(os.homedir(), '.cache', 'huggingface', 'hub');
  const ollamaStore = process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models');
  const pkusegDir = process.env.PKUSEG_HOME || path.join(SERVER_ROOT, 'data', 'model-cache', 'pkuseg');
  const voiceDir = path.resolve(process.env.CHATTERBOX_VOICE_DIR || path.join(SERVER_ROOT, 'data', 'voices'));

  // Live readiness (best-effort, short timeouts — never fail the whole endpoint).
  const [ollamaLive, chatterboxLive, comfyLive] = await Promise.all([
    liveCheck('http://127.0.0.1:11434/api/tags'),
    liveCheck(`${(process.env.CHATTERBOX_URL || 'http://127.0.0.1:8880').replace(/\/+$/, '')}/health`),
    liveCheck(`${(process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '')}/system_stats`),
  ]);
  let ollamaModels: string[] = [];
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = await res.json() as { models?: { name?: string }[] };
      ollamaModels = (data.models || []).map(m => String(m.name || '')).filter(Boolean);
    }
  } catch { /* offline */ }

  const exampleKeys = envExampleKeys();
  const envKeyDiff = exampleKeys.map(k => ({ key: k, set: has(process.env[k]) }));

  // Full env matrix: secrets report presence only; non-secrets show values.
  const SECRET_KEYS = new Set(['GEMINI_API_KEY', 'OPENCODE_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'XKIRO_API_KEY', 'COLAB_MEDIA_API_KEY', 'HF_TOKEN', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET']);
  const ENV_GROUPS: { group: string; vars: string[] }[] = [
    { group: 'Server', vars: ['HOST', 'PORT', 'CORS_ORIGIN', 'APP_URL', 'TUBEFLOW_DATA_DIR'] },
    { group: 'Script LLMs', vars: ['GEMINI_API_KEY', 'GEMINI_EDIT_MODEL', 'OPENCODE_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'XKIRO_API_KEY'] },
    { group: 'Voice (local + cloud TTS)', vars: ['TTS_PROVIDER', 'CHATTERBOX_URL', 'CHATTERBOX_HOST', 'CHATTERBOX_PORT', 'CHATTERBOX_DEVICE', 'CHATTERBOX_T3_MODEL', 'CHATTERBOX_TIMEOUT_MS', 'CHATTERBOX_MAX_CHUNK_CHARS', 'CHATTERBOX_PYTHON', 'CHATTERBOX_VOICE_DIR', 'PKUSEG_HOME', 'TTS_SERVER_URL', 'OMNIVOICE_URL', 'TTS_MODEL', 'TTS_CLOUD_CHUNK_MAX_CHARS', 'TTS_CLOUD_TIMEOUT_MS', 'EDGE_TTS_PYTHON'] },
    { group: 'Caches / model stores', vars: ['HF_HOME', 'HF_HUB_CACHE', 'HF_TOKEN', 'OLLAMA_MODELS'] },
    { group: 'Image + music (ComfyUI)', vars: ['COMFYUI_PATH', 'COMFYUI_PYTHON', 'COMFYUI_BASE_URL', 'COMFYUI_WORKFLOW_PATH', 'COMFYUI_PROMPT_NODE_ID', 'COMFYUI_SEED_NODE_ID', 'COMFYUI_SEED_INPUT_KEY', 'COMFYUI_TIMEOUT_MS', 'COMFYUI_LOW_VRAM'] },
    { group: 'Image + video (Colab API)', vars: ['COLAB_MEDIA_API_URL', 'COLAB_MEDIA_API_KEY', 'COLAB_VIDEO_FRAMES', 'COLAB_IMAGE_FRAMES', 'COLAB_STEPS'] },
    { group: 'Presenter', vars: ['MUSETALK_ROOT', 'MUSETALK_PYTHON'] },
    { group: 'Motion graphics', vars: ['EDITING_PLANNER_MODEL', 'EDITING_MAX_PROVIDER_CALLS', 'EDITING_RENDER_CONCURRENCY', 'EDITING_PROVIDER_TIMEOUT_MS', 'EDITING_RENDER_TIMEOUT_MS', 'EDITING_BROWSER_EXECUTABLE'] },
    { group: 'YouTube', vars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REDIRECT_URI'] },
  ];
  const envMatrix = ENV_GROUPS.map(g => ({
    group: g.group,
    vars: g.vars.map(k => {
      const raw = process.env[k];
      const isSecret = SECRET_KEYS.has(k);
      return { key: k, set: has(raw), value: isSecret ? (has(raw) ? '(set — value hidden)' : '(missing)') : (raw ?? '(unset)') };
    }),
  }));

  res.json({
    generatedAt: new Date().toISOString(),
    repoRoot: path.resolve(SERVER_ROOT, '..'),
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    ports: { frontend: 'http://localhost:5173 (vite)', backend: `http://localhost:${process.env.PORT || '3001'}`, chatterbox: process.env.CHATTERBOX_URL || 'http://127.0.0.1:8880', comfyui: process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188', ollama: 'http://127.0.0.1:11434' },
    scriptModels: {
      default: 'gemini-3.6-flash (cloud, needs GEMINI_API_KEY)',
      geminiEditOverride: process.env.GEMINI_EDIT_MODEL || '(unset — defaults to gemini-3.6-flash)',
      gemini: GEMINI_MODELS.map(m => ({ id: m.id, name: m.name, needsKey: 'GEMINI_API_KEY in server/.env' })),
      local: LOCAL_MODELS.map(m => ({ ...m, install: OLLAMA_INSTALL[m.id] || `ollama pull ${m.id.replace('ollama/', '')}`, endpoint: 'http://127.0.0.1:11434 (no key, offline)', downloaded: ollamaModels.some(n => n.startsWith(m.id.replace('ollama/', '').split(':')[0])) })),
      opencodeFree: OPENCODE_MODELS.map(m => ({ ...m, needsKey: 'OPENCODE_API_KEY in server/.env' })),
      groq: GROQ_MODELS.map(m => ({ ...m, needsKey: 'GROQ_API_KEY in server/.env' })),
      openrouter: OPENROUTER_MODELS.map(m => ({ ...m, needsKey: 'OPENROUTER_API_KEY in server/.env OR browser openrouter_key sent as x-api-key' })),
    },
    voice: {
      activeProvider: TTS_PROVIDER,
      activeProviderName: TTS_PROVIDER_NAME,
      providerKind: TTS_PROVIDER_KIND,
      env: { TTS_PROVIDER: process.env.TTS_PROVIDER || 'chatterbox (default)', CHATTERBOX_URL: process.env.CHATTERBOX_URL || 'http://127.0.0.1:8880', CHATTERBOX_T3_MODEL: process.env.CHATTERBOX_T3_MODEL || 'v3', CHATTERBOX_DEVICE: process.env.CHATTERBOX_DEVICE || 'auto', TTS_MODEL: process.env.TTS_MODEL || 'openai/gpt-4o-mini-tts-2025-12-15 (OpenRouter cloud TTS)' },
      options: [
        { id: 'chatterbox', name: 'Chatterbox Multilingual V3 (default, local, free)', install: 'npm run setup:tts  → server/chatterbox/.venv (Python 3.10) + HF cache ResembleAI/chatterbox (ve.pt, t3_mtl23ls_v3.safetensors, s3gen.pt, conds.pt, tokenizer) + server/data/model-cache/pkuseg + server/data/voices', needsKey: 'none' },
        { id: 'edge', name: 'Edge Neural TTS (cloud, free, no key)', install: 'needs internet + EDGE_TTS_PYTHON for synthesis script', needsKey: 'none', voices: Object.entries(EDGE_VOICE_MAP).map(([id, v]) => `${id} → ${v.voice}`) },
        { id: 'openrouter', name: 'OpenRouter TTS (cloud)', install: 'none', needsKey: 'browser openrouter_key / OPENROUTER_API_KEY', model: process.env.TTS_MODEL || 'openai/gpt-4o-mini-tts-2025-12-15', voiceMap: CLOUD_VOICE_IDS },
        { id: 'omni', name: 'OmniVoice legacy local server (deprecated path)', install: 'python -m omnivoice_server --port 8880 (TTS_SERVER_URL / OMNIVOICE_URL)', needsKey: 'none' },
      ],
      chatterboxVenv: { path: chatterboxVenv, installed: exists(chatterboxVenv) },
      voiceDir: { path: voiceDir, installed: exists(voiceDir) },
      pkusegDir: { path: pkusegDir, installed: exists(pkusegDir) },
      live: chatterboxLive,
    },
    image: {
      engine: 'ComfyUI (separate git clone, git-ignored)',
      workflow: process.env.COMFYUI_WORKFLOW_PATH || path.join(SERVER_ROOT, 'workflows', 'flux_klein_t2i.json'),
      note: 'Bundled workflow is SDXL (CheckpointLoaderSimple → juggernautXL_ragnarok.safetensors) despite flux_klein_t2i.json filename',
      comfyPath: { path: comfyPath, hasMainPy: exists(path.join(comfyPath, 'main.py')) },
      comfyPython: { path: comfyVenv, installed: exists(comfyVenv) },
      checkpoints: comfyCheckpoints,
      promptNode: process.env.COMFYUI_PROMPT_NODE_ID || '6',
      seedNode: process.env.COMFYUI_SEED_NODE_ID || '13',
      seedKey: process.env.COMFYUI_SEED_INPUT_KEY || 'seed',
      env: { COMFYUI_BASE_URL: process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188', COMFYUI_LOW_VRAM: process.env.COMFYUI_LOW_VRAM ?? 'true', COMFYUI_TIMEOUT_MS: process.env.COMFYUI_TIMEOUT_MS || '600000' },
      live: comfyLive,
    },
    music: {
      engine: 'ACE-Step 1.5 via ComfyUI audio nodes (local)',
      files: musicFiles,
      setup: 'artifacts/comfy-venv Python → node server/scripts/setup-local-music.py (writes repo ComfyUI/models; copy to external COMFYUI_PATH if used)',
    },
    presenter: {
      note: 'Requires SEPARATE custom MuseTalk-Demo app (app/ wrapper). Upstream MuseTalk clone alone is NOT enough.',
      root: { path: museTalkRoot, installed: exists(path.join(museTalkRoot, 'app', 'musetalk_service.py')) },
      python: { path: process.env.MUSETALK_PYTHON || '(miniconda3/envs/musetalk-demo/python.exe lookup)', installed: exists(process.env.MUSETALK_PYTHON || '') },
      env: { MUSETALK_ROOT: process.env.MUSETALK_ROOT || '(unset)', MUSETALK_PYTHON: process.env.MUSETALK_PYTHON || '(unset)' },
    },
    editing: {
      planner: process.env.EDITING_PLANNER_MODEL || process.env.GEMINI_EDIT_MODEL || 'gemini-3.6-flash',
      alignment: 'Saved narration scene boundaries, or estimated scene timing',
      grounding: 'Gemini image detection and crop verification',
      browser: editing.browser || '(Remotion managed browser)',
    },
    ollama: {
      endpoint: 'http://127.0.0.1:11434',
      store: { path: ollamaStore, installed: exists(ollamaStore) },
      live: ollamaLive,
      models: ollamaModels,
    },
    storage: {
      dataDir: { path: dataDir, installed: exists(dataDir) },
      hfCache: { path: hfCache, installed: exists(hfCache) },
      voices: { path: voiceDir, installed: exists(voiceDir) },
      pkuseg: { path: pkusegDir, installed: exists(pkusegDir) },
      clientSecret: exists(path.join(dataDir, 'client_secret.json')),
      youtubeToken: exists(path.join(dataDir, 'youtube-token.json')),
      accountsDir: exists(path.join(dataDir, 'accounts')),
    },
    tools: {
      node: process.version,
      ffmpeg: toolVersion('ffmpeg', ['-version']),
      ffprobe: toolVersion('ffprobe', ['-version']),
      python310: toolVersion('py', ['-3.10', '--version']),
      python312: toolVersion('py', ['-3.12', '--version']),
    },
    envMatrix,
    envKeyDiff,
    apiKeys: keyStatus(),
    envFile: {
      path: path.join(SERVER_ROOT, '.env'),
      exists: exists(path.join(SERVER_ROOT, '.env')),
      template: '.env.example (committed) → copy to server/.env (git-ignored, never commit)',
    },
    gitNotes: {
      committed: ['source code', '.env.example', 'server/workflows/*.json', 'server/chatterbox/setup.ps1 + prefetch.py', 'server/scripts/setup-local-music.py', 'docs/NEW_PC_SETUP.md'],
      ignoredNotInGit: ['ComfyUI/', 'artifacts/', 'server/chatterbox/.venv/', 'server/.env + .env', 'server/data/generated|output|rendered|voices|model-cache|accounts|music|sfx|*.json tokens', 'C:/Users/<you>/.cache/huggingface/hub/models--ResembleAI--chatterbox', 'C:/Users/<you>/.ollama/models', 'external C:/AI/MuseTalk-Demo', 'node_modules/', 'browser localStorage (openrouter_key, UI state)'],
    },
    newPcChecklist: [
      '1. Install Git, Node 24.x, Python 3.10 (Chatterbox) + 3.12 (ComfyUI), FFmpeg+ffprobe, Ollama, NVIDIA driver — see docs/NEW_PC_SETUP.md §3',
      '2. git clone <your-repo-url> + npm ci + npm ci --prefix server, then copy .env.example → server/.env and fill absolute paths for THIS PC',
      '3. ollama pull qwen3.5:4b (scripts + editing, no key)',
      '4. npm run setup:tts (Chatterbox V3 local voice, first run downloads GBs) — set CHATTERBOX_DEVICE=cpu for CPU-only PCs',
      '5. Clone ComfyUI separately + comfy-venv + SDXL checkpoint juggernautXL_ragnarok.safetensors → ComfyUI/models/checkpoints',
      '6. Run server/scripts/setup-local-music.py with comfy-venv Python for ACE-Step music weights',
      '7. Paste server API keys into server/.env (GEMINI/OPENCODE/GROQ/OPENROUTER); paste browser OpenRouter key in app Settings (localStorage, per-PC)',
      '8. Transfer or reinstall MuseTalk-Demo app + conda env only if you need AI Presenter; otherwise leave it off',
      '9. npm run build:all + npm test, then npm run dev; verify /api/health, /api/generate/models, /api/tts/status, /api/presenter/status',
      '10. Never commit server/.env, server/data tokens, model weights, or venvs — they are git-ignored by design',
    ],
  });
});
