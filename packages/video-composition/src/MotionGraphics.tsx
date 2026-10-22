import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, interpolate, spring, useVideoConfig } from 'remotion';
import type { ArtifactComposition, EditingProject } from '@tubeflow/editing-contracts';
import { cardBounds, targetMostlyVisible, targetOnScreen } from './graphics.js';
import type { Matrix } from './math.js';
import { DocumentaryComposition, type DocumentaryAssets } from './DocumentaryComposition.js';

type Props = { project: EditingProject; artifact: ArtifactComposition; frame: number; source: { width: number; height: number }; sourceTransform?: Matrix; assets?: DocumentaryAssets };
function Text({ text, size, height, family, color = '#ffffff', weight = 700 }: { text: string; size: number; height: number; family: string; color?: string; weight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const config = useVideoConfig();
  const minimum = Math.min(config.width, config.height) * 0.026;
  const [handle] = useState(() => delayRender('Fit motion graphic typography'));
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      let current = Math.max(size, minimum);
      el.style.fontSize = `${current}px`;
      while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && current > minimum) {
        current -= 1; el.style.fontSize = `${current}px`;
      }
    }
    continueRender(handle);
    return () => continueRender(handle);
  }, [text, size, height, family, handle, minimum]);
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
const accentFor = (project: EditingProject) => project.style.colors.accent || '#8bb9e8';
const textFor = (project: EditingProject) => project.style.colors.text || '#ffffff';
const backgroundFor = (project: EditingProject) => project.style.colors.background || '#172033';

export function CinematicTitle(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props), scale = project.inputs.width / 1080, accent = accentFor(project);
  const mainHeight = b.height * (g.detail ? 0.71 : 0.87);
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height,
    opacity, transform: `translateY(${(1 - enter) * 36 * scale}px) scale(${0.96 + enter * 0.04})`,
    transformOrigin: 'center', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center',
    filter: 'drop-shadow(0 2px 6px #000c)' }}>
    <div style={{ clipPath: `inset(0 ${(1 - enter) * 100}% 0 0)` }}>
      <Text text={g.title} family={familyFor(project)} size={b.width * 0.11} height={mainHeight} color={textFor(project)} />
    </div>
    <div style={{ alignSelf: 'center', width: `${enter * 32}%`, height: Math.max(2, 3 * scale), background: accent, opacity: 0.9, marginTop: 2 * scale }} />
    {g.detail && <div style={{ marginTop: 6 * scale, clipPath: `inset(0 0 ${(1 - enter) * 100}% 0)`, opacity: 0.75 }}>
      <Text text={g.detail} family={familyFor(project)} size={b.width * 0.042} height={b.height - mainHeight - 9 * scale} weight={500} />
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
      <Text text={g.title} family={familyFor(project)} size={b.width * 0.115} height={nameHeight} color={textFor(project)} />
      {g.detail && <Text text={g.detail} family={familyFor(project)} size={b.width * 0.055} height={b.height - nameHeight} color={textFor(project)} weight={500} />}
    </div>
  </div>;
}

export function LocationBadge(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props), scale = project.inputs.width / 1080, accent = accentFor(project);
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height,
    opacity, transform: `scale(${0.72 + enter * 0.28})`, transformOrigin: 'left center', display: 'flex', alignItems: 'center',
    padding: `0 ${Math.max(7, 18 * scale)}px`, boxSizing: 'border-box', borderLeft: `${Math.max(3, 5 * scale)}px solid ${accent}`,
    borderBottom: `1px solid ${accent}bb`, background: `linear-gradient(90deg, ${backgroundFor(project)}ee, ${backgroundFor(project)}66 82%, transparent)`,
    textShadow: '0 2px 6px #000' }}>
    <div style={{ width: '100%' }}><Text text={g.title} family={familyFor(project)} size={b.width * 0.12} height={b.height * (g.detail ? 0.58 : 0.8)} color={textFor(project)} />
      {g.detail && <Text text={g.detail} family={familyFor(project)} size={b.width * 0.065} height={b.height * 0.32} color={textFor(project)} weight={400} />}</div>
  </div>;
}

