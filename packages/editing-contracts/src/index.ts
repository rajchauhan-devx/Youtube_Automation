import { z } from "zod";
export * from "./primitives.js";
export * from "./scene-graph.js";

import {
  Id,
  UUID,
  Hash,
  num,
  positive,
  unit,
  Frame,
  Point,
  Rect,
  Crop,
  Color,
  Transform,
  identity,
  Easing,
  Track,
  PathCommand,
  Geometry,
  Paint,
  Clip,
  Anchor,
  TextStyle,
} from "./primitives.js";
import { SceneGraph, sceneGraphIssues } from "./scene-graph.js";

export const SCHEMA_VERSION = 1;
export const RENDERER_VERSION = "6.0.0";

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
  z.strictObject({
    ...nodeBase,
    kind: z.literal("lottie"),
    assetId: Id,
    bounds: Rect,
    loop: z.boolean().optional(),
  }),
  z.strictObject({
    ...nodeBase,
    kind: z.literal("audio"),
    assetId: Id,
  }),
]);
export const ImageMotion = z.enum(['hold', 'push-in', 'pull-out', 'drift-left', 'drift-right', 'drift-up', 'drift-down', 'diagonal-in', 'focus-in']);
export const ImageMotionSettings = {
  motion: ImageMotion,
  strength: z.number().min(0).max(0.2).optional(),
  focus: z.strictObject({ x: unit, y: unit }).optional(),
};
export const ImageComparison = z.strictObject({ mode: z.enum(['split', 'wipe']), beforeLabel: z.string().trim().max(40), afterLabel: z.string().trim().max(40) });
// Source pixels and annotations are separate. Anchors are normalized within sourceCrop.
export const DiagramReflow = z.strictObject({
  sourceCrop: Crop,
  labels: z.array(z.strictObject({
    text: z.string().trim().min(1).max(72),
    anchor: z.strictObject({ x: unit, y: unit }),
  })).min(1).max(6),
});
export const EditorialSequence = z.strictObject({
  template: z.enum(['impact', 'measure', 'process', 'assembly']),
  headline: z.string().trim().min(1).max(64),
  kicker: z.string().trim().max(64),
  facts: z.array(z.strictObject({ value: z.string().trim().min(1).max(24), label: z.string().trim().max(48) })).max(3),
  subjectAssetId: Id.optional(),
  direction: z.enum(['horizontal', 'incline']).default('horizontal'),
  disclosure: z.string().trim().max(80).default(''),
});
// Explicitly versioned; retired free-form nodes remain hidden on old projects.
export const DocumentaryComposition = z.strictObject({
  version: z.literal(1),
  treatment: z.enum(['archival', 'cinematic', 'map']),
  layout: z.enum(['inset', 'cutaway']).optional(),
  comparison: ImageComparison.optional(),
  diagram: DiagramReflow.optional(),
  editorial: EditorialSequence.optional(),
  layers: z.array(z.strictObject({
    id: Id,
    assetId: Id,
    bounds: Crop, // normalized inside the graphic's image stage
    crop: Crop.optional(),
    preserveSource: z.boolean().optional(), // embedded labels require the complete source throughout motion
    fit: z.enum(['contain', 'cover']),
    ...ImageMotionSettings,
    delay: z.number().min(0).max(0.5), // fraction of artifact duration
    rotation: z.number().min(-6).max(6),
  })).max(4),
  emphasis: z.enum(['none', 'focus', 'marker']),
}).refine(composition => !composition.comparison || composition.layers.length === 2, 'Image comparisons need exactly two source layers')
  .refine(c => !c.diagram || (c.layers.length === 1 && !c.comparison && c.layout === 'cutaway' && c.emphasis === 'none'),
    'Reflowed diagrams need one full-frame source and native annotations')
  .refine(c => c.editorial ? c.layers.length === 0 && !c.diagram && !c.comparison && c.emphasis === 'none' && c.layout === 'cutaway' : c.layers.length > 0,
    'Editorial sequences use their own scene elements; image compositions need source layers');
