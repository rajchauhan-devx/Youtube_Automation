import { customDesignIssues } from '@tubeflow/editing-contracts';
import type { ArtifactComposition, EditingProject, MotionGraphicSpec } from '@tubeflow/editing-contracts';
import { customValue } from './customAnimation.js';
import { sourceToScreen } from './math.js';

export const graphicNames = { title: 'Cinematic title', 'lower-third': 'Character lower third', badge: 'Location / era', spotlight: 'Object spotlight', custom: 'AI custom graphic' };
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
export function targetMostlyVisible(box: MotionGraphicSpec['bounds'], width: number, height: number) {
  const visibleWidth = Math.max(0, Math.min(width, box.x + box.width) - Math.max(0, box.x));
  const visibleHeight = Math.max(0, Math.min(height, box.y + box.height) - Math.max(0, box.y));
  const centerX = box.x + box.width / 2, centerY = box.y + box.height / 2;
  return box.width > 0 && box.height > 0 && centerX >= 0 && centerX <= width && centerY >= 0 && centerY <= height &&
    visibleWidth * visibleHeight >= box.width * box.height * 0.8;
}
/** Both preview and export use this exact source-to-screen geometry. */
export function graphicIssues(p: EditingProject, a: ArtifactComposition, source: { width: number; height: number }) {
  const g = a.graphic;
  if (!g) return [];
  const safe = graphicSafeArea(p.inputs.width, p.inputs.height);
  const issues: string[] = [];
  if (!contains(safe, g.bounds)) issues.push('The graphic exceeds the format safe area.');
  if (g.kind === 'custom' && g.design) {
    issues.push(...customDesignIssues(g.design));
    const totalWords = g.design.elements.filter(e => e.kind === 'text' || e.kind === 'counter').reduce((sum, e) => sum + e.text.trim().split(/\s+/u).length, 0);
    if ((a.endFrame - a.startFrame) / p.inputs.fps < Math.max(2.5, totalWords / 3 + 0.8)) issues.push('Custom graphic has insufficient reading time.');
    for (const e of g.design.elements) {
      // Smooth interpolation is monotone. Translation extrema and maximum scale
      // plus a circular rotation envelope bound every frame, including between keyframes.
      const scales = e.tracks.find(t => t.property === 'scale')?.keyframes.map(k => k.value) || [1];
      const maxScale = Math.max(1, ...scales);
      const rotates = e.tracks.some(t => t.property === 'rotation' && t.keyframes.some(k => k.value !== 0));
      const halfW = e.bounds.width * g.bounds.width / 2, halfH = e.bounds.height * g.bounds.height / 2;
      const radius = Math.hypot(halfW, halfH) * maxScale;
      const extentX = rotates ? radius : halfW * maxScale, extentY = rotates ? radius : halfH * maxScale;
      const xs = [0, ...(e.tracks.find(t => t.property === 'x')?.keyframes.map(k => k.value) || [])];
      const ys = [0, ...(e.tracks.find(t => t.property === 'y')?.keyframes.map(k => k.value) || [])];
      const cx = (e.bounds.x + e.bounds.width / 2) * g.bounds.width, cy = (e.bounds.y + e.bounds.height / 2) * g.bounds.height;
      if (cx + Math.min(...xs) * g.bounds.width - extentX < -0.001 || cx + Math.max(...xs) * g.bounds.width + extentX > g.bounds.width + 0.001 ||
        cy + Math.min(...ys) * g.bounds.height - extentY < -0.001 || cy + Math.max(...ys) * g.bounds.height + extentY > g.bounds.height + 0.001) issues.push(`${e.id}: transformed element exceeds safe bounds.`);
      if (e.kind === 'text' || e.kind === 'counter') {
        const font = e.fontSize * g.bounds.width;
        const width = e.bounds.width * g.bounds.width, height = e.bounds.height * g.bounds.height;
        const visibleSamples = Array.from({ length: 100 }, (_, i) => (i + 0.5) / 100).filter(progress => customValue(e, 'opacity', progress, 1) >= 0.8 && font * customValue(e, 'scale', progress, 1) >= p.inputs.width * 0.018).length;
        const requiredSeconds = Math.max(1, e.text.trim().split(/\s+/u).length / 3 + 0.8);
        if (visibleSamples / 100 * (a.endFrame - a.startFrame) / p.inputs.fps < requiredSeconds) issues.push(`${e.id}: text is not readable long enough.`);
        if (font < p.inputs.width * 0.018) issues.push(`${e.id}: text is too small to read.`);
        const values = e.tracks.find(t => t.property === 'value')?.keyframes.map(k => String(Math.round(k.value))) || ['0'];
        const longest = values.reduce((a, b) => a.length > b.length ? a : b, '0');
        const displayed = e.kind === 'counter' ? e.text.replace('{value}', longest) : e.text;
        const charsPerLine = Math.max(1, Math.floor(width / (font * 0.75)));
        const lines = displayed.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)), 0);
        if (lines * font * 1.3 > height) issues.push(`${e.id}: text needs more space or shorter wording.`);
      }
    }
  }
  if (g.kind === 'spotlight') {
    // Camera motion is piecewise linear, but inspect every rendered frame to cover all extrema.
    for (let frame = a.startFrame; frame < a.endFrame; frame++) {
      const box = targetOnScreen(p, a, frame, source);
      if (!box || !targetMostlyVisible(box, p.inputs.width, p.inputs.height)) { issues.push('The target leaves the visible frame during the shot.'); break; }
      if (intersects(g.bounds, box, p.inputs.width * 0.018)) { issues.push('The callout would cover its target.'); break; }
    }
  }
  return issues;
}

export function cardBounds(kind: MotionGraphicSpec['kind'], width: number, height: number, position = 'bottom') {
  const safe = graphicSafeArea(width, height), portrait = height > width;
  const w = safe.width * (kind === 'custom' ? 1 : kind === 'title' ? 1 : kind === 'lower-third' ? (portrait ? 0.78 : 0.52) : kind === 'badge' ? (portrait ? 0.64 : 0.38) : (portrait ? 0.70 : 0.46));
  const h = height * (kind === 'custom' ? 0.42 : kind === 'title' ? (portrait ? 0.20 : 0.27) : kind === 'lower-third' ? (portrait ? 0.12 : 0.18) : kind === 'badge' ? (portrait ? 0.08 : 0.12) : (portrait ? 0.11 : 0.16));
  const x = position === 'right' ? safe.x + safe.width - w : position === 'center' || kind === 'title' ? safe.x + (safe.width - w) / 2 : safe.x;
  const y = position === 'top' ? safe.y : position === 'center' ? safe.y + (safe.height - h) / 2 : safe.y + safe.height - h;
  return { x, y, width: w, height: h };
}
