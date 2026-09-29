import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, interpolate, spring } from 'remotion';
import type { ArtifactComposition, EditingProject } from '@tubeflow/editing-contracts';
import { graphicSafeArea, contains, targetOnScreen } from './graphics.js';

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

function Card(props: Props & { variant: 'title' | 'lower-third' | 'badge' | 'spotlight'; delay?: number }) {
  const { project, artifact, variant } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation({ ...props, frame: props.frame - (props.delay || 0) });
  const scale = project.inputs.width / 1080, pad = Math.min(b.width * 0.055, 30 * scale);
  const titleHeight = (b.height - pad * 2) * (g.detail ? 0.60 : 1);
  const family = project.style.fontAssetIds.map(id => `"editing-${id}"`).join(', ');
  const accent = project.style.colors.accent || '#f2bd65';
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, boxSizing: 'border-box', padding: pad,
    opacity, transformOrigin: 'center', transform: `translateY(${(1 - enter) * 16 * scale}px) scale(${0.975 + enter * 0.025})`,
    background: 'linear-gradient(130deg, rgba(9,18,32,0.97), rgba(17,28,43,0.94))', backdropFilter: 'blur(16px)',
    border: `1px solid ${accent}66`, borderRadius: variant === 'badge' ? 12 * scale : 20 * scale,
    boxShadow: '0 18px 60px #00000066', overflow: 'hidden', textAlign: variant === 'title' ? 'center' : 'left' }}>
    <div style={{ position: 'absolute', left: 0, top: 0, height: variant === 'lower-third' ? '100%' : 3 * scale,
      width: variant === 'lower-third' ? 5 * scale : `${enter * 100}%`, background: `linear-gradient(90deg, ${accent}, #fff0)` }} />
    <div style={{ clipPath: `inset(0 ${(1 - enter) * 100}% 0 0)` }}>
      <Text text={g.title} family={family} size={variant === 'title' ? b.width * 0.105 : b.width * 0.084} height={titleHeight} color={variant === 'title' ? '#ffe7ad' : '#ffffff'} />
      {g.detail && <Text text={g.detail} family={family} size={b.width * 0.047} height={(b.height - pad * 2) - titleHeight} color="#e4eaf3" weight={400} />}
    </div>
  </div>;
}
export const CinematicTitle = (props: Props) => <Card {...props} variant="title" />;
export const CharacterLowerThird = (props: Props) => <Card {...props} variant="lower-third" />;
export const LocationBadge = (props: Props) => <Card {...props} variant="badge" />;

export function ObjectSpotlight(props: Props) {
  const { project, artifact, frame, source } = props;
  const b = targetOnScreen(project, artifact, frame, source);
  if (!b || !contains(graphicSafeArea(project.inputs.width, project.inputs.height), b, 6)) return null;
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
    <Card {...props} variant="spotlight" />
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
