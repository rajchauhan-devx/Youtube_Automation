import React, { useLayoutEffect, useRef } from 'react';
import { Img } from 'remotion';
import type { CustomElementSpec, CustomDesignSpec, MotionGraphicSpec } from '@tubeflow/editing-contracts';

import { customValue } from './customAnimation.js';

function Element({ element: e, bounds: b, progress, family, assets }: { element: CustomElementSpec; bounds: MotionGraphicSpec['bounds']; progress: number; family: string; assets: Record<string, { url: string }> }) {
  const textRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
      console.warn('EDITING_QA:' + JSON.stringify({ code: 'TEXT_OVERFLOW', nodeId: e.id, message: `${e.id}: text exceeds its bounds after approved fonts loaded` }));
    }
  }, [e, progress]);
  const width = e.bounds.width * b.width, height = e.bounds.height * b.height;
  const fontSize = e.fontSize * b.width;
  const style: React.CSSProperties = { position: 'absolute',
    left: (e.bounds.x + customValue(e, 'x', progress, 0)) * b.width,
    top: (e.bounds.y + customValue(e, 'y', progress, 0)) * b.height,
    width, height, transformOrigin: 'center', transform: `scale(${customValue(e, 'scale', progress, 1)}) rotate(${customValue(e, 'rotation', progress, 0)}deg)`, opacity: customValue(e, 'opacity', progress, 1), color: e.color };
  const stroke = e.strokeWidth * b.width;
  const draw = customValue(e, 'draw', progress, 1);
  if (e.kind === 'image' && e.assetId) return <Img src={assets[e.assetId].url} style={{ ...style, objectFit: 'contain' }} />;
  if (e.kind === 'text' || e.kind === 'counter') {
    const value = Math.round(customValue(e, 'value', progress, 0));
    return <div ref={textRef} data-editing-text="custom" data-node-id={e.id} style={{ ...style, fontFamily: family, fontSize, fontWeight: 700,
      lineHeight: 1.3, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textAlign: e.align,
      background: e.fill || undefined, textShadow: '0 2px 5px #000a' }}>{e.kind === 'counter' ? e.text.replace('{value}', String(value)) : e.text}</div>;
  }
  return <svg style={{ ...style, overflow: 'visible' }} width={width} height={height}>
    {e.kind === 'rect' ? <rect x={stroke / 2} y={stroke / 2} width={Math.max(0, width - stroke)} height={Math.max(0, height - stroke)} rx={Math.min(width, height) * 0.08} fill={e.fill || 'none'} stroke={e.color} strokeWidth={stroke} />
      : e.kind === 'ellipse' ? <ellipse cx={width / 2} cy={height / 2} rx={Math.max(0, (width - stroke) / 2)} ry={Math.max(0, (height - stroke) / 2)} fill={e.fill || 'none'} stroke={e.color} strokeWidth={stroke} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      : <polyline points={e.points.map(p => `${stroke / 2 + p.x * Math.max(0, width - stroke)},${stroke / 2 + p.y * Math.max(0, height - stroke)}`).join(' ')} fill={e.fill || 'none'} stroke={e.color} strokeWidth={stroke} strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />}
  </svg>;
}
export function CustomGraphicRenderer({ design, bounds, progress, family, assets }: { design: CustomDesignSpec; bounds: MotionGraphicSpec['bounds']; progress: number; family: string; assets: Record<string, { url: string }> }) {
  return <div style={{ position: 'absolute', left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}>
    {design.elements.map(e => <Element key={e.id} element={e} bounds={bounds} progress={progress} family={family} assets={assets} />)}
  </div>;
}
