import { z } from "zod";

export const SCHEMA_VERSION = 1;
export const RENDERER_VERSION = "1.0.0";
export const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const UUID = z.uuid();
export const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const num = z.number().finite().min(-100000).max(100000);
const positive = z.number().finite().positive().max(100000);
const unit = z.number().min(0).max(1);
export const Frame = z.number().int().min(0).max(216000);
export const Point = z.strictObject({ x: num, y: num });
export const Rect = z.strictObject({
  x: num,
  y: num,
  width: positive,
  height: positive,
});
export const Crop = z
  .strictObject({ x: unit, y: unit, width: unit.gt(0), height: unit.gt(0) })
  .refine(
    (r) => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001,
    "Crop exceeds source bounds",
  );
export const Color = z.string().regex(/^#[a-fA-F0-9]{6}([a-fA-F0-9]{2})?$/);
export const Transform = z.strictObject({
  x: num,
  y: num,
  scaleX: z.number().min(0.01).max(100),
  scaleY: z.number().min(0.01).max(100),
  rotation: num,
  pivot: Point,
});
export const identity = () => ({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  pivot: { x: 0, y: 0 },
});
export const Easing = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("linear") }),
  z.strictObject({
    kind: z.literal("bezier"),
    x1: unit,
    y1: unit,
    x2: unit,
    y2: unit,
  }),
  z.strictObject({
    kind: z.literal("spring"),
    stiffness: z.number().min(1).max(500),
    damping: z.number().min(1).max(100),
    mass: z.number().min(0.1).max(10),
  }),
]);
export const Track = z.strictObject({
  property: z.enum([
    "x",
    "y",
    "scaleX",
    "scaleY",
    "rotation",
    "opacity",
    "strokeProgress",
    "clipProgress",
  ]),
  keyframes: z
    .array(z.strictObject({ frame: Frame, value: num, easing: Easing }))
    .min(1)
    .max(120),
});
export const PathCommand = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("M"), x: num, y: num }),
  z.strictObject({ op: z.literal("L"), x: num, y: num }),
  z.strictObject({ op: z.literal("Q"), x1: num, y1: num, x: num, y: num }),
  z.strictObject({
    op: z.literal("C"),
    x1: num,
    y1: num,
    x2: num,
    y2: num,
    x: num,
    y: num,
  }),
  z.strictObject({ op: z.literal("Z") }),
]);
export const Geometry = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("rect"),
    bounds: Rect,
    radius: z.number().min(0).max(1000),
  }),
  z.strictObject({ kind: z.literal("ellipse"), bounds: Rect }),
  z.strictObject({
    kind: z.literal("polygon"),
    points: z.array(Point).min(3).max(128),
  }),
]);
export const Paint = z.strictObject({
  fill: Color.nullable(),
  stroke: Color.nullable(),
  strokeWidth: z.number().min(0).max(100),
  dash: z.array(z.number().positive().max(1000)).max(12),
  gradient: z
    .strictObject({
      angle: num,
      stops: z
        .array(z.strictObject({ offset: unit, color: Color }))
        .min(2)
        .max(8),
    })
    .optional(),
  shadow: z
    .strictObject({
      color: Color,
      blur: z.number().min(0).max(30),
      x: num,
      y: num,
    })
    .optional(),
});
export const Clip = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("geometry"),
    space: z.enum(["screen", "source-image", "parent"]),
    geometry: Geometry,
  }),
  z.strictObject({
    kind: z.literal("path"),
    space: z.enum(["screen", "source-image", "parent"]),
    commands: z.array(PathCommand).min(1).max(256),
  }),
  z.strictObject({
    kind: z.literal("mask"),
    space: z.enum(["screen", "source-image", "parent"]),
    assetId: Id,
    bounds: Rect,
    mode: z.enum(["alpha", "luminance"]),
  }),
]);
export const Anchor = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("screen"), point: Point }),
  z.strictObject({
    kind: z.literal("source"),
    sceneId: Id,
    assetId: Id,
    point: z.strictObject({ x: unit, y: unit }),
    offset: Point,
  }),
  z.strictObject({
    kind: z.literal("object"),
    sceneId: Id,
    objectId: Id,
    offset: Point,
  }),
  z.strictObject({
    kind: z.literal("node"),
    nodeId: Id,
    point: z.strictObject({ x: unit, y: unit }),
    offset: Point,
  }),
]);
const nodeBase = {
  id: Id,
  parentId: Id.optional(),
  space: z.enum(["screen", "source-image", "parent"]),
  zIndex: z.number().int().min(-100).max(100),
  transform: Transform,
  opacity: unit,
  clip: Clip.optional(),
  tracks: z.array(Track).max(8),
};
export const TextStyle = z.strictObject({
  fontAssetId: Id,
  fontSize: z.number().min(12).max(300),
  fontWeight: z.enum(["400", "700"]),
  color: Color,
  align: z.enum(["left", "center", "right"]),
  lineHeight: z.number().min(1).max(2),
  background: Color.optional(),
});
export const Node = z.discriminatedUnion("kind", [
  z.strictObject({ ...nodeBase, kind: z.literal("group") }),
  z.strictObject({
    ...nodeBase,
    kind: z.literal("text"),
    text: z.string().min(1).max(1000),
    style: TextStyle,
    bounds: Rect,
  }),
  z.strictObject({
    ...nodeBase,
    kind: z.literal("image"),
    assetId: Id,
    bounds: Rect,
    fit: z.enum(["contain", "cover"]),
    crop: Crop.optional(),
  }),
  z.strictObject({
    ...nodeBase,
    kind: z.literal("shape"),
    geometry: Geometry,
    paint: Paint,
  }),
  z.strictObject({
    ...nodeBase,
    kind: z.literal("path"),
    commands: z.array(PathCommand).min(1).max(256),
    paint: Paint,
  }),
  z.strictObject({
    ...nodeBase,
    kind: z.literal("connector"),
    from: Anchor,
    to: Anchor,
    paint: Paint,
    route: z.enum(["line", "elbow", "curve"]),
  }),
]);
export const Artifact = z.strictObject({
  id: Id,
  sceneId: Id,
  enabled: z.boolean(),
  intent: z.string().min(1).max(2000),
  narrativeRefs: z.array(Id).max(100),
  startFrame: Frame,
  endFrame: Frame,
  priority: z.number().int().min(0).max(10),
  nodes: z.array(Node).max(128),
  assetRequestIds: z.array(Id).max(20),
  revisionInstruction: z.string().max(2000).optional(),
});
export const Style = z.strictObject({
  id: Id,
  direction: z.string().max(3000),
  colors: z.record(Id, Color),
  fontAssetIds: z.array(Id).min(1).max(8),
  headingSize: z.number().min(24).max(180),
  bodySize: z.number().min(20).max(120),
  lineWeight: z.number().min(1).max(16),
  textureAssetIds: z.array(Id).max(5),
  shapeTreatment: z.string().max(500),
  motionIntensity: unit,
  minReadingSeconds: z.number().min(1).max(10),
  minContrast: z.number().min(3).max(21),
});
export const Diagnostic = z.strictObject({
  severity: z.enum(["info", "warning", "error"]),
  code: Id,
  stage: Id,
  sceneId: Id.optional(),
  artifactId: Id.optional(),
  nodeId: Id.optional(),
  message: z.string().max(4000),
  repair: z.string().max(2000).optional(),
  retryable: z.boolean(),
});
export const Token = z.strictObject({
  id: Id,
  text: z.string().max(2000),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().positive(),
  start: z.number().min(0),
  end: z.number().positive(),
  confidence: unit,
  evidence: z.string().max(1000),
});
export const Alignment = z.strictObject({
  audioHash: Hash,
  narrationHash: Hash,
  language: z.enum(["en", "hi"]),
  duration: z.number().positive().max(3600),
  tokens: z.array(Token).max(20000),
  provider: z.string().max(200),
  version: z.string().max(100),
  mode: z.enum(["word", "phrase", "approximate"]),
});
export const Analysis = z.strictObject({
  id: Id,
  assetId: Id,
  imageHash: Hash,
  width: positive,
  height: positive,
  description: z.string().max(3000),
  protectedRegions: z.array(Crop).max(32),
  objects: z
    .array(
      z.strictObject({
        id: Id,
        description: z.string().max(1000),
        region: Crop,
        anchor: z.strictObject({ x: unit, y: unit }),
        maskAssetId: Id.optional(),
        method: z.enum(["vision-estimate", "grounding", "fixture"]),
        confidence: unit,
        evidence: z.string().max(1000),
      }),
    )
    .max(64),
});
export const Scene = z.strictObject({
  id: Id,
  assetId: Id,
  startFrame: Frame,
  endFrame: Frame,
  narrativeRefs: z.array(Id).max(1000),
  camera: z
    .array(
      z.strictObject({
        frame: Frame,
        x: num,
        y: num,
        scale: z.number().min(1).max(3),
      }),
    )
    .min(1)
    .max(16),
  transitionFrames: z.number().int().min(0).max(120),
  analysisId: Id.optional(),
  reservedRegions: z.array(Rect).max(32),
});
export const Asset = z.strictObject({
  id: Id,
  hash: Hash,
  mime: z.enum([
    "image/png",
    "image/jpeg",
    "image/webp",
    "audio/wav",
    "audio/mpeg",
    "font/woff2",
    "video/mp4",
  ]),
  width: positive.optional(),
  height: positive.optional(),
  duration: z.number().positive().optional(),
  alpha: z.boolean(),
  path: z
    .string()
    .max(300)
    .regex(/^[a-zA-Z0-9_/.-]+$/)
    .refine(
      (p) =>
        !p.startsWith("/") &&
        !p.split("/").some((s) => s === ".." || s === "." || !s),
      "Invalid relative asset path",
    ),
  method: z.enum([
    "import",
    "crop",
    "generate",
    "background-removal",
    "font",
    "fixture",
  ]),
  providerVersion: z.string().max(200),
  seed: z.number().int().optional(),
  sourceUrl: z.url().optional(),
  license: z.string().max(1000).optional(),
  attribution: z.string().max(1000).optional(),
});
export const AssetRequest = z.strictObject({
  id: Id,
  purpose: z.string().max(2000),
  strategy: z.enum(["reuse", "crop", "generate", "retrieve"]),
  sourceAssetId: Id.optional(),
  prompt: z.string().max(4000).optional(),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  crop: Crop.optional(),
  transparent: z.boolean(),
  width: z.number().int().min(64).max(2048),
  height: z.number().int().min(64).max(2048),
  styleId: Id,
  referenceAssetIds: z.array(Id).max(8),
});
export const Snapshot = z.strictObject({
  scriptId: Id,
  scriptHash: Hash,
  narrationText: z.string().min(1).max(50000),
  narrationHash: Hash,
  language: z.enum(["en", "hi"]),
  audioAssetId: Id,
  audioHash: Hash,
  imageAssets: z
    .array(
      z.strictObject({
        assetId: Id,
        hash: Hash,
        promptIndex: z.number().int().min(0),
        prompt: z.string().max(10000),
      }),
    )
    .min(1)
    .max(160),
  width: z.number().int().min(320).max(3840),
  height: z.number().int().min(320).max(3840),
  fps: z.number().int().min(12).max(60),
  durationFrames: Frame.min(1),
  audioFilename: z.string().max(200),
  sceneTiming: z
    .array(
      z.strictObject({
        sceneId: Id,
        text: z.string().max(5000),
        start: z.number().min(0),
        end: z.number().positive(),
        promptIndex: z.number().int().min(0),
      }),
    )
    .max(160),
});
export const Settings = z.strictObject({
  stylePreference: z.string().max(2000),
  density: z.enum(["subtle", "balanced", "expressive"]),
  maxProviderCalls: z.number().int().min(1).max(2000),
  maxGeneratedAssets: z.number().int().min(0).max(20),
});
export const Project = z.strictObject({
  id: UUID,
  schemaVersion: z.literal(1),
  scriptId: Id,
  revisionId: UUID,
  parentRevisionId: UUID.optional(),
  status: z.enum([
    "draft",
    "processing",
    "partial",
    "ready",
    "needs_configuration",
    "failed",
  ]),
  inputs: Snapshot,
  settings: Settings,
  style: Style,
  alignment: Alignment,
  scenes: z.array(Scene).min(1).max(160),
  analyses: z.array(Analysis).max(160),
  artifacts: z.array(Artifact).max(160),
  assetIds: z.array(Id).max(1000),
  sceneOutcomes: z.array(z.strictObject({
    sceneId: Id,
    state: z.enum(["planned", "not_needed", "complete", "failed"]),
    reason: z.string().max(2000),
    artifactIds: z.array(Id).max(10),
  })).max(160).optional(),
  diagnostics: z.array(Diagnostic).max(2000),
  createdAt: z.iso.datetime(),
});
export const Job = z.strictObject({
  id: UUID,
  projectId: UUID,
  revisionId: UUID,
  operation: z.enum(["generate", "revise", "render"]),
  inputHash: Hash,
  idempotencyKey: z.string().min(1).max(128),
  state: z.enum([
    "queued",
    "running",
    "cancel_requested",
    "cancelled",
    "succeeded",
    "partial",
    "failed",
    "needs_configuration",
    "interrupted",
  ]),
  stage: z.string().max(100),
  attempts: z.number().int().min(0),
  completed: z.number().int().min(0),
  total: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  heartbeat: z.iso.datetime().optional(),
  artifactId: Id.optional(),
  instruction: z.string().max(2000).optional(),
  resultRevisionId: UUID.optional(),
  outputUrl: z.string().max(500).optional(),
  error: z.string().max(4000).optional(),
  stages: z.record(
    z.string(),
    z.strictObject({
      durationMs: z.number().min(0),
      output: z.string().max(300).optional(),
    }),
  ),
  usage: z
    .array(
      z.strictObject({
        operation: z.string(),
        model: z.string(),
        promptVersion: z.string(),
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
      }),
    )
    .max(2000),
});
export const RenderManifest = z.strictObject({
  planHash: Hash,
  revisionId: UUID,
  rendererVersion: z.string(),
  schemaVersion: z.number(),
  assetHashes: z.record(Id, Hash),
  fontHashes: z.record(Id, Hash),
  width: positive,
  height: positive,
  fps: positive,
  frameCount: Frame,
  audioAssetId: Id,
  outputUrl: z.string(),
  qa: z.array(Diagnostic),
  durationMs: z.number().min(0),
});
export type EditingProject = z.infer<typeof Project>;
export type CompositionNode = z.infer<typeof Node>;
export type ArtifactComposition = z.infer<typeof Artifact>;
export type AssetRecord = z.infer<typeof Asset>;
export type JobRecord = z.infer<typeof Job>;
export type ScenePlan = z.infer<typeof Scene>;
export type SceneAnalysis = z.infer<typeof Analysis>;
export type AnchorRef = z.infer<typeof Anchor>;
export type AnimationTrack = z.infer<typeof Track>;
export type Transform2D = z.infer<typeof Transform>;
export type DiagnosticRecord = z.infer<typeof Diagnostic>;
export type AlignmentResult = z.infer<typeof Alignment>;
export const toFrame = (seconds: number, fps: number) =>
  Math.round(seconds * fps);
