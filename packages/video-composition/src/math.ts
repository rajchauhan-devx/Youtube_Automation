import type {
  AnimationTrack,
  Transform2D,
  ScenePlan,
  EditingProject,
  AnchorRef,
  ArtifactComposition,
  CompositionNode,
} from "@tubeflow/editing-contracts";
export type Matrix = [number, number, number, number, number, number];
export type Point = { x: number; y: number };
export const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
export const apply = (m: Matrix, p: Point): Point => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
/** Column vectors: T(translation) T(pivot) R S T(-pivot); parent * child. */
export function transformMatrix(t: Transform2D): Matrix {
  const r = (t.rotation * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  return multiply(
    multiply(translate(t.x + t.pivot.x, t.y + t.pivot.y), [
      c * t.scaleX,
      s * t.scaleX,
      -s * t.scaleY,
      c * t.scaleY,
      0,
      0,
    ]),
    translate(-t.pivot.x, -t.pivot.y),
  );
}
function ease(t: number, e: AnimationTrack["keyframes"][number]["easing"]) {
  if (e.kind === "linear") return t;
  if (e.kind === "spring") {
    const w = Math.sqrt(e.stiffness / e.mass),
      d = e.damping / (2 * Math.sqrt(e.stiffness * e.mass));
    const f = (v: number) =>
      1 -
      Math.exp(-Math.min(d, 1) * w * v) *
        Math.cos(w * Math.sqrt(Math.max(0, 1 - d * d)) * v);
    return Math.max(0, Math.min(1, f(t) / Math.max(0.001, f(1))));
  }
  const cubic = (u: number, a: number, b: number) =>
    3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u * u * b + u ** 3;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (cubic(m, e.x1, e.x2) < t) lo = m;
    else hi = m;
  }
  return cubic((lo + hi) / 2, e.y1, e.y2);
}
export function evaluateTrack(track: AnimationTrack, frame: number) {
  const k = track.keyframes;
  if (frame <= k[0].frame) return k[0].value;
  for (let i = 1; i < k.length; i++)
    if (frame < k[i].frame) {
      const a = k[i - 1],
        b = k[i];
      return (
        a.value +
        (b.value - a.value) *
          ease((frame - a.frame) / (b.frame - a.frame), a.easing)
      );
    }
  return k[k.length - 1].value;
}
export function evaluateTransform(node: CompositionNode, frame: number) {
  const t = { ...node.transform },
    state = { opacity: node.opacity, strokeProgress: 1, clipProgress: 1 };
  for (const track of node.tracks) {
    const value = evaluateTrack(track, frame);
    if (track.property in state)
      state[track.property as keyof typeof state] = value;
    else
      t[
        track.property as Exclude<
          AnimationTrack["property"],
          keyof typeof state
        >
      ] = value;
  }
  return { transform: t, ...state };
}
export function cameraAt(scene: ScenePlan, frame: number) {
  const local = frame - scene.startFrame,
    k = scene.camera;
  if (local <= k[0].frame) return k[0];
  for (let i = 1; i < k.length; i++)
    if (local < k[i].frame) {
      const a = k[i - 1],
        b = k[i],
        t = (local - a.frame) / (b.frame - a.frame);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        scale: a.scale + (b.scale - a.scale) * t,
      };
    }
  return k[k.length - 1];
}
export function sourceMatrix(
  scene: ScenePlan,
  frame: number,
  output: { width: number; height: number },
  source: { width: number; height: number },
): Matrix {
  const fit = Math.max(
      output.width / source.width,
      output.height / source.height,
    ),
    c = cameraAt(scene, frame),
    scale = fit * c.scale;
  return [
    scale,
    0,
    0,
    scale,
    (output.width - source.width * scale) / 2 + c.x,
    (output.height - source.height * scale) / 2 + c.y,
  ];
}
export function sourceToScreen(
  point: Point,
  scene: ScenePlan,
  frame: number,
  output: { width: number; height: number },
  source: { width: number; height: number },
) {
  return apply(sourceMatrix(scene, frame, output, source), {
    x: point.x * source.width,
    y: point.y * source.height,
  });
}
export function nodeMatrix(
  node: CompositionNode,
  artifact: ArtifactComposition,
  project: EditingProject,
  frame: number,
  dimensions: Record<string, { width: number; height: number }>,
): Matrix {
  const own = transformMatrix(
    evaluateTransform(node, frame - artifact.startFrame).transform,
  );
  if (node.parentId)
    return multiply(
      nodeMatrix(
        artifact.nodes.find((n) => n.id === node.parentId)!,
        artifact,
        project,
        frame,
        dimensions,
      ),
      own,
    );
  if (node.space === "source-image") {
    const scene = project.scenes.find((s) => s.id === artifact.sceneId)!;
    return multiply(
      sourceMatrix(scene, frame, project.inputs, dimensions[scene.assetId]),
      own,
    );
  }
  return own;
}
export function resolveAnchor(
  anchor: AnchorRef,
  artifact: ArtifactComposition,
  project: EditingProject,
  frame: number,
  dimensions: Record<string, { width: number; height: number }>,
): Point {
  if (anchor.kind === "screen") return anchor.point;
  if (anchor.kind === "node") {
    const node = artifact.nodes.find((n) => n.id === anchor.nodeId)!;
    if (!("bounds" in node)) throw new Error("Anchor target lacks bounds");
    const p = apply(nodeMatrix(node, artifact, project, frame, dimensions), {
      x: node.bounds.x + node.bounds.width * anchor.point.x,
      y: node.bounds.y + node.bounds.height * anchor.point.y,
    });
    return { x: p.x + anchor.offset.x, y: p.y + anchor.offset.y };
  }
  const scene = project.scenes.find((s) => s.id === anchor.sceneId)!;
  const point =
    anchor.kind === "source"
      ? anchor.point
      : project.analyses
          .find((a) => a.id === scene.analysisId)!
          .objects.find((o) => o.id === anchor.objectId)!.anchor;
  const p = sourceToScreen(
    point,
    scene,
    frame,
    project.inputs,
    dimensions[scene.assetId],
  );
  return { x: p.x + anchor.offset.x, y: p.y + anchor.offset.y };
}
export function sampleFrames(a: ArtifactComposition) {
  const d = a.endFrame - a.startFrame;
  return [
    ...new Set([
      Math.min(a.endFrame - 1, a.startFrame + Math.min(15, Math.floor(d / 4))),
      Math.floor((a.startFrame + a.endFrame) / 2),
      Math.max(a.startFrame, a.endFrame - 1 - Math.min(10, Math.floor(d / 4))),
    ]),
  ];
}
