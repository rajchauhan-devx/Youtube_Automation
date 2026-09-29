/** Motion Pack E2E: deterministic build (network disabled) -> headless stills ->
 * pixel proof that graphics actually paint, plus a full MP4 export.
 *
 * Run:  node tests/editing/motion-pack-e2e.mjs        (after `npm run build --prefix server`)
 * Outputs stills + video under artifacts/motion-pack-e2e/.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { validateProject } from "@tubeflow/editing-contracts";

process.env.TUBEFLOW_DATA_DIR = path.resolve("artifacts/motion-pack-e2e-data");

const { saveAsset, hash } = await import("../../server/dist/services/editing/repository.js");
const { registerFonts } = await import("../../server/dist/services/editing/media.js");
const { runMedia } = await import("../../server/dist/services/media-process.js");
const { buildMotionPack } = await import("../../server/dist/services/editing/motionPackArtifacts.js");
const { renderSession, exportVideo } = await import("../../server/dist/services/editing/renderer.js");
const { renderStill } = await import("@remotion/renderer");

const OUT = path.resolve("artifacts/motion-pack-e2e");
fs.mkdirSync(OUT, { recursive: true });

const FPS = 30;
const DURATION = 8;
const FRAMES = FPS * DURATION;
const W = 1080;
const H = 1920;

const text0 = "Growth brings money today. Avoid this mistake.";
const text1 = "Remember to subscribe for more ideas soon.";
const narration = `${text0} ${text1}`;
// Word timings: scene 0 starts at 0.6s, scene 1 at 4.6s, 0.45s steps.
const tokens = [];
{
  let cursor = 0;
  let n = 0;
  for (const [text, start, step] of [[text0, 0.6, 0.45], [text1, 4.6, 0.45]]) {
    let i = 0;
    for (const w of text.split(/\s+/)) {
      const at = narration.indexOf(w, cursor);
      if (at < 0) throw new Error(`Fixture word missing: ${w}`);
      cursor = at + w.length;
      tokens.push({
        id: `token-${n++}`,
        text: w,
        startOffset: at,
        endOffset: at + w.length,
        start: start + i * step,
        end: start + i * step + 0.32,
        confidence: 1,
        evidence: "e2e-word-timings",
      });
      i++;
    }
    cursor += 1; // skip the joining space
  }
}
const raw0len = text0.split(/\s+/).length;

// Sanity: every token slice must equal its text (validateProject enforces this).
for (const t of tokens) {
  if (narration.slice(t.startOffset, t.endOffset) !== t.text) {
    throw new Error(`Bad fixture offset for ${t.id}: ${JSON.stringify(narration.slice(t.startOffset, t.endOffset))} !== ${t.text}`);
  }
}

const flat = async (color) =>
  saveAsset(
    await sharp({ create: { width: W, height: H, channels: 3, background: color } }).png().toBuffer(),
    { mime: "image/png", width: W, height: H, alpha: false, method: "fixture", providerVersion: "motion-e2e" },
  );
const bg0 = await flat({ r: 28, g: 41, b: 53 });
const bg1 = await flat({ r: 58, g: 28, b: 28 });

const wav = path.join(OUT, "tone.wav");
await runMedia("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${DURATION}`, "-c:a", "pcm_s16le", wav]);
const audio = saveAsset(fs.readFileSync(wav), { mime: "audio/wav", duration: DURATION, alpha: false, method: "fixture", providerVersion: "motion-e2e" });
const fonts = registerFonts();

const draft = {
  id: randomUUID(),
  schemaVersion: 1,
  scriptId: "motion-e2e",
  revisionId: randomUUID(),
  status: "draft",
  inputs: {
    scriptId: "motion-e2e",
    scriptHash: hash("motion-e2e"),
    narrationText: narration,
    narrationHash: hash(narration),
    language: "en",
    audioAssetId: audio.id,
    audioHash: audio.hash,
    imageAssets: [
      { assetId: bg0.id, hash: bg0.hash, promptIndex: 0, prompt: "scene one" },
      { assetId: bg1.id, hash: bg1.hash, promptIndex: 1, prompt: "scene two" },
    ],
    width: W,
    height: H,
    fps: FPS,
    durationFrames: FRAMES,
    audioFilename: "tone.wav",
    sceneTiming: [],
  },
  settings: { stylePreference: "", density: "balanced", maxProviderCalls: 10, maxGeneratedAssets: 0 },
  style: {
    id: "e2e-style",
    direction: "e2e",
    colors: { background: "#172033", text: "#ffffff", accent: "#f2bd65" },
    fontAssetIds: fonts.map((f) => f.id),
    headingSize: 64,
    bodySize: 42,
    lineWeight: 4,
    textureAssetIds: [],
    shapeTreatment: "simple",
    motionIntensity: 0.4,
    minReadingSeconds: 2.5,
    minContrast: 4.5,
  },
  alignment: {
    audioHash: audio.hash,
    narrationHash: hash(narration),
    language: "en",
    duration: DURATION,
    tokens,
    provider: "e2e",
    version: "1",
    mode: "word",
  },
  scenes: [
    {
      id: "scene-0",
      assetId: bg0.id,
      startFrame: 0,
      endFrame: 120,
      narrativeRefs: tokens.slice(0, raw0len).map((t) => t.id),
      camera: [{ frame: 0, x: 0, y: 0, scale: 1 }, { frame: 120, x: 0, y: 0, scale: 1 }],
      transitionFrames: 0,
      reservedRegions: [{ x: 64.8, y: 1593.6, width: 950.4, height: 230.4 }],
    },
    {
      id: "scene-1",
      assetId: bg1.id,
      startFrame: 120,
      endFrame: 240,
      narrativeRefs: tokens.slice(raw0len).map((t) => t.id),
      camera: [{ frame: 0, x: 0, y: 0, scale: 1 }, { frame: 120, x: 0, y: 0, scale: 1 }],
      transitionFrames: 0,
      reservedRegions: [{ x: 64.8, y: 1593.6, width: 950.4, height: 230.4 }],
    },
  ],
  analyses: [],
  artifacts: [],
  assetIds: [bg0.id, bg1.id, audio.id, ...fonts.map((f) => f.id)],
  diagnostics: [],
  createdAt: new Date().toISOString(),
};
validateProject(draft);

// 1. Determinism + zero-network proof: stub fetch, build twice (sync, must not return a promise).
const realFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("E2E network disabled during motion-pack build");
};
let builtA;
let builtB;
try {
  builtA = buildMotionPack(draft);
  builtB = buildMotionPack(draft);
} finally {
  globalThis.fetch = realFetch;
}
if (builtA instanceof Promise || builtB instanceof Promise) throw new Error("buildMotionPack must be synchronous");
const strip = (p) => JSON.stringify({ artifacts: p.artifacts, outcomes: p.sceneOutcomes });
if (strip(builtA) !== strip(builtB)) throw new Error("Non-deterministic motion-pack output");
const graphics = builtA.artifacts.filter((a) => a.intent.startsWith("Motion "));
console.log(`E2E build: ${graphics.length} motion graphics, ${builtA.artifacts.length} artifacts total (network disabled, deterministic)`);
fs.writeFileSync(path.join(OUT, "motion-pack.json"), JSON.stringify({ artifacts: builtA.artifacts, sceneOutcomes: builtA.sceneOutcomes }, null, 2));
for (const a of graphics) console.log(`  - ${a.id}: ${a.intent} frames ${a.startFrame}..${a.endFrame}`);

// 2. Region helper: union bbox of an artifact's nodes (group-local coords
//    are offset by the parent group's screen transform).
function regionOf(artifact) {
  let box = null;
  const offsets = new Map();
  for (const n of artifact.nodes) {
    if (n.kind === 'group') offsets.set(n.id, { x: n.transform.x, y: n.transform.y });
  }
  const grow = (x, y) => {
    box = box ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
  };
  for (const n of artifact.nodes) {
    if (n.kind === "audio") continue;
    const off = n.parentId ? offsets.get(n.parentId) || { x: 0, y: 0 } : { x: 0, y: 0 };
    const gx = (x) => x + off.x;
    const gy = (y) => y + off.y;
    if (n.kind === "text" || n.kind === "lottie" || (n.kind === "image" && n.bounds)) {
      const b = n.bounds;
      grow(gx(b.x), gy(b.y));
      grow(gx(b.x + b.width), gy(b.y + b.height));
    } else if (n.kind === "shape") {
      const g = n.geometry;
      if (g.kind === "polygon") g.points.forEach((pt) => grow(gx(pt.x), gy(pt.y)));
      else {
        grow(gx(g.bounds.x), gy(g.bounds.y));
        grow(gx(g.bounds.x + g.bounds.width), gy(g.bounds.y + g.bounds.height));
      }
    } else if (n.kind === "path") {
      for (const c of n.commands) {
        if (c.op === "Z") continue;
        if ("x1" in c) grow(gx(c.x1), gy(c.y1));
        if ("x2" in c) grow(gx(c.x2), gy(c.y2));
        grow(gx(c.x), gy(c.y));
      }
    }
  }
  if (!box) throw new Error(`No region for ${artifact.id}`);
  const pad = 30;
  const x0 = Math.max(0, Math.floor(box.x0) - pad);
  const y0 = Math.max(0, Math.floor(box.y0) - pad);
  return {
    left: x0,
    top: y0,
    width: Math.min(W, Math.ceil(box.x1) + pad) - x0,
    height: Math.min(H, Math.ceil(box.y1) + pad) - y0,
  };
}

/** Fraction of region pixels differing by >30 in any channel + mean brightness. */
const compare = async (fileA, fileB, region) => {
  const a = await sharp(fileA).extract(region).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(fileB).extract(region).raw().toBuffer({ resolveWithObject: true });
  const da = a.data;
  const db = b.data;
  const ch = a.info.channels;
  const total = da.length / ch;
  let changed = 0;
  let bright = 0;
  for (let i = 0; i < da.length; i += ch) {
    let hit = false;
    for (let c = 0; c < ch; c++) {
      bright += da[i + c];
      if (Math.abs(da[i + c] - db[i + c]) > 30) hit = true;
    }
    if (hit) changed++;
  }
  return { fraction: changed / total, brightness: bright / da.length };
};

