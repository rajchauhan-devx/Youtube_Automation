import {
  Alignment,
  toFrame,
  type AlignmentResult,
  type EditingProject,
  type ArtifactComposition,
} from "@tubeflow/editing-contracts";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { assetFile, assetRecord, atomic, objectHash, projectDir } from "./repository.js";
import { editingConfig } from "./config.js";
/** Compile narration references into frames; models never choose independent cue clocks. */
export function compileCue(
  project: EditingProject,
  artifact: ArtifactComposition,
): ArtifactComposition {
  const scene = project.scenes.find((s) => s.id === artifact.sceneId);
  if (!scene) throw new Error("Artifact references an unknown scene");
  const tokens = artifact.narrativeRefs.map((id) => {
    const token = project.alignment.tokens.find((t) => t.id === id);
    if (!token || !scene.narrativeRefs.includes(id))
      throw new Error("Unresolved artifact narrative cue");
    return token;
  });
  if (!tokens.length)
    throw new Error("A generated artifact needs a narration cue");
  const result = structuredClone(artifact),
    oldDuration = artifact.endFrame - artifact.startFrame;
  if (oldDuration <= 0) throw new Error("Invalid proposed artifact duration");
  if (project.alignment.mode === "approximate") {
    result.startFrame = scene.startFrame;
    result.endFrame = scene.endFrame;
  } else {
    result.startFrame = Math.max(
      scene.startFrame,
      toFrame(Math.min(...tokens.map((t) => t.start)), project.inputs.fps),
    );
    const words = result.nodes
      .filter((n) => n.kind === "text")
      .reduce((count, n) => count + n.text.split(/\s+/u).length, 0);
    const readingFrames = Math.ceil(
      Math.max(words ? project.style.minReadingSeconds : 0, words / 3) *
        project.inputs.fps,
    );
    result.endFrame = Math.min(
      scene.endFrame,
      Math.max(
        result.startFrame + Math.max(1, readingFrames),
        toFrame(Math.max(...tokens.map((t) => t.end)), project.inputs.fps),
      ),
    );
  }
  const duration = result.endFrame - result.startFrame;
  if (duration <= 0) throw new Error("Narration cue falls outside its scene");
  for (const node of result.nodes)
    for (const track of node.tracks) {
      if (track.keyframes.some((key) => key.frame > oldDuration))
        throw new Error("Proposed animation exceeds its interval");
      track.keyframes = [
        ...new Map(
          track.keyframes.map((key) => {
            const frame = Math.round((key.frame * duration) / oldDuration);
            return [frame, { ...key, frame }] as const;
          }),
        ).values(),
      ];
    }
  return result;
}
export function approximateAlignment(
  inputs: EditingProject["inputs"],
  duration: number,
): AlignmentResult {
  const matches = [...inputs.narrationText.matchAll(/\S+/gu)],
    weight = matches.reduce((sum, m) => sum + m[0].length, 0);
  let cursor = 0;
  return {
    audioHash: inputs.audioHash,
    narrationHash: inputs.narrationHash,
    language: inputs.language,
    duration,
    mode: "approximate",
    provider: "character-weighted-fallback",
    version: "1",
    tokens: matches.map((m, i) => {
      const start = (duration * cursor) / weight;
      cursor += m[0].length;
      return {
        id: `token-${i}`,
        text: m[0],
        startOffset: m.index!,
        endOffset: m.index! + m[0].length,
        start,
        end: (duration * cursor) / weight,
        confidence: 0,
        evidence: "Estimated reading allocation, not measured speech timing",
      };
    }),
  };
}
export async function align(
  project: EditingProject,
  signal: AbortSignal,
  useService = true,
): Promise<AlignmentResult> {
  const config = editingConfig(),
    key = objectHash({
      audio: project.inputs.audioHash,
      text: project.inputs.narrationHash,
      language: project.inputs.language,
      backend: useService ? config.alignmentUrl : "measured-fallback",
      version: 1,
    }),
    file = path.join(projectDir(project.id), "alignment", `${key}.json`);
  if (fs.existsSync(file))
    return Alignment.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  let result: AlignmentResult;
  if (config.alignmentUrl && useService) {
    const requestId = randomUUID();
    const bounded = AbortSignal.any([
      signal,
      AbortSignal.timeout(config.providerTimeout),
    ]);
    const cancel = () => {
      void fetch(`${config.alignmentUrl.replace(/\/$/, "")}/cancel`, {
        method: "POST",
        headers: { "X-Request-ID": requestId },
        signal: AbortSignal.timeout(3000),
      }).catch(() => undefined);
    };
    bounded.addEventListener("abort", cancel, { once: true });
    try {
      const form = new FormData();
      form.append(
        "audio",
        new Blob([
          new Uint8Array(
            fs.readFileSync(assetFile(project.inputs.audioAssetId)),
          ),
        ]),
        "narration.wav",
      );
      form.append("text", project.inputs.narrationText);
      form.append("language", project.inputs.language);
      form.append("audioHash", project.inputs.audioHash);
      form.append("narrationHash", project.inputs.narrationHash);
      const response = await fetch(
        `${config.alignmentUrl.replace(/\/$/, "")}/align`,
        {
          method: "POST",
          headers: { "X-Request-ID": requestId },
          body: form,
          signal: bounded,
        },
      );
      if (!response.ok) throw new Error("Alignment provider is unavailable");
      result = Alignment.parse(await response.json());
      if (Math.abs(result.duration - project.alignment.duration) > 0.15)
        throw new Error("Alignment duration does not match probed audio");
      result.duration = project.alignment.duration; // Container padding can differ from decoded PCM length.
    } finally {
      bounded.removeEventListener("abort", cancel);
    }
  } else if (project.inputs.sceneTiming.length) {
    let offset = 0;
    result = {
      ...project.alignment,
      mode: "phrase",
      provider: "tts-scene-samples",
      version: "1",
      tokens: project.inputs.sceneTiming.map((s, i) => {
        const startOffset = project.inputs.narrationText.indexOf(
          s.text,
          offset,
        );
        if (startOffset < 0)
          throw new Error("Scene narration differs from selected audio text");
        offset = startOffset + s.text.length;
        return {
          id: `span-${i}`,
          text: s.text,
          startOffset,
          endOffset: offset,
          start: s.start,
          end: s.end,
          confidence: 1,
          evidence:
            "Measured PCM scene boundaries from selected TTS audio; no word-level claim",
        };
      }),
    };
  } else result = project.alignment;
  signal.throwIfAborted();
  atomic(file, result);
  return result;
}
export function mapScenes(project: EditingProject) {
  const { inputs, alignment } = project,
    images = inputs.imageAssets;
  // Preserve measured per-scene narration when available; otherwise split at phrase boundaries
  // weighted by spoken tokens. The fallback remains explicitly marked approximate.
  const tokens = alignment.tokens;
  return images.map((image, i) => {
    const measured = inputs.sceneTiming.find(
      (t) => t.promptIndex === image.promptIndex,
    );
    const start =
      i === 0
        ? 0
        : measured
          ? toFrame(measured.start, inputs.fps)
          : toFrame(
              tokens[
                Math.min(
                  tokens.length - 1,
                  Math.floor((i * tokens.length) / images.length),
                )
              ]?.start || 0,
              inputs.fps,
            );
    const next = inputs.sceneTiming.find(
      (t) => t.promptIndex === images[i + 1]?.promptIndex,
    );
    const end =
      i === images.length - 1
        ? inputs.durationFrames
        : next
          ? toFrame(next.start, inputs.fps)
          : toFrame(
              tokens[
                Math.min(
                  tokens.length - 1,
                  Math.floor(((i + 1) * tokens.length) / images.length),
                )
              ]?.start || 0,
              inputs.fps,
            );
    if (end <= start)
      throw new Error(
        "Narration is too short for the selected number of scene images",
      );
    return {
      id: `scene-${i}`,
      assetId: image.assetId,
      startFrame: start,
      endFrame: end,
      narrativeRefs: tokens
        .filter(
          (t) =>
            toFrame(t.start, inputs.fps) >= start &&
            toFrame(t.start, inputs.fps) < end,
        )
        .map((t) => t.id),
      camera: [
        { frame: 0, x: 0, y: 0, scale: 1 },
        { frame: end - start, x: 0, y: 0, scale: assetRecord(image.assetId).mime === "video/mp4" ? 1 : 1.06 },
      ],
      transitionFrames: 0,
      reservedRegions: [
        {
          x: inputs.width * 0.06,
          y: inputs.height * 0.83,
          width: inputs.width * 0.88,
          height: inputs.height * 0.12,
        },
      ],
    };
  });
}
