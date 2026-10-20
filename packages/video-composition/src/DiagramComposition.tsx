import { AbsoluteFill, Img, interpolate } from 'remotion';
import { useLayoutEffect, useRef } from 'react';
import type { AssetRecord, ArtifactComposition, EditingProject } from '@tubeflow/editing-contracts';
import { diagramLayout } from './diagram-layout.js';

function Label({ text, fontSize, height, artifactId }: { text: string; fontSize: number; height: number; artifactId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let size = fontSize;
    element.style.fontSize = `${size}px`;
    // Adjust typography only, within a narrow readable range. Overflow beyond
    // this floor is reported by rendered QA rather than shrinking the whole graphic.
    while ((element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) && size > fontSize * 0.86) {
      size -= 0.5; element.style.fontSize = `${size}px`;
    }
  }, [text, fontSize, height]);
  return <div ref={ref} data-editing-text="diagram-label" data-artifact-id={artifactId} style={{
    flex: 1, minWidth: 0, height, fontSize, lineHeight: 1.4, fontWeight: 600, color: '#fff',
    overflowWrap: 'anywhere',
  }}>{text}</div>;
}

export function DiagramComposition({ project, artifact, frame, asset }: {
  project: EditingProject; artifact: ArtifactComposition; frame: number; asset: { url: string; record: AssetRecord };
}) {
  const diagram = artifact.graphic!.composition!.diagram!;
  const { width, height, fps } = project.inputs;
  const local = frame - artifact.startFrame, duration = artifact.endFrame - artifact.startFrame;
  const layout = diagramLayout(width, height, diagram, { width: asset.record.width!, height: asset.record.height! });
  const accent = project.style.colors.accent || '#e7ba70', radius = layout.fontSize * 0.55;
  const opacity = Math.max(0, Math.min(1, local / (fps * 0.2), (duration - 1 - local) / (fps * 0.2)));
  const family = project.style.fontAssetIds.map(id => `"editing-${id}"`).join(', ');
  return <AbsoluteFill data-diagram-reflow style={{ background: '#10141c', opacity }}>
    <div style={{ position: 'absolute', left: layout.image.x, top: layout.image.y, width: layout.image.width,
      height: layout.image.height, overflow: 'hidden' }}>
      <Img src={asset.url} style={{ position: 'absolute', maxWidth: 'none',
        width: asset.record.width! * layout.scale, height: asset.record.height! * layout.scale,
        left: -diagram.sourceCrop.x * asset.record.width! * layout.scale,
        top: -diagram.sourceCrop.y * asset.record.height! * layout.scale }} />
    </div>
    {layout.cards.map((card, i) => {
      const reveal = interpolate(local, [fps * (0.15 + i * 0.08), fps * (0.45 + i * 0.08)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      // Only leaders and card opacity animate. Their endpoints stay registered to source pixels.
      const end = layout.portrait ? { x: card.x + radius * 2, y: card.y } : { x: card.x, y: card.y + card.height / 2 };
      return <svg key={`leader-${i}`} width={width} height={height} style={{ position: 'absolute', inset: 0, opacity: reveal }}>
          <path d={`M${card.point.x} ${card.point.y} L${end.x} ${end.y}`} fill="none" stroke={accent}
            strokeWidth={Math.max(2, width / 540)} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - reveal} opacity={0.5} />
          <circle cx={card.point.x} cy={card.point.y} r={radius} fill="#10141c" stroke={accent} strokeWidth={2} />
          <text x={card.point.x} y={card.point.y} dominantBaseline="central" textAnchor="middle" fill="#fff"
            fontFamily={family} fontSize={layout.fontSize * 0.7}>{i + 1}</text>
        </svg>;
    })}
    {layout.cards.map((card, i) => {
      const reveal = interpolate(local, [fps * (0.15 + i * 0.08), fps * (0.45 + i * 0.08)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return <div key={`card-${i}`} data-diagram-card style={{ position: 'absolute', left: card.x, top: card.y, width: card.width, height: card.height, opacity: reveal,
          boxSizing: 'border-box', borderLeft: `3px solid ${accent}`, padding: layout.fontSize * 0.35,
          background: '#1b2434', display: 'grid', gridTemplateColumns: `${layout.fontSize * 0.7}px minmax(0, 1fr)`,
          alignItems: 'start', gap: layout.fontSize * 0.3 }}>
          <span style={{ color: accent, fontFamily: family, fontSize: layout.fontSize * 0.8 }}>{i + 1}</span>
          <div style={{ minWidth: 0, fontFamily: family }}>
            <Label text={card.text} fontSize={layout.fontSize} height={card.height - layout.fontSize * 0.7}
              artifactId={artifact.id} />
          </div>
        </div>;
    })}
  </AbsoluteFill>;
}
