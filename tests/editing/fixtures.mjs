import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { identity, validateProject } from "@tubeflow/editing-contracts";
import {
  saveAsset,
  hash,
  publish,
} from "../../server/dist/services/editing/repository.js";
import { registerFonts } from "../../server/dist/services/editing/media.js";
import { runMedia } from "../../server/dist/services/media-process.js";
import { store } from "../../server/dist/services/store.js";
import { approximateAlignment } from "../../server/dist/services/editing/timing.js";
const paint = (fill, stroke = null) => ({
  fill,
  stroke,
  strokeWidth: 3,
  dash: [],
});
const base = (id, more = {}) => ({
  id,
  space: "screen",
  zIndex: 1,
  transform: identity(),
  opacity: 1,
  tracks: [],
  ...more,
});
export async function fixture(
  theme = "museum",
  portrait = false,
  empty = false,
) {
  const width = portrait ? 360 : 640,
    height = portrait ? 640 : 360,
    dir = path.resolve("artifacts/editing-smoke");
  fs.mkdirSync(dir, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#1c2935"/><ellipse cx="330" cy="300" rx="90" ry="210" fill="#a99880"/><circle cx="420" cy="380" r="35" fill="#d3c1a1"/><path d="M100 570 Q320 460 540 570" fill="none" stroke="#465965" stroke-width="8"/></svg>`;
  const bg = saveAsset(await sharp(Buffer.from(svg)).png().toBuffer(), {
    mime: "image/png",
    width: 640,
    height: 640,
    alpha: false,
    method: "fixture",
    providerVersion: "synthetic-statue-v1",
  });
  const cut = saveAsset(
    await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><path d="M64 4 Q120 60 112 95 Q64 150 16 95 Q8 60 64 4" fill="#52dbe2"/></svg>',
      ),
    )
      .png()
      .toBuffer(),
    {
      mime: "image/png",
      width: 128,
      height: 128,
      alpha: true,
      method: "fixture",
      providerVersion: "synthetic-cutout-v1",
    },
  );
  const wav = path.join(dir, "tone.wav");
  if (!fs.existsSync(wav))
    await runMedia("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3",
      "-c:a",
      "pcm_s16le",
      wav,
    ]);
  const audio = saveAsset(fs.readFileSync(wav), {
      mime: "audio/wav",
      duration: 3,
      alpha: false,
      method: "fixture",
      providerVersion: "synthetic-tone-not-narration",
    }),
    fonts = registerFonts();
  const text =
    theme === "science"
      ? "पानी गर्म होता है। Water becomes vapor. पानी गर्म होता है।"
      : "The supplied fixture describes a bronze statue and its hand. This label is a fixture claim, not an image inference.";
  const inputs = {
    scriptId: "editing-fixture",
    scriptHash: hash("fixture"),
    narrationText: text,
    narrationHash: hash(text),
    language: theme === "science" ? "hi" : "en",
    audioAssetId: audio.id,
    audioHash: audio.hash,
    imageAssets: [
      {
        assetId: bg.id,
        hash: bg.hash,
        promptIndex: 0,
        prompt: "Synthetic statue",
      },
    ],
    width,
    height,
    fps: 24,
    durationFrames: 72,
    audioFilename: "tone.wav",
    sceneTiming: [],
  };
  const alignment = approximateAlignment(inputs, 3),
    id = randomUUID();
  const p = {
    id,
    schemaVersion: 1,
    scriptId: inputs.scriptId,
    revisionId: randomUUID(),
    status: "ready",
    inputs,
    settings: {
      stylePreference: theme,
      density: "balanced",
      maxProviderCalls: 8,
      maxGeneratedAssets: 1,
    },
    style: {
      id: "fixture-style",
      direction: theme,
      colors: { accent: "#f4c97b", text: "#ffffff" },
      fontAssetIds: fonts.map((f) => f.id),
      headingSize: 30,
      bodySize: 24,
      lineWeight: 3,
      textureAssetIds: [],
      shapeTreatment: "free composition",
      motionIntensity: 0.3,
      minReadingSeconds: 2,
      minContrast: 4.5,
    },
    alignment,
    scenes: [
      {
        id: "scene-0",
        assetId: bg.id,
        startFrame: 0,
        endFrame: 72,
        narrativeRefs: alignment.tokens.map((t) => t.id),
        camera: [
          { frame: 0, x: 0, y: 0, scale: 1 },
          { frame: 72, x: 5, y: -3, scale: 1.12 },
        ],
        transitionFrames: 0,
        analysisId: "analysis-0",
        reservedRegions: [],
      },
    ],
    analyses: [
      {
        id: "analysis-0",
        assetId: bg.id,
        imageHash: bg.hash,
        width: 640,
        height: 640,
        description: "Synthetic statue, known fixture hand",
        protectedRegions: [],
        objects: [
          {
            id: "hand",
            description: "Known synthetic hand center",
            region: { x: 0.6, y: 0.53, width: 0.11, height: 0.12 },
            anchor: { x: 420 / 640, y: 380 / 640 },
            method: "fixture",
            confidence: 1,
            evidence: "Authored source SVG circle center",
          },
        ],
      },
    ],
    artifacts: [],
    assetIds: [bg.id, cut.id, audio.id, ...fonts.map((f) => f.id)],
    diagnostics: [],
    createdAt: new Date().toISOString(),
  };
  const label = (id, text, bounds) =>
    base(id, {
      kind: "text",
      text,
      bounds,
      style: {
        fontAssetId: fonts[theme === "science" ? 1 : 0].id,
        fontSize: 24,
        fontWeight: "400",
        color: "#ffffff",
        align: "left",
        lineHeight: 1.3,
        background: "#172033",
      },
    });
  const a = {
    id: "explanation",
    sceneId: "scene-0",
    enabled: true,
    intent:
      theme === "museum"
        ? "Magnify the actual hand and explain the supplied material"
        : theme === "technology"
          ? "Explain a connected three-stage process"
          : "Playful science explanation with a cutout and Hindi label",
    narrativeRefs: alignment.tokens.map((t) => t.id),
    startFrame: 0,
    endFrame: 72,
    priority: 1,
    nodes: [],
    assetRequestIds: [],
  };
  if (theme === "museum")
    a.nodes = [
      base("group", { kind: "group" }),
      base("detail", {
        kind: "image",
        assetId: bg.id,
        bounds: { x: 24, y: 24, width: 110, height: 110 },
        fit: "cover",
        crop: { x: 0.55, y: 0.48, width: 0.22, height: 0.24 },
        clip: {
          kind: "geometry",
          space: "screen",
          geometry: {
            kind: "ellipse",
            bounds: { x: 24, y: 24, width: 110, height: 110 },
          },
        },
      }),
      label("label", "Bronze · fixture claim", {
        x: 20,
        y: height - 82,
        width: width - 40,
        height: 64,
      }),
      base("pointer", {
        kind: "connector",
        from: {
          kind: "object",
          sceneId: "scene-0",
          objectId: "hand",
          offset: { x: 0, y: 0 },
        },
        to: {
          kind: "node",
          nodeId: "detail",
          point: { x: 0.8, y: 0.8 },
          offset: { x: 0, y: 0 },
        },
        paint: paint(null, "#f4c97b"),
        route: "curve",
      }),
    ];
  if (theme === "technology")
    a.nodes = [
      base("diagram", { kind: "group" }),
      ...[0, 1, 2].flatMap((i) => [
        base(`box-${i}`, {
          kind: "shape",
          parentId: "diagram",
          space: "parent",
          geometry: {
            kind: "rect",
            bounds: {
              x: 25 + (i * (width - 50)) / 3,
              y: 40,
              width: (width - 70) / 3,
              height: 70,
            },
            radius: 12,
          },
          paint: paint("#203d5a", "#65d9eb"),
        }),
        label(`text-${i}`, ["Input", "Model", "Result"][i], {
          x: 30 + (i * (width - 50)) / 3,
          y: 62,
          width: (width - 80) / 3,
          height: 40,
        }),
      ]),
      base("flow", {
        kind: "path",
        commands: [
          { op: "M", x: 40, y: 145 },
          {
            op: "C",
            x1: 150,
            y1: 230,
            x2: 220,
            y2: 100,
            x: width - 40,
            y: 170,
          },
        ],
        paint: paint(null, "#65d9eb"),
        tracks: [
          {
            property: "strokeProgress",
            keyframes: [
              { frame: 0, value: 0, easing: { kind: "linear" } },
              { frame: 40, value: 1, easing: { kind: "linear" } },
            ],
          },
        ],
      }),
    ];
  if (theme === "science")
    a.nodes = [
      base("cutout-group", {
        kind: "group",
        transform: { ...identity(), x: 20, y: 20 },
      }),
      base("drop", {
        kind: "image",
        parentId: "cutout-group",
        space: "parent",
        assetId: cut.id,
        bounds: { x: 0, y: 0, width: 128, height: 128 },
        fit: "contain",
        clip: {
          kind: "geometry",
          space: "parent",
          geometry: {
            kind: "polygon",
            points: [
              { x: 64, y: 0 },
              { x: 128, y: 64 },
              { x: 64, y: 128 },
              { x: 0, y: 64 },
            ],
          },
        },
        tracks: [
          {
            property: "y",
            keyframes: [
              {
                frame: 0,
                value: 0,
                easing: { kind: "bezier", x1: 0.3, y1: 0, x2: 0.7, y2: 1 },
              },
              { frame: 36, value: 20, easing: { kind: "linear" } },
              { frame: 71, value: 0, easing: { kind: "linear" } },
            ],
          },
        ],
      }),
      label("hindi", "पानी गर्म होता है।\nWater becomes vapor.", {
        x: 20,
        y: height - 115,
        width: width - 40,
        height: 100,
      }),
    ];
  if (!empty) p.artifacts = [a];
  validateProject(p);
  publish(p);
  store.add("scripts", { id: p.scriptId, name: "Editing fixture" });
  return p;
}
