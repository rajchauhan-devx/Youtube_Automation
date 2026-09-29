import {
  Alignment,
  toFrame,
  type AlignmentResult,
  type EditingProject,
} from "@tubeflow/editing-contracts";
import fs from "node:fs";
import path from "node:path";
import { assetRecord, atomic, objectHash, projectDir } from "./repository.js";
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
  _useService = false,
): Promise<AlignmentResult> {
  const key = objectHash({
      audio: project.inputs.audioHash,
      text: project.inputs.narrationHash,
      language: project.inputs.language,
      backend: "saved-narration-timing",
      sceneTiming: project.inputs.sceneTiming,
      version: 2,
    }),
    file = path.join(projectDir(project.id), "alignment", `${key}.json`);
  if (fs.existsSync(file))
    return Alignment.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  let result: AlignmentResult;
  if (project.inputs.sceneTiming.length) {
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