// 3. Render: one mid-window frame per checked graphic, each with a same-frame
//    baseline where motion graphics are disabled (captions identical).
const session = await renderSession(builtA, new AbortController().signal);
try {
  const checks = [];
  const pick = graphics.filter((a) => /arrow-up|cash|badge/.test(a.intent));
  if (pick.length < 3) throw new Error(`Expected arrow-up, cash and badge graphics, got: ${graphics.map((g) => g.intent).join("; ")}`);
  for (const artifact of pick.slice(0, 3)) {
    const frame = Math.floor((artifact.startFrame + artifact.endFrame) / 2);
    const region = regionOf(artifact);
    const name = artifact.id;
    const withFx = path.join(OUT, `${name}-f${frame}.png`);
    await renderStill({ ...session, output: withFx, frame, imageFormat: "png", timeoutInMilliseconds: 120000 });
    const disabled = {
      ...builtA,
      artifacts: builtA.artifacts.map((a) => (a.intent.startsWith("Motion ") ? { ...a, enabled: false } : a)),
    };
    const sessionB = await renderSession(disabled, new AbortController().signal);
    const base = path.join(OUT, `${name}-f${frame}-baseline.png`);
    try {
      await renderStill({ ...sessionB, output: base, frame, imageFormat: "png", timeoutInMilliseconds: 120000 });
    } finally {
      sessionB.close();
    }
    const c = await compare(withFx, base, region);
    console.log(`${name} frame ${frame} region ${region.width}x${region.height}: changed ${(c.fraction * 100).toFixed(1)}%, brightness ${c.brightness.toFixed(1)}`);
    checks.push({ name, frame, ...c });
  }
  const bad = checks.filter((c) => !(c.fraction > 0.005 && c.brightness > 5));
  if (bad.length) throw new Error(`Graphic paint check failed: ${JSON.stringify(bad)}`);
  console.log("E2E stills: all graphic regions paint (enabled vs disabled delta).");

  // Per-word kinetic highlight: the dark-on-gold pill must sit on the active
  // word — frame 170 ("subscribe" active, left) vs frame 183 ("for" active,
  // right). The dark centroid must move right with the spoken word.
  const darkCentroid = async (file, region) => {
    const { data, info } = await sharp(file).extract(region).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    let sx = 0;
    let n = 0;
    const total = data.length / ch;
    for (let i = 0; i < data.length; i += ch) {
      if (data[i] >= 10 && data[i] <= 45 && data[i + 1] >= 10 && data[i + 1] <= 45 && data[i + 2] >= 10 && data[i + 2] <= 45) {
        sx += (i / ch) % region.width;
        n++;
      }
    }
    return { fraction: n / total, cx: n ? sx / n : -1 };
  };
  const captionAt = (frame) => {
    const a = builtA.artifacts.find((x) => x.intent.startsWith("Kinetic captions") && x.sceneId === "scene-1" && frame >= x.startFrame && frame < x.endFrame);
    if (!a) throw new Error(`No caption page at frame ${frame}`);
    const n = a.nodes.find((x) => x.kind === "text");
    const b = n.bounds;
    return { left: Math.round(b.x), top: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
  };
  const leftFile = path.join(OUT, "kinetic-left-f170.png");
  const rightFile = path.join(OUT, "kinetic-right-f183.png");
  await renderStill({ ...session, output: leftFile, frame: 170, imageFormat: "png", timeoutInMilliseconds: 120000 });
  await renderStill({ ...session, output: rightFile, frame: 183, imageFormat: "png", timeoutInMilliseconds: 120000 });
  const leftRegion = captionAt(170);
  const rightRegion = captionAt(183);
  const left = await darkCentroid(leftFile, leftRegion);
  const right = await darkCentroid(rightFile, rightRegion);
  console.log(`kinetic highlight: "subscribe" dark ${(left.fraction * 100).toFixed(2)}% @x=${left.cx.toFixed(0)}, "for" dark ${(right.fraction * 100).toFixed(2)}% @x=${right.cx.toFixed(0)}`);
  if (!(left.fraction > 0.003 && right.fraction > 0.003 && right.cx - left.cx > 50)) {
    throw new Error(`Kinetic highlight check failed: ${JSON.stringify({ left, right })}`);
  }
  console.log("E2E kinetic captions: highlight tracks the active word.");
} finally {
  session.close();
}

// 4. Full MP4 export through the unchanged export path (exportVideo itself
//    validates frame count, duration and narration length).
const jobId = randomUUID();
const url = await exportVideo(builtA, jobId, new AbortController().signal, (done, total) => {
  if (done % 60 === 0 || done === total) console.log(`E2E export: ${done}/${total} frames`);
});
console.log(`E2E export OK: ${url}`);
const mp4 = path.resolve(`artifacts/motion-pack-e2e-data/editing/${builtA.id}/renders/${jobId}/video.mp4`);
if (!fs.existsSync(mp4) || fs.statSync(mp4).size < 10000) throw new Error("Export MP4 missing or suspiciously small");
console.log(`E2E mp4: ${(fs.statSync(mp4).size / 1024).toFixed(0)} KiB at ${mp4}`);
console.log("MOTION_PACK_E2E_PASS");