export type DocumentarySpec = z.infer<typeof DocumentaryComposition>;
export const MotionGraphic = z.strictObject({
  kind: z.enum(["title", "lower-third", "badge", "spotlight", "caption", "route", "counter", "frame", "diagram", "composition"]),
  title: z.string().trim().min(1).max(64),
  detail: z.string().trim().max(120),
  bounds: Rect,
  composition: DocumentaryComposition.optional(),
  wordTimings: z.array(z.strictObject({ startFrame: Frame, endFrame: Frame })).max(64).optional(),
  target: z.strictObject({
    label: z.string().trim().min(1).max(120),
    region: Crop,
    evidence: z.string().max(1000),
    verified: z.literal(true),
  }).optional(),
}).refine(g => g.kind !== "spotlight" || !!g.target, "A spotlight needs a verified target")
  .refine(g => (g.kind === 'composition') === !!g.composition, 'Only documentary compositions carry image layers')
  .refine(g => !g.composition || g.composition.emphasis === 'none' || !!g.target, 'Source emphasis needs a verified target')
  .refine(g => g.composition?.layout !== 'cutaway' || g.composition.emphasis === 'none', 'A cutaway cannot highlight its hidden background');
export type MotionGraphicSpec = z.infer<typeof MotionGraphic>;

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
  graphic: MotionGraphic.optional(),
  sceneGraph: SceneGraph.optional(),
  visualReview: z.strictObject({
    status: z.enum(['pending', 'passed', 'unavailable', 'rejected']),
    attempts: z.number().int().min(0).max(2),
    frames: z.array(Frame).max(16),
    reason: z.string().max(2000),
  }).optional(),
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
  framing: z.enum(['contain', 'cover']).optional(),
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
    "application/json",
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
  aiModel: z.string().max(150).optional(),
  documentary: z.boolean().default(true),
  treatment: z.enum(['auto', 'archival', 'cinematic', 'map']).default('auto'),
  visualReview: z.boolean().default(true),
  graphicEngine: z.enum(['directed', 'generative']).default('directed'),
  motionLevel: z.enum(['subtle', 'balanced', 'expressive', 'still']).default('balanced'),
  soundDesign: z.enum(['off', 'subtle', 'balanced', 'expressive']).default('off'),
});
export const Project = z.strictObject({
  id: UUID,
  schemaVersion: z.union([z.literal(1), z.literal(2)]).default(1),
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
  documentaryRequirement: z.strictObject({ version: z.literal(1) }).optional(),
  style: Style,
  alignment: Alignment,
  scenes: z.array(Scene).min(1).max(160),
  analyses: z.array(Analysis).max(160),
  artifacts: z.array(Artifact).max(1000),
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
  operation: z.enum(["generate", "revise", "render", "review", "align"]),
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
/** Legacy quota check. motionProject retires this requirement for optional graphics. */
export function assertDocumentaryVisuals(project: EditingProject) {
  if (!project.documentaryRequirement) return;
  if (!project.artifacts.some(a => a.enabled && a.graphic?.kind === 'composition' && (a.graphic.composition?.layers.length || a.graphic.composition?.editorial)))
    throw new Error('Image-led documentary generation produced no enabled image compositions. Review the skipped visuals or regenerate; text-only export is blocked.');
}
export function assertGraphicsReviewed(project: EditingProject) {
  if (!project.settings.visualReview) return;
  const pending = project.artifacts.filter(a => a.enabled && (a.sceneGraph || (a.graphic && a.graphic.kind !== 'caption')) && a.visualReview?.status !== 'passed');
  if (pending.length) throw new Error(`Rendered vision review has not passed for ${pending.length} motion graphic(s). Retry visual review before exporting.`);
}
export type ArtifactRepresentation = 'legacy-nodes' | 'legacy-graphic' | 'scene-graph' | 'empty';

export function artifactRepresentation(artifact: z.infer<typeof Artifact>): ArtifactRepresentation {
  const hasLegacyNodes = artifact.nodes && artifact.nodes.length > 0;
  const hasGraphic = !!artifact.graphic;
  const hasSceneGraph = !!artifact.sceneGraph;

  const count = (hasLegacyNodes ? 1 : 0) + (hasGraphic ? 1 : 0) + (hasSceneGraph ? 1 : 0);
  if (count > 1) {
    throw new Error(`Artifact ${artifact.id} has multiple conflicting representations: legacy-nodes=${hasLegacyNodes}, graphic=${hasGraphic}, scene-graph=${hasSceneGraph}`);
  }
  if (hasSceneGraph) return 'scene-graph';
  if (hasGraphic) return 'legacy-graphic';
  if (hasLegacyNodes) return 'legacy-nodes';
  return 'empty';
}

export function isRenderableArtifact(artifact: z.infer<typeof Artifact>): boolean {
  if (!artifact.enabled) return false;
  const rep = artifactRepresentation(artifact);
  return rep !== 'empty';
}

export function collectArtifactAssets(artifact: z.infer<typeof Artifact>): string[] {
  const assets: string[] = [];
  if (artifact.graphic?.composition) {
    artifact.graphic.composition.layers.forEach(l => assets.push(l.assetId));
    if (artifact.graphic.composition.editorial?.subjectAssetId) {
      assets.push(artifact.graphic.composition.editorial.subjectAssetId);
    }
  }
  if (artifact.sceneGraph) {
    for (const node of artifact.sceneGraph.nodes) {
      if (node.kind === 'image') assets.push(node.assetId);
      if (node.clip?.kind === 'mask') assets.push(node.clip.assetId);
      if (node.kind === 'text' && node.style?.fontAssetId) assets.push(node.style.fontAssetId);
      if (node.kind === 'metric' && node.style?.fontAssetId) assets.push(node.style.fontAssetId);
    }
    for (const cue of artifact.sceneGraph.soundCues) {
      assets.push(cue.assetId);
    }
  }
  if (artifact.nodes) {
    for (const node of artifact.nodes) {
      if (node.kind === 'image' || node.kind === 'lottie' || node.kind === 'audio') {
        assets.push(node.assetId);
      }
      if (node.kind === 'text') {
        assets.push(node.style.fontAssetId);
      }
    }
  }
  return [...new Set(assets)];
}

/** Read old revisions without displaying retired captions, stickers or generated assets.
 * Saved revisions remain intact; new revisions and exports use only the native graphics. */
export function motionProject(input: EditingProject): EditingProject {
  const p = structuredClone(input);
  // Graphics are optional, including in saved projects from the old quota-based planner.
  delete p.documentaryRequirement;
  p.artifacts = p.artifacts.filter(a => isRenderableArtifact(a));
  p.analyses = [];
  p.scenes.forEach(s => { delete s.analysisId; });
  p.style.textureAssetIds = [];
  
  const artifactAssets = p.artifacts.flatMap(a => collectArtifactAssets(a));
  p.assetIds = [...new Set([
    p.inputs.audioAssetId,
    ...p.inputs.imageAssets.map(a => a.assetId),
    ...p.style.fontAssetIds,
    ...artifactAssets,
  ])];
  p.sceneOutcomes = p.sceneOutcomes?.map(s => ({ ...s, artifactIds: s.artifactIds.filter(id => p.artifacts.some(a => a.id === id)) }));
  return p;
}
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
  sceneGraph: { version: 1, nodes: ["group", "text", "image", "shape", "path", "connector", "metric"], sharedPreviewExport: true, soundCues: true },
  primitives: ["CinematicTitle", "CharacterLowerThird", "LocationBadge", "ObjectSpotlight", "MotionCaption", "RouteLine", "DateCounter", "ArchivalFrame", "DiagramCallout", "DocumentaryComposition"],
  coordinates:
    "design pixels; source anchors/crops normalized; keyframes artifact-local",
  limits: {
    nodesPerArtifact: 128,
    depth: 8,
    pathCommands: 256,
    artifacts: 1000,
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
    // Validate artifact representation exclusivity
    artifactRepresentation(a);

    if (a.sceneGraph) {
      for (const evidence of a.sceneGraph.evidence) {
        if (evidence.narrationTokenIds.some(id => !tokens.has(id) || !scene!.narrativeRefs.includes(id))) fail('Unresolved scene graph narration evidence');
        if (evidence.status === 'narration' && evidence.sourceId !== scene!.id) fail('Narration evidence belongs to another scene');
      }
      const graphIssues = sceneGraphIssues(a.sceneGraph, a.endFrame - a.startFrame);
      if (graphIssues.length) fail(graphIssues.join('; '));
      const b = a.sceneGraph.bounds;
      if (!a.narrativeRefs.length) fail("Scene graph requires narration evidence");
      if (b.x < 0 || b.y < 0 || b.x + b.width > p.inputs.width || b.y + b.height > p.inputs.height)
        fail("Scene graph exceeds the output canvas");
      unique(a.sceneGraph.nodes.map(n => n.id), "scene graph node ID");

      const nodeMap = new Map(a.sceneGraph.nodes.map(n => [n.id, n]));
      for (const node of a.sceneGraph.nodes) {
        if (node.kind === 'image') asset(node.assetId);
        if (node.kind === 'text' && node.style?.fontAssetId) asset(node.style.fontAssetId);
        if (node.kind === 'metric' && node.style?.fontAssetId) asset(node.style.fontAssetId);

        // Check parent cycles & depth
        let depth = 0;
        let curr = node.parentId;
        const seen = new Set<string>([node.id]);
        while (curr) {
          if (seen.has(curr) || depth >= 8) fail(`Scene graph cycle or excessive depth for node ${node.id}`);
          seen.add(curr);
          depth++;
          curr = nodeMap.get(curr)?.parentId;
        }

        // Check connector references
        if (node.kind === 'connector') {
          if (node.from.kind === 'node' && !nodeMap.has(node.from.nodeId)) {
            fail(`Connector ${node.id} references missing 'from' node ${node.from.nodeId}`);
          }
          if (node.to.kind === 'node' && !nodeMap.has(node.to.nodeId)) {
            fail(`Connector ${node.id} references missing 'to' node ${node.to.nodeId}`);
          }
        }
      }

      for (const cue of a.sceneGraph.soundCues) {
        asset(cue.assetId);
        if (cue.localFrame < 0 || cue.localFrame >= a.endFrame - a.startFrame) {
          fail(`Sound cue ${cue.id} local frame ${cue.localFrame} outside artifact interval`);
        }
      }
    }

    if (a.graphic) {
      const b = a.graphic.bounds;
      if (!a.narrativeRefs.length) fail("Motion graphics require narration evidence");
      if (b.x < 0 || b.y < 0 || b.x + b.width > p.inputs.width || b.y + b.height > p.inputs.height)
        fail("Motion graphic exceeds the output canvas");
      if (a.nodes.length) fail("Motion graphics cannot include legacy composition nodes");
      if (a.graphic.wordTimings && (a.graphic.kind !== 'caption' || a.graphic.wordTimings.length !== a.graphic.title.split(/\s+/u).filter(Boolean).length ||
        a.graphic.wordTimings.some((word, index, words) => word.endFrame <= word.startFrame || word.endFrame > a.endFrame - a.startFrame || (index > 0 && word.startFrame < words[index - 1].startFrame)))) fail('Invalid caption word timing');
      if (a.graphic.composition) {
        unique(a.graphic.composition.layers.map(layer => layer.id), 'documentary layer ID');
        a.graphic.composition.layers.forEach(layer => asset(layer.assetId));
        if (a.graphic.composition.editorial?.subjectAssetId) asset(a.graphic.composition.editorial.subjectAssetId);
      }
    }
    if (a.visualReview?.frames.some(frame => frame < a.startFrame || frame >= a.endFrame))
      fail('Visual review frame is outside its artifact');
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
      if (n.kind === "lottie") {
        asset(n.assetId);
        if (!n.bounds || n.bounds.width <= 0 || n.bounds.height <= 0)
          fail("Lottie node requires positive bounds");
      }
      if (n.kind === "audio") {
        asset(n.assetId);
        if (JSON.stringify(n.transform) !== JSON.stringify(identity()))
          fail("Audio nodes carry no visual transform");
        if (n.tracks.some((t) => t.property !== "opacity"))
          fail("Audio nodes animate volume (opacity) only");
      }
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
export * from './motion-template.js';
