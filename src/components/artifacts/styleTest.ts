import type { ArtifactComposition, EditingProject, MotionGraphicSpec } from '@tubeflow/editing-contracts';
import { cardBounds } from '@tubeflow/video-composition';

type Kind = MotionGraphicSpec['kind'];
export type StyleTestSample = { kind: Kind; frame: number };

/** A local preview of all four renderers. Nothing from this project is saved or exported. */
export function makeStyleTestProject(project: EditingProject): { project: EditingProject; samples: StyleTestSample[] } | null {
  const spotlight = project.artifacts.find(a => a.enabled && a.graphic?.kind === 'spotlight' && a.graphic.target?.verified);
  if (!spotlight) return null;

  const usedScenes = new Set([spotlight.sceneId]);
  const artifacts: ArtifactComposition[] = [spotlight];
  const labels: Record<Exclude<Kind, 'spotlight' | 'custom'>, { title: string; detail: string; position: string }> = {
    title: { title: 'Title style', detail: '', position: 'center' },
    'lower-third': { title: 'Character name', detail: 'Style test', position: 'bottom' },
    badge: { title: 'Location / Era', detail: 'Style test', position: 'top' },
  };

  for (const kind of ['title', 'lower-third', 'badge'] as const) {
    const existing = project.artifacts.find(a => a.enabled && a.graphic?.kind === kind && !usedScenes.has(a.sceneId));
    if (existing) {
      artifacts.push(existing);
      usedScenes.add(existing.sceneId);
      continue;
    }
    const scene = project.scenes.find(s => !usedScenes.has(s.id) && s.narrativeRefs.length > 0 && s.endFrame - s.startFrame >= Math.ceil(project.inputs.fps * 2.5));
    if (!scene) return null;
    const label = labels[kind];
    artifacts.push({
      id: `style-test-${kind}`, sceneId: scene.id, enabled: true,
      intent: `Style test: ${kind}`, narrativeRefs: scene.narrativeRefs.slice(0, 100),
      startFrame: scene.startFrame, endFrame: Math.min(scene.endFrame, scene.startFrame + Math.round(project.inputs.fps * 3)),
      priority: 5, nodes: [], assetRequestIds: [],
      graphic: { kind, title: label.title, detail: label.detail,
        bounds: cardBounds(kind, project.inputs.width, project.inputs.height, label.position) },
    });
    usedScenes.add(scene.id);
  }

  artifacts.sort((a, b) => a.startFrame - b.startFrame);
  return { project: { ...project, artifacts }, samples: artifacts.map(a => ({ kind: a.graphic!.kind, frame: Math.min(a.endFrame - 1, a.startFrame + Math.round(project.inputs.fps * 0.9)) })) };
}
