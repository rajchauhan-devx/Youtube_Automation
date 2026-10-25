import { z } from "zod";
import { Id, Frame, Point, Rect, Color, Transform, Paint, Clip, Track, TextStyle, PathCommand, Geometry, Anchor } from "./primitives.js";
import { MotionTemplateSelection } from './motion-template.js';

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
  status: z.enum(["verified", "narration", "derived", "illustrative"]).default("verified"),
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

const SceneGraphBase = z.strictObject({
  template: MotionTemplateSelection.optional(),
  version: z.literal(1).default(1),
  seed: z.number().int().default(42),
  bounds: Rect,
  theme: SceneGraphTheme.optional(),
  nodes: z.array(SceneGraphNode).min(1).max(128),
  soundCues: z.array(SoundCue).max(8).default([]),
  evidence: z.array(EvidenceBinding).max(64).default([]),
  capabilities: z.array(z.string()).max(32).default([]),
});

export type SceneGraphData = z.infer<typeof SceneGraphBase>;

/** Structural and reference validation shared by providers, persistence and rendering. */
export function sceneGraphIssues(graph: SceneGraphData, durationFrames?: number): string[] {
  const issues: string[] = [];
  const ids = new Map(graph.nodes.map(n => [n.id, n]));
  if (ids.size !== graph.nodes.length) issues.push('Node IDs must be unique');
  const supportedCapabilities=new Set(['svg-2d','frame-animation','vector_geometry','dynamic_typography','metric_counter','metric','shape','branching','connectors','text','image','path','group','connector']);
  for (const capability of graph.capabilities) if (!supportedCapabilities.has(capability)) issues.push(`Unsupported graph capability ${capability}`);
  const cueIds = new Set(graph.soundCues.map(c => c.id));
  if (cueIds.size !== graph.soundCues.length) issues.push('Sound cue IDs must be unique');
  for (const n of graph.nodes) {
    if (n.space === 'source-image') issues.push(`${n.id}: source-image nodes require a tracked-source renderer`);
    if (n.parentId && ids.get(n.parentId)?.kind !== 'group') issues.push(`${n.id}: parent must reference an existing group`);
    const seen = new Set([n.id]); let parent = n.parentId;
    while (parent) {
      if (seen.has(parent) || seen.size > 8) { issues.push(`${n.id}: parent cycle or depth exceeds 8`); break; }
      seen.add(parent); parent = ids.get(parent)?.parentId;
    }
    if (n.clip && (n.clip.kind === 'mask' || n.clip.space === 'source-image')) issues.push(`${n.id}: unsupported mask or source-space clip`);
    const properties = new Set<string>();
    for (const t of n.tracks) {
      if (properties.has(t.property)) issues.push(`${n.id}: conflicting ${t.property} tracks`);
      properties.add(t.property);
      t.keyframes.forEach((k,i) => {
        if (i && k.frame <= t.keyframes[i-1].frame) issues.push(`${n.id}: keyframes must be strictly ordered`);
        if (durationFrames !== undefined && k.frame > durationFrames) issues.push(`${n.id}: keyframe outside artifact interval`);
        if (['opacity','strokeProgress','clipProgress'].includes(t.property) && (k.value < 0 || k.value > 1)) issues.push(`${n.id}: ${t.property} must be between 0 and 1`);
        if (['scaleX','scaleY'].includes(t.property) && (k.value < 0.01 || k.value > 100)) issues.push(`${n.id}: invalid animated scale`);
      });
    }
    if (n.kind === 'image' && n.crop && (n.crop.x+n.crop.width>1.000001 || n.crop.y+n.crop.height>1.000001)) issues.push(`${n.id}: image crop exceeds source`);
    if (n.kind === 'connector') for (const a of [n.from,n.to]) {
      if (a.kind !== 'node' && a.kind !== 'screen') issues.push(`${n.id}: unsupported ${a.kind} anchor`);
      if (a.kind === 'node') {
        const target=ids.get(a.nodeId);
        if (!target || (!('bounds' in target) && target.kind !== 'shape')) issues.push(`${n.id}: anchor needs an existing bounded node`);
      }
    }
    if (n.kind === 'path' && n.commands[0].op !== 'M') issues.push(`${n.id}: path must begin with M`);
  }
  for (const e of graph.evidence) if (!ids.has(e.targetNodeId)) issues.push(`Evidence references missing node ${e.targetNodeId}`);
  if (durationFrames !== undefined) {
    for (const c of graph.soundCues) {
      if (c.localFrame >= durationFrames) issues.push(`${c.id}: sound cue outside artifact interval`);
    }
  }
  return [...new Set(issues)];
}
export const SceneGraph = SceneGraphBase.superRefine((graph, ctx) => {
  for (const message of sceneGraphIssues(graph)) ctx.addIssue({ code: 'custom', message });
});
export type SceneGraphNodeData = z.infer<typeof SceneGraphNode>;
export type SoundCueData = z.infer<typeof SoundCue>;
export type EvidenceBindingData = z.infer<typeof EvidenceBinding>;
export type SceneGraphThemeData = z.infer<typeof SceneGraphTheme>;
