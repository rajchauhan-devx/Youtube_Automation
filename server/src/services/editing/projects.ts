import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Settings,
  durationFrames,
  type EditingProject,
} from "@tubeflow/editing-contracts";
import { store } from "../store.js";
import { assertNarrationCurrent } from "../long-narration.js";
import type { ScenePlan as NarrationPlan } from "../scene-plan.js";
import {
  registerFonts,
  registerMedia,
  readNarrationMetadata,
} from "./media.js";
import { objectHash, hash, publish } from "./repository.js";
import { approximateAlignment, mapScenes } from "./timing.js";
import { EditingError, editingConfig } from "./config.js";
export interface ScriptInput {
  id: string;
  narration?: string;
  scenePlan?: NarrationPlan;
  editingProjectId?: string;
  generatedImages?: {
    index: number;
    status: string;
    url?: string;
    prompt: string;
    mediaType?: string;
  }[];
  generatedAudio?: {
    filename: string;
    language: "en" | "hi";
    url: string;
    narrationText?: string;
    sync?: unknown;
  }[];
}
export const scriptFingerprint = (s: ScriptInput) =>
  objectHash({
    narration: s.narration,
    scenePlan: s.scenePlan,
    images: s.generatedImages?.map((i) => ({
      index: i.index,
      url: i.url,
      prompt: i.prompt,
      mediaType: i.mediaType,
    })),
    audio: s.generatedAudio?.map((a) => ({
      filename: a.filename,
      language: a.language,
      narrationText: a.narrationText,
    })),
  });
