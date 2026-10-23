import React from 'react';
import type { SceneGraphData } from '@tubeflow/editing-contracts';
import { commandsToSvgPath, pointsToSvg, computeConnectorPath } from '@tubeflow/video-composition';

interface SceneGraphOverlayProps {
  graph: SceneGraphData;
  scale?: number;
}

export const SceneGraphOverlay: React.FC<SceneGraphOverlayProps> = ({ graph, scale = 1 }) => {
  const theme = graph.theme || {
    name: 'default',
    primary: '#F07835',
    accent: '#FFE600',
    background: 'rgba(15, 23, 42, 0.94)',
    text: '#FFFFFF',
    fontFamily: "'Montserrat', 'Inter', sans-serif',",
    secondaryFont: "'JetBrains Mono', monospace",
    lineWeight: 2,
    radius: 6,
  };

  const nodeCenters = new Map<string, { x: number; y: number }>();
  for (const node of graph.nodes) {
    if ('bounds' in node && node.bounds) {
      nodeCenters.set(node.id, {
        x: node.bounds.x + node.bounds.width / 2,
        y: node.bounds.y + node.bounds.height / 2,
      });
    }
  }

  // Calculate percentage positions relative to 1080x1920 design space
  const leftPct = (graph.bounds.x / 1080) * 100;
  const topPct = (graph.bounds.y / 1920) * 100;
  const widthPct = (graph.bounds.width / 1080) * 100;
  const heightPct = (graph.bounds.height / 1920) * 100;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        pointerEvents: 'none',
        zIndex: 15,
        fontFamily: theme.fontFamily,
      }}
    >
      <svg
        viewBox={`0 0 ${graph.bounds.width} ${graph.bounds.height}`}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      >
        {graph.nodes.map((node) => {
          if (node.kind === 'shape') {
            const g = node.geometry;
            const p = node.paint;
            const fill = p.fill || 'none';
            const stroke = p.stroke || 'none';
            const strokeWidth = p.strokeWidth ?? theme.lineWeight;
            const dash = p.dash?.length ? p.dash.join(' ') : undefined;

            if (g.kind === 'rect') {
              return (
                <rect
                  key={node.id}
                  x={g.bounds.x}
                  y={g.bounds.y}
                  width={g.bounds.width}
                  height={g.bounds.height}
                  rx={g.radius}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                />
              );
            }
            if (g.kind === 'ellipse') {
              const cx = g.bounds.x + g.bounds.width / 2;
              const cy = g.bounds.y + g.bounds.height / 2;
              return (
                <ellipse
                  key={node.id}
                  cx={cx}
                  cy={cy}
                  rx={g.bounds.width / 2}
                  ry={g.bounds.height / 2}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                />
              );
            }
            if (g.kind === 'polygon') {
              return (
                <polygon
                  key={node.id}
                  points={pointsToSvg(g.points)}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                />
              );
            }
          }
          if (node.kind === 'path') {
            const p = node.paint;
            const fill = p.fill || 'none';
            const stroke = p.stroke || 'none';
            const strokeWidth = p.strokeWidth ?? theme.lineWeight;
            const dash = p.dash?.length ? p.dash.join(' ') : undefined;
            return (
              <path
                key={node.id}
                d={commandsToSvgPath(node.commands)}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
              />
            );
          }
          if (node.kind === 'connector') {
            let fromPt = { x: 0, y: 0 };
            let toPt = { x: 100, y: 100 };
            if (node.from.kind === 'screen') fromPt = node.from.point;
            else if (node.from.kind === 'node' && nodeCenters.has(node.from.nodeId)) {
              fromPt = nodeCenters.get(node.from.nodeId)!;
            }
            if (node.to.kind === 'screen') toPt = node.to.point;
            else if (node.to.kind === 'node' && nodeCenters.has(node.to.nodeId)) {
              toPt = nodeCenters.get(node.to.nodeId)!;
            }
            const d = computeConnectorPath(fromPt, toPt, node.route);
            const p = node.paint;
            const stroke = p.stroke || theme.primary;
            const strokeWidth = p.strokeWidth ?? theme.lineWeight;
            const dash = p.dash?.length ? p.dash.join(' ') : undefined;
            return (
              <path
                key={node.id}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
                strokeLinecap="round"
              />
            );
          }
          return null;
        })}
      </svg>

      <div style={{ position: 'absolute', inset: 0 }}>
        {graph.nodes.map((node) => {
          if (node.kind === 'text') {
            const st = node.style;
            const nodeLeftPct = (node.bounds.x / graph.bounds.width) * 100;
            const nodeTopPct = (node.bounds.y / graph.bounds.height) * 100;
            const nodeWidthPct = (node.bounds.width / graph.bounds.width) * 100;
            return (
              <div
                key={node.id}
                style={{
                  position: 'absolute',
                  left: `${nodeLeftPct}%`,
                  top: `${nodeTopPct}%`,
                  width: `${nodeWidthPct}%`,
                  color: st.color || theme.text,
                  fontSize: `${Math.max(10, Math.round(st.fontSize * scale * 0.45))}px`,
                  fontWeight: st.fontWeight,
                  textAlign: st.align,
                  lineHeight: st.lineHeight,
                  background: st.background || undefined,
                  padding: st.background ? '2px 6px' : undefined,
                  borderRadius: st.background ? '3px' : undefined,
                }}
              >
                {node.text}
              </div>
            );
          }
          if (node.kind === 'metric') {
            const m = node;
            const nodeLeftPct = (m.bounds.x / graph.bounds.width) * 100;
            const nodeTopPct = (m.bounds.y / graph.bounds.height) * 100;
            const nodeWidthPct = (m.bounds.width / graph.bounds.width) * 100;
            return (
              <div
                key={node.id}
                style={{
                  position: 'absolute',
                  left: `${nodeLeftPct}%`,
                  top: `${nodeTopPct}%`,
                  width: `${nodeWidthPct}%`,
                  fontFamily: theme.secondaryFont || theme.fontFamily,
                }}
              >
                <div
                  style={{
                    fontSize: `${Math.max(14, Math.round((m.style.fontSize || 32) * scale * 0.5))}px`,
                    fontWeight: m.style.fontWeight || 900,
                    color: m.style.color || theme.primary,
                    lineHeight: 1.1,
                  }}
                >
                  {m.prefix}
                  <span>{m.targetValue.toFixed(m.decimals)}</span>
                  {m.unit && (
                    <span style={{ fontSize: '0.6em', color: theme.accent, marginLeft: '3px' }}>
                      {m.unit}
                    </span>
                  )}
                  {m.suffix}
                </div>
                {m.label && (
                  <div
                    style={{
                      fontSize: '8px',
                      fontWeight: 700,
                      color: theme.text,
                      opacity: 0.85,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      marginTop: '1px',
                    }}
                  >
                    {m.label}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};
