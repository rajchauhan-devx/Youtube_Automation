import { AbsoluteFill, Img, interpolate } from 'remotion';
import type { AssetRecord, ArtifactComposition, EditingProject } from '@tubeflow/editing-contracts';
import { targetOnScreen, targetMostlyVisible } from './graphics.js';
import type { Matrix } from './math.js';
import { imageMotionAt, documentaryImageLayout } from './image-motion.js';
import { DiagramComposition } from './DiagramComposition.js';
import { EditorialSequence } from './EditorialSequence.js';

export type DocumentaryAssets = Record<string, { url: string; record: AssetRecord }>;
type Props = { project: EditingProject; artifact: ArtifactComposition; frame: number;
  source: { width: number; height: number }; sourceTransform?: Matrix; assets: DocumentaryAssets };

/** Actual source pixels, independently animated. No remote fetching or generated code. */
export function DocumentaryComposition({ project, artifact, frame, source, sourceTransform, assets }: Props) {
  const g = artifact.graphic!, composition = g.composition!, b = g.bounds;
  if (composition.editorial) return <EditorialSequence project={project} artifact={artifact} frame={frame} assets={assets} />;
  if (composition.diagram) {
    const asset = assets[composition.layers[0].assetId];
    if (!asset) throw new Error('Missing diagram source');
    return <DiagramComposition project={project} artifact={artifact} frame={frame} asset={asset} />;
  }
  const duration = artifact.endFrame - artifact.startFrame, local = frame - artifact.startFrame;
  const fade = Math.min(1, local / Math.max(1, project.inputs.fps * 0.22), (duration - 1 - local) / Math.max(1, project.inputs.fps * 0.22));
  const target = targetOnScreen(project, artifact, frame, source, sourceTransform);
  const accent = project.style.colors.accent || '#8bb9e8';
  const comparison = composition.comparison;
  const wipe = Math.max(0, Math.min(1, (local / Math.max(1, duration - 1) - 0.15) / 0.7));
  return <AbsoluteFill style={{ opacity: Math.max(0, fade) }}>
    {target && composition.emphasis !== 'none' && targetMostlyVisible(target, project.inputs.width, project.inputs.height) &&
      <svg width={project.inputs.width} height={project.inputs.height} style={{ position: 'absolute', inset: 0 }}>
        {composition.emphasis === 'focus' && <path
          d={`M0 0H${project.inputs.width}V${project.inputs.height}H0Z M${target.x} ${target.y}v${target.height}h${target.width}v-${target.height}Z`}
          fill="#00000099" fillRule="evenodd" />}
        <rect x={target.x} y={target.y} width={target.width} height={target.height}
          fill={composition.emphasis === 'marker' ? `${accent.slice(0, 7)}44` : 'none'}
          stroke={accent} strokeWidth={Math.max(2, project.inputs.width / 650)} />
      </svg>}
    <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, overflow: 'hidden' }}>
      {composition.layers.map((layer, index) => {
        const asset = assets[layer.assetId];
        if (!asset) throw new Error(`Missing documentary layer ${layer.assetId}`);
        const bounds = comparison ? { x: comparison.mode === 'split' ? index * 0.5 : 0, y: 0, width: comparison.mode === 'split' ? 0.5 : 1, height: 1 } : layer.bounds;
        const w = bounds.width * b.width, h = bounds.height * b.height;
        const imageW = asset.record.width!, imageH = asset.record.height!;
        const { crop, fit } = documentaryImageLayout(layer, w, h, { width: imageW, height: imageH });
        const reveal = interpolate(local - duration * layer.delay, [0, Math.max(1, project.inputs.fps * 0.45)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const progress = Math.max(0, Math.min(1, (local - duration * layer.delay) / Math.max(1, duration * (1 - layer.delay) - 1)));
        const motion = imageMotionAt(layer, progress);
        return <div key={layer.id} data-documentary-layer={layer.id} style={{ position: 'absolute',
          left: bounds.x * b.width, top: bounds.y * b.height, width: w, height: h,
          clipPath: comparison?.mode === 'wipe' && index === 1 ? `inset(0 ${(1 - wipe) * 100}% 0 0)` : undefined,
          opacity: comparison ? 1 : reveal, transform: comparison ? undefined : `translate(${motion.x * w}px, ${motion.y * h + (1 - reveal) * h * 0.035}px) rotate(${layer.preserveSource ? 0 : layer.rotation}deg)`,
          boxSizing: 'border-box', overflow: 'hidden', background: asset.record.alpha ? 'transparent' : '#10141c',
          border: asset.record.alpha ? 'none' : composition.treatment === 'archival' ? `${Math.max(2, b.width / 180)}px solid #e8e0d0` : '1px solid #ffffff44',
          boxShadow: asset.record.alpha ? 'none' : '0 8px 24px #0009', filter: asset.record.alpha ? 'drop-shadow(0 5px 10px #0008)' : undefined }}>
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${motion.scale})`, transformOrigin: `${motion.originX * 100}% ${motion.originY * 100}%` }}>
            <div style={{ position: 'absolute', overflow: 'hidden', width: imageW * crop.width * fit, height: imageH * crop.height * fit,
              left: (w - imageW * crop.width * fit) / 2, top: (h - imageH * crop.height * fit) / 2 }}>
            <Img src={asset.url} style={{ position: 'absolute', maxWidth: 'none',
              width: imageW * fit, height: imageH * fit,
              left: -crop.x * imageW * fit, top: -crop.y * imageH * fit }} />
            </div>
          </div>
        </div>;
      })}
      {comparison && <>
        <div data-comparison-divider style={{ position: 'absolute', left: `${(comparison.mode === 'split' ? 0.5 : wipe) * 100}%`, top: 0, bottom: 0, width: Math.max(2, project.inputs.width / 500), background: accent, transform: 'translateX(-50%)' }} />
        {[comparison.beforeLabel, comparison.afterLabel].map((label, index) => label && <div key={index} style={{ position: 'absolute', top: 8, ...(index === 0 ? { left: 8 } : { right: 8 }), maxWidth: '45%', padding: '4px 8px', background: '#10141ccc', color: '#fff', fontFamily: project.style.fontAssetIds.map(id => `"editing-${id}"`).join(', '), fontSize: Math.max(9, b.width * 0.035), overflowWrap: 'anywhere' }}>{label}</div>)}
      </>}
    </div>
  </AbsoluteFill>;
}
