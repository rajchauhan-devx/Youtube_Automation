import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { generatedDir, mediaUrl, currentWorkspace } from "../workspace.js";
import { containedFile } from "../paths.js";
import { runMedia } from "../media-process.js";
import { saveAsset, hash, assetRecord, assetFile } from "./repository.js";
import { EditingError } from "./config.js";
import type { AssetRecord } from "@tubeflow/editing-contracts";
const require = createRequire(import.meta.url);
export async function probe(file: string, signal?: AbortSignal) {
  const result = JSON.parse(
    await runMedia(
      "ffprobe",
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
      signal,
    ),
  );
  const duration = Number(result.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600)
    throw new EditingError(
      "INVALID_DURATION",
      "Narration must have a decodable duration between 0 and 3600 seconds.",
    );
  if (
    !result.streams?.some(
      (s: { codec_type: string }) => s.codec_type === "audio",
    )
  )
    throw new EditingError("MISSING_AUDIO", "Selected file contains no audio");
  return duration;
}
export async function registerMedia(
  scriptId: string,
  url: string,
  kind: "image" | "audio" | "video",
) {
  // Only URLs generated for this script and workspace can be imported. Never fetch client URLs.
  const escaped = scriptId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    match = url.match(
      new RegExp(`/generate/file/${escaped}/([a-zA-Z0-9_.-]+)$`),
    );
  if (!match)
    throw new EditingError(
      "INVALID_MEDIA",
      "Select generated media belonging to this script.",
    );
  const route = `generate/file/${scriptId}/${match[1]}`;
  const scope = currentWorkspace();
  if (
    url !== mediaUrl(route) &&
    !(
      scope.accountId === "default" &&
      scope.profile === "shorts" &&
      url === `/api/${route}`
    )
  )
    throw new EditingError(
      "INVALID_MEDIA",
      "Media URL belongs to a different workspace",
    );
  const file = containedFile(generatedDir(), scriptId, match[1]);
  if (!fs.existsSync(file) || fs.statSync(file).size > 256 * 1024 * 1024)
    throw new EditingError(
      "MISSING_MEDIA",
      "Media is missing or exceeds 256 MiB.",
    );
  const bytes = fs.readFileSync(file);
  if (kind === "image") {
    const image = sharp(bytes, { limitInputPixels: 40000000 }),
      meta = await image.metadata();
    if (
      !["png", "jpeg", "webp"].includes(meta.format || "") ||
      !meta.width ||
      !meta.height ||
      (meta.pages || 1) > 1
    )
      throw new EditingError(
        "UNSUPPORTED_MEDIA",
        "Enhanced editing requires still PNG/JPEG/WebP scenes.",
      );
    await image.stats();
    return saveAsset(bytes, {
      mime: `image/${meta.format}` as AssetRecord["mime"],
      width: meta.width,
      height: meta.height,
      alpha: !!meta.hasAlpha,
      method: "import",
      providerVersion: "existing-scene",
    });
  }
  if (kind === "video") {
    const info = JSON.parse(await runMedia("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file]));
    const stream = info.streams?.find((s: {codec_type: string}) => s.codec_type === "video");
    const duration = Number(stream?.duration || info.format?.duration);
    if (path.extname(file).toLowerCase() !== ".mp4" || !info.format?.format_name?.includes("mp4") ||
        !stream?.width || !stream?.height || stream.width * stream.height > 40000000 || !Number.isFinite(duration) || duration <= 0 || duration > 3600)
      throw new EditingError("UNSUPPORTED_VIDEO", "Select a decodable MP4 video up to one hour.");
    return saveAsset(bytes, {mime: "video/mp4", width: stream.width, height: stream.height, duration,
      alpha: false, method: "import", providerVersion: "existing-video"});
  }
  const duration = await probe(file);
  if (![".wav", ".mp3"].includes(path.extname(file)))
    throw new EditingError("UNSUPPORTED_AUDIO", "Use WAV or MP3 narration.");
  return saveAsset(bytes, {
    mime: file.endsWith(".wav") ? "audio/wav" : "audio/mpeg",
    duration,
    alpha: false,
    method: "import",
    providerVersion: "existing-tts",
  });
}
export function registerFonts() {
  // Bundled OFL fonts; one Devanagari and one Latin face are selected explicitly per text node.
  return [
    ["@fontsource/noto-sans", "noto-sans-latin-400-normal.woff2"],
    [
      "@fontsource/noto-sans-devanagari",
      "noto-sans-devanagari-devanagari-400-normal.woff2",
    ],
  ].map(([pkg, name]) => {
    const file = path.join(
      path.dirname(require.resolve(`${pkg}/package.json`)),
      "files",
      name,
    );
    return saveAsset(fs.readFileSync(file), {
      mime: "font/woff2",
      alpha: false,
      method: "font",
      providerVersion: pkg,
      license: "SIL Open Font License 1.1",
      attribution: "Noto project",
    });
  });
}
export function readNarrationMetadata(
  scriptId: string,
  filename: string,
  audioHash: string,
) {
  const file = containedFile(
    generatedDir(),
    scriptId,
    `${filename}.narration.json`,
  );
  if (!fs.existsSync(file)) return undefined;
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    text: string;
    language: "hi" | "en";
    audioHash: string;
  };
  if (data.audioHash !== audioHash)
    throw new EditingError(
      "STALE_NARRATION",
      "Narration metadata no longer matches this audio.",
    );
  return data;
}
export function writeNarrationMetadata(
  file: string,
  text: string,
  language: "en" | "hi",
) {
  fs.writeFileSync(
    `${file}.narration.json`,
    JSON.stringify({
      text,
      language,
      audioHash: hash(fs.readFileSync(file)),
      version: 1,
    }),
  );
}
export async function cropAsset(
  sourceId: string,
  crop: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
) {
  const source = assetRecord(sourceId);
  if (!source.width || !source.height)
    throw new EditingError("INVALID_CROP", "Crop source is not an image");
  const left = Math.floor(crop.x * source.width),
    top = Math.floor(crop.y * source.height),
    w = Math.min(
      source.width - left,
      Math.max(1, Math.round(crop.width * source.width)),
    ),
    h = Math.min(
      source.height - top,
      Math.max(1, Math.round(crop.height * source.height)),
    );
  const bytes = await sharp(assetFile(sourceId))
    .extract({ left, top, width: w, height: h })
    .resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return saveAsset(bytes, {
    mime: "image/png",
    width,
    height,
    alpha: !(await sharp(bytes).stats()).isOpaque,
    method: "crop",
    providerVersion: `sharp-crop-v1:${source.hash}`,
  });
}
