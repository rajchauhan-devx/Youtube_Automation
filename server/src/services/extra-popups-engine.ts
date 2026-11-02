import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  type ExtraPopupAsset,
  type DynamicMotionGraphicData,
  type ExtraPopupShapeType,
  type ExtraPopupPlacementType,
  styleKitFor,
  clampShapeToKit,
  clampSfxToKit,
  mobileSafePlacement,
  MOBILE_SAFE_PLACEMENTS,
  POPUP_SHAPES,
  SFX_NAMES,
} from '@tubeflow/editing-contracts';
import { store } from './store.js';
import { chat, getGeminiApiKey } from './gemini.js';
import { generatedDir, mediaUrl } from './workspace.js';
import { generateCloudflareImage, isCloudflareConfigured } from './cloudflare-image.js';
import { generateGoogleImage, isGoogleImageConfigured } from './google-image.js';
import { generateImage, checkComfyStatus } from './comfyui.js';

/** Shapes that render a hero card with a headline (no photograph frame). */
const CARD_ARCHETYPES = ['metric_counter', 'mystery_hook', 'heritage_intel', 'blueprint_diagram'] as const;

export function enhanceMacroPrompt(subject: string, channelProfile?: string): string {
  const cleanSubject = (subject || '').trim().replace(/^["']|["']$/g, '');
  if (!cleanSubject) {
    return 'Isolated macro studio close-up of high-detail relic texture, centered composition, dramatic cinematic rim lighting, clean dark studio backdrop, 8k photograph.';
  }

  // If already contains macro directives, return as is
  if (/\b(isolated macro|macro studio|close-up|micro-detail)\b/i.test(cleanSubject)) {
    return cleanSubject;
  }

  const isAncient = /dharma|ancient|mythology|vedic|sacred|history/i.test(channelProfile || '');
  const isSciFi = /tech|cyber|scifi|rule\s*zero|engineering/i.test(channelProfile || '');

  if (isAncient) {
    return `Isolated macro studio close-up of ${cleanSubject}, sacred craftsmanship, deep obsidian and antique gold sheen, micro-fissures with subtle glowing diya amber embers, razor-sharp tactile texture, centered composition, shallow depth of field, clean dark studio backdrop, 8k photorealistic.`;
  }

  if (isSciFi) {
    return `Isolated macro studio close-up of ${cleanSubject}, high-tech aerospace alloy and laser micro-welds, matte carbon gunmetal sheen, faint cyan laser telemetry line, centered composition, shallow depth of field, clean dark studio backdrop, 8k photorealistic.`;
  }

  return `Isolated macro studio close-up of ${cleanSubject}, centered composition, extreme micro-detail, cinematic 8k photograph, razor-sharp focus on texture, dramatic side rim lighting, clean dark studio backdrop with shallow depth of field, high contrast, zero background clutter.`;
}

/**
 * Offline fallback. Grounds every field in the actual narration and picks the
 * shape / sound from the channel StyleKit. Never invents sample copy.
 */
function heuristicExtractPopups(script: any): ExtraPopupAsset[] {
  const scenes = Array.isArray(script.scenePlan?.scenes) ? script.scenePlan.scenes : [];
  const popups: ExtraPopupAsset[] = [];
  const scriptText = scenes.map((s: any) => s.narration || '').join(' ');
  const isHindi = /[\u0900-\u097F]/.test(scriptText) || script.language === 'hi';
  const kit = styleKitFor(script.autoPilotSettings?.channelProfile || script.name || '');

  const placements: ExtraPopupPlacementType[] = ['top-right', 'center-right', 'top-left', 'center-left'];

  scenes.forEach((scene: any, index: number) => {
    const narration = String(scene.narration || '').trim();
    const text = `${narration} ${scene.imagePrompt || ''} ${scene.videoPrompt || ''}`;

    // Pull the first narrated number so the popup shows a real figure, never a demo one.
    const numMatch = narration.match(/(\d[\d,\.]*\s*(?:लाख|करोड़|हजार|टन|ton|tons|tonnes|year|years|साल|फ़ीट|feet|ft|मीटर|meters|m|mile|miles)?)/i);
    const mysteryMatch = /(रहस्य|unsolved|mystery|impossible|secret|असंभव|अनसुलझा|चमत्कार|no one knows|cannot explain)/i.test(narration);
    const heritageMatch = /(सभ्यता|dynasty|वंश|century|सदी|king|राजा|temple|मंदिर|ancient|प्राचीन|इतिहास|scripture|शास्त्र)/i.test(narration);
    const geomMatch = /(ज्यामिति|geometry|carved|तराश|architecture|वास्तु|trench|excavation|chamber|कक्ष|pillar|स्तंभ)/i.test(narration);

    let shape: ExtraPopupShapeType;
    let archetype: string;
    let title = '';
    let subtitle = '';
    let badgeTag = '';
    let statValue: string | undefined;
    let statUnit: string | undefined;

    if (numMatch) {
      shape = 'metric_counter';
      archetype = 'metric_counter';
      const raw = numMatch[1].trim();
      const valueMatch = raw.match(/^([\d,\.]+)/);
      statValue = valueMatch ? valueMatch[1] : raw;
      statUnit = raw.slice(statValue.length).trim() || undefined;
      // Title is the sentence fragment that contains the number, so it is narration-grounded.
      const figure: string = statValue;
      const sentence = narration.split(/[।.!?]/).find(s => s.includes(figure)) || narration;
      title = sentence.trim().split(/\s+/).slice(0, isHindi ? 6 : 8).join(' ');
      badgeTag = isHindi ? 'प्रमाणित आँकड़ा' : 'STATED FIGURE';
    } else if (geomMatch) {
      shape = 'blueprint_diagram';
      archetype = 'blueprint_diagram';
      title = firstClause(narration, isHindi ? 5 : 7);
      badgeTag = isHindi ? 'ज्यामिति' : 'GEOMETRY';
    } else if (mysteryMatch) {
      shape = 'mystery_hook';
      archetype = 'mystery_hook';
      title = firstClause(narration, isHindi ? 5 : 7);
      badgeTag = isHindi ? 'रहस्य' : 'OPEN QUESTION';
    } else if (heritageMatch) {
      shape = 'heritage_intel';
      archetype = 'heritage_intel';
      title = firstClause(narration, isHindi ? 5 : 7);
      badgeTag = isHindi ? 'प्राचीन धरोहर' : 'HERITAGE';
    } else {
      shape = kit.popupShapes[index % kit.popupShapes.length];
      archetype = 'macro_relic';
      title = firstClause(narration, isHindi ? 5 : 7);
      badgeTag = isHindi ? 'निरीक्षण' : 'DETAIL';
    }

    const subject = title || scene.imagePrompt || scene.videoPrompt || 'archival detail';
    const sfx = clampSfxToKit(
      kit,
      shape === 'metric_counter' ? kit.defaultSfx : shape === 'mystery_hook' ? 'energy_hum' : kit.defaultSfx
    );

    popups.push({
      id: `popup_${index}_${crypto.randomBytes(4).toString('hex')}`,
      sceneIndex: index,
      cueWord: cueFromNarration(narration, isHindi),
      cueOffsetSec: 1.0,
      durationSec: 3.2,
      title: title || (isHindi ? 'विवरण' : 'Detail'),
      subtitle: subtitle || undefined,
      badgeTag,
      statValue,
      statUnit,
      archetype,
      prompt: enhanceMacroPrompt(subject, script.name),
      shape: clampShapeToKit(kit, shape),
      placement: placements[index % placements.length],
      scalePercent: 30,
      sfx,
      status: 'pending',
    });
  });

  return popups;
}

/** First clause of the narration, capped in length. Used as popup headline. */
function firstClause(narration: string, maxWords: number): string {
  const clause = narration.split(/[।.,;:!?]/)[0] || narration;
  const words = clause.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

/** A spoken word to trigger on: prefer a late-content word, not the first article. */
function cueFromNarration(narration: string, isHindi: boolean): string {
  const words = narration.split(/\s+/).filter(w => w.length > (isHindi ? 1 : 3));
  return (words[Math.min(3, words.length - 1)] || words[0] || (isHindi ? 'यह' : 'this')).replace(/[।.,;:!?]/g, '');
}

export async function detectPopupsForScript(
  scriptId: string,
  apiKeyParam?: string
): Promise<ExtraPopupAsset[]> {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) {
    throw new Error(`Script not found: ${scriptId}`);
  }

  const scenes = Array.isArray(script.scenePlan?.scenes) ? script.scenePlan.scenes : [];
  if (scenes.length === 0) {
    return [];
  }

  const apiKey = getGeminiApiKey(apiKeyParam);
  if (!apiKey) {
    const detected = heuristicExtractPopups(script);
    script.extraPopups = detected;
    store.add('scripts', script);
    return detected;
  }

  try {
    const scriptText = scenes.map((s: any) => s.narration || '').join(' ');
    const isHindi = /[\u0900-\u097F]/.test(scriptText) || script.language === 'hi';
    const kit = styleKitFor(script.autoPilotSettings?.channelProfile || script.name || '');

    const sceneDescriptions = scenes.map((s: any, idx: number) => ({
      sceneIndex: idx,
      narration: s.narration || '',
      visualPrompt: s.imagePrompt || s.videoPrompt || '',
      durationSec: s.duration || 5,
    }));

    const systemPrompt = `You are a world-class YouTube Shorts creative director (inspired by Vox, MagnatesMedia, Lemmino) specializing in high-retention visual popups.
For each scene in the script, analyze the narration and identify the SINGLE HIGHEST-RETENTION on-screen popup to captivate the viewer.

CHANNEL STYLE KIT (this is a brand contract — obey it exactly):
- Palette: primary ${kit.popup.primary}, accent ${kit.popup.accent}, text ${kit.popup.text}
- Allowed shapes ONLY: ${kit.popupShapes.join(' | ')}
- Allowed sounds ONLY: ${kit.sfxPalette.filter(s => s !== 'none').join(' | ')}
- Tone energy: ${kit.energy}

ARCHETYPES (pick the most powerful one per scene):
1. "metric_counter": dramatic numbers, scale, quantities, years, weights, dimensions.
2. "mystery_hook": unsolved paradoxes, open loops, missing evidence, shocking questions.
3. "heritage_intel": historical dates, dynasties, rulers, scriptures, locations.
4. "blueprint_diagram": architectural methods, geometry, subterranean cutaways.
5. "macro_relic": concrete physical materials, tools, carving textures.

LANGUAGE:
${isHindi ? '- Script is HINDI. Output "title", "subtitle", "badgeTag" in HINDI (Devanagari) matching the spoken narration.' : '- Output clean, punchy English titles, subtitles and tags.'}

GROUNDING RULES (critical):
- "title" and "subtitle" MUST be drawn from the actual narration words shown below. Never invent facts, measurements or claims.
- "cueWord" MUST be an exact word present in that scene's narration.
- Every number you place in "statValue" must appear in that scene's narration.

PLACEMENT RULE:
- Only use: "top-right", "top-left", "center-right", "center-left". Never bottom corners (mobile subtitle safe zone).

OUTPUT JSON SCHEMA:
[
  {
    "sceneIndex": number,
    "archetype": "${CARD_ARCHETYPES.join('" | "')} | "macro_relic",
    "cueWord": "Exact spoken word triggering the popup",
    "cueOffsetSec": number (0.8-2.2),
    "durationSec": number (2.5-3.5),
    "title": "Bold headline (1-4 words, from narration)",
    "subtitle": "Secondary line (from narration)",
    "badgeTag": "Small pill tag",
    "statValue": "Large number if metric_counter (must appear in narration)",
    "statUnit": "Unit tag if metric_counter",
    "subject": "Physical item or texture prompt for image generation",
    "shape": "${kit.popupShapes.join('" | "')}",
    "placement": "${MOBILE_SAFE_PLACEMENTS.join('" | "')}",
    "sfx": "${kit.sfxPalette.filter(s => s !== 'none').join('" | "')}"
  }
]`;

    const userPrompt = `Script Scenes:
${JSON.stringify(sceneDescriptions, null, 2)}`;

    const response = await chat(
      apiKey,
      {
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        json: true,
        temperature: 0.35,
      }
    );

    const rawText = response.choices?.[0]?.message?.content?.trim() || '[]';
    let parsed: any[] = [];
    try {
      parsed = JSON.parse(rawText);
      if (!Array.isArray(parsed) && Array.isArray((parsed as any).popups)) {
        parsed = (parsed as any).popups;
      }
    } catch {
      parsed = [];
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      const fallback = heuristicExtractPopups(script);
      script.extraPopups = fallback;
      store.add('scripts', script);
      return fallback;
    }

    const detected: ExtraPopupAsset[] = parsed.map((item, idx) => {
      const sceneIdx = typeof item.sceneIndex === 'number' ? item.sceneIndex : idx;
      const popupId = `popup_${sceneIdx}_${crypto.randomBytes(4).toString('hex')}`;
      const subject = item.subject || item.title || item.cueWord || 'Relic detail';
      const prompt = enhanceMacroPrompt(subject, script.name);

      const shape = clampShapeToKit(kit, item.shape) === clampShapeToKit(kit, item.archetype)
        ? clampShapeToKit(kit, item.shape)
        : clampShapeToKit(kit, item.shape || item.archetype);
      const placement = mobileSafePlacement(item.placement);
      const sfx = clampSfxToKit(kit, item.sfx);

      return {
        id: popupId,
        sceneIndex: sceneIdx,
        cueWord: String(item.cueWord || subject).slice(0, 100),
        cueOffsetSec: typeof item.cueOffsetSec === 'number' ? item.cueOffsetSec : 1.0,
        durationSec: typeof item.durationSec === 'number' ? Math.min(3.5, item.durationSec) : 3.0,
        title: String(item.title || subject).slice(0, 100),
        subtitle: item.subtitle ? String(item.subtitle).slice(0, 200) : undefined,
        badgeTag: item.badgeTag ? String(item.badgeTag).slice(0, 50) : undefined,
        statValue: item.statValue ? String(item.statValue).slice(0, 30) : undefined,
        statUnit: item.statUnit ? String(item.statUnit).slice(0, 20) : undefined,
        archetype: item.archetype || shape,
        prompt,
        shape,
        placement,
        scalePercent: 30,
        sfx,
        status: 'pending',
      };
    });

    script.extraPopups = detected;
    store.add('scripts', script);
    return detected;
  } catch (err) {
    console.warn('[extra-popups] Gemini detection failed, falling back to heuristic:', err);
    const fallback = heuristicExtractPopups(script);
    script.extraPopups = fallback;
    store.add('scripts', script);
    return fallback;
  }
}

/**
 * Zero-config Pollinations image generator fallback.
 */
async function generatePollinationsImage(
  prompt: string,
  scriptId: string,
  seed: number
): Promise<{ publicUrl: string; fileName: string; seed: number; elapsedMs: number }> {
  const started = Date.now();
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) {
    throw new Error(`Pollinations API returned status ${res.status}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  const outDir = path.join(generatedDir(), scriptId);
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `popup-${Date.now()}-${seed}.png`;
  fs.writeFileSync(path.join(outDir, fileName), buffer);

  return {
    publicUrl: mediaUrl(`generate/file/${scriptId}/${fileName}`),
    fileName,
    seed,
    elapsedMs: Date.now() - started,
  };
}

export async function generatePopupImage(opts: {
  scriptId: string;
  popupId: string;
  prompt?: string;
  provider?: 'local' | 'cloudflare' | 'google' | 'pollinations';
  modelName?: string;
  seed?: number;
}): Promise<ExtraPopupAsset> {
  const { scriptId, popupId } = opts;
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);

  const popups: ExtraPopupAsset[] = script.extraPopups || [];
  const target = popups.find(p => p.id === popupId);
  if (!target) throw new Error(`Popup not found: ${popupId}`);

  const prompt = opts.prompt || target.prompt;
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const preferredProvider = opts.provider;

  target.status = 'generating';
  delete target.error;
  store.add('scripts', script);

  try {
    let result: { publicUrl: string; fileName: string; seed: number; elapsedMs: number };

    if (preferredProvider === 'cloudflare' || (!preferredProvider && isCloudflareConfigured())) {
      result = await generateCloudflareImage({
        prompt,
        scriptId,
        index: target.sceneIndex,
        seed,
        preset: 'high',
        modelName: opts.modelName,
        filePrefix: 'popup' as any,
      });
    } else if (preferredProvider === 'google' || (!preferredProvider && isGoogleImageConfigured())) {
      result = await generateGoogleImage({
        prompt,
        scriptId,
        index: target.sceneIndex,
        seed,
        filePrefix: 'popup' as any,
      });
    } else if (preferredProvider === 'local') {
      const comfy = await checkComfyStatus();
      if (comfy.online) {
        result = await generateImage({
          prompt,
          scriptId,
          index: target.sceneIndex,
          seed,
          preset: 'high',
          filePrefix: 'popup' as any,
        });
      } else {
        result = await generatePollinationsImage(prompt, scriptId, seed);
      }
    } else {
      // Automatic fallback: try cloudflare -> local -> pollinations
      if (isCloudflareConfigured()) {
        try {
          result = await generateCloudflareImage({
            prompt,
            scriptId,
            index: target.sceneIndex,
            seed,
            preset: 'high',
            modelName: opts.modelName,
            filePrefix: 'popup' as any,
          });
        } catch (cfErr) {
          console.warn('[extra-popups] Cloudflare failed, trying local Comfy:', cfErr);
          const comfy = await checkComfyStatus();
          if (comfy.online) {
            result = await generateImage({
              prompt,
              scriptId,
              index: target.sceneIndex,
              seed,
              preset: 'high',
              filePrefix: 'popup' as any,
            });
          } else {
            result = await generatePollinationsImage(prompt, scriptId, seed);
          }
        }
      } else {
        const comfy = await checkComfyStatus();
        if (comfy.online) {
          result = await generateImage({
            prompt,
            scriptId,
            index: target.sceneIndex,
            seed,
            preset: 'high',
            filePrefix: 'popup' as any,
          });
        } else {
          result = await generatePollinationsImage(prompt, scriptId, seed);
        }
      }
    }

    target.imageUrl = result.publicUrl;
    target.status = 'ready';
    store.add('scripts', script);
    return target;
  } catch (err: any) {
    console.error(`[extra-popups] Failed to generate image for popup ${popupId}:`, err);
    target.status = 'error';
    target.error = err.message || 'Generation failed';
    store.add('scripts', script);
    throw err;
  }
}

export async function generateAllPopupsForScript(
  scriptId: string,
  options?: {
    apiKey?: string;
    imageProvider?: 'local' | 'cloudflare' | 'google' | 'pollinations';
    onProgress?: (completed: number, total: number, currentPopup: ExtraPopupAsset) => void;
  }
): Promise<ExtraPopupAsset[]> {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);

  let popups: ExtraPopupAsset[] = script.extraPopups || [];
  if (popups.length === 0) {
    popups = await detectPopupsForScript(scriptId, options?.apiKey);
  }

  const results: ExtraPopupAsset[] = [];
  const pending = popups.filter(p => p.status !== 'ready');

  for (let i = 0; i < popups.length; i++) {
    const p = popups[i];
    if (p.status === 'ready' && p.imageUrl) {
      results.push(p);
      options?.onProgress?.(i + 1, popups.length, p);
      continue;
    }

    try {
      const updated = await generatePopupImage({
        scriptId,
        popupId: p.id,
        provider: options?.imageProvider,
      });
      results.push(updated);
      options?.onProgress?.(i + 1, popups.length, updated);
    } catch (err) {
      console.warn(`[extra-popups] Skipped popup ${p.id} due to error:`, err);
      results.push(p);
      options?.onProgress?.(i + 1, popups.length, p);
    }
  }

  return results;
}

/** Create a user-authored popup, clamped into the channel StyleKit. */
export function addCustomPopupAsset(scriptId: string, input: Partial<ExtraPopupAsset> & { subject?: string }): ExtraPopupAsset {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);
  const kit = styleKitFor(script.autoPilotSettings?.channelProfile || script.name || '');
  const popups: ExtraPopupAsset[] = script.extraPopups || [];

  const popup: ExtraPopupAsset = {
    id: input.id || `popup_custom_${crypto.randomBytes(4).toString('hex')}`,
    sceneIndex: input.sceneIndex ?? 0,
    cueWord: input.cueWord || input.title || 'detail',
    cueOffsetSec: input.cueOffsetSec ?? 1.0,
    durationSec: input.durationSec ?? 3.2,
    title: input.title || 'Untitled',
    subtitle: input.subtitle,
    prompt: input.prompt || enhanceMacroPrompt(input.subject || input.title || 'detail', script.name),
    negativePrompt: input.negativePrompt,
    shape: clampShapeToKit(kit, input.shape),
    placement: mobileSafePlacement(input.placement),
    scalePercent: input.scalePercent ?? 30,
    imageUrl: input.imageUrl,
    maskUrl: input.maskUrl,
    sfx: clampSfxToKit(kit, input.sfx),
    statValue: input.statValue,
    statUnit: input.statUnit,
    badgeTag: input.badgeTag,
    archetype: input.archetype || input.shape,
    status: input.imageUrl ? 'ready' : 'pending',
  };

  popups.push(popup);
  script.extraPopups = popups;
  store.add('scripts', script);
  return popup;
}

/** Merge a partial edit into an existing popup, re-clamping shape/sfx/placement to the kit. */
export function updatePopupAsset(scriptId: string, input: Partial<ExtraPopupAsset> & { id: string }): ExtraPopupAsset {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);
  const kit = styleKitFor(script.autoPilotSettings?.channelProfile || script.name || '');
  const popups: ExtraPopupAsset[] = script.extraPopups || [];
  const idx = popups.findIndex(p => p.id === input.id);
  if (idx < 0) throw new Error(`Popup not found: ${input.id}`);

  const existing = popups[idx];
  const merged: ExtraPopupAsset = {
    ...existing,
    ...input,
    shape: input.shape ? clampShapeToKit(kit, input.shape) : existing.shape,
    placement: input.placement ? mobileSafePlacement(input.placement) : existing.placement,
    sfx: input.sfx ? clampSfxToKit(kit, input.sfx) : existing.sfx,
  };
  popups[idx] = merged;
  script.extraPopups = popups;
  store.add('scripts', script);
  return merged;
}

export function deletePopupAsset(scriptId: string, popupId: string): void {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);
  script.extraPopups = (script.extraPopups || []).filter((p: ExtraPopupAsset) => p.id !== popupId);
  store.add('scripts', script);
}

/** Persist a base64 image supplied by the client as the popup's artwork. */
export function saveUploadedPopupImage(scriptId: string, popupId: string, base64Data: string): ExtraPopupAsset {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);
  const popups: ExtraPopupAsset[] = script.extraPopups || [];
  const target = popups.find(p => p.id === popupId);
  if (!target) throw new Error(`Popup not found: ${popupId}`);

  const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(base64Data);
  const buffer = Buffer.from(match ? match[2] : base64Data, 'base64');
  const ext = match?.[1] === 'jpeg' ? 'jpg' : match?.[1] || 'png';

  const outDir = path.join(generatedDir(), scriptId);
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `popup-upload-${popupId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(outDir, fileName), buffer);

  target.imageUrl = mediaUrl(`generate/file/${scriptId}/${fileName}`);
  target.status = 'ready';
  delete target.error;
  script.extraPopups = popups;
  store.add('scripts', script);
  return target;
}

export function compileExtraPopupToMotionGraphic(
  popup: ExtraPopupAsset,
  opts: {
    width?: number;
    height?: number;
    startSec?: number;
    durationSec?: number;
    fps?: number;
    channelKey?: string;
  } = {}
): DynamicMotionGraphicData {
  const width = opts.width || 1080;
  const height = opts.height || 1920;
  const id = `dmg-${popup.id}`;
  const shape = popup.shape || 'circle_medallion';
  const isLeft = (popup.placement || '').includes('left');
  const durSec = typeof opts.durationSec === 'number' ? opts.durationSec : (popup.durationSec || 3.2);
  const startSec = typeof opts.startSec === 'number' ? Math.max(0, opts.startSec) : (popup.cueOffsetSec || 1.0);

  // Single source of visual identity: the channel StyleKit. No hardcoded palette here.
  const kit = styleKitFor(opts.channelKey || popup.archetype || '');
  const theme = kit.popup;
  const noCard = theme.cardStyle === 'none';

  // Resolve image to base64 Data URI for 100% reliable zero-latency offline rendering in Chromium
  let imgSrc = popup.imageUrl || '';
  if (imgSrc.startsWith('/api/generate/file/')) {
    const rawParts = imgSrc.replace('/api/generate/file/', '').split('/');
    if (rawParts.length >= 2) {
      const sId = rawParts[0];
      const fName = rawParts.slice(1).join('/');
      const diskPath = path.resolve(generatedDir(), sId, fName);
      if (fs.existsSync(diskPath)) {
        try {
          const b64 = fs.readFileSync(diskPath).toString('base64');
          imgSrc = `data:image/png;base64,${b64}`;
        } catch (err) {
          console.warn('[extra-popups] Could not read disk image for base64:', err);
        }
      }
    }
  }

  // Safe zones: protect top 15% (Shorts header/camera safe zone) and bottom 25% (subtitle area)
  let posStyles = '';
  switch (popup.placement) {
    case 'top-left':
      posStyles = 'top: 15%; left: 8%; align-items: flex-start;';
      break;
    case 'bottom-left':
      posStyles = 'top: 28%; left: 8%; align-items: flex-start;';
      break;
    case 'bottom-right':
      posStyles = 'top: 28%; right: 8%; align-items: flex-end;';
      break;
    case 'center-left':
      posStyles = 'top: 30%; left: 8%; align-items: flex-start;';
      break;
    case 'center-right':
      posStyles = 'top: 30%; right: 8%; align-items: flex-end;';
      break;
    case 'top-right':
    default:
      posStyles = 'top: 15%; right: 8%; align-items: flex-end;';
      break;
  }

  const hasImage = Boolean(imgSrc && imgSrc.length > 10);
  const isMetric = shape === 'metric_counter' || popup.archetype === 'metric_counter';
  const isMystery = shape === 'mystery_hook' || popup.archetype === 'mystery_hook';
  const isBlueprint = shape === 'blueprint_diagram' || popup.archetype === 'blueprint_diagram';
  const isHeritage = shape === 'heritage_intel' || popup.archetype === 'heritage_intel' || (!hasImage && !isMetric && !isMystery && !isBlueprint);
  const isHex = shape === 'tactical_hexagon' && hasImage;

  const themeColor = theme.primary;
  const themeGlow = theme.glow;
  const badgeTag = popup.badgeTag || (isMetric ? 'STATED FIGURE' : isMystery ? 'OPEN QUESTION' : isHeritage ? 'HERITAGE' : isBlueprint ? 'GEOMETRY' : (isHex ? 'TELEMETRY' : 'DETAIL'));

  let cardBodyHtml = '';

  if (isMetric) {
    cardBodyHtml = `
      <div class="ep-hero-card ep-card-metric">
        <div class="ep-badge-pill">
          <span class="ep-pill-dot"></span>
          <span class="ep-pill-tag">${badgeTag}</span>
        </div>
        <div class="ep-stat-row">
          <span class="ep-stat-num">${popup.statValue || popup.title}</span>
          ${popup.statUnit ? `<span class="ep-stat-unit">${popup.statUnit}</span>` : ''}
        </div>
        <div class="ep-title">${popup.title}</div>
        ${popup.subtitle ? `<div class="ep-sub">${popup.subtitle}</div>` : ''}
      </div>
    `;
  } else if (isMystery) {
    cardBodyHtml = `
      <div class="ep-hero-card ep-card-mystery">
        <div class="ep-badge-pill ep-pill-mystery">
          <span class="ep-pill-qmark">?</span>
          <span class="ep-pill-tag">${badgeTag}</span>
        </div>
        <div class="ep-title ep-title-lg">${popup.title}</div>
        ${popup.subtitle ? `<div class="ep-sub">${popup.subtitle}</div>` : ''}
      </div>
    `;
  } else if (isHeritage) {
    cardBodyHtml = `
      <div class="ep-hero-card ep-card-heritage">
        <div class="ep-badge-pill">
          <span class="ep-pill-dot"></span>
          <span class="ep-pill-tag">${badgeTag}</span>
        </div>
        <div class="ep-title ep-title-heritage">${popup.title}</div>
        ${popup.subtitle ? `<div class="ep-sub">${popup.subtitle}</div>` : ''}
      </div>
    `;
  } else if (isBlueprint) {
    cardBodyHtml = `
      <div class="ep-hero-card ep-card-blueprint">
        <div class="ep-badge-pill">
          <span class="ep-pill-dot"></span>
          <span class="ep-pill-tag">${badgeTag}</span>
        </div>
        <div class="ep-title">${popup.title}</div>
        ${popup.subtitle ? `<div class="ep-sub">${popup.subtitle}</div>` : ''}
      </div>
    `;
  } else {
    // Photographic frame shapes: medallion, hexagon, glass card, loupe, cutout relic.
    let frameSvg = '';
    if (shape === 'tactical_hexagon') {
      frameSvg = `
        <div class="ep-frame ep-hex">
          <svg viewBox="0 0 100 100" class="ep-svg">
            <defs>
              <clipPath id="hexClip-${popup.id}">
                <polygon points="50,4 94,26 94,74 50,96 6,74 6,26" />
              </clipPath>
            </defs>
            <polygon points="50,2 96,25 96,75 50,98 4,75 4,25" fill="none" stroke="${themeGlow}" stroke-width="4" />
            <polygon points="50,4 94,26 94,74 50,96 6,74 6,26" fill="none" stroke="${themeColor}" stroke-width="3" />
            <polygon points="50,8 90,28 90,72 50,92 10,72 10,28" fill="none" stroke="${themeGlow}" stroke-width="1.5" stroke-dasharray="4 2" />
            <image href="${imgSrc}" x="6" y="4" width="88" height="92" clip-path="url(#hexClip-${popup.id})" preserveAspectRatio="xMidYMid slice" />
          </svg>
        </div>
      `;
    } else if (shape === 'museum_glass_card') {
      frameSvg = `
        <div class="ep-frame ep-glass">
          <div class="ep-glass-inner">
            <img src="${imgSrc}" alt="${popup.title}" class="ep-img" />
            <div class="ep-glass-shine"></div>
          </div>
        </div>
      `;
    } else if (shape === 'magnifying_loupe') {
      frameSvg = `
        <div class="ep-frame ep-loupe">
          <svg viewBox="0 0 100 100" class="ep-svg">
            <defs>
              <clipPath id="loupeClip-${popup.id}"><circle cx="45" cy="45" r="38" /></clipPath>
            </defs>
            <circle cx="45" cy="45" r="41" fill="none" stroke="${themeGlow}" stroke-width="4" />
            <circle cx="45" cy="45" r="39" fill="none" stroke="${themeColor}" stroke-width="2.5" />
            <image href="${imgSrc}" x="7" y="7" width="76" height="76" clip-path="url(#loupeClip-${popup.id})" preserveAspectRatio="xMidYMid slice" />
            <line x1="72" y1="72" x2="96" y2="96" stroke="${themeColor}" stroke-width="6" stroke-linecap="round" />
            <line x1="72" y1="72" x2="96" y2="96" stroke="${themeGlow}" stroke-width="12" stroke-linecap="round" opacity="0.4" />
          </svg>
        </div>
      `;
    } else if (shape === 'cutout_relic') {
      frameSvg = `
        <div class="ep-frame ep-cutout">
          <svg viewBox="0 0 100 100" class="ep-svg">
            <defs>
              <clipPath id="cutClip-${popup.id}">
                <path d="M50 3 C70 3 92 18 95 42 C98 66 82 90 52 96 C24 100 4 78 5 50 C6 24 28 3 50 3 Z" />
              </clipPath>
            </defs>
            <path d="M50 3 C70 3 92 18 95 42 C98 66 82 90 52 96 C24 100 4 78 5 50 C6 24 28 3 50 3 Z"
              fill="none" stroke="${themeGlow}" stroke-width="4" />
            <image href="${imgSrc}" x="2" y="2" width="96" height="96" clip-path="url(#cutClip-${popup.id})" preserveAspectRatio="xMidYMid slice" />
            <path d="M50 3 C70 3 92 18 95 42 C98 66 82 90 52 96 C24 100 4 78 5 50 C6 24 28 3 50 3 Z"
              fill="none" stroke="${themeColor}" stroke-width="2" stroke-dasharray="6 4" />
          </svg>
        </div>
      `;
    } else {
      // Circle medallion default
      frameSvg = `
        <div class="ep-frame ep-circle">
          <svg viewBox="0 0 100 100" class="ep-svg">
            <defs>
              <clipPath id="circleClip-${popup.id}">
                <circle cx="50" cy="50" r="41" />
              </clipPath>
            </defs>
            <circle cx="50" cy="50" r="46" fill="none" stroke="${themeGlow}" stroke-width="3.5" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="${themeColor}" stroke-width="2.5" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="${theme.accent}" stroke-width="2" stroke-dasharray="5 3" class="ep-spin" />
            <image href="${imgSrc}" x="9" y="9" width="82" height="82" clip-path="url(#circleClip-${popup.id})" preserveAspectRatio="xMidYMid slice" />
            <circle cx="50" cy="50" r="41" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1" />
          </svg>
        </div>
      `;
    }

    const leaderSvg = `
      <svg class="ep-leader-line" viewBox="0 0 180 32">
        ${isLeft ? `
          <path class="ep-path" d="M0 4 L80 4 L130 28" fill="none" stroke="${themeColor}" stroke-width="3" />
          <circle class="ep-node" cx="130" cy="28" r="5" fill="${themeColor}" />
        ` : `
          <path class="ep-path" d="M180 4 L100 4 L50 28" fill="none" stroke="${themeColor}" stroke-width="3" />
          <circle class="ep-node" cx="50" cy="28" r="5" fill="${themeColor}" />
        `}
      </svg>
    `;

    // 'none' card style (Ancient Dharma): free-floating type, no card box behind the label.
    cardBodyHtml = `
      ${hasImage ? frameSvg : ''}
      <div class="ep-leader-block ${isLeft ? 'ep-left' : 'ep-right'}">
        ${hasImage ? leaderSvg : ''}
        <div class="ep-badge ${noCard ? 'ep-badge-float' : ''}">
          <div class="ep-badge-pill">
            <span class="ep-pill-dot"></span>
            <span class="ep-pill-tag">${badgeTag}</span>
          </div>
          <div class="ep-title">${popup.title}</div>
          ${popup.subtitle ? `<div class="ep-sub">${popup.subtitle}</div>` : ''}
        </div>
      </div>
    `;
  }

  const html = `
    <div id="${id}" class="ep-wrapper" style="${posStyles}">
      <div class="ep-card">
        ${cardBodyHtml}
      </div>
    </div>
  `;

  const css = `
    @keyframes epSpinAnim {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    #${id}.ep-wrapper {
      position: absolute;
      display: flex;
      flex-direction: column;
      pointer-events: none;
      z-index: 50;
      user-select: none;
      visibility: hidden;
      opacity: 0;
      font-family: ${kit.theme.fontFamily}, system-ui, -apple-system, sans-serif;
    }
    #${id} .ep-card {
      display: flex;
      flex-direction: column;
      align-items: inherit;
      filter: drop-shadow(0 20px 48px rgba(0,0,0,0.92));
    }
    #${id} .ep-hero-card {
      display: flex;
      flex-direction: column;
      padding: 16px 24px;
      border-radius: ${Math.max(8, kit.theme.radius * 3)}px;
      background: ${noCard ? 'transparent' : theme.surface};
      border: 1.5px solid ${theme.surfaceBorder};
      box-shadow: ${noCard ? 'none' : `0 20px 50px rgba(0,0,0,0.9), 0 0 35px ${theme.glow}`};
      backdrop-filter: ${noCard ? 'none' : 'blur(24px)'};
      min-width: 320px;
      max-width: 440px;
    }
    #${id} .ep-card-metric { border-color: ${theme.primary}; box-shadow: 0 20px 50px rgba(0,0,0,0.92), 0 0 35px ${theme.glow}; }
    #${id} .ep-card-mystery { border-color: ${theme.accent}; box-shadow: 0 20px 50px rgba(0,0,0,0.92), 0 0 40px ${theme.glow}; }
    #${id} .ep-card-heritage { border-color: ${theme.badge}; box-shadow: 0 20px 50px rgba(0,0,0,0.92), 0 0 35px ${theme.glow}; }
    #${id} .ep-card-blueprint { border-color: ${theme.primary}; box-shadow: 0 20px 50px rgba(0,0,0,0.92), 0 0 35px ${theme.glow}; }
    #${id} .ep-stat-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin: 4px 0 6px 0;
    }
    #${id} .ep-stat-num {
      font-size: 48px;
      font-weight: 900;
      color: ${theme.text};
      letter-spacing: -0.02em;
      line-height: 1.0;
      text-shadow: 0 0 24px ${theme.glow};
    }
    #${id} .ep-stat-unit {
      font-size: 20px;
      font-weight: 800;
      color: ${theme.primary};
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    #${id} .ep-badge-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    #${id} .ep-pill-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${theme.badge};
      box-shadow: 0 0 10px ${theme.badge};
    }
    #${id} .ep-pill-qmark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${theme.accent};
      color: #000;
      font-size: 12px;
      font-weight: 900;
    }
    #${id} .ep-pill-tag {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: ${theme.primary};
      text-transform: uppercase;
    }
    #${id} .ep-title {
      font-size: 24px;
      font-weight: 800;
      color: ${theme.text};
      letter-spacing: 0.01em;
      line-height: 1.25;
      ${noCard ? `text-shadow: 0 2px 12px rgba(0,0,0,0.95), 0 0 26px ${theme.glow};` : ''}
    }
    #${id} .ep-title-lg {
      font-size: 26px;
      font-weight: 900;
      color: ${theme.text};
    }
    #${id} .ep-title-heritage {
      font-size: 25px;
      color: ${theme.text};
    }
    #${id} .ep-sub {
      font-size: 15px;
      font-weight: 500;
      color: ${theme.muted};
      margin-top: 4px;
      line-height: 1.35;
      ${noCard ? `text-shadow: 0 2px 10px rgba(0,0,0,0.95);` : ''}
    }
    #${id} .ep-frame {
      position: relative;
      width: 310px;
      height: 310px;
    }
    #${id} .ep-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    #${id} .ep-spin {
      transform-origin: 50px 50px;
      animation: epSpinAnim 12s linear infinite;
    }
    #${id} .ep-glass {
      padding: 10px;
      border-radius: 24px;
      background: ${noCard ? 'transparent' : theme.surface};
      border: 2px solid ${theme.primary};
      box-shadow: 0 16px 36px rgba(0,0,0,0.85), 0 0 30px ${theme.glow};
      backdrop-filter: ${noCard ? 'none' : 'blur(20px)'};
    }
    #${id} .ep-glass-inner {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 18px;
      overflow: hidden;
    }
    #${id} .ep-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    #${id} .ep-leader-block {
      display: flex;
      flex-direction: column;
      margin-top: 6px;
    }
    #${id} .ep-leader-block.ep-left { align-items: flex-start; }
    #${id} .ep-leader-block.ep-right { align-items: flex-end; }
    #${id} .ep-leader-line {
      width: 180px;
      height: 32px;
      overflow: visible;
    }
    #${id} .ep-badge {
      display: flex;
      flex-direction: column;
      padding: 14px 22px;
      border-radius: ${Math.max(8, kit.theme.radius * 2)}px;
      background: ${noCard ? 'transparent' : theme.surface};
      border: ${noCard ? 'none' : `1.5px solid ${theme.surfaceBorder}`};
      box-shadow: ${noCard ? 'none' : `0 14px 36px rgba(0,0,0,0.9), 0 0 26px ${theme.glow}`};
      backdrop-filter: ${noCard ? 'none' : 'blur(20px)'};
      max-width: 380px;
    }
  `;

  const js = `
  {
    const rootEl = typeof container !== 'undefined' && container ? container : document;
    const wrapper = rootEl.querySelector('#${id}');
    const card = rootEl.querySelector('#${id} .ep-card');
    const path = rootEl.querySelector('#${id} .ep-path');
    const node = rootEl.querySelector('#${id} .ep-node');

    if (wrapper && card) {
      gsap.set(wrapper, { autoAlpha: 0 });
      tl.set(wrapper, { autoAlpha: 1 }, ${startSec.toFixed(3)});
      tl.fromTo(card,
        { scale: 0, autoAlpha: 0, rotationY: 15, transformOrigin: 'center center' },
        { scale: 1, autoAlpha: 1, rotationY: 0, duration: 0.45, ease: 'back.out(1.8)' },
        ${startSec.toFixed(3)}
      );

      if (path) {
        const len = path.getTotalLength ? path.getTotalLength() : 110;
        tl.fromTo(path,
          { strokeDasharray: len, strokeDashoffset: len },
          { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' },
          ${(startSec + 0.15).toFixed(3)}
        );
      }

      if (node) {
        tl.fromTo(node,
          { scale: 0, autoAlpha: 0, transformOrigin: 'center center' },
          { scale: 1, autoAlpha: 1, duration: 0.25, ease: 'back.out(2)' },
          ${(startSec + 0.25).toFixed(3)}
        );
      }

      tl.to(card, {
        y: '-=6px',
        duration: 1.8,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: ${Math.max(1, Math.floor(durSec / 1.8))}
      }, ${(startSec + 0.45).toFixed(3)});

      tl.to(card, {
        scale: 0.85,
        autoAlpha: 0,
        duration: 0.35,
        ease: 'power2.in'
      }, ${(startSec + durSec).toFixed(3)});

      tl.set(wrapper, { autoAlpha: 0 }, ${(startSec + durSec + 0.36).toFixed(3)});
    }
  }
  `;

  return {
    id,
    sceneIndex: popup.sceneIndex,
    type: 'extra_popup',
    title: popup.title,
    detail: popup.subtitle,
    cuePhrase: popup.cueWord,
    startSec: typeof opts.startSec === 'number' ? opts.startSec : popup.cueOffsetSec,
    durationSec: durSec,
    placement: {
      position: popup.placement as any,
      align: 'center',
    },
    visualConcept: popup.prompt,
    sfx: {
      kind: popup.sfx as any,
      volume: 0.7,
      startSec: 0,
    },
    render: {
      html,
      css,
      js,
    },
  };
}
