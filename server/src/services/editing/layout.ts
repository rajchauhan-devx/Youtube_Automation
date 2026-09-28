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
      try {
        const asset = assetRecord(id);
        return [id, { width: asset.width || 1, height: asset.height || 1 }];
      } catch {
        return [id, { width: p.inputs.width, height: p.inputs.height }];
      }
    }),
  );
  // Sanitize image nodes and masks: ensure they only reference valid image assets
  for (const node of result.nodes) {
    if (node.kind === "image") {
      let isImg = false;
      try {
        isImg = assetRecord(node.assetId).mime.startsWith("image/");
      } catch {
        isImg = false;
      }
      if (!isImg) {
        try {
          if (assetRecord(scene.assetId).mime.startsWith("image/")) {
            node.assetId = scene.assetId;
            isImg = true;
          }
        } catch {
          // ignore
        }
      }
      if (!isImg) {
        // Convert invalid/video image node to an elegant vector card shape so preview rendering and QA never crash
        const shapeNode = node as unknown as Record<string, unknown>;
        shapeNode.kind = "shape";
        const b = (node as { bounds?: Box }).bounds || {
          x: p.inputs.width * 0.05,
          y: p.inputs.height * 0.08,
          width: Math.min(500, p.inputs.width * 0.4),
          height: Math.min(220, p.inputs.height * 0.25),
        };
        delete shapeNode.assetId;
        delete shapeNode.fit;
        delete shapeNode.crop;
        delete shapeNode.bounds;
        shapeNode.geometry = {
          kind: "rect",
          bounds: { ...b },
          radius: 16,
        };
        shapeNode.paint = {
          fill: (p.style.colors.surface || p.style.colors.background || "#111827") + "e6",
          stroke: p.style.colors.accent || p.style.colors.primary || "#F59E0B",
          strokeWidth: 2,
          dash: [],
        };
      }
    }
    if (node.clip?.kind === "mask") {
      let isImg = false;
      try {
        isImg = assetRecord(node.clip.assetId).mime.startsWith("image/");
      } catch {
        isImg = false;
      }
      if (!isImg) {
        delete (node as { clip?: unknown }).clip;
      }
    }
  }
  for (const node of result.nodes) {
    if (node.parentId) {
      const parent = result.nodes.find((p) => p.id === node.parentId);
      if (!parent || parent.kind !== "group") {
        delete (node as { parentId?: string }).parentId;
        if (node.space === "parent") node.space = "screen";
      } else {
        node.space = "parent";
      }
    } else if (node.space === "parent") {
      node.space = "screen";
    }
    if (node.clip && node.clip.space !== node.space) {
      node.clip.space = node.space;
    }
  }
  // Ensure every node with bounds is safely within the canvas dimensions
  for (const node of result.nodes) {
    if ("bounds" in node && node.bounds) {
      node.bounds.width = Math.min(p.inputs.width, Math.max(20, node.bounds.width));
      node.bounds.height = Math.min(p.inputs.height, Math.max(20, node.bounds.height));
      if (node.space === "screen" || !node.parentId) {
        if (node.bounds.x + node.bounds.width > p.inputs.width) {
          node.bounds.x = Math.max(16, p.inputs.width - node.bounds.width - 16);
        }
        if (node.bounds.x < 0) node.bounds.x = 16;
        if (node.bounds.y + node.bounds.height > p.inputs.height) {
          node.bounds.y = Math.max(16, p.inputs.height - node.bounds.height - 16);
        }
        if (node.bounds.y < 0) node.bounds.y = 16;
      }
    }
  }
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
    if (right - left <= p.inputs.width + 16 && bottom - top <= p.inputs.height + 16) {
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
      margin = p.inputs.width * 0.05,
      captionBoundary = p.inputs.height * 0.72;
    const reservedTop = scene.reservedRegions.length
      ? Math.min(...scene.reservedRegions.map((r) => r.y))
      : p.inputs.height;
    const maxSafeY = Math.max(margin, Math.min(captionBoundary - b.height, reservedTop - b.height - 12));
    if (b.y + b.height > captionBoundary) {
      b.y = Math.max(p.inputs.height * 0.08, Math.min(p.inputs.height * 0.32, maxSafeY));
      if (b.width > p.inputs.width * 0.7) {
        b.width = Math.min(b.width, p.inputs.width * 0.55);
      }
    }
    const candidates = [
      b,
      ...[
        margin,
        (p.inputs.width - b.width) / 2,
        p.inputs.width - margin - b.width,
      ].flatMap((x) =>
        [
          p.inputs.height * 0.08,
          Math.max(p.inputs.height * 0.08, Math.min(p.inputs.height * 0.32, maxSafeY / 2)),
          maxSafeY,
        ].map((y) => ({ ...b, x, y })),
      ),
    ];
    const score = (candidate: Box) => {
      if (
        candidate.x < 0 ||
        candidate.y < 0 ||
        candidate.x + candidate.width > p.inputs.width ||
        candidate.y + candidate.height > p.inputs.height ||
        scene.reservedRegions.some((r) => overlap(candidate, r) > 0)
      )
        return Infinity;
      let cost = 0;
      if (candidate.y + candidate.height > captionBoundary) {
        cost += 5000;
      }
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
          world.y + world.height > p.inputs.height ||
          scene.reservedRegions.some((r) => overlap(world, r) > 0)
        )
          return Infinity;
        for (const region of [
          ...protectedBoxes(p, a, frame),
          ...occupied,
        ])
          cost += overlap(world, region) * 10;
      }
      return cost + Math.hypot(candidate.x - b.x, candidate.y - b.y);
    };
    const scored = candidates
      .map((c) => ({ candidate: c, s: score(c) }))
      .sort((x, y) => x.s - y.s);
    if (scored[0] && scored[0].s < Infinity) {
      node.bounds = scored[0].candidate;
    } else {
      // Clamped fallback to guaranteed safe area
      node.bounds.x = Math.max(margin, Math.min(node.bounds.x, p.inputs.width - node.bounds.width - margin));
      node.bounds.y = Math.max(margin, Math.min(node.bounds.y, maxSafeY));
    }
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
        try {
          const r = assetRecord(id);
          return [id, { width: r.width || 1, height: r.height || 1 }];
        } catch {
          return [id, { width: p.inputs.width, height: p.inputs.height }];
        }
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
      const tol = 12;
      if (
        points.some(
          (pt) =>
            pt.x < -tol ||
            pt.y < -tol ||
            pt.x > p.inputs.width + tol ||
            pt.y > p.inputs.height + tol,
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
