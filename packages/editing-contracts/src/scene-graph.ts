import { z } from "zod";
import { Id, Frame, Point, Rect, Color, Transform, Paint, Clip, Track, TextStyle, PathCommand, Geometry, Anchor } from "./primitives.js";

export const SCENE_GRAPH_VERSION = 1;

/** Sound Cue tied to artifact-local frame timing */
export const SoundCue = z.strictObject({
  id: Id,
  assetId: Id,
  localFrame: Frame,
  gainDb: z.number().min(-60).max(12).default(0),
  transientOffsetMs: z.number().min(0).max(5000).optional(),
  label: z.string().max(100).optional(),
});

/** Provenance and evidence binding for factual claims */
export const EvidenceBinding = z.strictObject({
  targetNodeId: Id,
  sourceId: Id,
  narrationTokenIds: z.array(Id).max(64),
  verifiedValue: z.string().max(1000),
  derivation: z.string().max(1000).optional(),
  status: z.enum(["verified", "derived", "illustrative"]).default("verified"),
});

/** Theme tokens applied to a SceneGraph composition */
export const SceneGraphTheme = z.strictObject({
  name: z.string().max(100),
  primary: Color,
  accent: Color,
  background: Color,
  text: Color,
  fontFamily: z.string().max(200),
  secondaryFont: z.string().max(200).optional(),
  lineWeight: z.number().min(1).max(16).default(2),
  radius: z.number().min(0).max(100).default(6),
});

/** Metric / Telemetry display node */
const nodeBase = {
  id: Id,
  parentId: Id.optional(),
  space: z.enum(["screen", "source-image", "parent"]).default("screen"),
  zIndex: z.number().int().min(-100).max(100).default(0),
  transform: Transform,
  opacity: z.number().min(0).max(1).default(1),
  clip: Clip.optional(),
  tracks: z.array(Track).max(16).default([]),
};

export const MetricNode = z.strictObject({
  ...nodeBase,
  kind: z.literal("metric"),
  targetValue: z.number().finite(),
  startValue: z.number().finite().default(0),
  unit: z.string().max(40).optional(),
  label: z.string().max(200).optional(),
  subLabel: z.string().max(200).optional(),
  prefix: z.string().max(20).optional(),
  suffix: z.string().max(20).optional(),
  decimals: z.number().int().min(0).max(4).default(0),
  bounds: Rect,
  style: TextStyle,
});

export const SceneGraphNode = z.discriminatedUnion("kind", [
  z.strictObject({ ...nodeBase, kind: z.literal("group") }),
  z.strictObject({
    ...nodeBase,
    kind: z.literal("text"),
    text: z.string().min(1).max(2000),
    style: TextStyle,
    bounds: Rect,
  }),
  z.strictObject({
    ...nodeBase,
    kind: z.literal("image"),
    assetId: Id,
    bounds: Rect,
    fit: z.enum(["contain", "cover"]),
    crop: z.strictObject({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0.0001).max(1),
      height: z.number().min(0.0001).max(1),
    }).optional(),
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
    commands: z.array(PathCommand).min(1).max(512),
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
  MetricNode,
]);

export const SceneGraph = z.strictObject({
  version: z.literal(1).default(1),
  seed: z.number().int().default(42),
  bounds: Rect,
  theme: SceneGraphTheme.optional(),
  nodes: z.array(SceneGraphNode).min(1).max(128),
  soundCues: z.array(SoundCue).max(8).default([]),
  evidence: z.array(EvidenceBinding).max(64).default([]),
  capabilities: z.array(z.string()).max(32).default([]),
});

export type SceneGraphData = z.infer<typeof SceneGraph>;
export type SceneGraphNodeData = z.infer<typeof SceneGraphNode>;
export type SoundCueData = z.infer<typeof SoundCue>;
export type EvidenceBindingData = z.infer<typeof EvidenceBinding>;
export type SceneGraphThemeData = z.infer<typeof SceneGraphTheme>;
