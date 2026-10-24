import { z } from 'zod';
import { Artifact, Crop, EditorialSequence, ImageMotionSettings, ImageComparison, type ArtifactComposition, type EditingProject, type MotionGraphicSpec } from '@tubeflow/editing-contracts';
import { cardBounds, graphicIssues, graphicNames } from '@tubeflow/video-composition';
import {motionLanguageIssues} from './motionEditorial.js';
import { assetRecord } from './repository.js';
import { narrationCue } from './narrationCue.js';

export const GraphicProposal = z.strictObject({
  sceneId: z.string(),
  kind: z.enum(['title', 'lower-third', 'badge', 'spotlight', 'route', 'counter', 'frame', 'diagram', 'composition']),
  title: z.string().trim().min(1).max(64),
  detail: z.string().trim().max(120),
  target: z.string().trim().max(120),
  quote: z.string().trim().min(1).max(1000),
  position: z.enum(['top', 'bottom', 'left', 'right', 'center']).optional(),
  sequence: EditorialSequence.omit({ subjectAssetId: true }).extend({ assetPrompt: z.string().trim().max(1600).optional() }).optional(),
  composition: z.strictObject({
    treatment: z.enum(['archival', 'cinematic', 'map']),
    layout: z.enum(['inset', 'cutaway']).optional(),
    comparison: ImageComparison.optional(),
    emphasis: z.enum(['none', 'focus', 'marker']),
    layers: z.array(z.strictObject({
      sourceSceneId: z.string().max(100),
      bounds: Crop,
      crop: Crop.optional(),
      useTargetCrop: z.boolean(),
      fit: z.enum(['contain', 'cover']),
      ...ImageMotionSettings,
      delay: z.number().min(0).max(0.5),
      rotation: z.number().min(-6).max(6),
    })).min(1).max(4),
  }).optional(),
});
export type Proposal = z.infer<typeof GraphicProposal>;
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
export function compileGraphic(p: EditingProject, proposal: Proposal, target?: MotionGraphicSpec['target'], id = `graphic-${proposal.sceneId}`, labeledSources: string[] = []): ArtifactComposition {
  const languageIssues=motionLanguageIssues(p,[proposal.title,proposal.detail,...(proposal.sequence ? [proposal.sequence.headline,proposal.sequence.kicker || '',proposal.sequence.disclosure || '',...proposal.sequence.facts.flatMap(f=>[f.value,f.label])] : [])]);
  if(languageIssues.length)throw new Error(languageIssues[0]);
  const scene = p.scenes.find(s => s.id === proposal.sceneId);
  const cue = scene && narrationCue(p.alignment.tokens.filter(t => scene.narrativeRefs.includes(t.id)), proposal.quote);
  if (!scene || !cue) throw new Error('The proposed graphic has no matching narration evidence.');
  if (proposal.kind !== 'spotlight' && SLOGAN.test(`${proposal.title} ${proposal.detail}`)) throw new Error('The proposed label reads as clickbait. Use an evidence noun or citation instead.');
  const title = proposal.kind === 'spotlight' && target ? target.label.slice(0, 64).replace(/^./u, first => first.toLocaleUpperCase()) : proposal.title;
  const sceneSeconds = (scene.endFrame - scene.startFrame) / p.inputs.fps;
  const readingSeconds = (detail: string) => Math.max(2.5, Math.min(8, `${title} ${detail}`.trim().split(/\s+/u).length / 3 + 0.8));
  let detail = proposal.kind === 'spotlight' ? '' : citationDetail(proposal.detail);
  if (proposal.kind === 'title' && sceneSeconds < Math.min(readingSeconds(detail), 3)) detail = '';
  const seconds = readingSeconds(detail);
  if (sceneSeconds < (proposal.kind === 'composition' ? 1.4 : Math.min(seconds, 3))) throw new Error('The scene is too short to read this graphic.');
  let startFrame = scene.startFrame;
  if (p.alignment.mode !== 'approximate') {
    startFrame = Math.max(startFrame, Math.round(cue.start * p.inputs.fps));
  }
  const endFrame = proposal.kind === 'composition' ? scene.endFrame : Math.min(scene.endFrame, startFrame + Math.ceil(seconds * p.inputs.fps));
  if (endFrame - startFrame < p.inputs.fps * (proposal.kind === 'composition' ? 1.4 : 2)) throw new Error('The cue leaves insufficient reading time.');
  const graphic: MotionGraphicSpec = { kind: proposal.kind, title, detail,
    bounds: cardBounds(proposal.kind, p.inputs.width, p.inputs.height, proposal.position || (proposal.kind === 'title' ? 'center' : 'bottom')), ...(target ? { target } : {}) };
  if (proposal.kind === 'composition') {
    if (!proposal.composition) throw new Error('Documentary composition is missing its image layers.');
    const design = proposal.composition;
    if (design.layout === 'cutaway') graphic.bounds = { x: 0, y: 0, width: p.inputs.width, height: p.inputs.height };
    graphic.composition = { version: 1, treatment: design.treatment, ...(design.layout ? { layout: design.layout } : {}), emphasis: design.emphasis,
      ...(design.comparison ? { comparison: design.comparison } : {}),
      layers: design.layers.map((layer, i) => {
        const sourceScene = p.scenes.find(s => s.id === layer.sourceSceneId);
        if (!sourceScene) throw new Error('Documentary layer refers to an unknown scene.');
        const source = assetRecord(sourceScene.assetId);
        const preserveSource = labeledSources.includes(source.id);
        if (!source.mime.startsWith('image/')) throw new Error('Documentary inserts require still images. Choose an image scene.');
        if (layer.useTargetCrop && (!target || sourceScene.id !== scene.id)) throw new Error('A verified detail crop must use its own source scene.');
        return { bounds: layer.bounds, fit: layer.fit, motion: layer.motion, delay: layer.delay, rotation: layer.rotation,
          ...(layer.strength !== undefined ? { strength: layer.strength } : {}), ...(layer.focus ? { focus: layer.focus } : {}),
          ...(layer.crop ? { crop: layer.crop } : {}), id: `image-${i}`, assetId: source.id,
          ...(layer.useTargetCrop ? { crop: target!.region } : {}),
          ...(preserveSource ? { preserveSource: true, fit: 'contain' as const, crop: { x: 0, y: 0, width: 1, height: 1 }, rotation: 0 } : {}) };
      }) };
  } else if (proposal.composition) throw new Error('Only documentary compositions accept image layers.');
  if (graphic.composition && graphic.composition.layers.every(layer => !layer.preserveSource && layer.assetId === scene.assetId &&
    (!layer.crop || (layer.crop.x === 0 && layer.crop.y === 0 && layer.crop.width >= 0.98 && layer.crop.height >= 0.98))))
    throw new Error('Repeating the entire background is not a documentary insert. Use a useful source detail or a related companion image.');
  const artifact = Artifact.parse({ id, sceneId: scene.id, enabled: true, intent: `${graphicNames[proposal.kind]}: ${title}`,
    narrativeRefs: scene.narrativeRefs.slice(0, 100), startFrame, endFrame, priority: 5, nodes: [], assetRequestIds: [], graphic });
  const source = assetRecord(scene.assetId);
  const dimensions = { width: source.width!, height: source.height! };
  if (proposal.kind === 'spotlight' || (graphic.composition && graphic.composition.emphasis !== 'none')) {
    let accepted = false;
    for (const scale of graphic.composition ? [1, 0.8, 0.6] : [1]) {
      for (const position of ['bottom', 'top', 'right', 'center']) {
        const base = cardBounds(proposal.kind, p.inputs.width, p.inputs.height, position);
        artifact.graphic!.bounds = { x: base.x + (position === 'right' ? base.width * (1 - scale) : 0),
          y: base.y + (position === 'top' ? 0 : base.height * (1 - scale)), width: base.width * scale, height: base.height * scale };
        if (!graphicIssues(p, artifact, dimensions).length) { accepted = true; break; }
      }
      if (accepted) break;
    }
    if (!accepted) throw new Error('The target or its callout cannot fit safely throughout the camera movement.');
  }
  const issues = graphicIssues(p, artifact, dimensions);
  if (issues.length) throw new Error(issues.join(' '));
  return artifact;
}
