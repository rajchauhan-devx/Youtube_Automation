import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, interpolate, spring } from 'remotion';
import type { ArtifactComposition, EditingProject } from '@tubeflow/editing-contracts';
import { targetMostlyVisible, targetOnScreen } from './graphics.js';

type Props = { project: EditingProject; artifact: ArtifactComposition; frame: number; source: { width: number; height: number } };
function Text({ text, size, height, family, color = '#ffffff', weight = 700 }: { text: string; size: number; height: number; family: string; color?: string; weight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [handle] = useState(() => delayRender('Fit motion graphic typography'));
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      let current = size;
      el.style.fontSize = `${current}px`;
      while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && current > 6) {
        current -= 1; el.style.fontSize = `${current}px`;
      }
    }
    continueRender(handle);
    return () => continueRender(handle);
  }, [text, size, height, family, handle]);
  return <div ref={ref} data-editing-text="motion" style={{ height, fontFamily: family, fontSize: size, lineHeight: 1.3, fontWeight: weight, color, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{text}</div>;
}

function animation({ project, artifact, frame }: Props) {
  const fps = project.inputs.fps, local = frame - artifact.startFrame, duration = artifact.endFrame - artifact.startFrame;
  const enter = spring({ frame: local, fps, config: { stiffness: 125, damping: 23, overshootClamping: true }, durationInFrames: Math.max(1, Math.min(Math.round(fps * 0.7), Math.floor(duration / 3))) });
  const exitFrames = Math.max(1, Math.min(Math.round(fps * 0.3), Math.floor(duration / 4)));
  const exit = interpolate(local, [duration - exitFrames - 1, duration - 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return { enter, opacity: Math.min(1, local / Math.max(1, fps * 0.14)) * exit, fps, local };
}

const familyFor = (project: EditingProject) => project.style.fontAssetIds.map(id => `"editing-${id}"`).join(', ');
const accentFor = (project: EditingProject) => project.style.colors.accent || '#f2bd65';

export function CinematicTitle(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props), scale = project.inputs.width / 1080, accent = accentFor(project);
  const mainHeight = b.height * (g.detail ? 0.71 : 0.87);
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height,
    opacity, transform: `translateY(${(1 - enter) * 70 * scale}px) scale(${0.91 + enter * 0.09})`,
    transformOrigin: 'center', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center',
    filter: 'drop-shadow(0 3px 10px #000e) drop-shadow(0 0 25px #000a)' }}>
    <div style={{ clipPath: `inset(0 ${(1 - enter) * 100}% 0 0)` }}>
      <Text text={g.title} family={familyFor(project)} size={b.width * 0.13} height={mainHeight} color="#fff5df" />
    </div>
    <div style={{ alignSelf: 'center', width: `${enter * 56}%`, height: Math.max(2, 5 * scale), background: accent, boxShadow: `0 0 ${18 * scale}px ${accent}`, marginTop: 2 * scale }} />
    {g.detail && <div style={{ marginTop: 6 * scale, clipPath: `inset(0 0 ${(1 - enter) * 100}% 0)` }}>
      <Text text={g.detail} family={familyFor(project)} size={b.width * 0.052} height={b.height - mainHeight - 9 * scale} weight={500} />
    </div>}
  </div>;
}

export function CharacterLowerThird(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props), scale = project.inputs.width / 1080, accent = accentFor(project);
  const pad = Math.max(5, 18 * scale), nameHeight = b.height * (g.detail ? 0.58 : 0.78);
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height,
    opacity, transform: `translateX(${(enter - 1) * 78 * scale}px)`, display: 'flex', alignItems: 'center',
    textShadow: '0 2px 7px #000, 0 0 16px #000' }}>
    <div style={{ width: Math.max(3, 6 * scale), height: `${enter * 82}%`, background: accent, boxShadow: `0 0 ${12 * scale}px ${accent}`, flexShrink: 0 }} />
    <div style={{ paddingLeft: pad, width: b.width - pad - 6 * scale, overflow: 'hidden', clipPath: `inset(0 ${(1 - enter) * 100}% 0 0)` }}>
      <Text text={g.title} family={familyFor(project)} size={b.width * 0.115} height={nameHeight} />
      {g.detail && <Text text={g.detail} family={familyFor(project)} size={b.width * 0.055} height={b.height - nameHeight} color="#e5edf1" weight={500} />}
    </div>
  </div>;
}

