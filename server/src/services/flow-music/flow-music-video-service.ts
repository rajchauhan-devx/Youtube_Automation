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
import { analyzeBeats, type BeatAnalysis } from './beat-detector.js';
import { alignLyricsToAudio, type LyricAlignmentResult } from './lyric-aligner.js';
import {
  extractAudioId3Lyrics,
  transcribeAudioLyricsWithGemini,
} from './audio-metadata.js';
import {
  normalizeBeatEditOptions,
  snapScenesToBeats,
  computeSceneBeatEvents,
  buildPunchZoomTerm,
  buildFlashEnableExpr,
  buildShakeRotateExpr,
  buildBeatKaraokeAssSubtitles,
  getBeatEditProfile,
  type BeatEditOptions,
} from './beat-edit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface SongApprovalState {
  scriptId: string;
  approved: boolean;
  approvedAt?: string;
  songUrl: string;
  trackTitle: string;
  /** Rejection loop: keeps feedback so the user can refine lyrics/settings and regenerate. */
  rejected?: boolean;
  rejectedAt?: string;
  rejectNote?: string;
  rejectCount?: number;
}

export interface FlowSceneDefinition {
  line: string;
  caption: string;
  tag?: string;
  duration: number;
  effect: 'zoom-in' | 'zoom-out' | 'pan-up' | 'pan-left';
  prompt: string;
  /** AI-decided lyric section type (hook/dialogue/tension/drop/chant/triumph/finale). */
  sectionType?: string;
  /** AI-decided shot/image type (close-up/wide/aerial/cosmic/silhouette/monumental...). */
  imageType?: string;
}

export interface FlowMusicStudioState {
  scriptId: string;
  title: string;
  prompt: string;
  lyrics: string;
  lyricsMode: 'custom' | 'instrumental' | 'ai';
  language?: 'auto' | 'hi' | 'en' | 'instrumental';
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

export type FlowVideoFormat = 'shorts' | 'long' | 'both';

export interface FlowVideoJob {
  id: string;
  scriptId: string;
  state: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  stage: string;
  progress: number;
  approved: boolean;
  images: { line: string; prompt: string; filename: string; url: string }[];
  videoFormat?: FlowVideoFormat;
  shortsVideoUrl?: string;
  longVideoUrl?: string;
  shortsPath?: string;
  longPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  /** Beat map summary from the approved audio (beat-synced editing). */
  beats?: {
    bpm: number;
    beatCount: number;
    downbeatCount: number;
    dropCount: number;
    duration: number;
    reliable: boolean;
  };
  /** The beat-edit settings used for this render. */
  editOptions?: BeatEditOptions;
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
    language: 'auto',
    mood: '',
    theme: '',
    vocalProfile: '',
    sfxBooms: false,
    sfxRisers: false,
    dholPercussion: false,
    brassSwells: false,
    duration: 60,
    bpm: 110,
    producerModel: 'Google Lyria / Flow Music',
    imageOnlyReel: true,
    letterboxBanner: '',
    vfxParticles: false,
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
  const previous = getSongApproval(scriptId);
  const state: SongApprovalState = {
    scriptId: safeId,
    approved,
    approvedAt: approved ? new Date().toISOString() : undefined,
    songUrl: songUrl || '',
    trackTitle: trackTitle || (songUrl ? 'Approved Audio Track' : ''),
  };
  if (approved) {
    // Approving clears any prior rejection
    state.rejected = false;
    state.rejectNote = undefined;
    state.rejectedAt = undefined;
    state.rejectCount = previous.rejectCount || 0;
  } else {
    // Revoking keeps the reject history intact
    state.rejectCount = previous.rejectCount || 0;
  }
  approvalMap.set(safeId, state);

  const approvalFile = path.join(flowMusicDataDir(), `approval_${safeId}.json`);
  fs.mkdirSync(path.dirname(approvalFile), { recursive: true });
  fs.writeFileSync(approvalFile, JSON.stringify(state, null, 2), 'utf8');

