import { z } from 'zod';
import { Artifact, type ArtifactComposition, type EditingProject, type ScenePlan } from '@tubeflow/editing-contracts';
import { ANCIENT_DHARMA_LIBRARY, compileMotionTemplate, motionLibraryTemplate } from '@tubeflow/video-composition';
import { motionJson, type MotionContext } from './motionProvider.js';
import { sceneNarration } from './motionPackArtifacts.js';
import { inspectGraphLayout } from './sceneGraphLayout.js';
import { motionEditorialContext } from './motionEditorial.js';

const norm = (s: string) => s.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
export const narrationSupports = (text: string, narration: string) => !!norm(text) && (` ${norm(narration)} `).includes(` ${norm(text)} `);

export function motionLibraryForProject(project: EditingProject) {
  return motionEditorialContext(project).key === 'ancient_dharma' ? ANCIENT_DHARMA_LIBRARY : [];
}

export async function generateLibraryGraph(
  project: EditingProject, scene: ScenePlan, beat: { templateId?: string; intent: string; quote: string },
  interval: {startFrame: number; endFrame: number}, ctx: MotionContext, model: string,
  validate: (graph: NonNullable<ArtifactComposition['sceneGraph']>) => string[], old?: ArtifactComposition, observation?: unknown,
): Promise<ArtifactComposition> {
  const template = motionLibraryTemplate(beat.templateId || '');
  if (!template || !motionLibraryForProject(project).some(t=>t.id===template.id)) throw new Error('Template is not available for this profile');
  const narration = sceneNarration(project,scene.id), policy=motionEditorialContext(project);
  const tokens=project.alignment.tokens.filter(t=>scene.narrativeRefs.includes(t.id));
  const observed = z.object({openArea:z.enum(['top','bottom','left','right','center','none'])}).safeParse(observation);
  const openArea = observed.success ? observed.data.openArea : 'center';
  if(openArea==='none')throw new Error('No open area is available; keep this scene clean');
  const options = {templateId:template.id,width:project.inputs.width,height:project.inputs.height,fps:project.inputs.fps,
    durationFrames:interval.endFrame-interval.startFrame,fontAssetId:project.style.fontAssetIds[policy.displayLanguage==='hi'&&project.style.fontAssetIds.length>1?1:0],
    sceneId:scene.id,tokens,openArea};
  // Use the server's provider-schema instance; compileMotionTemplate also parses
  // the canonical shared content contract before accepting any geometry.
  const schema=z.strictObject({
    items:z.array(z.strictObject({text:z.string().trim().min(1).max(160),detail:z.string().trim().min(1).max(160).optional()})).min(1).max(7),
    links:z.array(z.strictObject({from:z.number().int().min(0).max(6),to:z.number().int().min(0).max(6)})).max(6).default([]),
    layout:z.enum(['auto','horizontal','vertical']).default('auto'),
  }).superRefine((content,check)=>{
    if(content.items.length<template.minItems||content.items.length>template.maxItems)check.addIssue({code:'custom',message:`Use ${template.minItems}–${template.maxItems} items`});
    for(const [i,item] of content.items.entries())for(const [field,text] of Object.entries(item))if(text&&!narrationSupports(text,narration))check.addIssue({code:'custom',path:['items',i,field],message:'Use an exact phrase from this scene narration; never sample facts or invented translations'});
    try {
      const {layout,...data}=content;
      const graph=compileMotionTemplate({...options,content:data,layout});
      for(const message of validate(graph))check.addIssue({code:'custom',message});
    }catch(error){check.addIssue({code:'custom',message:error instanceof Error?error.message:'Invalid template content'});}
  });
  let feedback: string[]=[];
  for(let round=0;round<2;round++){
    ctx.stage(round?'Fitting motion template':'Adapting motion template',0,1);
    const content=await motionJson(ctx,model,round?'repair-scene-graph-template':'design-scene-graph-template',schema,
      'Adapt the selected motion family to THIS narration. Return content only; the shared renderer owns geometry and animation. Each item text and optional detail must be an exact short contiguous phrase from the scene narration. Use the channel display language. Never translate silently, reuse example facts, invent dates/measurements/source credits or turn narration paragraphs into captions. Follow the selected family useWhen and avoidWhen. For a tree, order parents before children and supply one explicit {from,to} link for every child, supported by the narration. All other families use links:[]. Order journey/process/timeline items exactly as supported by the narration; spacing is schematic, never geographic or proportional time. Two comparison items describe the two stated accounts, not invented numerical bars. Prefer fewer short labels and a long reading hold. Auto layout reflows for the output format; use vertical when horizontal text would be cramped. Use feedback to simplify phrases or remove optional detail without changing facts. Channel policy and source observations take precedence over script hints.',
      {template,narration,intent:beat.intent,quote:beat.quote,editorialPolicy:policy,
        output:{width:options.width,height:options.height,durationSeconds:options.durationFrames/options.fps,openArea},
        observation,protectedRegions:scene.reservedRegions,previous:old?.sceneGraph,feedback});
    const {layout,...data}=content;
    const graph=compileMotionTemplate({...options,content:data,layout});
    const candidate=Artifact.parse({id:old?.id||`sg-${scene.id}`,sceneId:scene.id,enabled:old?.enabled??true,intent:beat.intent,narrativeRefs:scene.narrativeRefs,
      ...interval,priority:5,nodes:[],assetRequestIds:[],sceneGraph:graph});
    feedback=await inspectGraphLayout(project,candidate,ctx.signal,true);
    ctx.onGraphDraft?.(candidate.sceneGraph!,feedback);
    if(!feedback.length)return candidate;
  }
  throw new Error(`Motion template could not fit: ${feedback.slice(0,4).join('; ')}`);
}
