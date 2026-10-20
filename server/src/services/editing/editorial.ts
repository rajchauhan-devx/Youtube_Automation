import { Artifact, type EditingProject } from '@tubeflow/editing-contracts';
import { narrationCue } from './narrationCue.js';
import { sceneNarration, type Proposal } from './motionPackArtifacts.js';
import { motionAsset } from './motionAssets.js';
import type { MotionContext } from './motionProvider.js';

const normalized = (value: string) => value.normalize('NFKC').replace(/[०-९]/g, c => String(c.charCodeAt(0) - 0x966)).replace(/[,\s]/g, '').toLocaleLowerCase();
export async function compileEditorial(project: EditingProject, proposal: Proposal, ctx: MotionContext, id = `graphic-${proposal.sceneId}`) {
  if (!proposal.sequence || proposal.kind !== 'composition') throw new Error('Editorial sequences require an explicit supported composition brief.');
  const scene = project.scenes.find(s => s.id === proposal.sceneId);
  if (!scene) throw new Error('Unknown editorial scene');
  const cue = narrationCue(project.alignment.tokens.filter(t => scene.narrativeRefs.includes(t.id)), proposal.quote);
  if (!cue) throw new Error('Editorial sequence has no exact spoken evidence');
  const narration = sceneNarration(project, scene.id), sequence = proposal.sequence;
  const spokenNumbers = new Set<string>(normalized(narration).match(/\d+(?:\.\d+)?/g) || []);
  for (const fact of sequence.facts) {
    const digits = normalized(`${fact.value} ${fact.label}`).match(/\d+(?:\.\d+)?/g);
    if (digits ? digits.some(value => !spokenNumbers.has(value)) : !normalized(narration).includes(normalized(fact.value)))
      throw new Error(`Unsupported display value: ${fact.value}. Use a number or phrase actually spoken in this scene.`);
  }
  if (['impact', 'measure'].includes(sequence.template) && !sequence.facts.length) throw new Error('A numeric reveal requires a supported display fact.');
  if (['impact', 'measure'].includes(sequence.template) && !/\d/u.test(normalized(sequence.facts[0]?.value || '')))
    throw new Error('A scale/statistic sequence requires an actual spoken number, not a caption disguised as a graphic.');
  if (sequence.template === 'assembly' && !/interlock|joint|tongue|groove|जोड़|इंटरलॉक/iu.test(narration))
    throw new Error('The joining diagram requires a narration beat explicitly about joints or interlocking parts.');
  if (sequence.direction === 'incline' && !/ramp|incline|slope|रैंप|ढलान/iu.test(narration))
    throw new Error('An inclined process stage requires an explicitly narrated ramp or incline.');
  const { assetPrompt, ...spec } = sequence;
  let subjectAssetId: string | undefined;
  if (assetPrompt) {
    const asset = await motionAsset(project, assetPrompt, ctx); subjectAssetId = asset.id;
    project.assetIds = [...new Set([...project.assetIds, asset.id])];
  }
  const startFrame = project.alignment.mode === 'approximate' ? scene.startFrame : Math.max(scene.startFrame, Math.round(cue.start * project.inputs.fps));
  const endFrame = sequence.template === 'impact' ? Math.min(scene.endFrame, startFrame + Math.round(project.inputs.fps * 3.6)) : scene.endFrame;
  if (endFrame - startFrame < project.inputs.fps * (['process', 'assembly'].includes(sequence.template) ? 3 : 2))
    throw new Error('This sequence needs more reading and animation time than the spoken cue leaves.');
  return Artifact.parse({ id, sceneId: scene.id, enabled: true, intent: `Editorial ${sequence.template}: ${sequence.headline}`,
    narrativeRefs: scene.narrativeRefs, startFrame, endFrame, priority: 6, nodes: [], assetRequestIds: [],
    graphic: { kind: 'composition', title: proposal.title, detail: '', bounds: { x: 0, y: 0, width: project.inputs.width, height: project.inputs.height },
      composition: { version: 1, treatment: 'cinematic', layout: 'cutaway', emphasis: 'none', layers: [], editorial: { ...spec, ...(subjectAssetId ? { subjectAssetId } : {}) } } } });
}