function SpotlightLabel(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props), scale = project.inputs.width / 1080;
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, opacity: opacity * 0.96,
    transform: `translateY(${(1 - enter) * 24 * scale}px)`, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', padding: `0 ${Math.max(6, 16 * scale)}px`,
    borderLeft: `${Math.max(2, 3 * scale)}px solid ${accentFor(project)}`, textShadow: '0 1px 4px #000' }}>
    <div style={{ width: '100%', clipPath: `inset(0 ${(1 - enter) * 100}% 0 0)` }}>
      <Text text={g.title} family={familyFor(project)} size={b.width * 0.088} height={b.height * (g.detail ? 0.58 : 0.82)} color={textFor(project)} />
      {g.detail && <Text text={g.detail} family={familyFor(project)} size={b.width * 0.045} height={b.height * 0.34} color={textFor(project)} weight={400} />}
    </div>
  </div>;
}

export function ObjectSpotlight(props: Props) {
  const { project, artifact, frame, source } = props;
  const b = targetOnScreen(project, artifact, frame, source, props.sourceTransform);
  if (!b || !targetMostlyVisible(b, project.inputs.width, project.inputs.height)) return null;
  const { enter, opacity, local, fps } = animation(props), card = artifact.graphic!.bounds;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2, rx = b.width / 2 + 4, ry = b.height / 2 + 4;
  const from = { x: Math.max(card.x, Math.min(cx, card.x + card.width)), y: Math.max(card.y, Math.min(cy, card.y + card.height)) };
  const dx = from.x - cx, dy = from.y - cy, factor = 1 / Math.sqrt(dx * dx / (rx * rx) + dy * dy / (ry * ry));
  const to = { x: cx + dx * factor, y: cy + dy * factor };
  const draw = interpolate(local, [fps * 0.2, fps * 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const accent = accentFor(project), width = Math.max(2, project.inputs.width / 360);
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
  return <AbsoluteFill data-graphic-artifact={props.artifact.id} style={{ zIndex: props.artifact.graphic?.kind === 'caption' ? 20 : 5 }}>
    <GraphicContent {...props} />
    <GraphicLayoutCheck {...props} />
  </AbsoluteFill>;
}

/** Runs after the graphics mount (FontRegistry loads before this subtree exists). */
function GraphicLayoutCheck({ project, artifact, frame }: Props) {
  const [handle] = useState(() => delayRender('Check rendered graphic bounds'));
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-graphic-artifact="${artifact.id}"]`);
    const check = () => {
      root?.querySelectorAll<HTMLElement>('[data-editing-text]').forEach(element => {
        // Entrance/exit animations may move transparent text outside the canvas.
        // Measure it once visible; hidden transition geometry is not a defect.
        let opacity = 1;
        for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (style.display === 'none' || style.visibility === 'hidden') return;
          opacity *= Number(style.opacity);
          if (ancestor === root) break;
        }
        if (opacity <= 0.01) return;
        const bounds = element.getBoundingClientRect(), viewport = root.getBoundingClientRect();
        // A reveal can slide text through an on-canvas clipping container.
        // Only its visible intersection can extend outside the video frame.
        const visible = { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
        for (let ancestor = element.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor), clip = ancestor.getBoundingClientRect();
          if (/hidden|clip|auto|scroll/.test(style.overflowX)) {
            visible.left = Math.max(visible.left, clip.left); visible.right = Math.min(visible.right, clip.right);
          }
          if (/hidden|clip|auto|scroll/.test(style.overflowY)) {
            visible.top = Math.max(visible.top, clip.top); visible.bottom = Math.min(visible.bottom, clip.bottom);
          }
        }
        const overflow = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
        const outside = visible.right > visible.left && visible.bottom > visible.top &&
          (visible.left < viewport.left - 1 || visible.top < viewport.top - 1 || visible.right > viewport.right + 1 || visible.bottom > viewport.bottom + 1);
        const small = parseFloat(getComputedStyle(element).fontSize) < Math.min(project.inputs.width, project.inputs.height) * 0.025;
        if (overflow || outside || small) console.warn('EDITING_QA:' + JSON.stringify({
          code: overflow ? 'TEXT_OVERFLOW' : outside ? 'GRAPHIC_OUTSIDE_FRAME' : 'TEXT_TOO_SMALL',
          artifactId: artifact.id, nodeId: element.dataset.nodeId || 'native-graphic',
          message: `Native text must fit at a readable size: ${element.clientWidth}x${element.clientHeight}, content ${element.scrollWidth}x${element.scrollHeight}, font ${getComputedStyle(element).fontSize}.`,
        }));
      });
      continueRender(handle);
    };
    const animation = requestAnimationFrame(check);
    return () => { cancelAnimationFrame(animation); continueRender(handle); };
  }, [project, artifact, frame, handle]);
  return null;
}

function GraphicContent(props: Props) {
  const graphic = props.artifact.graphic;
  if (!graphic) return null;
  if (graphic.kind === 'composition') {
    if (!props.assets) throw new Error('Documentary layers require registered assets');
    return <DocumentaryComposition {...props} assets={props.assets} />;
  }
  if (graphic.kind === 'title') return <CinematicTitle {...props} />;
  if (graphic.kind === 'lower-third') return <CharacterLowerThird {...props} />;
  if (graphic.kind === 'badge') return <LocationBadge {...props} />;
  if (graphic.kind === 'caption') return <MotionCaption {...props} />;
  if (graphic.kind === 'route') return <RouteLine {...props} />;
  if (graphic.kind === 'counter') return <DateCounter {...props} />;
  if (graphic.kind === 'frame') return <ArchivalFrame {...props} />;
  if (graphic.kind === 'diagram') return <DiagramCallout {...props} />;
  return <ObjectSpotlight {...props} />;
}

/** Thin journey progress line with a small evidence label. No map art needed. */
export function RouteLine(props: Props) {
  const { project, artifact, frame } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props);
  const local = frame - artifact.startFrame, duration = Math.max(1, artifact.endFrame - artifact.startFrame);
  const draw = interpolate(local, [0, duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scale = project.inputs.width / 1080, accent = accentFor(project);
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, opacity }}>
    <div style={{ clipPath: `inset(0 ${(1 - enter) * 100}% 0 0)` }}>
      <Text text={g.title} family={familyFor(project)} size={b.width * 0.075} height={b.height * 0.52} color={textFor(project)} />
    </div>
    <div style={{ position: 'relative', marginTop: 6 * scale, height: Math.max(3, 4 * scale), background: '#ffffff22', borderRadius: 99 }}>
      <div style={{ position: 'absolute', inset: 0, width: `${draw * 100}%`, background: accent, opacity: 0.9, borderRadius: 99 }} />
      <div style={{ position: 'absolute', top: '50%', left: `${draw * 100}%`, width: Math.max(8, 12 * scale), height: Math.max(8, 12 * scale),
        borderRadius: '50%', background: accent, border: `${Math.max(2, 3 * scale)}px solid #07111d`, transform: 'translate(-50%, -50%)' }} />
    </div>
    {g.detail && <div style={{ marginTop: 4 * scale, opacity: 0.7 }}>
      <Text text={g.detail} family={familyFor(project)} size={b.width * 0.045} height={b.height * 0.26} weight={400} />
    </div>}
  </div>;
}

/** Large tabular date/stat numerals with a small citation. Static, no count-up gimmick. */
export function DateCounter(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props), scale = project.inputs.width / 1080;
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, opacity,
    transform: `translateY(${(1 - enter) * 20 * scale}px)`, textAlign: 'left' }}>
    <div style={{ fontFamily: familyFor(project), fontWeight: 700, fontSize: b.height * (g.detail ? 0.52 : 0.66),
      lineHeight: 1.05, color: textFor(project), letterSpacing: '0.04em', textShadow: '0 1px 4px #000' }}>{g.title}</div>
    {g.detail && <div style={{ marginTop: 4 * scale, opacity: 0.7, borderLeft: `2px solid ${accentFor(project)}`, paddingLeft: 8 * scale }}>
      <Text text={g.detail} family={familyFor(project)} size={b.height * 0.16} height={b.height * 0.24} weight={400} />
    </div>}
  </div>;
}