  return state;
}

/**
 * Explicitly rejects the current track with an optional refinement note.
 * The note is surfaced to the UI ("Rejected — refine lyrics/settings and regenerate")
 * and can be folded back into the next generation attempt as feedback.
 */
export function rejectSong(
  scriptId: string,
  opts: { note?: string; songUrl?: string; trackTitle?: string } = {}
): SongApprovalState {
  const safeId = sanitizeSegment(scriptId) || 'flow_studio_custom';
  const previous = getSongApproval(scriptId);
  const note = (opts.note || '').trim();
  const state: SongApprovalState = {
    scriptId: safeId,
    approved: false,
    songUrl: opts.songUrl || previous.songUrl || '',
    trackTitle: opts.trackTitle || previous.trackTitle || '',
    rejected: true,
    rejectedAt: new Date().toISOString(),
    rejectNote: note || undefined,
    rejectCount: (previous.rejectCount || 0) + 1,
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

// Natural painterly style — avoids the over-processed "AI image" look.
// Uses traditional Indian miniature painting and classical illustration aesthetics.
const HD_CINEMATIC_STYLE =
  'traditional Indian painting style, warm earthy pigments, hand-painted brush texture, natural dramatic lighting, rich warm golds and deep reds, painterly depth, no digital gloss, no watermarks, no text';
const HD_MYTHOLOGY_STYLE =
  'classical Ramayana illustration style, warm hand-painted tones, natural ochre and crimson palette, oil-on-canvas texture, dramatic raking light, authentic mythological aesthetic, no watermarks, no text';

// 8 HD scenes for Hanuman's FIRST VISIT to Lanka (Lanka Dahan — ocean leap, search for Sita, Lanka ablaze)
export const HANUMAN_LANKA_DAHAN_SCENE_DEFINITIONS: FlowSceneDefinition[] = [
  {
    line: 'हनुमान का महासागर लांघना — रामकाज के लिए',
    caption: 'हनुमान का महासागर लांघना',
    tag: '[Ocean Leap · Opening]',
    duration: 8,
    effect: 'pan-up',
    prompt:
      `Heroic low-angle wide shot of Lord Hanuman leaping powerfully across a vast dark ocean at dusk — muscular monkey form with long curled tail, golden crown and crimson dhoti, NO wings, NO feathers, carried only by divine vayu-putra wind power, body radiating warm golden aura, distant rocky Lanka island silhouetted on the horizon, churning waves below lit orange by setting sun, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'सुरसा और मैनाक — देवों की परीक्षा',
    caption: 'देवों की परीक्षा — आगे बढ़ते हनुमान',
    tag: '[Divine Test]',
    duration: 8,
    effect: 'zoom-in',
    prompt:
      `Dramatic scene of Lord Hanuman — monkey warrior with long tail, golden ornaments, NO wings, NO feathers — leaping by divine strength past a gigantic serpentine sea goddess Surasa rising from the storm-tossed ocean, moonlit clouds parting around his blazing golden form, showers of divine blessings raining from above, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'लंका नगरी — रावण की स्वर्ण सभा',
    caption: 'लंका नगरी — स्वर्णिम महल',
    tag: '[Golden Lanka · Establishing]',
    duration: 9,
    effect: 'pan-left',
    prompt:
      `Sweeping wide-angle painting of the legendary golden city of Lanka seen at night, towering multi-tiered palaces gleaming like molten gold, tall fortress walls guarded by demon sentinels carrying flaming torches, moonlit ocean surrounding the island, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'अशोक वाटिका — माँ सीता की खोज',
    caption: 'अशोक वाटिका में माँ सीता',
    tag: '[Ashok Vatika · Emotion]',
    duration: 10,
    effect: 'zoom-in',
    prompt:
      `Tender intimate scene inside a lush moonlit garden — a sorrowful noble queen seated under an ancient ashoka tree, surrounded by demon guards, a small glowing figure watching from above among the leaves, warm golden divine light filtering through the canopy, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'अक्षकुमार वध — हनुमान का प्रताप',
    caption: 'अक्षकुमार वध — रण भूमि',
    tag: '[Battle Surge]',
    duration: 8,
    effect: 'zoom-out',
    prompt:
      `Dynamic battle painting of a mighty divine monkey warrior standing victorious among fallen demon warriors on the red-tinged courtyard of Lanka palace, iron mace raised high, dark smoke curling against a blood-orange sky, fierce determined expression, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'रावण दरबार — नीति का उपदेश',
    caption: 'रावण दरबार — हनुमान का साहस',
    tag: '[Royal Confrontation]',
    duration: 9,
    effect: 'zoom-in',
    prompt:
      `Dramatic throne-room scene of a fearless divine monkey warrior standing proudly before a ten-headed demon king seated on a jewelled throne, flames lighting the ornate columned hall, the warrior's posture radiating calm fearlessness, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'लंका दहन — अग्नि का प्रकोप',
    caption: 'लंका दहन — जय श्री राम!',
    tag: '[Lanka Burns · Climax]',
    duration: 10,
    effect: 'zoom-out',
    prompt:
      `Epic wide painting of the golden city of Lanka engulfed in roaring orange and crimson flames at night, a divine monkey warrior silhouetted against the blazing inferno as his tail sets the towers alight, sparks and embers swirling across a smoke-filled sky, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'वापसी — राम जी की भक्ति में',
    caption: 'जय श्री राम — भक्ति का उत्सव',
    tag: '[Return · Triumph]',
    duration: 9,
    effect: 'pan-up',
    prompt:
      `Radiant dawn seascape of victorious Lord Hanuman — muscular monkey warrior with long curled tail, golden crown, crimson dhoti, NO wings, NO feathers — leaping triumphantly back across the ocean toward the mainland by divine vayu power, golden morning light breaking on the horizon, divine aura surrounding his wingless form, waves below shimmering in first light, ${HD_MYTHOLOGY_STYLE}`,
  },
];

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
      `Dynamic high-speed aerial vista of Lord Hanuman — muscular monkey warrior with long curled tail, golden crown and crimson dhoti, NO wings, NO feathers, wingless — soaring like a blazing comet high above the churning emerald ocean at night by divine vayu power, golden shockwave rings carving through storm clouds, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'हनुमान अतुलितबलधामम्...',
    caption: 'हनुमान अतुलितबलधामम्...',
    tag: '[Lifting Dronagiri]',
    duration: 9,
    effect: 'zoom-in',
    prompt:
      `Majestic wide shot of radiant Lord Hanuman — muscular monkey warrior with curled tail, golden ornaments, NO wings, NO feathers, wingless — hovering in the star-strewn night sky while effortlessly lifting the colossal craggy Dronagiri mountain overhead on one palm, glowing emerald and golden Sanjeevani medicinal herbs illuminating rugged cliffside waterfalls, ${HD_MYTHOLOGY_STYLE}`,
  },
  {
    line: 'हनुमान महाकाल शंभोरावतारः...',
    caption: 'हनुमान महाकाल शंभोरावतारः...',
    tag: '[Mahakal Rudra Avatar]',
    duration: 10,
    effect: 'zoom-out',
    prompt:
      `Awe-inspiring cosmic fantasy scene of Lord Hanuman in his fierce Rudra Mahakal avatar — mighty vanara form with long tail, NO wings, NO feathers — standing between the dark earth and rising dawn sun, glowing divine trident aura and sacred Rudraksha beads around chest and arms, coronal solar flares silhouetting his mighty wingless form, ${HD_MYTHOLOGY_STYLE}`,
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
 * Rigorously enforces authentic canonical Hindu mythological character integrity and
 * classical Indian devotional aesthetics, preventing model distortions on sacred deities.
 */
export function sanitizeCanonicalMythologyPrompt(rawPrompt: string): string {
  let prompt = String(rawPrompt || '').trim();
  if (!prompt) return prompt;

  // 1. Remove unwanted modern or inappropriate style keywords
  prompt = prompt.replace(
    /\b(?:graphic\s+novel|comic\s+book|cartoon|anime|manga|3d\s+render|octane\s+render|cgi|unreal\s+engine|superhero|modern|photorealistic|hyperrealistic)\b/gi,
    'classical devotional painting'
  );

  // 2. Lord Hanuman Canonical Integrity
  const isHanuman = /hanuman|bajrangbali|anjaneya|maruti|pawanputra|mahaveer|kesarinandan|हनुमान|बजरंगबली|वानर|बजरंगी|मारुति/i.test(prompt);
  if (isHanuman) {
    // Aggressively remove any reference to wings, feathers, angelic appendages or bird hybrids
    prompt = prompt.replace(/\b(?:with\s+)?(?:enormous\s+|golden\s+|feathered\s+|giant\s+|angelic\s+|eagle\s+|majestic\s+|seraphic\s+)?wings?(?:\s+of\s+wind)?\b/gi, 'divine vayu wind power');
    prompt = prompt.replace(/\b(?:bird|angel|eagle|avian)\s+feathers?\b/gi, '');
    prompt = prompt.replace(/\bfeathers?\b/gi, '');
    prompt = prompt.replace(/\bfeathered\b/gi, '');
    prompt = prompt.replace(/\bdemonic\s+horns?\b/gi, '');
    prompt = prompt.replace(/\bfangs?\b/gi, '');

    if (!/no wings/i.test(prompt)) {
      prompt = `${prompt}, Lord Hanuman as sacred divine Vanara monkey warrior with long curled tail, golden crown and crimson dhoti, strictly NO wings, NO feathers, wingless divine form propelled purely by divine vayu wind power`;
    }
  }

  // 3. Lord Rama Canonical Integrity
  const isRama = /(?:\b|_)(?:rama|ram|shree\s+ram|sri\s+ram|raghunath|raghav|ramachandra|sita\s+ram|siya\s+ram)(?:\b|_)|श्री\s*राम|प्रभु\s*राम|रघुनाथ|राघव|रामचंद्र/i.test(prompt);
  if (isRama) {
    prompt = prompt.replace(/\b(?:thick\s+|heavy\s+)?(?:beard|mustache|facial\s+hair)\b/gi, 'clean-shaven noble face');
    prompt = prompt.replace(/\b(?:angry|ferocious|wrathful)\s+(?:face|expression)\b/gi, 'serene majestic expression');

    if (!/shyama|blue-tinted|kodanda/i.test(prompt)) {
      prompt = `${prompt}, Lord Rama depicted with serene lotus-eyes, gentle noble smile, divine blue-tinted shyama complexion, royal golden mukut (crown), yellow silk pitambara dhoti, sacred Janeu thread, holding sacred Kodanda bow, strictly clean-shaven noble royal countenance`;
    }
  }

  // 4. Mata Sita Canonical Integrity
  const isSita = /\b(?:sita|seeta|janaki|vaidehi|maithili)\b|सीता|माता\s*सीता|जानकी|वैदेही/i.test(prompt);
  if (isSita) {
    prompt = prompt.replace(/\b(?:revealing|seductive|modern|western)\b/gi, 'traditional modest');
    if (!/traditional.*saree|auspicious/i.test(prompt)) {
      prompt = `${prompt}, Mata Sita with queenly grace, divine purity and noble dignity, dressed in traditional Vedic auspicious saree and sacred ornaments (maang tikka, bangles)`;
    }
  }

  // 5. Ravana Canonical Integrity
  const isRavana = /\b(?:ravan|ravana|dashanan|dasanana|lankapati)\b|रावण|दशानन|लंकपति/i.test(prompt);
  if (isRavana) {
    if (!/ten-headed|dashanana/i.test(prompt)) {
      prompt = `${prompt}, ten-headed demon king Ravana in ornate golden armor, majestic towering dark warrior king with ten crowned heads`;
    }
  }

  // 6. Lord Shiva Canonical Integrity
  const isShiva = /\b(?:shiva|mahadev|rudra|shankar|bholenath|nilakantha)\b|शिव|महादेव|रुद्र|शंकर|भोलेनाथ/i.test(prompt);
  if (isShiva) {
    if (!/trishula|crescent\s+moon/i.test(prompt)) {
      prompt = `${prompt}, Lord Shiva with matted jata locks holding crescent moon and sacred Ganga, sacred ash and Rudraksha beads, holding sacred Trishula and Damru, serene meditative cosmic aura`;
    }
  }

  // 7. Ensure traditional classical Indian painting aesthetic
  if (!/raja ravi varma|ramayana illustration style|classical indian/i.test(prompt)) {
    prompt = `${prompt}, ${HD_MYTHOLOGY_STYLE}`;
  }

  return prompt;
}

export function sanitizeHanumanPrompt(rawPrompt: string): string {
  return sanitizeCanonicalMythologyPrompt(rawPrompt);
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
  const effectivePrompt = sanitizeCanonicalMythologyPrompt(opts.prompt);
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
            prompt: effectivePrompt,
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
            prompt: effectivePrompt,
            seed: opts.seed,
            preset: 'high',
            aspectRatio,
            force2dStylized: false,
          });
        } else {
          const localResult = await generateImage({
            scriptId: tempScriptId,
            index,
            prompt: effectivePrompt,
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

/** Optional per-scene beat events used to build the "cool edit" effects. */
export interface SceneBeatFilterEvents {
  punches: number[];
  flashes: number[];
  shakes: number[];
  options: BeatEditOptions;
}

function appendBeatEffects(filters: string[], events?: SceneBeatFilterEvents): void {
  if (!events || !events.options.enabled) return;
  const profile = getBeatEditProfile(events.options.intensity);
  if (events.options.shakeDrops && events.shakes.length > 0) {
    const shake = buildShakeRotateExpr(events.shakes, profile);
    if (shake) filters.push(`rotate=a='${shake}':ow=iw:oh=ih:c=black`);
  }
  if (events.options.flashes && events.flashes.length > 0) {
    const enable = buildFlashEnableExpr(events.flashes);
    if (enable) filters.push(`eq=brightness=${profile.flashBrightness}:saturation=1.18:enable='${enable}'`);
  }
}

/** Builds an oversampled Lanczos Ken Burns filter for true full-frame 9:16 portrait (1080x1920) Shorts scenes. */
export function buildShortsSceneFilter(dur: number, zoomIn: boolean, beatEvents?: SceneBeatFilterEvents): string {
  const numFrames = dur * 30;
  const baseZoom = zoomIn ? `'min(zoom+0.00055,1.14)` : `'max(1.14-0.00055*on,1.0)`;
  const profile = beatEvents && beatEvents.options.enabled ? getBeatEditProfile(beatEvents.options.intensity) : null;
  const punchTerm =
    profile && beatEvents && beatEvents.options.punchZoom && beatEvents.punches.length > 0
      ? buildPunchZoomTerm(beatEvents.punches, profile)
      : '';
  const zoomExpr = `${baseZoom}${punchTerm}'`;

  const fgFilters = [
    `scale=2160:3840:flags=lanczos:force_original_aspect_ratio=increase`,
    `unsharp=5:5:0.45:3:3:0.2`,
    `eq=contrast=1.06:saturation=1.12:brightness=0.0`,
    `colorbalance=rs=0.03:gs=0.0:bs=-0.02`,
    `zoompan=z=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${numFrames}:s=1080x1920:fps=30`,
  ];
  appendBeatEffects(fgFilters, beatEvents);
  fgFilters.push(`format=yuv420p`);
  return `[0:v]${fgFilters.join(',')}[out]`;
}

/** Builds a 4K-oversampled Lanczos Ken Burns filter for 16:9 widescreen scenes. */
export function buildLongSceneFilter(dur: number, zoomIn: boolean, width = 1920, height = 1080, beatEvents?: SceneBeatFilterEvents): string {
  const numFrames = dur * 30;
  const baseZoom = zoomIn ? `'min(zoom+0.00055,1.14)` : `'max(1.14-0.00055*on,1.0)`;
  const profile = beatEvents && beatEvents.options.enabled ? getBeatEditProfile(beatEvents.options.intensity) : null;
  const punchTerm =
    profile && beatEvents && beatEvents.options.punchZoom && beatEvents.punches.length > 0
      ? buildPunchZoomTerm(beatEvents.punches, profile)
      : '';
  const zoomExpr = `${baseZoom}${punchTerm}'`;

  const filters = [
    `scale=3840:2160:flags=lanczos:force_original_aspect_ratio=increase`,
    `unsharp=5:5:0.5:3:3:0.25`,
    `eq=contrast=1.06:saturation=1.12:brightness=0.0`,
    `colorbalance=rs=0.03:gs=0.0:bs=-0.02`,
    `zoompan=z=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${numFrames}:s=${width}x${height}:fps=30`,
  ];
  appendBeatEffects(filters, beatEvents);
  filters.push(`format=yuv420p`);
  return filters.join(',');
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
    '-preset', 'fast',
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
  bannerText?: string,
  alignedLyrics?: LyricAlignmentResult | null
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
    'Style: Banner,Georgia,54,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1,2,8,20,20,140,1',
    'Style: Caption,Nirmala UI,56,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,3,5,40,40,0,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const cleanBanner = typeof bannerText === 'string' ? bannerText.trim() : '';
  if (cleanBanner) {
    lines.push(`Dialogue: 0,0:00:00.00,${formatAssTime(totalDur)},Banner,,0,0,0,,${escapeAssText(cleanBanner)}`);
  }

  if (alignedLyrics && alignedLyrics.phrases.length > 0) {
    for (const phrase of alignedLyrics.phrases) {
      const wrapped = wrapAssCaption(phrase.text, 34);
      if (wrapped) {
        lines.push(`Dialogue: 1,${formatAssTime(phrase.start)},${formatAssTime(phrase.end)},Caption,,0,0,0,,${wrapped}`);
      }
    }
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return;
  }

  const useHanumanHighlights = isHanumanPresetScenes(scenes);
  let currentTime = 0;
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = Math.max(2, sc.duration || 8);
    const startTime = currentTime;
    const endTime = currentTime + dur;
    currentTime = endTime;

    const text = wrapAssCaption(sc.caption || sc.line, 34);
    if (text) {
      lines.push(`Dialogue: 1,${formatAssTime(startTime)},${formatAssTime(endTime)},Caption,,0,0,0,,${text}`);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

export function buildLongAssSubtitles(
  scenes: FlowSceneDefinition[],
  _totalDur: number,
  filePath: string,
  alignedLyrics?: LyricAlignmentResult | null
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

  if (alignedLyrics && alignedLyrics.phrases.length > 0) {
    for (const phrase of alignedLyrics.phrases) {
      const wrapped = wrapAssCaption(phrase.text, 64);
      if (wrapped) {
        lines.push(`Dialogue: 1,${formatAssTime(phrase.start)},${formatAssTime(phrase.end)},LongCaption,,0,0,0,,${wrapped}`);
      }
    }
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return;
  }

  let currentTime = 0;
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = Math.max(2, sc.duration || 8);
    const startTime = currentTime;
    const endTime = currentTime + dur;
    currentTime = endTime;

    const text = wrapAssCaption(sc.caption || sc.line, 64);
    if (text) {
      lines.push(`Dialogue: 1,${formatAssTime(startTime)},${formatAssTime(endTime)},LongCaption,,0,0,0,,${text}`);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

const EFFECTS: Array<FlowSceneDefinition['effect']> = ['zoom-in', 'pan-up', 'zoom-out', 'pan-left'];

/**
 * Heuristic section classifier used as the deterministic fallback: it decides
 * what each lyric part "is" so the right image type & edit energy follow it.
 */
function classifyLyricSection(line: string): { sectionType: string; imageType: string; effect: FlowSceneDefinition['effect'] } {
  const lower = line.toLowerCase();
  const isChant = /[\u0900-\u097F]*(जय|राम|ॐ|om|jay|jai|chant|मंत्र|mantra)/.test(lower) || /\.\.\.|…/.test(line);
  const isDrop = /मार दूंगा|रोअर|roar|तूफान|storm|war|युद्ध|लड़ा|attack|anger|क्रोध/.test(lower) || line.includes('!');
  const isTriumph = /जय|victory|win|light|sunrise|प्रकाश|जीत/.test(lower);
  const isQuestion = line.includes('?') || /अगर|क्या|कब|why|how/.test(lower);

  if (isDrop) return { sectionType: 'drop', imageType: 'monumental low-angle hero shot with explosive energy', effect: 'zoom-in' };
  if (isTriumph) return { sectionType: 'triumph', imageType: 'radiant wide sunrise shot with divine light rays', effect: 'zoom-out' };
  if (isChant) return { sectionType: 'chant', imageType: 'cosmic wide devotional establishing shot', effect: 'pan-left' };
  if (isQuestion) return { sectionType: 'hook', imageType: 'tense intimate close-up on worried faces', effect: 'zoom-in' };
  return { sectionType: 'dialogue', imageType: 'cinematic medium shot with dramatic side lighting', effect: 'pan-up' };
}

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
 * Detects if the given topic/title/lyrics refers to Hanuman's first Lanka visit (Lanka Dahan).
 */
function isLankaDahanTopic(topic: string, rawSource: string): boolean {
  const combined = `${topic} ${rawSource}`.toLowerCase();
  return (
    /lanka\s*dahan/i.test(combined) ||
    /लंका\s*दहन/i.test(combined) ||
    /lankadahan/i.test(combined) ||
    (/lanka/i.test(combined) && /hanuman|हनुमान/i.test(combined) && /first|pehli|पहली|pratham/i.test(combined)) ||
    (/ashok\s*vatika|अशोक\s*वाटिका/i.test(combined)) ||
    (/sita.*search|sita.*khoj|sitaji/i.test(combined) && /hanuman|हनुमान/i.test(combined))
  );
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

  // Auto-detect Lanka Dahan topic when no explicit lyrics were provided
  if (rawLines.length === 0 && isLankaDahanTopic(topic, rawSource)) {
    const target = opts.targetDuration || 60;
    return fitScenesToAudioDuration(HANUMAN_LANKA_DAHAN_SCENE_DEFINITIONS, target);
  }

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

  const fallbackScenes: FlowSceneDefinition[] = beats.map((line, i) => {
    const classified = classifyLyricSection(line);
    return {
      line,
      caption: line.replace(/^[^:]{1,24}:\s*/, '').replace(/^["“]|["”]$/g, ''),
      tag: `[${classified.sectionType.charAt(0).toUpperCase()}${classified.sectionType.slice(1)} · Scene ${i + 1}]`,
      duration: perScene,
      effect: classified.effect,
      sectionType: classified.sectionType,
      imageType: classified.imageType,
      prompt: `${classified.imageType} illustrating "${line}" within theme "${topic}", mood "${mood}", dynamic composition, dramatic lighting, ${HD_MYTHOLOGY_STYLE}`,
    };
  });

  const apiKey = !opts.offlineOnly ? getGeminiApiKey() : '';
  if (!apiKey || rawLines.length === 0) {
    return fallbackScenes.map((sc) => ({
      ...sc,
      prompt: sanitizeCanonicalMythologyPrompt(sc.prompt),
    }));
  }

  try {
    const response = await geminiChat(apiKey, {
      temperature: 0.35,
      max_tokens: 3072,
      json: true,
      signal: AbortSignal.timeout(20000),
      messages: [
        {
          role: 'system',
          content: `You are an elite storyboard director and sacred iconography scholar for Indian devotional & epic music videos (Ramayana, Mahabharata, Shiva Purana, Krishna Leela).

YOUR WORKFLOW:
1. FIRST, thoroughly read through the FULL lyrics from beginning to end to understand the complete narrative arc, the sacred deities, their actions, and the emotional climax.
2. SECOND, create chronologically progressive visual scenes that directly illustrate what is happening in the song at that moment.

SACRED CANONICAL CHARACTER RULES (NEVER DISTORT OR INVENT CHARACTER TRAITS):
- Lord Hanuman (बजरंगबली / पवनपुत्र):
  * Form: Sacred divine Vanara (monkey warrior) form with radiant noble face, powerful muscular physique, long curled tail.
  * Attire: Golden royal crown (mukut), crimson or saffron/ochre dhoti (langot/pitambar), golden armlets and kundal earrings, sacred Janeu thread across torso, radiating warm golden divine aura.
  * STRICT NEGATIVE: NEVER give Hanuman wings, feathers, angelic cherub wings, bird appendages, demonic fangs or horns. He flies purely by divine Vayu wind power (anila-putra).
- Lord Rama (श्री राम):
  * Form: Maryada Purushottam divine avatar of Vishnu, serene lotus-like eyes (kamalnayan), gentle noble smile, compassionate majestic aura.
  * Complexion: Soft blue-tinted shyama complexion (cloud-colored / meghashyama).
  * Attire: Royal golden mukut (crown), yellow silk pitambara dhoti, pearl garland, sacred Janeu thread.
  * Weapons: Wields the divine Kodanda longbow in left hand, quiver of arrows on back.
  * STRICT NEGATIVE: Strictly clean-shaven noble royal face with NO beard, NO mustache, NO wrathful demonic distortion.
- Mata Sita (माँ सीता):
  * Form: Divine incarnation of Goddess Lakshmi, queenly grace, radiant purity and noble dignity.
  * Attire: Traditional auspicious Vedic saree, sacred traditional ornaments (maang tikka, bangles, nose ring), modest and noble demeanour.
  * STRICT NEGATIVE: NO modern, revealing or westernized clothing.
- Ravana (दशानन रावण):
  * Form: Mighty ten-headed (Dashanana) demon emperor of Lanka, towering dark warrior king with ten crowned heads, ornate golden royal armor, majestic Lankan throne hall.
- Lord Shiva (महादेव):
  * Form: Divine ascetic with matted jata locks holding crescent moon and sacred Ganga, blue throat (Neelkantha), sacred Rudraksha beads, holding Trishula and Damru, serene cosmic stillness.
- Lord Krishna (श्री कृष्ण):
  * Form: Luminous dark-blue complexion, peacock feather in golden crown, gentle captivating smile, yellow silk pitambar, holding the sacred divine Bansuri.

ARTISTIC STYLE:
- Traditional classical Indian devotional oil painting style (Raja Ravi Varma masterwork & Gita Press Ramayana classical illustration).
- Warm earthy hand-painted pigments (ochre, vermilion, deep crimson, lapis lazuli indigo, burnished gold).
- Natural dramatic lighting (golden hour sunrise/sunset, warm torchlight, mystical divine aura).
- Oil-on-canvas texture, authentic devotional reverence.
- STRICT NEGATIVE: NEVER photorealistic CGI, NEVER 3D render, NEVER cartoon, NEVER anime, NEVER comic book / graphic novel.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruction: `First, read and analyze these complete lyrics thoroughly. Then create exactly ${beats.length} chronological visual scenes that faithfully visualize the story told in the lyrics while strictly obeying the canonical character rules.`,
            topic,
            mood,
            theme: opts.theme || topic,
            totalSongDurationSeconds: totalTarget,
            fullSongLyrics: rawSource,
            sceneBeats: beats,
            formatRequirements: [
              "Output a JSON array of objects matching each scene in chronological order.",
              "Each object must have:",
              "  - 'line': The specific lyric line from the song.",
              "  - 'caption': Concise lyric subtitle for display.",
              "  - 'sectionType': hook | dialogue | battle | tension | devotion | triumph | climax | finale",
              "  - 'imageType': Specific framing (e.g. 'Heroic low-angle wide shot', 'Tense throne-room confrontation', 'Dynamic leap across stormy ocean', 'Serene radiant dawn seascape')",
              "  - 'visualPrompt': Rich descriptive prompt directly visualizing the specific lyric event while strictly obeying the canonical deity rules."
            ]
          }),
        },
      ],
    });
    const parsed = JSON.parse(response.choices?.[0]?.message?.content || '[]');
    if (Array.isArray(parsed) && parsed.length === beats.length) {
      return beats.map((line, i) => {
        const ai = parsed[i] || {};
        const fallback = fallbackScenes[i];
        const rawPrompt = String(ai.visualPrompt || fallback.prompt).trim();
        const safePrompt = sanitizeCanonicalMythologyPrompt(rawPrompt);
        const sectionType = String(ai.sectionType || fallback.sectionType || 'dialogue').toLowerCase();
        const imageType = String(ai.imageType || fallback.imageType || 'cinematic shot').trim();
        return {
          line,
          caption: String(ai.caption || fallback.caption).trim(),
          tag: `[${sectionType.charAt(0).toUpperCase()}${sectionType.slice(1)} · Scene ${i + 1}]`,
          duration: perScene,
          effect: EFFECTS[i % EFFECTS.length],
          sectionType,
          imageType,
          prompt: safePrompt,
        };
      });
    }
  } catch (err: any) {
    console.warn(`[Flow Music Storyboard] Using deterministic scene builder (${err?.message || 'LLM unavailable'})`);
  }

  return fallbackScenes.map((sc) => ({
    ...sc,
    prompt: sanitizeCanonicalMythologyPrompt(sc.prompt),
  }));
}

/**
 * Resolves the approved audio track path from explicit URL, approval state, or latest audio download.
 */
export function resolveApprovedAudioPath(scriptId: string, explicitSongUrl = ''): string {
  const downloadsDir = flowMusicDownloadsDir();
  const approval = getSongApproval(scriptId);
  const candidateUrl = explicitSongUrl || approval.songUrl || '';

  if (candidateUrl && path.isAbsolute(candidateUrl) && fs.existsSync(candidateUrl) && fs.statSync(candidateUrl).isFile()) {
    return candidateUrl;
  }

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
  aspectRatio?: '9:16' | '16:9';
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

  const job = opts.jobId ? videoJobs.get(opts.jobId) : undefined;
  const targetAspect: '9:16' | '16:9' =
    opts.aspectRatio ||
    (job?.videoFormat === 'shorts'
      ? '9:16'
      : job?.videoFormat === 'long'
        ? '16:9'
        : safeName.includes('shorts')
          ? '9:16'
          : safeName.includes('long')
            ? '16:9'
            : '9:16');

  const seed = Math.floor(Math.random() * 1_000_000) + (opts.index ?? 0) * 37;
  const result = await generateFlowMusicSceneImage({
    prompt: opts.prompt,
    outputPath: imgPath,
    seed,
    aspectRatio: targetAspect,
    index: opts.index ?? 0,
    scriptId: `flow_regen_${Date.now()}`,
  });

  if (opts.jobId) {
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
  /** Video format to produce: 'shorts' (9:16 portrait), 'long' (16:9 widescreen landscape), or 'both'. Defaults to 'shorts'. */
  videoFormat?: FlowVideoFormat;
  aspectRatio?: '9:16' | '16:9';
  /** Beat-synced "cool edit" options (karaoke subtitles, punch zooms, flashes, shakes). */
  beatEdit?: Partial<BeatEditOptions>;
  /** BPM from the Flow Music settings, anchoring beat detection. */
  bpmHint?: number;
  /** Re-use existing scene keyframes when re-rendering for quick subtitle / beat-edit changes. */
  reuseImages?: boolean;
  /** Explicit list of existing keyframe filenames or URLs to reuse. */
  existingImages?: Array<{ filename?: string; url?: string; line?: string; prompt?: string } | string>;
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

  const requestedFormat: FlowVideoFormat =
    opts.videoFormat === 'long' || (opts.videoFormat as string) === 'landscape'
      ? 'long'
      : opts.videoFormat === 'both'
        ? 'both'
        : 'shorts';

  const jobId = `fv_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const job: FlowVideoJob = {
    id: jobId,
    scriptId,
    state: 'running',
    stage: 'Initializing 2K HD scene generation pipeline',
    progress: 5,
    approved: true,
    videoFormat: requestedFormat,
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

    // 1b. Resolve lyrics FIRST so scene planning, visual character prompts, and subtitle alignment
    // all have access to the full, authentic spoken & sung song lyrics.
    const studioDraft = getFlowMusicStudioState();
    const isMatchingStudioDraft = studioDraft.scriptId === scriptId;
    let referenceLyrics = (opts.lyrics || (isMatchingStudioDraft ? studioDraft.lyrics : '') || studioDraft.lyrics || '').trim();
    const metaPath = audioPath.replace(/\.(mp3|wav|m4a|ogg|aac)$/i, '.json');

    if (!referenceLyrics && audioPath) {
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (meta.lyrics) referenceLyrics = String(meta.lyrics).trim();
          else if (meta.transcription) referenceLyrics = String(meta.transcription).trim();
        } catch {}
      }
      if (!referenceLyrics) {
        referenceLyrics = await extractAudioId3Lyrics(audioPath);
      }
      if (!referenceLyrics) {
        job.stage = 'Transcribing sung & spoken lyrics directly from audio with Gemini...';
        job.progress = 5;
        job.updatedAt = new Date().toISOString();
        referenceLyrics = await transcribeAudioLyricsWithGemini(audioPath);
      }
      if (referenceLyrics) {
        try {
          if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            meta.lyrics = referenceLyrics;
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
          }
          saveFlowMusicStudioState({ lyrics: referenceLyrics });
        } catch {}
      }
    }

    // 1c. Beat-synced edit setup — analyze the approved track for beats & drops
    const beatEditOptions = normalizeBeatEditOptions(opts.beatEdit);
    let beatAnalysis: BeatAnalysis | null = null;
    if (beatEditOptions.enabled) {
      job.stage = 'Analyzing beats, downbeats & bass drops from the approved track...';
      job.progress = 8;
      job.updatedAt = new Date().toISOString();
      try {
        beatAnalysis = await analyzeBeats(audioPath, { hintBpm: opts.bpmHint, scriptId });
        job.beats = {
          bpm: beatAnalysis.bpm,
          beatCount: beatAnalysis.beats.length,
          downbeatCount: beatAnalysis.downbeats.length,
          dropCount: beatAnalysis.drops.length,
          duration: beatAnalysis.duration,
          reliable: beatAnalysis.reliable,
        };
        console.log(
          `[Flow Music Beat Edit] ${beatAnalysis.beats.length} beats @ ${beatAnalysis.bpm} BPM, ${beatAnalysis.downbeats.length} downbeats, ${beatAnalysis.drops.length} drops (${beatAnalysis.source})`
        );
      } catch (err: any) {
        console.warn(`[Flow Music Beat Edit] Beat analysis failed, rendering without beat sync: ${err?.message || err}`);
        beatAnalysis = null;
      }
    }
    job.editOptions = beatEditOptions;

    // 2. Resolve scenes (explicit custom scenes -> script/lyrics builder -> persisted draft -> preset)
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
    } else {
      const effectiveTopic =
        opts.title?.trim() ||
        studioDraft.title?.trim() ||
        opts.theme?.trim() ||
        studioDraft.theme?.trim() ||
        (isLankaDahanTopic(opts.title || '', referenceLyrics) ? 'Lanka Dahan' : 'Epic Cinematic Story');

      baseScenes = await buildScenesFromScript({
        lyrics: referenceLyrics,
        scriptText: opts.prompt || studioDraft.prompt,
        topic: effectiveTopic,
        mood: opts.mood || studioDraft.mood,
        theme: opts.theme || studioDraft.theme,
        targetDuration: opts.duration || audioDuration || 60,
      });
    }

    // Snap scene cut boundaries to the beat grid so visual changes land on the music
    let scenes: FlowSceneDefinition[];
    if (beatAnalysis && beatEditOptions.enabled && beatEditOptions.snapCuts && baseScenes.length > 0) {
      const snap = snapScenesToBeats(baseScenes, beatAnalysis, audioDuration);
      scenes = snap.scenes;
      console.log(
        `[Flow Music Beat Edit] Snapped ${snap.snappedBoundaries}/${Math.max(0, baseScenes.length - 1)} scene cuts to the beat grid`
      );
    } else {
      scenes = fitScenesToAudioDuration(baseScenes, audioDuration);
    }

    // Align subtitles to actual vocal timings & pacing inside the approved audio track
    let alignedLyrics: LyricAlignmentResult | null = null;
    const finalLyricsToAlign = referenceLyrics || scenes.map((s) => s.caption || s.line).filter(Boolean).join('\n');
    if (finalLyricsToAlign) {
      job.stage = 'Syncing subtitle speed & word timings to actual vocal audio...';
      job.progress = 12;
      job.updatedAt = new Date().toISOString();
      try {
        alignedLyrics = await alignLyricsToAudio({
          audioPath,
          lyrics: finalLyricsToAlign,
          scriptId,
        });
        console.log(
          `[Flow Music Subtitle Sync] ${alignedLyrics.phrases.length} phrases, ${alignedLyrics.words.length} words aligned (${alignedLyrics.source})`
        );
      } catch (err: any) {
        console.warn(`[Flow Music Subtitle Sync] Alignment failed, using scene fallback: ${err?.message || err}`);
        alignedLyrics = null;
      }
    }
    const bannerText =
      opts.letterboxBanner !== undefined
        ? opts.letterboxBanner
        : studioDraft.letterboxBanner || '';

    job.stage = `Generating ${scenes.length} HD 2K keyframes from your lyrics (AI-chosen shots)...`;
    job.progress = 15;
    job.updatedAt = new Date().toISOString();

    const shouldRenderShorts = requestedFormat === 'shorts' || requestedFormat === 'both';
    const shouldRenderLong = requestedFormat === 'long' || requestedFormat === 'both';
    const isBoth = requestedFormat === 'both';

    // In shorts mode (9:16 portrait), generate native 9:16 portrait frames.
    // In long mode (16:9 landscape), generate native 16:9 widescreen frames.
    // In 'both' mode, generate 9:16 frames for shorts and 16:9 frames for long video.
    const defaultAspect: '9:16' | '16:9' =
      opts.aspectRatio || (requestedFormat === 'long' ? '16:9' : '9:16');

    const imageFiles: string[] = [];
    const shortsImageFiles: string[] = [];
    const longImageFiles: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      checkCancelled();
      const scene = scenes[i];

      if (!isBoth) {
        const imgFilename = `${jobId}_scene_${i}.png`;
        const imgPath = path.join(outDir, imgFilename);

        let reused = false;
        if (opts.reuseImages) {
          let candidatePath: string | null = null;
          if (Array.isArray(opts.existingImages) && opts.existingImages[i]) {
            const item = opts.existingImages[i];
            const raw = typeof item === 'string' ? item : item.filename || item.url || '';
            if (raw) {
              const clean = path.basename(raw.split('?')[0]);
              const p = path.join(outDir, clean);
              if (fs.existsSync(p) && fs.statSync(p).size > 1000) {
                candidatePath = p;
              }
            }
          }
          if (!candidatePath) {
            // Look for any existing recent scene image ending with _scene_${i}.png
            try {
              const files = fs
                .readdirSync(outDir)
                .filter((f) => f.endsWith(`_scene_${i}.png`) && f !== imgFilename)
                .map((f) => ({ name: f, path: path.join(outDir, f), mtime: fs.statSync(path.join(outDir, f)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime);
              if (files.length > 0 && fs.statSync(files[0].path).size > 1000) {
                candidatePath = files[0].path;
              }
            } catch {}
          }

          if (candidatePath) {
            try {
              fs.copyFileSync(candidatePath, imgPath);
              reused = true;
              console.log(
                `[Flow Music Re-Render] Reused keyframe for Scene ${i + 1}/${scenes.length} from ${path.basename(candidatePath)}`
              );
            } catch (err) {
              console.warn(`[Flow Music Re-Render] Could not copy ${candidatePath}:`, err);
            }
          }
        }

        if (!reused) {
          job.stage = `Generating HD Scene ${i + 1}/${scenes.length} (${defaultAspect}): ${scene.line.slice(0, 40)}...`;
          job.progress = 15 + Math.round((i / scenes.length) * 35);
          job.updatedAt = new Date().toISOString();

          const seed = 1008 + i * 42;
          const generated = await generateFlowMusicSceneImage({
            prompt: scene.prompt,
            outputPath: imgPath,
            seed,
            aspectRatio: defaultAspect,
            index: i,
            scriptId: `${jobId}_s${i}`,
          });
          console.log(
            `[Flow Music Image] Scene ${i + 1}/${scenes.length} generated via ${generated.provider} (${generated.model}, ${defaultAspect}, ${Math.round(generated.bytes / 1024)} KB)`
          );
        } else {
          job.stage = `Re-using keyframe for Scene ${i + 1}/${scenes.length}...`;
          job.progress = 15 + Math.round(((i + 1) / scenes.length) * 35);
          job.updatedAt = new Date().toISOString();
        }

        imageFiles.push(imgPath);

        job.images.push({
          line: scene.line,
          prompt: scene.prompt,
          filename: imgFilename,
          url: `/api/flow-music/videos/${imgFilename}`,
        });
      } else {
        // Dual format: generate 9:16 for shorts and 16:9 for long video
        const shortsImgFilename = `${jobId}_shorts_scene_${i}.png`;
        const shortsImgPath = path.join(outDir, shortsImgFilename);
        const longImgFilename = `${jobId}_long_scene_${i}.png`;
        const longImgPath = path.join(outDir, longImgFilename);

        let reusedShorts = false;
        let reusedLong = false;
        if (opts.reuseImages) {
          // Look for dedicated shorts scene image
          try {
            const shortsFiles = fs
              .readdirSync(outDir)
              .filter((f) => (f.endsWith(`_shorts_scene_${i}.png`) || f.endsWith(`_scene_${i}.png`)) && f !== shortsImgFilename)
              .map((f) => ({ path: path.join(outDir, f), mtime: fs.statSync(path.join(outDir, f)).mtimeMs }))
              .sort((a, b) => b.mtime - a.mtime);
            if (shortsFiles.length > 0 && fs.statSync(shortsFiles[0].path).size > 1000) {
              fs.copyFileSync(shortsFiles[0].path, shortsImgPath);
              reusedShorts = true;
            }
          } catch {}

          // Look for dedicated long scene image
          try {
            const longFiles = fs
              .readdirSync(outDir)
              .filter((f) => (f.endsWith(`_long_scene_${i}.png`) || f.endsWith(`_scene_${i}.png`)) && f !== longImgFilename)
              .map((f) => ({ path: path.join(outDir, f), mtime: fs.statSync(path.join(outDir, f)).mtimeMs }))
              .sort((a, b) => b.mtime - a.mtime);
            if (longFiles.length > 0 && fs.statSync(longFiles[0].path).size > 1000) {
              fs.copyFileSync(longFiles[0].path, longImgPath);
              reusedLong = true;
            }
          } catch {}
        }

        if (!reusedShorts) {
          job.stage = `Generating HD Shorts Scene ${i + 1}/${scenes.length} (9:16)...`;
          job.progress = 15 + Math.round((i / scenes.length) * 18);
          job.updatedAt = new Date().toISOString();
          const seedShorts = 1008 + i * 42;
          await generateFlowMusicSceneImage({
            prompt: scene.prompt,
            outputPath: shortsImgPath,
            seed: seedShorts,
            aspectRatio: '9:16',
            index: i,
            scriptId: `${jobId}_s${i}_s`,
          });
        }
        if (!reusedLong) {
          job.stage = `Generating HD Long Scene ${i + 1}/${scenes.length} (16:9)...`;
          job.progress = 15 + Math.round(18 + (i / scenes.length) * 17);
          job.updatedAt = new Date().toISOString();
          const seedLong = 2008 + i * 42;
          await generateFlowMusicSceneImage({
            prompt: scene.prompt,
            outputPath: longImgPath,
            seed: seedLong,
            aspectRatio: '16:9',
            index: i,
            scriptId: `${jobId}_s${i}_l`,
          });
        }

        shortsImageFiles.push(shortsImgPath);
        longImageFiles.push(longImgPath);
        job.images.push({
          line: scene.line,
          prompt: scene.prompt,
          filename: shortsImgFilename,
          url: `/api/flow-music/videos/${shortsImgFilename}`,
        });
      }
    }

    const effectiveShortsImages = isBoth ? shortsImageFiles : imageFiles;
    const effectiveLongImages = isBoth ? longImageFiles : imageFiles;

    checkCancelled();
    const totalDur = scenes.reduce((acc, s) => acc + (s.duration || 8), 0);

    // Precompute scene time ranges for per-scene beat events
    let rangeCursor = 0;
    const sceneRanges = scenes.map((sc) => {
      const start = rangeCursor;
      rangeCursor += sc.duration || 8;
      return { start, end: rangeCursor };
    });
    const sceneBeatEvents = (index: number): SceneBeatFilterEvents | undefined => {
      if (!beatAnalysis || !beatEditOptions.enabled) return undefined;
      const range = sceneRanges[index];
      const events = computeSceneBeatEvents(range.start, range.end, beatAnalysis, beatEditOptions);
      return { ...events, options: beatEditOptions };
    };

    // 3. Render Shorts Video (9:16 vertical - 1080x1920)
    if (shouldRenderShorts) {
      checkCancelled();
      job.stage = beatAnalysis
        ? 'Rendering 9:16 Shorts: Lanczos Ken Burns + beat-synced punch zooms, flashes & captions'
        : 'Rendering 9:16 Shorts Video with Lanczos Ken Burns & synced captions';
      job.progress = shouldRenderLong ? 55 : 60;
      job.updatedAt = new Date().toISOString();

      const shortsFilename = `${jobId}_shorts.mp4`;
      const shortsPath = path.join(outDir, shortsFilename);
      const shortsAssPath = path.join(outDir, `${jobId}_shorts.ass`);
      if (beatAnalysis && beatEditOptions.enabled) {
        buildBeatKaraokeAssSubtitles({
          scenes,
          analysis: beatAnalysis,
          options: beatEditOptions,
          filePath: shortsAssPath,
          format: 'shorts',
          bannerText: bannerText,
          alignedLyrics,
        });
      } else {
        buildShortsAssSubtitles(scenes, totalDur, shortsAssPath, bannerText, alignedLyrics);
      }

      const shortsClipList: string[] = [];

      if (effectiveShortsImages.length === 1) {
        checkCancelled();
        const sc = scenes[0];
        const dur = sc.duration || 8;
        const filter = buildShortsSceneFilter(dur, true, sceneBeatEvents(0));
        const escapedAss = shortsAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        await runFFmpegCommand([
          '-y',
          '-i', effectiveShortsImages[0],
          '-i', audioPath,
          '-filter_complex', `${filter};[out]ass='${escapedAss}'[vout]`,
          '-map', '[vout]',
          '-map', '1:a:0',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '16',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-shortest',
          shortsPath,
        ]);
      } else {
        for (let i = 0; i < effectiveShortsImages.length; i++) {
          checkCancelled();
          const sc = scenes[i];
          const clipFile = path.join(outDir, `${jobId}_shorts_clip_${i}.mp4`);
          const dur = sc.duration || 8;
          const filter = buildShortsSceneFilter(dur, i % 2 === 0, sceneBeatEvents(i));

          await runFFmpegCommand([
            '-y',
            '-i', effectiveShortsImages[i],
            '-filter_complex', filter,
            '-map', '[out]',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '12',
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
      }
      job.shortsPath = shortsPath;
      job.shortsVideoUrl = `/api/flow-music/videos/${shortsFilename}`;
      try { fs.unlinkSync(shortsAssPath); } catch {}
      for (const c of shortsClipList) { try { fs.unlinkSync(c); } catch {} }
    }

    // 4. Render Long Video (16:9 widescreen - 1920x1080)
    if (shouldRenderLong) {
      checkCancelled();
      job.stage = beatAnalysis
        ? 'Rendering 16:9 Long Video with beat-synced cinematic editing'
        : 'Rendering 16:9 Long Video in HD cinematic widescreen presentation';
      job.progress = shouldRenderShorts ? 80 : 60;
      job.updatedAt = new Date().toISOString();

      const longFilename = `${jobId}_long.mp4`;
      const longPath = path.join(outDir, longFilename);
      const longAssPath = path.join(outDir, `${jobId}_long.ass`);
      if (beatAnalysis && beatEditOptions.enabled) {
        buildBeatKaraokeAssSubtitles({
          scenes,
          analysis: beatAnalysis,
          options: beatEditOptions,
          filePath: longAssPath,
          format: 'long',
          bannerText: bannerText,
          alignedLyrics,
        });
      } else {
        buildLongAssSubtitles(scenes, totalDur, longAssPath, alignedLyrics);
      }

      const longClipList: string[] = [];

      if (effectiveLongImages.length === 1) {
        checkCancelled();
        const sc = scenes[0];
        const dur = sc.duration || 8;
        const filter = buildLongSceneFilter(dur, true, 1920, 1080, sceneBeatEvents(0));
        const escapedAss = longAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        await runFFmpegCommand([
          '-y',
          '-i', effectiveLongImages[0],
          '-i', audioPath,
          '-vf', `${filter},ass='${escapedAss}'`,
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '16',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-shortest',
          longPath,
        ]);
      } else {
        for (let i = 0; i < effectiveLongImages.length; i++) {
          checkCancelled();
          const sc = scenes[i];
          const clipFile = path.join(outDir, `${jobId}_long_clip_${i}.mp4`);
          const dur = sc.duration || 8;
          const filter = buildLongSceneFilter(dur, i % 2 === 0, 1920, 1080, sceneBeatEvents(i));

          await runFFmpegCommand([
            '-y',
            '-i', effectiveLongImages[i],
            '-vf', filter,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '12',
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
      }
      job.longPath = longPath;
      job.longVideoUrl = `/api/flow-music/videos/${longFilename}`;
      try { fs.unlinkSync(longAssPath); } catch {}
      for (const c of longClipList) { try { fs.unlinkSync(c); } catch {} }
    }

    // 5. Copy to script workspace output if script exists
    try {
      const script = store.getById<any>('scripts', scriptId);
      if (script) {
        const scriptOutDir = containedFile(workspaceOutputDir(), scriptId, '');
        fs.mkdirSync(scriptOutDir, { recursive: true });
        if (job.shortsPath && fs.existsSync(job.shortsPath)) {
          fs.copyFileSync(job.shortsPath, path.join(scriptOutDir, 'flow_shorts_final.mp4'));
        }
        if (job.longPath && fs.existsSync(job.longPath)) {
          fs.copyFileSync(job.longPath, path.join(scriptOutDir, 'flow_long_final.mp4'));
        }
      }
    } catch {}

    // Complete job
    const formatTitle =
      requestedFormat === 'shorts'
        ? 'Portrait Short (9:16)'
        : requestedFormat === 'long'
          ? 'Landscape Video (16:9)'
          : 'Shorts (9:16) & Long (16:9) videos';

    job.state = 'done';
    job.stage = beatAnalysis
      ? `Beat-synced ${formatTitle} ready! ${beatAnalysis.beats.length} beats @ ${beatAnalysis.bpm} BPM synced captions, punch zooms & drop shakes.`
      : `Final ${formatTitle} created successfully!`;
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