export const durationFrames = (seconds: number, fps: number) =>
  Math.ceil(seconds * fps);
export const capabilities = {
  schemaVersion: 1,
  rendererVersion: RENDERER_VERSION,
  primitives: ["group", "text", "image", "shape", "path", "connector"],
  coordinates:
    "design pixels; source anchors/crops normalized; keyframes artifact-local",
  limits: {
    nodesPerArtifact: 128,
    depth: 8,
    pathCommands: 256,
    artifacts: 160,
  },
  unsupported: [
    "video nodes",
    "particles",
    "3D",
    "executable code",
    "path morphing",
    "animated GIF",
  ],
};

/** Cross-field checks are deliberately shared by planning, preview and export. */
export function validateProject(value: unknown): EditingProject {
  const p = Project.parse(value);
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const unique = (ids: string[], label: string) => {
    if (new Set(ids).size !== ids.length) fail(`Duplicate ${label}`);
  };
  unique(p.assetIds, "asset ID");
  unique(
    p.scenes.map((s) => s.id),
    "scene ID",
  );
  unique(
    p.artifacts.map((a) => a.id),
    "artifact ID",
  );
  unique(
    p.alignment.tokens.map((t) => t.id),
    "token ID",
  );
  unique(
    p.analyses.map((a) => a.id),
    "analysis ID",
  );
  const assets = new Set(p.assetIds),
    tokens = new Set(p.alignment.tokens.map((t) => t.id));
  const asset = (id: string) => {
    if (!assets.has(id)) fail(`Unresolved asset ${id}`);
  };
  asset(p.inputs.audioAssetId);
  p.inputs.imageAssets.forEach((i) => asset(i.assetId));
  p.style.fontAssetIds.forEach(asset);
  p.style.textureAssetIds.forEach(asset);
  if (
    p.alignment.audioHash !== p.inputs.audioHash ||
    p.alignment.narrationHash !== p.inputs.narrationHash ||
    p.alignment.language !== p.inputs.language
  )
    fail("Alignment identity mismatch");
  if (
    durationFrames(p.alignment.duration, p.inputs.fps) !==
    p.inputs.durationFrames
  )
    fail("Audio duration mismatch");
  let previousOffset = 0,
    previousTime = 0;
  for (const t of p.alignment.tokens) {
    if (
      t.startOffset < previousOffset ||
      t.endOffset <= t.startOffset ||
      t.endOffset > p.inputs.narrationText.length ||
      p.inputs.narrationText.slice(t.startOffset, t.endOffset) !== t.text ||
      t.end <= t.start ||
      t.start < previousTime ||
      t.end > p.alignment.duration + 0.001
    )
      fail(`Invalid alignment token ${t.id}`);
    previousOffset = t.endOffset;
    previousTime = t.end;
  }
  let cursor = 0;
  for (const s of p.scenes) {
    asset(s.assetId);
    if (
      s.startFrame !== cursor ||
      s.endFrame <= s.startFrame ||
      s.transitionFrames > (s.endFrame - s.startFrame) / 2
    )
      fail(`Invalid scene interval ${s.id}`);
    s.narrativeRefs.forEach((r) => {
      if (!tokens.has(r)) fail(`Unresolved narrative ${r}`);
    });
    if (
      s.analysisId &&
      !p.analyses.some((a) => a.id === s.analysisId && a.assetId === s.assetId)
    )
      fail("Unresolved scene analysis");
    s.camera.forEach((k, i) => {
      if (
        k.frame > s.endFrame - s.startFrame ||
        (i > 0 && k.frame <= s.camera[i - 1].frame)
      )
        fail("Invalid camera keyframes");
    });
    cursor = s.endFrame;
  }
  if (cursor !== p.inputs.durationFrames)
    fail("Scenes must cover the entire narration");
  for (const analysis of p.analyses) {
    asset(analysis.assetId);
    unique(
      analysis.objects.map((o) => o.id),
      "object ID",
    );
    analysis.objects.forEach((o) => {
      if (o.maskAssetId) asset(o.maskAssetId);
    });
  }
  for (const a of p.artifacts) {
    const scene = p.scenes.find((s) => s.id === a.sceneId);
    if (
      !scene ||
      a.startFrame < scene.startFrame ||
      a.endFrame > scene.endFrame ||
      a.endFrame <= a.startFrame
    )
      fail(`Invalid artifact interval ${a.id}`);
    a.narrativeRefs.forEach((r) => {
      if (!tokens.has(r) || !scene!.narrativeRefs.includes(r))
        fail(`Unresolved artifact narrative ${r}`);
    });
    if (a.nodes.some((n) => n.kind === "text") && !a.narrativeRefs.length)
      fail("Text requires supplied narrative references");
    unique(
      a.nodes.map((n) => n.id),
      "node ID",
    );
    const map = new Map(a.nodes.map((n) => [n.id, n]));
    const visit = (n: CompositionNode, seen = new Set<string>()) => {
      if (seen.has(n.id) || seen.size >= 8)
        fail("Node graph cycle or excessive depth");
      seen.add(n.id);
      if (n.parentId) {
        const parent = map.get(n.parentId);
        if (!parent || parent.kind !== "group" || n.space !== "parent")
          fail("Invalid parent reference/space");
        visit(parent!, seen);
      } else if (n.space === "parent") fail("Parent space requires a parent");
    };
    for (const n of a.nodes) {
      visit(n);
      if (n.kind === "image") asset(n.assetId);
      if (n.kind === "text") {
        asset(n.style.fontAssetId);
        if (!p.style.fontAssetIds.includes(n.style.fontAssetId))
          fail("Unapproved font");
      }
      if (n.clip?.kind === "mask") asset(n.clip.assetId);
      if (n.clip && n.clip.space !== n.space)
        fail("Clip must use the node coordinate space");
      unique(
        n.tracks.map((t) => t.property),
        "animation property",
      );
      for (const t of n.tracks)
        t.keyframes.forEach((k, i) => {
          if (
            k.frame > a.endFrame - a.startFrame ||
            (i > 0 && k.frame <= t.keyframes[i - 1].frame)
          )
            fail("Invalid animation keyframe interval");
          if (
            ["opacity", "strokeProgress", "clipProgress"].includes(
              t.property,
            ) &&
            (k.value < 0 || k.value > 1)
          )
            fail("Progress/opacity outside unit interval");
          if (
            ["scaleX", "scaleY"].includes(t.property) &&
            (k.value < 0.01 || k.value > 100)
          )
            fail("Animation scale outside limits");
        });
      if (n.kind === "connector") {
        if (
          n.parentId ||
          n.space !== "screen" ||
          JSON.stringify(n.transform) !== JSON.stringify(identity()) ||
          n.tracks.some(
            (t) => !["opacity", "strokeProgress"].includes(t.property),
          )
        )
          fail(
            "Connectors resolve in screen space and cannot have an additional transform",
          );
        for (const anchor of [n.from, n.to]) {
          if (anchor.kind === "node") {
            const target = map.get(anchor.nodeId);
            if (!target || !("bounds" in target))
              fail("Node attachment requires bounded text/image node");
          }
          if (
            anchor.kind === "source" &&
            (anchor.sceneId !== a.sceneId || anchor.assetId !== scene!.assetId)
          )
            fail("Source anchor identity mismatch");
          if (anchor.kind === "object") {
            const object = p.analyses
              .find((s) => s.id === scene!.analysisId)
              ?.objects.find((o) => o.id === anchor.objectId);
            if (
              anchor.sceneId !== a.sceneId ||
              !object ||
              object.method === "vision-estimate" ||
              object.confidence < 0.8
            )
              fail("Precise pointer requires verified localization");
          }
        }
      }
    }
  }
  return p;
}