/** Thin archival border with corner ticks and a source strip. No image filtering. */
export function ArchivalFrame(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props), scale = project.inputs.width / 1080, accent = accentFor(project);
  const tick = Math.max(10, 22 * scale), w = Math.max(2, 2.5 * scale);
  const corner = (pos: Record<string, string | number>): Record<string, string | number> => ({ position: 'absolute', width: tick, height: tick, borderColor: accent, opacity: 0.85, ...pos });
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, opacity }}>
    <div style={{ position: 'absolute', inset: 0, border: `${w}px solid #ffffff2e`, opacity: enter }} />
    <div style={corner({ top: -w, left: -w, borderTop: `${w}px solid`, borderLeft: `${w}px solid` })} />
    <div style={corner({ top: -w, right: -w, borderTop: `${w}px solid`, borderRight: `${w}px solid` })} />
    <div style={corner({ bottom: -w, left: -w, borderBottom: `${w}px solid`, borderLeft: `${w}px solid` })} />
    <div style={corner({ bottom: -w, right: -w, borderBottom: `${w}px solid`, borderRight: `${w}px solid` })} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: -b.height * 0.32, display: 'flex', gap: 8 * scale, alignItems: 'baseline' }}>
      <div style={{ fontFamily: familyFor(project), fontWeight: 700, fontSize: b.width * 0.07, color: textFor(project), textShadow: '0 1px 4px #000' }}>{g.title}</div>
      {g.detail && <div style={{ opacity: 0.7 }}><Text text={g.detail} family={familyFor(project)} size={b.width * 0.045} height={b.height * 0.26} weight={400} /></div>}
    </div>
  </div>;
}

