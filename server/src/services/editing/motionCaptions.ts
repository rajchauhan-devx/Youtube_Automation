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
export async function createMotionCaptions(input: EditingProject, signal: AbortSignal, preserveScenes = false): Promise<EditingProject> {
  const project = motionProject(nextRevision(input));
  project.alignment = await align(project, signal, false);
  if (!preserveScenes && !project.artifacts.some(artifact => artifact.graphic?.kind !== 'caption')) project.scenes = mapScenes(project);
  else {
    for (const scene of project.scenes) scene.narrativeRefs = project.alignment.tokens.filter(token => Math.round(token.start * project.inputs.fps) >= scene.startFrame && Math.round(token.start * project.inputs.fps) < scene.endFrame).map(token => token.id);
    for (const artifact of project.artifacts) artifact.narrativeRefs = project.scenes.find(scene => scene.id === artifact.sceneId)!.narrativeRefs.slice(0, 100);
  }
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
          graphic: { kind: 'caption', title, detail: '', bounds: cardBounds('caption', project.inputs.width, project.inputs.height),
            ...(project.alignment.mode === 'word' ? { wordTimings: group.map(word => {
              const start = Math.min(endFrame - startFrame - 1, Math.max(0, Math.round(word.start * project.inputs.fps) - startFrame));
              return { startFrame: start, endFrame: Math.min(endFrame - startFrame, Math.max(start + 1, Math.round(word.end * project.inputs.fps) - startFrame)) };
            }) } : {}) },
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
  if (project.alignment.mode !== 'word') project.diagnostics.push({ severity: 'info', code: 'CAPTION_TIMING_ESTIMATED', stage: 'captions', message: project.alignment.mode === 'phrase' ? 'Scene boundaries are measured, but word intervals are estimated. Use Align spoken words for measured caption timing.' : 'Caption timing is estimated because measured narration scene timing is unavailable.', retryable: false });
  project.status = project.diagnostics.some(d => d.code === 'GRAPHIC_SKIPPED') ? 'partial' : 'ready';
  return validateProject(project);
}
