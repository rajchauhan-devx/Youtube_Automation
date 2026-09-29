import { z } from 'zod';
import { Artifact, type ArtifactComposition, type EditingProject, type MotionGraphicSpec } from '@tubeflow/editing-contracts';
import { cardBounds, graphicIssues, graphicNames } from '@tubeflow/video-composition';
import { assetRecord } from './repository.js';

export const GraphicProposal = z.strictObject({
  sceneId: z.string(),
  kind: z.enum(['title', 'lower-third', 'badge', 'spotlight']),
  title: z.string().trim().min(1).max(64),
  detail: z.string().trim().max(120),
  target: z.string().trim().max(120),
  quote: z.string().trim().min(1).max(1000),
});
export type Proposal = z.infer<typeof GraphicProposal>;
const normalize = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
export function sceneNarration(p: EditingProject, sceneId: string) {
  const scene = p.scenes.find(s => s.id === sceneId)!;
  return scene.narrativeRefs.map(id => p.alignment.tokens.find(t => t.id === id)?.text || '').join(' ');
}
export function compileGraphic(p: EditingProject, proposal: Proposal, target?: MotionGraphicSpec['target'], id = `graphic-${proposal.sceneId}`): ArtifactComposition {
  const scene = p.scenes.find(s => s.id === proposal.sceneId);
  if (!scene || !normalize(sceneNarration(p, scene.id)).includes(normalize(proposal.quote))) throw new Error('The proposed graphic has no matching narration evidence.');
  const words = `${proposal.title} ${proposal.detail}`.trim().split(/\s+/u).length;
  const seconds = Math.max(2.5, Math.min(8, words / 3 + 0.8));
  if ((scene.endFrame - scene.startFrame) / p.inputs.fps < Math.min(seconds, 3)) throw new Error('The scene is too short to read this graphic.');
  let startFrame = scene.startFrame;
  if (p.alignment.mode === 'word') {
    const phrase = normalize(proposal.quote), firstWord = phrase.split(' ')[0];
    const token = p.alignment.tokens.find(t => scene.narrativeRefs.includes(t.id) && normalize(t.text) === firstWord);
    if (token) startFrame = Math.max(startFrame, Math.round(token.start * p.inputs.fps));
  }
  const endFrame = Math.min(scene.endFrame, startFrame + Math.ceil(seconds * p.inputs.fps));
  if (endFrame - startFrame < p.inputs.fps * 2) throw new Error('The cue leaves insufficient reading time.');
  const graphic: MotionGraphicSpec = { kind: proposal.kind, title: proposal.title, detail: proposal.detail,
    bounds: cardBounds(proposal.kind, p.inputs.width, p.inputs.height), ...(target ? { target } : {}) };
  const artifact = Artifact.parse({ id, sceneId: scene.id, enabled: true, intent: `${graphicNames[proposal.kind]}: ${proposal.title}`,
    narrativeRefs: scene.narrativeRefs.slice(0, 100), startFrame, endFrame, priority: 5, nodes: [], assetRequestIds: [], graphic });
  const source = assetRecord(scene.assetId);
  const dimensions = { width: source.width!, height: source.height! };
  if (proposal.kind === 'spotlight') {
    let accepted = false;
    for (const position of ['bottom', 'top', 'right', 'center']) {
      artifact.graphic!.bounds = cardBounds('spotlight', p.inputs.width, p.inputs.height, position);
      if (!graphicIssues(p, artifact, dimensions).length) { accepted = true; break; }
    }
    if (!accepted) throw new Error('The target or its callout cannot fit safely throughout the camera movement.');
  }
  const issues = graphicIssues(p, artifact, dimensions);
  if (issues.length) throw new Error(issues.join(' '));
  return artifact;
}
