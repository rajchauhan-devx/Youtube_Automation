import type {
  EditingProject,
  DiagnosticRecord,
  ArtifactComposition,
} from "@tubeflow/editing-contracts";
import {
  apply,
  nodeMatrix,
  sampleFrames,
  sourceToScreen,
} from "@tubeflow/video-composition";
import { assetRecord } from "./repository.js";
type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const luminance = (color: string) => {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
};
function protectedBoxes(
  p: EditingProject,
  a: ArtifactComposition,
  frame: number,
): Box[] {
  const scene = p.scenes.find((s) => s.id === a.sceneId)!,
    analysis = p.analyses.find((x) => x.id === scene.analysisId);
  if (!analysis) return [];
  return analysis.protectedRegions.map((r) => {
    const first = sourceToScreen(r, scene, frame, p.inputs, analysis),
      last = sourceToScreen(
        { x: r.x + r.width, y: r.y + r.height },
        scene,
        frame,
        p.inputs,
        analysis,
      );
    return {
      x: first.x,
      y: first.y,
      width: last.x - first.x,
      height: last.y - first.y,
    };
  });
}
/** Score alternate root-label positions; connectors attached to node bounds follow automatically. */
export function placeArtifact(
  p: EditingProject,
  a: ArtifactComposition,
): ArtifactComposition {
  const result = structuredClone(a),
    scene = p.scenes.find((s) => s.id === a.sceneId)!,
    occupied: Box[] = [];
  const dimensions = Object.fromEntries(
    p.assetIds.map((id) => {
      const asset = assetRecord(id);
      return [id, { width: asset.width || 1, height: asset.height || 1 }];
    }),
  );
  // Correct a common model error: specifying a screen position in both bounds and translation.
  // Move only independent static screen elements; source targets and animated groups stay untouched.
  for (const node of result.nodes) {
    if (
      !("bounds" in node) ||
      node.parentId ||
      node.space !== "screen" ||
      node.tracks.some((track) =>
        ["x", "y", "scaleX", "scaleY", "rotation"].includes(track.property),
      )
    )
      continue;
    if (
      node.kind === "text" &&
      !node.clip &&
      node.transform.rotation === 0 &&
      node.transform.scaleX === 1 &&
      node.transform.scaleY === 1
    ) {
      const estimatedTextWidth = node.text.length * node.style.fontSize * 0.55;
      node.bounds.width = Math.min(
        p.inputs.width * 0.88,
        Math.max(
          node.bounds.width,
          Math.min(estimatedTextWidth, p.inputs.width * 0.6),
        ),
      );
      const neededHeight =
        Math.ceil(estimatedTextWidth / node.bounds.width) *
          node.style.fontSize *
          node.style.lineHeight +
        2;
      if (neededHeight <= p.inputs.height * 0.75)
        node.bounds.height = Math.max(node.bounds.height, neededHeight);
    }
    const b = node.bounds,
      matrix = nodeMatrix(node, result, p, a.startFrame, dimensions);
    const points = [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x, y: b.y + b.height },
      { x: b.x + b.width, y: b.y + b.height },
    ].map((point) => apply(matrix, point));
    const left = Math.min(...points.map((point) => point.x)),
      right = Math.max(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y)),
      bottom = Math.max(...points.map((point) => point.y));
    if (right - left <= p.inputs.width && bottom - top <= p.inputs.height) {
      node.transform.x +=
        left < 0 ? -left : right > p.inputs.width ? p.inputs.width - right : 0;
      node.transform.y +=
        top < 0
          ? -top
          : bottom > p.inputs.height
            ? p.inputs.height - bottom
            : 0;
    }
  }
  for (const node of result.nodes) {
    if (
      node.kind !== "text" ||
      node.parentId ||
      node.space !== "screen" ||
      node.tracks.some((t) =>
        ["x", "y", "scaleX", "scaleY", "rotation"].includes(t.property),
      )
    )
      continue;
    if (
      !node.clip &&
      node.transform.rotation === 0 &&
      node.transform.scaleX === 1 &&
      node.transform.scaleY === 1
    ) {
      node.bounds.x += node.transform.x;
      node.bounds.y += node.transform.y;
      node.transform.x = 0;
      node.transform.y = 0;
    }
    const b = node.bounds,
      margin = p.inputs.width * 0.05;
    const candidates = [
      b,
      ...[
        margin,
        (p.inputs.width - b.width) / 2,
        p.inputs.width - margin - b.width,
      ].flatMap((x) =>
        [
          p.inputs.height * 0.05,
          p.inputs.height * 0.35,
          p.inputs.height * 0.65,
        ].map((y) => ({ ...b, x, y })),
      ),
    ];
    const score = (candidate: Box) => {
      if (
        candidate.x < 0 ||
        candidate.y < 0 ||
        candidate.x + candidate.width > p.inputs.width ||
        candidate.y + candidate.height > p.inputs.height
      )
        return Infinity;
      let cost = 0;
      for (const frame of sampleFrames(a)) {
        const m = nodeMatrix(
            { ...node, bounds: candidate },
            result,
            p,
            frame,
            Object.fromEntries(
              p.assetIds.map((id) => {
                const r = assetRecord(id);
                return [id, { width: r.width || 1, height: r.height || 1 }];
              }),
            ),
          ),
          point = apply(m, candidate),
          world = { ...candidate, ...point };
        if (
          world.x < 0 ||
          world.y < 0 ||
          world.x + world.width > p.inputs.width ||
          world.y + world.height > p.inputs.height
        )
          return Infinity;
        for (const region of [
          ...scene.reservedRegions,
          ...protectedBoxes(p, a, frame),
          ...occupied,
        ])
          cost += overlap(world, region) * 10;
      }
      return cost + Math.hypot(candidate.x - b.x, candidate.y - b.y);
    };
    node.bounds = candidates.sort((x, y) => score(x) - score(y))[0];
    occupied.push(node.bounds);
    node.style.background ||= p.style.colors.background || "#172033";
    const fg = luminance(node.style.color),
      bg = luminance(node.style.background),
      ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    if (ratio < p.style.minContrast)
      node.style.color = bg > 0.18 ? "#000000" : "#ffffff";
  }
  return result;
}
export function layoutDiagnostics(
  p: EditingProject,
  a: ArtifactComposition,
): DiagnosticRecord[] {
  const diagnostics: DiagnosticRecord[] = [],
    scene = p.scenes.find((s) => s.id === a.sceneId)!,
    dimensions = Object.fromEntries(
      p.assetIds.map((id) => {
        const r = assetRecord(id);
        return [id, { width: r.width || 1, height: r.height || 1 }];
      }),
    );
  const reported = new Set<string>();
  const report = (code: string, message: string, nodeId?: string) => {
    const key = code + nodeId;
    if (reported.has(key)) return;
    reported.add(key);
    diagnostics.push({
      severity: "warning",
      code,
      stage: "layout",
      artifactId: a.id,
      nodeId,
      message,
      retryable: false,
    });
  };
  if (
    (a.endFrame - a.startFrame) / p.inputs.fps < p.style.minReadingSeconds &&
    a.nodes.some((n) => n.kind === "text")
  )
    report("READING_TIME", "Composition is too brief to read");
  for (let frame = a.startFrame; frame < a.endFrame; frame++)
    for (const n of a.nodes) {
      if (!("bounds" in n)) continue;
      const m = nodeMatrix(n, a, p, frame, dimensions),
        b = n.bounds,
        points = [
          { x: b.x, y: b.y },
          { x: b.x + b.width, y: b.y },
          { x: b.x, y: b.y + b.height },
          { x: b.x + b.width, y: b.y + b.height },
        ].map((point) => apply(m, point));
      if (
        points.some(
          (pt) =>
            pt.x < 0 ||
            pt.y < 0 ||
            pt.x > p.inputs.width ||
            pt.y > p.inputs.height,
        )
      )
        report(
          "OFFSCREEN",
          `Node ${n.id} leaves the ${p.inputs.width}x${p.inputs.height} canvas at frame ${frame}: x=${Math.min(...points.map((pt) => pt.x)).toFixed(1)}..${Math.max(...points.map((pt) => pt.x)).toFixed(1)}, y=${Math.min(...points.map((pt) => pt.y)).toFixed(1)}..${Math.max(...points.map((pt) => pt.y)).toFixed(1)}. Use bounds for placement with transform x/y=0, scaleX/scaleY=1 where possible.`,
          n.id,
        );
      if (n.kind === "text") {
        const x = Math.min(...points.map((pt) => pt.x)),
          y = Math.min(...points.map((pt) => pt.y)),
          w = Math.max(...points.map((pt) => pt.x)) - x,
          h = Math.max(...points.map((pt) => pt.y)) - y;
        if (
          protectedBoxes(p, a, frame).some(
            (r) => overlap({ x, y, width: w, height: h }, r) > w * h * 0.1,
          )
        )
          report(
            "SUBJECT_OVERLAP",
            "Label overlaps a protected subject region",
            n.id,
          );
        if (
          scene.reservedRegions.some(
            (r) =>
              x < r.x + r.width &&
              x + w > r.x &&
              y < r.y + r.height &&
              y + h > r.y,
          )
        )
          report(
            "RESERVED_REGION",
            "Label overlaps a reserved subtitle/safe region",
            n.id,
          );
        // Conservative estimate before browser measurement. Devanagari clusters need actual shaping QA too.
        if (
          n.text.length * n.style.fontSize * 0.55 >
          b.width *
            Math.floor(b.height / (n.style.fontSize * n.style.lineHeight))
        )
          report("TEXT_FIT", "Label may overflow its bounds", n.id);
        if (n.style.fontSize < p.style.bodySize * 0.7)
          report(
            "SMALL_TEXT",
            "Label is below the story typography minimum",
            n.id,
          );
      }
    }
  return diagnostics.filter(
    (d, i, all) =>
      all.findIndex((x) => x.code === d.code && x.nodeId === d.nodeId) === i,
  );
}