export function LocationBadge(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props), scale = project.inputs.width / 1080, accent = accentFor(project);
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height,
    opacity, transform: `scale(${0.72 + enter * 0.28})`, transformOrigin: 'left center', display: 'flex', alignItems: 'center',
    padding: `0 ${Math.max(7, 18 * scale)}px`, boxSizing: 'border-box', borderLeft: `${Math.max(3, 5 * scale)}px solid ${accent}`,
    borderBottom: `1px solid ${accent}bb`, background: 'linear-gradient(90deg, #09121cdd, #09121c44 82%, transparent)',
    textShadow: '0 2px 6px #000' }}>
    <div style={{ width: '100%' }}><Text text={g.title} family={familyFor(project)} size={b.width * 0.12} height={b.height * (g.detail ? 0.58 : 0.8)} />
      {g.detail && <Text text={g.detail} family={familyFor(project)} size={b.width * 0.065} height={b.height * 0.32} color="#e5edf1" weight={400} />}</div>
  </div>;
}

function SpotlightLabel(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props), scale = project.inputs.width / 1080;
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, opacity,
    transform: `translateY(${(1 - enter) * 40 * scale}px)`, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', padding: `0 ${Math.max(6, 16 * scale)}px`,
    borderLeft: `${Math.max(3, 5 * scale)}px solid ${accentFor(project)}`, textShadow: '0 2px 8px #000, 0 0 18px #000', WebkitTextStroke: `${Math.max(1, 1.5 * scale)}px #07111d` }}>
    <div style={{ width: '100%', clipPath: `inset(0 ${(1 - enter) * 100}% 0 0)` }}>
      <Text text={g.title} family={familyFor(project)} size={b.width * 0.10} height={b.height * (g.detail ? 0.58 : 0.82)} />
      {g.detail && <Text text={g.detail} family={familyFor(project)} size={b.width * 0.05} height={b.height * 0.34} color="#e5edf1" weight={400} />}
    </div>
  </div>;
}

export function ObjectSpotlight(props: Props) {
  const { project, artifact, frame, source } = props;
  const b = targetOnScreen(project, artifact, frame, source);
  if (!b || !targetMostlyVisible(b, project.inputs.width, project.inputs.height)) return null;
  const { enter, opacity, local, fps } = animation(props), card = artifact.graphic!.bounds;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2, rx = b.width / 2 + 4, ry = b.height / 2 + 4;
  const from = { x: Math.max(card.x, Math.min(cx, card.x + card.width)), y: Math.max(card.y, Math.min(cy, card.y + card.height)) };
  const dx = from.x - cx, dy = from.y - cy, factor = 1 / Math.sqrt(dx * dx / (rx * rx) + dy * dy / (ry * ry));
  const to = { x: cx + dx * factor, y: cy + dy * factor };
  const draw = interpolate(local, [fps * 0.2, fps * 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const accent = project.style.colors.accent || '#f2bd65', width = Math.max(2, project.inputs.width / 360);
  const arrowId = `arrow-${artifact.id}`, glowId = `glow-${artifact.id}`;
  return <AbsoluteFill style={{ opacity }}>
    <svg width={project.inputs.width} height={project.inputs.height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <defs>
        <filter id={glowId}><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <marker id={arrowId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill={accent} /></marker>
      </defs>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#07111dcc" strokeWidth={width + 4} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={accent} strokeWidth={width} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - enter} filter={`url(#${glowId})`} />
      <path d={`M${from.x},${from.y} Q${from.x},${to.y} ${to.x},${to.y}`} fill="none" stroke={accent} strokeWidth={width}
        pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} markerEnd={draw > 0.98 ? `url(#${arrowId})` : undefined} />
    </svg>
    <SpotlightLabel {...props} />
  </AbsoluteFill>;
}

export function MotionGraphicRenderer(props: Props) {
  const graphic = props.artifact.graphic;
  if (!graphic) return null;
  if (graphic.kind === 'title') return <CinematicTitle {...props} />;
  if (graphic.kind === 'lower-third') return <CharacterLowerThird {...props} />;
  if (graphic.kind === 'badge') return <LocationBadge {...props} />;
  return <ObjectSpotlight {...props} />;
}
