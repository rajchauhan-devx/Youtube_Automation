import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { runMedia } from "../media-process.js";
import { assetFile, assetRecord } from "./repository.js";

/** Sample source time, never a downloaded URL. These frames are evidence, not tracked targets. */
export async function sceneThumbnails(id: string, signal?: AbortSignal, sceneSeconds?: number) {
  const record = assetRecord(id);
  if (record.mime !== "video/mp4") {
    const bytes = await sharp(assetFile(id)).resize({width: 768, height: 768, fit: "inside", withoutEnlargement: true}).png().toBuffer();
    return [`data:image/png;base64,${bytes.toString("base64")}`];
  }
  const duration = record.duration!;
  const visible = Math.min(duration, sceneSeconds ?? duration);
  const frames: string[] = [];
  for (const fraction of [0, 0.5, 0.9]) {
    signal?.throwIfAborted();
    const file = path.join(os.tmpdir(), `editing-frame-${randomUUID()}.png`);
    try {
      await runMedia("ffmpeg", ["-v", "error", "-ss", String(Math.max(0, Math.min(duration - 0.05, visible * fraction))), "-i", assetFile(id), "-frames:v", "1", "-vf", "scale=768:768:force_original_aspect_ratio=decrease", "-y", file], signal);
      frames.push(`data:image/png;base64,${fs.readFileSync(file).toString("base64")}`);
    } finally { fs.rmSync(file, {force: true}); }
  }
  return frames;
}
