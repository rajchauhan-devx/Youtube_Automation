import { validateProject, type EditingProject } from '@tubeflow/editing-contracts';
import { nextRevision } from './repository.js';
import { align } from './timing.js';
import { createMotionCaptions } from './motionCaptions.js';
import { narrationCue } from './narrationCue.js';

export async function alignProject(input: EditingProject, signal: AbortSignal) {
  let project = nextRevision(input);
  project.alignment = await align(project, signal, true);
  const captions = project.artifacts.some(artifact => artifact.graphic?.kind === 'caption');
  project.artifacts = project.artifacts.filter(artifact => artifact.graphic?.kind !== 'caption');
  for (const scene of project.scenes) {
    scene.narrativeRefs = project.alignment.tokens.filter(token => Math.round(token.start * project.inputs.fps) >= scene.startFrame && Math.round(token.start * project.inputs.fps) < scene.endFrame).map(token => token.id);
    if (!scene.narrativeRefs.length) throw new Error('A scene contains no aligned narration. Review its scene boundaries before aligning.');
  }
  for (const artifact of project.artifacts) {
    const scene = project.scenes.find(scene => scene.id === artifact.sceneId)!;
    artifact.narrativeRefs = scene.narrativeRefs.slice(0, 100);
    if (artifact.sceneGraph) {
      const tokens = project.alignment.tokens.filter(token => scene.narrativeRefs.includes(token.id));
      for (const evidence of artifact.sceneGraph.evidence) {
        const cue = narrationCue(tokens, evidence.verifiedValue);
        if (!cue) throw new Error(`Cannot rebind the narration evidence for ${artifact.intent}. Regenerate that graphic after reviewing the scene boundaries.`);
        evidence.narrationTokenIds = tokens.filter(token => token.start < cue.end && token.end > cue.start).map(token => token.id);
      }
    }
  }
  project.diagnostics = project.diagnostics.filter(note => !['SCENE_TIMING', 'CAPTION_TIMING_ESTIMATED'].includes(note.code));
  if (captions) {
    const alignedRevision = project.revisionId;
    project = await createMotionCaptions(project, signal, true);
    project.revisionId = alignedRevision; project.parentRevisionId = input.revisionId;
  }
  return validateProject(project);
}
