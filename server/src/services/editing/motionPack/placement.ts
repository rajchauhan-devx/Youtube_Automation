import type { Zone } from "./triggers.js";
import type { MotionDirective } from "./director.js";

export interface VisionBox {
  x: number; // normalized 0-1
  y: number;
  w: number;
  h: number;
  conf?: number;
  label?: string;
}

export interface VisionMetadata {
  version: number;
  source?: string;
  width: number;
  height: number;
  faces: VisionBox[];
  subjects: VisionBox[];
  emptyCells: Zone[];
  analyzedAt?: string;
}

export interface Canvas {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement extends Rect {
  rotation: number;
  visionAnchored: boolean;
}

const ZONE_CENTER: Record<Zone, { x: number; y: number }> = {
  "top-left": { x: 0.25, y: 0.18 },
  "top-center": { x: 0.5, y: 0.18 },
  "top-right": { x: 0.75, y: 0.18 },
  "center-left": { x: 0.25, y: 0.45 },
  center: { x: 0.5, y: 0.45 },
  "center-right": { x: 0.75, y: 0.45 },
  "bottom-left": { x: 0.25, y: 0.7 },
  "bottom-center": { x: 0.5, y: 0.7 },
  "bottom-right": { x: 0.75, y: 0.7 },
};

const DEFAULT_EMPTY: Zone[] = [
  "top-right", "top-left", "top-center",
  "center-left", "center-right",
  "bottom-left", "bottom-right", "bottom-center", "center",
];

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

const toPx = (b: VisionBox, c: Canvas): Rect => ({
  x: b.x * c.width,
  y: b.y * c.height,
  width: b.w * c.width,
  height: b.h * c.height,
});

/** Pure geometry: boxes -> pixels. Null vision degrades to safe-zone templates. */
export function resolvePlacement(
  directive: MotionDirective,
  vision: VisionMetadata | null,
  canvas: Canvas,
  size: { width: number; height: number },
  reserved: Rect[] = [],
): Placement {
  const marginX = Math.max(12, Math.round(canvas.width * 0.05));
  const marginTop = Math.max(24, Math.round(canvas.height * 0.05));
  const reservedTop = reserved.length ? Math.min(...reserved.map((r) => r.y)) : canvas.height;
  const maxY = Math.max(marginTop, reservedTop - size.height - 12);
  const w = Math.min(size.width, canvas.width - marginX * 2);
  const h = Math.min(size.height, Math.max(20, maxY - marginTop));

  const clamp = (x: number, y: number): Rect => ({
    x: Math.round(Math.max(marginX, Math.min(x, canvas.width - marginX - w))),
    y: Math.round(Math.max(marginTop, Math.min(y, maxY))),
    width: Math.round(w),
    height: Math.round(h),
  });

  const faces = (vision?.faces ?? []).map((b) => {
    const p = toPx(b, canvas);
    const pad = 0.12;
    return {
      x: p.x - p.width * pad,
      y: p.y - p.height * pad,
      width: p.width * (1 + pad * 2),
      height: p.height * (1 + pad * 2),
    };
  });

  const order =
    vision && vision.emptyCells.length
      ? [directive.zone, ...vision.emptyCells.filter((z) => z !== directive.zone)]
      : [directive.zone, ...DEFAULT_EMPTY.filter((z) => z !== directive.zone)];

  // Vision-anchored arrows: tip lands on the subject box edge nearest the zone.
  if (directive.anchor.type === "subjectBox" && vision?.subjects[0]) {
    const box = toPx(vision.subjects[0], canvas);
    const c = ZONE_CENTER[directive.zone];
    const target = { x: c.x * canvas.width, y: c.y * canvas.height };
    const edges = [
      { x: box.x + box.width / 2, y: box.y }, // top
      { x: box.x + box.width / 2, y: box.y + box.height }, // bottom
      { x: box.x, y: box.y + box.height / 2 }, // left
      { x: box.x + box.width, y: box.y + box.height / 2 }, // right
    ];
    const tip = edges.sort(
      (a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
    )[0];
    // Body extends from the tip toward the zone center.
    const dx = target.x - tip.x;
    const dy = target.y - tip.y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = tip.x + (dx / len) * (w / 2 + 8);
    const cy = tip.y + (dy / len) * (h / 2 + 8);
    const rotation = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const placed = clamp(cx - w / 2, cy - h / 2);
    return { ...clearFaces(placed, faces, marginTop, maxY), rotation, visionAnchored: true };
  }

  for (const zone of order) {
    const c = ZONE_CENTER[zone];
    const placed = clamp(c.x * canvas.width - w / 2, c.y * canvas.height - h / 2);
    if (reserved.some((r) => overlap(placed, r) > 0)) continue;
    return { ...clearFaces(placed, faces, marginTop, maxY), rotation: 0, visionAnchored: !!vision };
  }
  const fallback = ZONE_CENTER[directive.fallbackZone];
  const placed = clamp(fallback.x * canvas.width - w / 2, fallback.y * canvas.height - h / 2);
  return { ...clearFaces(placed, faces, marginTop, maxY), rotation: 0, visionAnchored: false };
}

/** Shift a lower graphic up until no face box overlaps it (or the top is reached). */
function clearFaces(rect: Rect, faces: Rect[], marginTop: number, maxY: number): Rect {
  let out = { ...rect };
  for (let i = 0; i < 8; i++) {
    const hit = faces.find((f) => overlap(out, f) > 0);
    if (!hit) return out;
    const shift = hit.y - out.height - 12 - out.y;
    out = { ...out, y: Math.round(Math.max(marginTop, Math.min(out.y + shift, maxY))) };
    if (out.y <= marginTop) return out;
  }
  return out;
}