/** Static evidence callout: left rule + noun + citation. No tracking ellipse. */
export function DiagramCallout(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = g.bounds;
  const { enter, opacity } = animation(props), scale = project.inputs.width / 1080;
  return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, opacity: opacity * 0.97,
    transform: `translateX(${(enter - 1) * 30 * scale}px)`, borderLeft: `${Math.max(2, 3 * scale)}px solid ${accentFor(project)}`,
    paddingLeft: Math.max(8, 14 * scale), textShadow: '0 1px 4px #000' }}>
    <div style={{ clipPath: `inset(0 ${(1 - enter) * 100}% 0 0)` }}>
      <Text text={g.title} family={familyFor(project)} size={b.width * 0.085} height={b.height * (g.detail ? 0.56 : 0.8)} color={textFor(project)} />
      {g.detail && <div style={{ opacity: 0.7 }}><Text text={g.detail} family={familyFor(project)} size={b.width * 0.048} height={b.height * 0.32} weight={400} /></div>}
    </div>
  </div>;
}

export function MotionCaption(props: Props) {
  const { project, artifact } = props, g = artifact.graphic!, b = cardBounds('caption', project.inputs.width, project.inputs.height);
  const { local, fps } = animation(props);
  const ref = useRef<HTMLDivElement>(null);
  const [handle] = useState(() => delayRender('Fit caption phrase'));
  const words = g.title.split(/\s+/u).filter(Boolean);
  const duration = Math.max(1, artifact.endFrame - artifact.startFrame);
  const fontSize = Math.min(b.height * 0.34, b.width * (project.inputs.height > project.inputs.width ? 0.085 : 0.056));
  const delay = Math.min(fps * 0.06, duration * 0.25 / Math.max(1, words.length));
  const family = familyFor(project);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element) {
      const minimum = Math.min(project.inputs.width, project.inputs.height) * 0.026;
      let size = Math.max(minimum, fontSize);
      element.style.fontSize = `${size}px`;
      while ((element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) && size > minimum) {
        size = Math.max(minimum, size - 1);
        element.style.fontSize = `${size}px`;
      }
    }
    continueRender(handle);
    return () => continueRender(handle);
  }, [g.title, fontSize, family, project.inputs.width, project.inputs.height, handle]);
  // Keep the complete phrase legible from its first frame to its last. Motion
  // moves words slightly, but never hides upcoming words against the footage.
  return <div ref={ref} style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, zIndex: 2,
    boxSizing: 'border-box', padding: `${b.height * 0.08}px ${b.width * 0.035}px`,
    background: 'rgba(0, 0, 0, 0.88)', borderRadius: b.height * 0.08, color: '#ffffff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', alignContent: 'center',
    columnGap: '0.38em', rowGap: '0.02em', fontFamily: family, fontWeight: 700,
    fontSize, lineHeight: 1.4, textAlign: 'center', textShadow: '0 1px 3px #000, 0 0 8px #000' }} data-editing-text="motion-caption">
    {words.map((word, index) => {
      const reveal = spring({ frame: Math.max(0, local - (g.wordTimings?.[index]?.startFrame ?? index * delay)), fps, config: { stiffness: 180, damping: 24, overshootClamping: true } });
      return <span key={`${index}-${word}`} style={{ display: 'inline-block', maxWidth: '100%', overflowWrap: 'anywhere',
        transform: `translateY(${(1 - reveal) * 0.06}em)`,
        transformOrigin: 'center bottom' }}>{word}</span>;
    })}
  </div>;
}