const Create = z.strictObject({
  scriptId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  audioFilename: z.string().min(1).max(200),
  language: z.enum(["en", "hi"]),
  imageIndexes: z.array(z.number().int().min(0)).min(1).max(160),
  aspect: z.enum(["9:16", "16:9"]),
  fps: z.number().int().min(12).max(60).default(30),
  settings: Settings,
});
let activeCreations = 0;
export const projectCreationActive = () => activeCreations > 0;
export async function createProject(value: unknown) {
  activeCreations++;
  try {
    return await createProjectSnapshot(value);
  } finally {
    activeCreations--;
  }
}
export async function reviseProjectInputs(
  existing: EditingProject,
  value: unknown,
) {
  activeCreations++;
  try {
    const next = await createProjectSnapshot(value, false);
    if (next.scriptId !== existing.scriptId)
      throw new EditingError(
        "INVALID_SCRIPT",
        "Input revision must belong to the same script",
      );
    next.id = existing.id;
    next.parentRevisionId = existing.revisionId;
    publish(next, existing.revisionId);
    const script = store.getById<ScriptInput>("scripts", existing.scriptId)!;
    store.add("scripts", { ...script, editingProjectId: existing.id });
    return next;
  } finally {
    activeCreations--;
  }
}
async function createProjectSnapshot(value: unknown, publishNew = true) {
  const request = Create.parse(value),
    script = store.getById<ScriptInput>("scripts", request.scriptId);
  if (!script) throw new EditingError("NOT_FOUND", "Script not found", 404);
  if (script.generatedImages?.some(i => i.status !== "done" || !i.url)) throw new EditingError("MISSING_SCENE", "Finish generating or importing every scene before generating artifacts.");
  const readyIndexes = (script.generatedImages || []).filter(i => i.status === "done" && i.url).map(i => i.index);
  if (request.imageIndexes.length !== readyIndexes.length || readyIndexes.some(i => !request.imageIndexes.includes(i)))
    throw new EditingError("MISSING_SCENE", "Include every ready scene so the complete video is preserved.");
  const source = script.generatedAudio?.find(
    (a) =>
      a.filename === request.audioFilename && a.language === request.language,
  );
  if (!source)
    throw new EditingError(
      "MISSING_AUDIO",
      "Select a generated narration in this script.",
    );
  if (new Set(request.imageIndexes).size !== request.imageIndexes.length)
    throw new EditingError(
      "DUPLICATE_IMAGE",
      "Scene image indexes must be unique",
    );
  const selected = [...request.imageIndexes].sort((a, b) => a - b).map((index) => {
    const image = script.generatedImages?.find(
      (i) => i.index === index && i.status === "done" && i.url,
    );
    if (!image)
      throw new EditingError(
        "MISSING_SCENE",
        "Every scene needs a ready image or video.",
      );
    return image;
  });
  const audio = await registerMedia(script.id, source.url, "audio"),
    metadata = readNarrationMetadata(script.id, source.filename, audio.hash);
  let narration = metadata?.text || source.narrationText;
  const sceneTiming: EditingProject["inputs"]["sceneTiming"] = [];
  if (source.sync && script.scenePlan) {
    const sync = assertNarrationCurrent(script, source.filename);
    narration = script.scenePlan.scenes.map((s) => s.narration).join("\n\n");
    sync.scenes.forEach((t, i) =>
      sceneTiming.push({
        sceneId: t.sceneId,
        text: script.scenePlan!.scenes[i].narration,
        start: t.startSample / sync.sampleRate,
        end: t.endSample / sync.sampleRate,
        promptIndex: i,
      }),
    );
  }
  if (!narration)
    throw new EditingError(
      "NARRATION_IDENTITY_UNKNOWN",
      "This older audio has no saved TTS text. Regenerate narration once so visual cues use the text actually spoken.",
    );
  if (metadata && metadata.language !== request.language)
    throw new EditingError(
      "LANGUAGE_MISMATCH",
      "Selected audio language differs from its TTS metadata",
    );
  if (sceneTiming.length && selected.length !== sceneTiming.length)
    throw new EditingError(
      "MISSING_SCENE",
      "Select all images for synchronized narration.",
    );
  const images = [];
  for (const image of selected) {
    const asset = await registerMedia(script.id, image.url!, image.mediaType === "video" ? "video" : "image");
    images.push({
      assetId: asset.id,
      hash: asset.hash,
      promptIndex: image.index,
      prompt: image.prompt,
    });
  }
  const fonts = registerFonts(),
    inputs: EditingProject["inputs"] = {
      scriptId: script.id,
      scriptHash: scriptFingerprint(script),
      narrationText: narration,
      narrationHash: hash(narration),
      language: request.language,
      audioAssetId: audio.id,
      audioHash: audio.hash,
      imageAssets: images,
      width: request.aspect === "9:16" ? 1080 : 1920,
      height: request.aspect === "9:16" ? 1920 : 1080,
      fps: request.fps,
      durationFrames: durationFrames(audio.duration!, request.fps),
      audioFilename: source.filename,
      sceneTiming,
    };
  const p: EditingProject = {
    id: randomUUID(),
    schemaVersion: 1,
    scriptId: script.id,
    revisionId: randomUUID(),
    status: "draft",
    inputs,
    settings: {
      ...request.settings,
      maxProviderCalls: Math.min(
        request.settings.maxProviderCalls,
        editingConfig().maxCalls,
      ),
      maxGeneratedAssets: Math.min(
        request.settings.maxGeneratedAssets,
        editingConfig().maxAssets,
      ),
    },
    style: {
      id: "story-style",
      direction:
        request.settings.stylePreference || "Clear, calm explanatory graphics",
      colors: { background: "#172033", text: "#ffffff", accent: "#f2bd65" },
      fontAssetIds: fonts.map((f) => f.id),
      headingSize: 64,
      bodySize: 42,
      lineWeight: 4,
      textureAssetIds: [],
      shapeTreatment: "Simple legible shapes",
      motionIntensity: 0.4,
      minReadingSeconds: 2.5,
      minContrast: 4.5,
    },
    alignment: approximateAlignment(inputs, audio.duration!),
    scenes: [],
    analyses: [],
    artifacts: [],
    assetIds: [
      ...new Set([
        audio.id,
        ...images.map((i) => i.assetId),
        ...fonts.map((f) => f.id),
      ]),
    ],
    diagnostics: [],
    createdAt: new Date().toISOString(),
  };
  p.scenes = mapScenes(p);
  // Recheck after asynchronous inspection; never overwrite concurrent edits to Script.
  const latest = store.getById<ScriptInput>("scripts", script.id);
  if (!latest || scriptFingerprint(latest) !== inputs.scriptHash)
    throw new EditingError(
      "STALE_INPUT",
      "Script changed during media inspection. Try again.",
      409,
    );
  if (publishNew) {
    publish(p);
    store.add("scripts", { ...latest, editingProjectId: p.id });
  }
  return p;
}
