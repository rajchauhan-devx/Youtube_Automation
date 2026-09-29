import type { ArtifactComposition, EditingProject, MotionGraphicSpec } from '@tubeflow/editing-contracts';
import { sourceToScreen } from './math.js';

export const graphicNames = { title: 'Cinematic title', 'lower-third': 'Character lower third', badge: 'Location / era', spotlight: 'Object spotlight' };
export function graphicSafeArea(width: number, height: number) {
  const portrait = height > width;
  return { x: width * 0.06, y: height * (portrait ? 0.15 : 0.06), width: width * (portrait ? 0.78 : 0.88), height: height * (portrait ? 0.60 : 0.88) };
}
export function targetOnScreen(project: EditingProject, artifact: ArtifactComposition, frame: number, source: { width: number; height: number }) {
  const region = artifact.graphic?.target?.region;
  const scene = project.scenes.find(s => s.id === artifact.sceneId);
  if (!region || !scene) return;
  const a = sourceToScreen(region, scene, frame, project.inputs, source);
  const b = sourceToScreen({ x: region.x + region.width, y: region.y + region.height }, scene, frame, project.inputs, source);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}
export function intersects(a: MotionGraphicSpec['bounds'], b: MotionGraphicSpec['bounds'], pad = 0) {
  return a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;
}
export function contains(a: MotionGraphicSpec['bounds'], b: MotionGraphicSpec['bounds'], pad = 0) {
  return b.x >= a.x + pad && b.y >= a.y + pad && b.x + b.width <= a.x + a.width - pad && b.y + b.height <= a.y + a.height - pad;
}
/** Both preview and export use this exact source-to-screen geometry. */
export function graphicIssues(p: EditingProject, a: ArtifactComposition, source: { width: number; height: number }) {
  const g = a.graphic;
  if (!g) return [];
  const safe = graphicSafeArea(p.inputs.width, p.inputs.height);
  const issues: string[] = [];
  if (!contains(safe, g.bounds)) issues.push('The text card exceeds the format safe area.');
  if (g.kind === 'spotlight') {
    // Camera motion is piecewise linear, but inspect every rendered frame to cover all extrema.
    for (let frame = a.startFrame; frame < a.endFrame; frame++) {
      const box = targetOnScreen(p, a, frame, source);
      if (!box || !contains(safe, box, 6)) { issues.push('The target leaves the visible safe area during the shot.'); break; }
      if (intersects(g.bounds, box, p.inputs.width * 0.018)) { issues.push('The callout would cover its target.'); break; }
    }
  }
  return issues;
}

export function cardBounds(kind: MotionGraphicSpec['kind'], width: number, height: number, position = 'bottom') {
  const safe = graphicSafeArea(width, height), portrait = height > width;
  const w = kind === 'title' ? safe.width : kind === 'badge' ? safe.width * (portrait ? 0.85 : 0.48) : safe.width * (portrait ? 1 : 0.49);
  const h = height * (kind === 'title' ? (portrait ? 0.23 : 0.31) : kind === 'badge' ? (portrait ? 0.105 : 0.15) : (portrait ? 0.18 : 0.24));
  const x = position === 'right' ? safe.x + safe.width - w : kind === 'title' || portrait ? safe.x + (safe.width - w) / 2 : safe.x;
  const y = position === 'top' || kind === 'badge' ? safe.y : position === 'center' || kind === 'title' ? safe.y + (safe.height - h) / 2 : safe.y + safe.height - h;
  return { x, y, width: w, height: h };
}
