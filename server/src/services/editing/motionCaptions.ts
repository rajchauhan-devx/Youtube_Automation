import { Artifact, motionProject, validateProject, type EditingProject } from '@tubeflow/editing-contracts';
import { cardBounds } from '@tubeflow/video-composition';
import { nextRevision } from './repository.js';
import { align, mapScenes } from './timing.js';

type Word = { text: string; start: number; end: number; tokenId: string };

function sceneWords(project: EditingProject, scene: EditingProject['scenes'][number]): Word[] {
  const words: Word[] = [];
  for (const id of scene.narrativeRefs) {
    const token = project.alignment.tokens.find(item => item.id === id);
    if (!token) continue;
    const matches = [...token.text.matchAll(/\S+/gu)];
    const weight = matches.reduce((sum, match) => sum + match[0].length, 0);
    let cursor = 0;
    for (const match of matches) {
      const start = token.start + (token.end - token.start) * cursor / weight;
      cursor += match[0].length;
      words.push({ text: match[0], start, end: token.start + (token.end - token.start) * cursor / weight, tokenId: id });
    }
  }
  return words;
}

/** Captions are timed to saved narration boundaries, never inferred from unrelated script text. */
export async function createMotionCaptions(input: EditingProject, signal: AbortSignal): Promise<EditingProject> {
  const project = motionProject(nextRevision(input));
  project.alignment = await align(project, signal, false);
  project.scenes = mapScenes(project);
  project.artifacts = project.artifacts.filter(a => a.graphic?.kind !== 'caption');
  project.diagnostics = project.diagnostics.filter(d => d.code !== 'CAPTION_TIMING_ESTIMATED');
  const portrait = project.inputs.height > project.inputs.width;
  const maxChars = portrait ? 36 : 52;
  const maxWords = portrait ? 5 : 8;
  let index = 0;
  for (const scene of project.scenes) {
    const words = sceneWords(project, scene);
    let group: Word[] = [];
    const add = () => {
      if (!group.length) return;
      const startFrame = Math.max(scene.startFrame, Math.round(group[0].start * project.inputs.fps));
      const endFrame = Math.min(scene.endFrame, Math.max(startFrame + 1, Math.round(group[group.length - 1].end * project.inputs.fps)));
      if (endFrame > startFrame) {
        const title = group.map(word => word.text).join(' ').slice(0, 64);
        project.artifacts.push(Artifact.parse({
          id: `caption-${index++}`, sceneId: scene.id, enabled: true, intent: `Motion caption: ${title}`,
          narrativeRefs: [...new Set(group.map(word => word.tokenId))], startFrame, endFrame,
          priority: 3, nodes: [], assetRequestIds: [],
          graphic: { kind: 'caption', title, detail: '', bounds: cardBounds('caption', project.inputs.width, project.inputs.height) },
        }));
      }
      group = [];
    };
    for (const word of words) {
      const candidate = [...group, word];
      if (group.length && (candidate.length > maxWords || candidate.map(item => item.text).join(' ').length > maxChars || word.end - group[0].start > 3.2)) add();
      group.push(word);
      if (/[.!?।॥]$/u.test(word.text)) add();
    }
    add();
  }
  if (!index) throw new Error('No narration timing is available for motion captions.');
  if (project.artifacts.length > 1000) throw new Error('This narration needs more than 1,000 captions. Split the video into shorter projects.');
  if (project.alignment.mode === 'approximate') project.diagnostics.push({ severity: 'info', code: 'CAPTION_TIMING_ESTIMATED', stage: 'captions', message: 'Caption timing is estimated because measured narration scene timing is unavailable.', retryable: false });
  project.status = project.diagnostics.some(d => d.code === 'GRAPHIC_SKIPPED') ? 'partial' : 'ready';
  return validateProject(project);
}
