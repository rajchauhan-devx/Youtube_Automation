import { useMemo } from 'react';
import type { SceneGraphData } from '@tubeflow/editing-contracts';
import { renderSceneGraphSvg, type SceneGraphRenderOptions } from '@tubeflow/video-composition';

interface Props {
  graph: SceneGraphData;
  frame: number;
  options: SceneGraphRenderOptions;
}
export function SceneGraphOverlay({ graph, frame, options }: Props) {
  const markup = useMemo(() => renderSceneGraphSvg(graph, frame, options), [graph, frame, options]);
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: markup }} />;
}
