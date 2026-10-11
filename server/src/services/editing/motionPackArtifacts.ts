import { z } from 'zod';
import { Artifact, type ArtifactComposition, type EditingProject, type MotionGraphicSpec } from '@tubeflow/editing-contracts';
import { cardBounds, graphicIssues, graphicNames } from '@tubeflow/video-composition';
import { assetRecord } from './repository.js';

export const GraphicProposal = z.strictObject({
  sceneId: z.string(),
  kind: z.enum(['title', 'lower-third', 'badge', 'spotlight', 'route', 'counter', 'frame', 'diagram']),
  title: z.string().trim().min(1).max(64),
  detail: z.string().trim().max(120),
  target: z.string().trim().max(120),
  quote: z.string().trim().min(1).max(1000),
  position: z.enum(['top', 'bottom', 'left', 'right', 'center']).optional(),
});
export type Proposal = z.infer<typeof GraphicProposal>;
const normalize = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
// Motivational/clickbait labels read as AI slop in documentaries. Details are
// source/era citations, titles are evidence nouns — never slogans.
const SLOGAN = /\b(amazing|incredible|shocking|unbelievable|mind[\s-]?blow|viral|epic|secret|you won'?t believe|must watch)\b/i;
function citationDetail(detail: string): string {
  const clean = detail.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (clean.length < detail.trim().length) {
    const cut = clean.slice(0, 38).replace(/\s+\S*$/, '').trim();
    return (cut || clean).slice(0, 40);
  }
  return clean;
}
export function sceneNarration(p: EditingProject, sceneId: string) {
  const scene = p.scenes.find(s => s.id === sceneId)!;
  return scene.narrativeRefs.map(id => p.alignment.tokens.find(t => t.id === id)?.text || '').join(' ');
}
export function compileGraphic(p: EditingProject, proposal: Proposal, target?: MotionGraphicSpec['target'], id = `graphic-${proposal.sceneId}`): ArtifactComposition {
  const scene = p.scenes.find(s => s.id === proposal.sceneId);
  if (!scene || !normalize(sceneNarration(p, scene.id)).includes(normalize(proposal.quote))) throw new Error('The proposed graphic has no matching narration evidence.');
  if (proposal.kind !== 'spotlight' && SLOGAN.test(`${proposal.title} ${proposal.detail}`)) throw new Error('The proposed label reads as clickbait. Use an evidence noun or citation instead.');
  const title = proposal.kind === 'spotlight' && target ? target.label.slice(0, 64).replace(/^./u, first => first.toLocaleUpperCase()) : proposal.title;
  const sceneSeconds = (scene.endFrame - scene.startFrame) / p.inputs.fps;
  const readingSeconds = (detail: string) => Math.max(2.5, Math.min(8, `${title} ${detail}`.trim().split(/\s+/u).length / 3 + 0.8));
  let detail = proposal.kind === 'spotlight' ? '' : citationDetail(proposal.detail);
  if (proposal.kind === 'title' && sceneSeconds < Math.min(readingSeconds(detail), 3)) detail = '';
  const seconds = readingSeconds(detail);
  if (sceneSeconds < Math.min(seconds, 3)) throw new Error('The scene is too short to read this graphic.');
  let startFrame = scene.startFrame;
  if (p.alignment.mode === 'word') {
    const phrase = normalize(proposal.quote), firstWord = phrase.split(' ')[0];
    const token = p.alignment.tokens.find(t => scene.narrativeRefs.includes(t.id) && normalize(t.text) === firstWord);
    if (token) startFrame = Math.max(startFrame, Math.round(token.start * p.inputs.fps));
  }
  const endFrame = Math.min(scene.endFrame, startFrame + Math.ceil(seconds * p.inputs.fps));
  if (endFrame - startFrame < p.inputs.fps * 2) throw new Error('The cue leaves insufficient reading time.');
  const graphic: MotionGraphicSpec = { kind: proposal.kind, title, detail,
    bounds: cardBounds(proposal.kind, p.inputs.width, p.inputs.height, proposal.position || (proposal.kind === 'title' ? 'center' : 'bottom')), ...(target ? { target } : {}) };
  const artifact = Artifact.parse({ id, sceneId: scene.id, enabled: true, intent: `${graphicNames[proposal.kind]}: ${title}`,
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
