import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assetFile, assetRecord } from "../repository.js";
import type { VisionMetadata } from "./placement.js";

const SIDECAR = "asset.vision.json";
const MAX_VIDEO_FRAMES = 120;

export interface TemporalFrame {
  tMs: number;
  faces: VisionMetadata["faces"];
  subjects: VisionMetadata["subjects"];
  emptyCells: VisionMetadata["emptyCells"];
}

export interface TemporalVision {
  version: number;
  source?: string;
  durationMs: number;
  sampleFps: number;
  frames: TemporalFrame[];
}

export type VisionSidecar =
  | { kind: "image"; meta: VisionMetadata }
  | { kind: "video"; temporal: TemporalVision }
  | null;

/** Read a previously computed offline vision sidecar (image or temporal video).
 *  Never throws: any failure means template fallback for that asset. No model
 *  runs here by design. */
export function loadVisionForAsset(assetId: string): VisionSidecar {
  try {
    const dir = path.dirname(assetFile(assetId));
    const file = path.join(dir, SIDECAR);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    if (raw.version !== 1) return null;
    if (Array.isArray(raw.frames)) {
      // Temporal video sidecar.
      const frames = (raw.frames as TemporalFrame[]).filter(
        (f) => typeof f?.tMs === "number" && Array.isArray(f.faces) && Array.isArray(f.subjects),
      );
      if (!frames.length) return null;
      return {
        kind: "video",
        temporal: {
          version: 1,
          source: typeof raw.source === "string" ? raw.source : "unknown",
          durationMs: typeof raw.durationMs === "number" ? raw.durationMs : 0,
          sampleFps: typeof raw.sampleFps === "number" ? raw.sampleFps : 1,
          frames: frames.map((f) => ({
            tMs: f.tMs,
            faces: f.faces.filter(boxOk),
            subjects: f.subjects.filter(boxOk),
            emptyCells: Array.isArray(f.emptyCells) ? f.emptyCells : [],
          })),
        },
      };
    }
    if (!Array.isArray(raw.faces) || !Array.isArray(raw.subjects)) return null;
    if (!(raw.faces as unknown[]).every(boxOk) || !(raw.subjects as unknown[]).every(boxOk)) return null;
    return {
      kind: "image",
      meta: {
        version: 1,
        source: typeof raw.source === "string" ? raw.source : "unknown",
        width: typeof raw.width === "number" ? raw.width : 0,
        height: typeof raw.height === "number" ? raw.height : 0,
        faces: (raw.faces as VisionMetadata["faces"]).filter(boxOk),
        subjects: (raw.subjects as VisionMetadata["subjects"]).filter(boxOk),
        emptyCells: Array.isArray(raw.emptyCells) ? raw.emptyCells : [],
        analyzedAt: typeof raw.analyzedAt === "string" ? raw.analyzedAt : undefined,
      },
    };
  } catch {
    return null;
  }
}

function boxOk(b: unknown): boolean {
  const v = b as { x?: number; y?: number; w?: number; h?: number };
  return (
    typeof v?.x === "number" && typeof v?.y === "number" &&
    typeof v?.w === "number" && typeof v?.h === "number" &&
    v.x >= 0 && v.y >= 0 && v.w > 0 && v.h > 0 && v.x + v.w <= 1.000001 && v.y + v.h <= 1.000001
  );
}

/** Nearest sampled frame at `tMs` as a plain image-style snapshot (pure). */
export function snapshotAt(temporal: TemporalVision, tMs: number): VisionMetadata {
  if (!temporal.frames.length) {
    return { version: 1, faces: [], subjects: [], emptyCells: [], width: 0, height: 0 };
  }
  let best = temporal.frames[0];
  for (const f of temporal.frames) {
    if (Math.abs(f.tMs - tMs) < Math.abs(best.tMs - tMs)) best = f;
  }
  return {
    version: 1,
    source: temporal.source,
    width: 0,
    height: 0,
    faces: best.faces,
    subjects: best.subjects,
    emptyCells: best.emptyCells,
  };
}

/** Fire-and-forget offline analysis hook. Call right after an image/video
 *  asset is saved; it skips work when a fresh sidecar exists or when the
 *  Python analyzer is unavailable. Never rejects, never blocks the caller. */
export function analyzeAssetInBackground(assetId: string): void {
  void (async () => {
    try {
      const record = assetRecord(assetId);
      const isImage = ["image/png", "image/jpeg", "image/webp"].includes(record.mime);
      const isVideo = record.mime === "video/mp4";
      if (!isImage && !isVideo) return;
      const file = assetFile(assetId);
      const sidecar = path.join(path.dirname(file), SIDECAR);
      if (fs.existsSync(sidecar) && fs.statSync(sidecar).mtimeMs >= fs.statSync(file).mtimeMs) return;
      const here = path.dirname(fileURLToPath(import.meta.url));
      const script = path.resolve(here, "..", "..", "..", "..", "tools", "vision", "analyze.py");
      if (!fs.existsSync(script)) return;
      if (isVideo) await analyzeVideo(file, sidecar, script, record.duration);
      else await runAnalyzer(script, ["--input", file, "--output", sidecar], 60000);
    } catch {
      // Offline vision is best-effort; template placement covers every failure.
    }
  })();
}

function analyzeVideo(videoFile: string, sidecar: string, script: string, duration?: number): Promise<void> {
  return new Promise((resolve) => {
    const total = duration && Number.isFinite(duration) && duration > 0 ? duration : 120;
    const fps = total > MAX_VIDEO_FRAMES ? 0.5 : 1;
    const framesDir = path.join(os.tmpdir(), `motion-vision-${randomUUID()}`);
    fs.mkdirSync(framesDir, { recursive: true });
    const done = () => {
      fs.rmSync(framesDir, { recursive: true, force: true });
      resolve();
    };
    const ff = spawn(
      "ffmpeg",
      ["-v", "error", "-i", videoFile, "-vf", `fps=${fps},scale=640:-1`, "-frames:v", String(MAX_VIDEO_FRAMES), "-q:v", "3", path.join(framesDir, "frame_%04d.jpg")],
      { stdio: "ignore", windowsHide: true },
    );
    const kill = setTimeout(() => {
      ff.kill();
      done();
    }, 120000);
    ff.on("error", () => {
      clearTimeout(kill);
      done();
    });
    ff.on("close", async (code) => {
      clearTimeout(kill);
      if (code !== 0) return done();
      try {
        await runAnalyzer(script, ["--input", framesDir, "--output", sidecar, "--fps", String(fps)], 180000);
      } catch {
        // fall through to cleanup
      }
      done();
    });
  });
}

function runAnalyzer(script: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    // Same interpreter convention as the rest of the server (chatterbox-tts).
    const py = spawn(process.platform === "win32" ? "python.exe" : "python3", [script, ...args], {
      stdio: "ignore",
      windowsHide: true,
    });
    const kill = setTimeout(() => {
      py.kill();
      resolve();
    }, timeoutMs);
    py.on("error", () => {
      clearTimeout(kill);
      resolve();
    });
    py.on("close", () => {
      clearTimeout(kill);
      resolve();
    });
  });
}
