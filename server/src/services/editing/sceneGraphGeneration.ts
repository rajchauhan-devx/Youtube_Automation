import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { Artifact, SceneGraph, SoundCue, EvidenceBinding, sceneGraphIssues, identity, Id, Frame, Color, Track, type EditingProject, type ScenePlan, type ArtifactComposition, type SceneGraphData } from '@tubeflow/editing-contracts';
import { motionJson, type MotionContext } from './motionProvider.js';
import { sceneNarration } from './motionPackArtifacts.js';
import { narrationCue } from './narrationCue.js';
import { getChannelUniverseTheme } from './sceneGraphDesigner.js';
import { saveAsset, assetRecord } from './repository.js';
import { SFX_DIR, ensureDefaultSfx } from '../sfx.js';
import { runMedia } from '../media-process.js';
import { currentWorkspace } from '../workspace.js';
import { inspectGraphLayout } from './sceneGraphLayout.js';
import {motionEditorialContext,graphEditorialIssues} from './motionEditorial.js';

const normalize = (s: string) => s.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const phraseIn = (text: string, source: string) => (` ${normalize(source)} `).includes(` ${normalize(text)} `);
const Beat = z.strictObject({ sceneId: z.string(), quote: z.string().min(1).max(1500), intent: z.string().min(1).max(300) });
export type GraphBeat = z.infer<typeof Beat>;

export async function planGraphBeats(project: EditingProject, ctx: MotionContext, model: string, scenes: ScenePlan[], observations: unknown, old?: ArtifactComposition): Promise<GraphBeat[]> {
  const budget = Math.max(0, Math.floor((ctx.maxCalls-ctx.job.usage.length-1)/(project.settings.visualReview?4:2)));
  const perMinute = {subtle:2,balanced:3,expressive:4}[project.settings.density];
  const cleanSceneLimit=motionEditorialContext(project).imageOnlyShorts ? Math.max(1,Math.floor(scenes.length*0.4)) : 12;
  const limit = old ? 1 : Math.min(12,budget,cleanSceneLimit,Math.ceil(project.inputs.durationFrames/project.inputs.fps/60*perMinute));
  if (!limit) { project.diagnostics.push({severity:'warning',code:'GRAPHIC_BUDGET',stage:'planning',message:'The remaining provider budget cannot cover an original composition and its checks.',retryable:true}); return []; }
  const schema=z.strictObject({beats:z.array(Beat).max(limit)}).superRefine(({beats},check)=>{
    const used=new Set<string>();for(const [i,b] of beats.entries()){
      const scene=scenes.find(s=>s.id===b.sceneId);
      if(!scene||used.has(b.sceneId))check.addIssue({code:'custom',path:['beats',i],message:'Use each eligible scene at most once'});
      used.add(b.sceneId);
      if(scene&&!phraseIn(b.quote,sceneNarration(project,scene.id)))check.addIssue({code:'custom',path:['beats',i,'quote'],message:'Quote must be an exact contiguous narration span'});
    }
  });
  const result=await motionJson(ctx,model,'plan-scene-graphs',schema,
    `You are an editorial motion designer. Select only moments where a visual explanation makes the spoken point easier to understand. Plan bespoke comparisons, branching diagrams, chronological sequences, quantity displays, relationships, processes or concise annotations using a general 2D scene graph. You are not choosing a fixed template. No cards, panels, boxed labels, enclosing frames, photo badges or frosted-glass surfaces. Integrate free-floating typography, lines and explanatory diagrams into open areas of the original footage. Keep ordinary footage clean; zero beats is valid. Never fill a quota. Respect supplied visual observations: do not cover a face or important subject. A beat needs a complete exact quote from its own narration. Graph labels and values will come only from that narration. Do not invent statistics, routes, dates, archive credits or verification. Avoid repeated structures in adjacent beats. Follow the user's direction and language. For revision return one replacement in the original scene, preserving meaning.`,
    {language:project.inputs.language,editorialPolicy:motionEditorialContext(project),direction:ctx.job.instruction||project.settings.stylePreference,density:project.settings.density,limit,
      pacing:'This is a maximum, not a target. Leave most scenes clean; prefer breathing room between useful beats. Metadata does not require a graphic in its scene.',
      observations,scenes:scenes.filter(s=>s.endFrame-s.startFrame>=project.inputs.fps*2).map(s=>({sceneId:s.id,narration:sceneNarration(project,s.id),duration:(s.endFrame-s.startFrame)/project.inputs.fps})),
      previous:old?.sceneGraph||old?.graphic});
  return result.beats;
}

export async function graphSoundPalette(project: EditingProject) {
  if(project.settings.soundDesign==='off')return [];
  await ensureDefaultSfx();
  const palette: {assetId:string;name:string}[] = [];
  for (const name of motionEditorialContext(project).soundNames) {
    const file=path.join(SFX_DIR,`${name}.mp3`);if(!fs.existsSync(file))continue;
    const duration=Number(await runMedia('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file]));
    const asset=saveAsset(fs.readFileSync(file),{mime:'audio/mpeg',duration,alpha:false,method:'import',providerVersion:'motion-sfx-v2'});
    palette.push({assetId:asset.id,name});
  }
  return palette;
}

/** A shape may explain the story, but may not become a backing or frame for text. */
export function graphCardIssues(graph: SceneGraphData): string[] {
  const issues: string[] = [];
  const labels = graph.nodes.filter(n => n.kind === 'text' || n.kind === 'metric');
  const visibleColor = (color: string | null) => Boolean(color && (color.length === 7 || parseInt(color.slice(7), 16) > 0));
  for (const node of graph.nodes) {
    if ((node.kind === 'text' || node.kind === 'metric') && visibleColor(node.style.background || null))
      issues.push(`${node.id}: remove the text backing; use unboxed type with a glyph shadow`);
    if (node.kind !== 'shape' || node.geometry.kind === 'ellipse') continue;
    const paint = node.paint;
    if (!visibleColor(paint.fill) && !(visibleColor(paint.stroke) && paint.strokeWidth > 0) && !paint.gradient?.stops.some(s => visibleColor(s.color))) continue;
    const geometry = node.geometry;
    const b = geometry.kind === 'rect' ? geometry.bounds : (() => {
      const xs = geometry.points.map(p => p.x), ys = geometry.points.map(p => p.y);
      return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
    })();
    // Compare only nodes in the same coordinate space; diagram bars and rules remain valid.
    const enclosed = labels.some(label => {
      if (label.parentId !== node.parentId || !('bounds' in label)) return false;
      const t = label.bounds;
      return b.x <= t.x && b.y <= t.y && b.x+b.width >= t.x+t.width && b.y+b.height >= t.y+t.height;
    });
    if (enclosed) issues.push(`${node.id}: remove the card or enclosing frame behind text; keep the footage visible`);
  }
  return issues;
}

export function graphEvidenceIssues(graph: SceneGraphData, project: EditingProject, scene: ScenePlan, allowedSounds: string[]): string[] {
  const issues=[...sceneGraphIssues(graph), ...graphCardIssues(graph), ...graphEditorialIssues(project,graph)];
  const narration=sceneNarration(project,scene.id),tokens=new Set(scene.narrativeRefs);
  for(const n of graph.nodes){
    if(n.kind==='image'&&!project.inputs.imageAssets.some(a=>a.assetId===n.assetId))issues.push(`${n.id}: image is not in the supplied source inventory`);
    if(n.kind==='text'||n.kind==='metric'){
      if(!project.style.fontAssetIds.includes(n.style.fontAssetId))issues.push(`${n.id}: choose an allowed fontAssetId`);
      const e=graph.evidence.find(e=>e.targetNodeId===n.id);
      if(!e||e.sourceId!==scene.id||!e.narrationTokenIds.length||e.narrationTokenIds.some(id=>!tokens.has(id))||!phraseIn(e.verifiedValue,narration)||e.status!=='narration')issues.push(`${n.id}: bind the displayed fact to an exact narration phrase, using status narration`);
      if(n.kind==='text'&&!phraseIn(n.text,e?.verifiedValue||''))issues.push(`${n.id}: display an exact phrase from its narration evidence`);
      if(n.kind==='metric'){
        const numbers=(e?.verifiedValue||'').match(/[+-]?\d[\d,]*(?:\.\d+)?/g)||[];
        if(!numbers.some(v=>Number(v.replace(/,/g,''))===n.targetValue))issues.push(`${n.id}: metric value must occur in its narration evidence`);
        for(const label of [n.label,n.unit,n.subLabel])if(label&&!phraseIn(label,e?.verifiedValue||''))issues.push(`${n.id}: label/unit must occur in its evidence`);
        if(n.prefix||n.suffix)issues.push(`${n.id}: preserve units in the unit field; omit ungrounded prefixes and suffixes`);
      }
    }
  }
  for(const c of graph.soundCues)if(!allowedSounds.includes(c.assetId))issues.push(`${c.id}: choose a supplied sound asset`);
  return [...new Set(issues)];
}

export async function generateSceneGraph(project: EditingProject, scene: ScenePlan, beat: GraphBeat, ctx: MotionContext, model: string, old?: ArtifactComposition, observation?: unknown): Promise<ArtifactComposition> {
  const tokens=project.alignment.tokens.filter(t=>scene.narrativeRefs.includes(t.id));
  const cue=project.alignment.mode==='approximate'?undefined:narrationCue(tokens,beat.quote);
  const startFrame=Math.max(scene.startFrame,Math.min(scene.endFrame-1,cue?Math.round(cue.start*project.inputs.fps):scene.startFrame));
  const endFrame=Math.min(scene.endFrame,Math.max(startFrame+Math.round(project.inputs.fps*2.5),cue?Math.ceil(cue.end*project.inputs.fps):scene.endFrame));
  const durationFrames=endFrame-startFrame;
  if(durationFrames<project.inputs.fps*1.5)throw new Error('Insufficient reading time for a useful motion graphic');
  const portrait=project.inputs.height>project.inputs.width,w=project.inputs.width,h=project.inputs.height;
  const bounds={x:w*0.07,y:h*(portrait?0.21:0.12),width:w*(portrait?0.79:0.86),height:h*(portrait?0.49:0.65)};
  const editorialPolicy=motionEditorialContext(project);
  const theme=getChannelUniverseTheme(currentWorkspace().accountId,`${editorialPolicy.channelName} ${project.style.direction}`);
  if(editorialPolicy.key!=='ancient_dharma'){theme.primary=project.style.colors.accent;theme.text=project.style.colors.text;}
  const palette=await graphSoundPalette(project);
  // A shallow transport avoids repeating a seven-way recursive union in Gemini's
  // constrained decoder. The canonical graph remains authoritative after expansion.
  const transportNode=z.strictObject({
    id:Id, kind:z.enum(['group','text','image','rect','ellipse','polygon','path','connector','metric']),
    x:z.number().finite(),y:z.number().finite(),width:z.number().min(0),height:z.number().min(0),
    parentId:Id.optional(),zIndex:z.number().int().min(-100).max(100).optional(),
    text:z.string().max(1000).optional(),fontSize:z.number().min(12).max(300).optional(),fontWeight:z.enum(['400','700']).optional(),
    align:z.enum(['left','center','right']).optional(),color:Color.optional(),fill:Color.nullable().optional(),stroke:Color.nullable().optional(),strokeWidth:z.number().min(0).max(20).optional(),
    gradientStops:z.array(z.strictObject({offset:z.number().min(0).max(1),color:Color})).min(2).max(8).optional(),gradientAngle:z.number().min(-360).max(360).optional(),
    shadowColor:Color.optional(),shadowBlur:z.number().min(0).max(30).optional(),
    radius:z.number().min(0).max(100).optional(),assetId:Id.optional(),fit:z.enum(['contain','cover']).optional(),
    points:z.array(z.strictObject({x:z.number(),y:z.number()})).max(128).optional(),
    commands:z.array(z.strictObject({op:z.enum(['M','L','Q','C','Z']),values:z.array(z.number()).max(6)})).max(128).optional(),
    fromNodeId:Id.optional(),toNodeId:Id.optional(),route:z.enum(['line','elbow','curve']).optional(),
    targetValue:z.number().finite().optional(),unit:z.string().max(40).optional(),label:z.string().max(120).optional(),
    tracks:z.array(z.strictObject({property:Track.shape.property,keyframes:z.array(z.strictObject({frame:Frame,value:z.number().finite(),ease:z.enum(['linear','smooth'])})).min(1).max(12)})).max(8),
  });
  const nodeSchema=z.strictObject({nodes:z.array(transportNode).min(1).max(40),soundCues:z.array(SoundCue).max(2),evidence:z.array(EvidenceBinding).max(40)});
  const expand=(design:z.infer<typeof nodeSchema>):SceneGraphData => SceneGraph.parse({
    version:1,seed:42,bounds,theme,soundCues:design.soundCues,evidence:design.evidence,capabilities:['svg-2d','frame-animation'],
    nodes:design.nodes.map(n=>{
      const base={id:n.id,...(n.parentId?{parentId:n.parentId}:{}),space:n.parentId?'parent':'screen',zIndex:n.zIndex||0,transform:identity(),opacity:1,
        tracks:n.tracks.map(t=>({property:t.property,keyframes:t.keyframes.map(k=>({frame:k.frame,value:k.value,easing:k.ease==='linear'?{kind:'linear'}:{kind:'bezier',x1:0.22,y1:1,x2:0.36,y2:1}}))}))};
      const b={x:n.x,y:n.y,width:n.width,height:n.height};
      const style={fontAssetId:project.style.fontAssetIds[editorialPolicy.displayLanguage==='hi'&&project.style.fontAssetIds.length>1?1:0],fontSize:n.fontSize||Math.max(12,Math.round(w*(portrait?0.035:0.021))),fontWeight:n.fontWeight||'700',color:n.color||theme.text,align:n.align||'center',lineHeight:1.3};
      const paint={fill:n.fill??null,stroke:n.stroke??null,strokeWidth:n.strokeWidth??theme.lineWeight,dash:[],
        ...(n.gradientStops?{gradient:{angle:n.gradientAngle||0,stops:n.gradientStops}}:{}),
        ...(n.shadowColor?{shadow:{color:n.shadowColor,blur:n.shadowBlur||8,x:0,y:2}}:{})};
      if(n.kind==='group')return {...base,kind:'group',transform:{...identity(),x:n.x,y:n.y}};
      if(n.kind==='text')return {...base,kind:'text',text:n.text,style,bounds:b};
      if(n.kind==='metric')return {...base,kind:'metric',targetValue:n.targetValue,startValue:0,unit:n.unit,label:n.label,decimals:n.targetValue!==undefined&&n.targetValue%1?2:0,bounds:b,style};
      if(n.kind==='image')return {...base,kind:'image',assetId:n.assetId,fit:n.fit||'contain',bounds:b};
      if(n.kind==='connector') {
        const from=design.nodes.find(node=>node.id===n.fromNodeId),to=design.nodes.find(node=>node.id===n.toNodeId);
        const point=(a:typeof from,b:typeof to) => {
          if(!a||!b||a.parentId!==b.parentId)return {x:0.5,y:0.5};
          const dx=b.x+b.width/2-a.x-a.width/2,dy=b.y+b.height/2-a.y-a.height/2;
          return Math.abs(dx)/Math.max(1,a.width)>Math.abs(dy)/Math.max(1,a.height)?{x:dx>=0?1:0,y:0.5}:{x:0.5,y:dy>=0?1:0};
        };
        return {...base,zIndex:n.zIndex??-1,kind:'connector',from:{kind:'node',nodeId:n.fromNodeId,point:point(from,to),offset:{x:0,y:0}},to:{kind:'node',nodeId:n.toNodeId,point:point(to,from),offset:{x:0,y:0}},route:n.route||'curve',paint:{...paint,fill:null,stroke:n.stroke||theme.primary}};
      }
      if(n.kind==='path')return {...base,kind:'path',paint,commands:(n.commands||[]).map(c=>{
        const expected={M:2,L:2,Q:4,C:6,Z:0}[c.op];if(c.values.length!==expected)throw new Error(`${n.id}: ${c.op} requires ${expected} numeric values`);
        const v=c.values;return c.op==='Z'?{op:'Z'}:c.op==='C'?{op:'C',x1:v[0],y1:v[1],x2:v[2],y2:v[3],x:v[4],y:v[5]}:c.op==='Q'?{op:'Q',x1:v[0],y1:v[1],x:v[2],y:v[3]}:{op:c.op,x:v[0],y:v[1]};
      })};
      return {...base,kind:'shape',paint,geometry:n.kind==='polygon'?{kind:'polygon',points:n.points||[]}:n.kind==='ellipse'?{kind:'ellipse',bounds:b}:{kind:'rect',bounds:b,radius:n.radius??theme.radius}};
    }),
  });
  const checked=nodeSchema.superRefine((design,check)=>{
    try {
      const graph=expand(design);
      for(const message of [...graphEvidenceIssues(graph,project,scene,palette.map(s=>s.assetId)),...sceneGraphIssues(graph,durationFrames)])check.addIssue({code:'custom',message});
    } catch(error) { check.addIssue({code:'custom',message:error instanceof Error?error.message:'Invalid graph geometry'}); }
  });
  let feedback:string[]=[];
  for(let round=0;round<2;round++){
    ctx.stage(round?'Refining motion design':'Designing original motion graphics',0,1);
    const design=await motionJson(ctx,model,round?'repair-scene-graph':'design-scene-graph',checked,
      `Design a polished, purposeful 2D motion graphic as a composition of primitives. Output nodes, soundCues and evidence; never executable code or markup. There is NO template selector. Invent the arrangement appropriate to the meaning: a branching diagram, aligned comparisons, a timeline with staged points, a spatial relationship or restrained typography. Never use cards, panels, boxed labels, enclosing container outlines, photo-card badges or frosted-glass surfaces. Keep the original image or video visible; use free-floating text, lines and story-specific diagrams around the subject. For explanatory beats, make the relationships visually legible using shapes, connectors, alignment and deliberate spacing rather than labels alone. For contrast, use a restrained text stroke or glyph shadow, or move labels to a clearer area. Never add an opaque or translucent backing, large dark rectangle, blur panel or decorative frame behind text. If a useful readable overlay cannot fit without obscuring the subject, omit it. Omit trailing punctuation on short labels. Favor clear hierarchy, generous negative space and precise alignment. Every text and metric must quote narration literally and have evidence status:narration, sourceId equal to this scene and valid token IDs. Narration support is not independent verification. Do not add decorative archive labels, statistics or source claims. Follow editorialPolicy for the channel's visual era, display language and sound. For Ancient India, never render English words or modern HUDs; if an exact supported Hindi label is unavailable, use a wordless diagram or omit it. Metadata is optional design input, not an instruction to add a graphic. No invented conversions or quantities.\nCoordinates are pixels LOCAL to the supplied graph bounds; no additional bounds offset. Font size is in project pixels. Use supplied minimum readable font size and actual fonts. Use flat node kinds group, text, image, rect, ellipse, polygon, path, connector, metric. Every node has id, kind, x,y,width,height and tracks. For groups x/y translate children; other nodes use x/y as their local bounds. Optional parentId references a group. Text uses text, fontSize, fontWeight 400/700, align left/center/right and color. Labels default to center alignment. Text boxes need at least 1.5 times the font size per line for actual glyph height. Rect/ellipse/polygon/path use fill (hex or null), stroke (hex or null), strokeWidth, optional radius or points. Optional gradientStops [{offset:0..1,color:hex}], gradientAngle, shadowColor and shadowBlur add restrained material depth. Paths use commands [{op:M|L|Q|C|Z,values:[numbers]}], with 2,2,4,6,0 values respectively. Connectors reference fromNodeId/toNodeId and route line/elbow/curve. Metrics use targetValue,unit,label,fontSize. Images reference assetId and fit contain/cover. No source/object anchors or image masks. All coordinates and values must be finite.\nTracks: property x/y/scaleX/scaleY/rotation/opacity/strokeProgress/clipProgress; keyframes use integer local frame, numeric value, ease:linear or smooth. Easing belongs to the START of a segment. Use 3+ keyframes where appropriate for reveal/hold/exit, without continuous distracting movement. Prefer staged builds and a long readable hold. Keep all content inside the local canvas at every frame, leaving 12px padding; do not overlap readable text. The runtime supplies a brief master fade. For quantities use accurate relative lengths; timelines require exact spoken dates.\nUse zero to two supplied sound cues at meaningful reveal frames, gainDb -8..0. Prefer one subtle cue or silence. Do not sound every label. Respect footage subject/open area observations and any protected regions. If revising preserve identity and evidence.`,
      {intent:beat.intent,quote:beat.quote,narration:sceneNarration(project,scene.id),language:project.inputs.language,editorialPolicy,direction:ctx.job.instruction||project.settings.stylePreference,
        canvas:{width:bounds.width,height:bounds.height,durationFrames,fps:project.inputs.fps,minimumFontSize:Math.max(12,Math.round(w*(portrait?0.031:0.019)))},
        theme,tokens:tokens.map(t=>({id:t.id,text:t.text})),sceneId:scene.id,
        images:project.inputs.imageAssets.map(a=>({assetId:a.assetId,prompt:a.prompt})),sounds:palette,observation,protectedRegions:scene.reservedRegions,previous:old?.sceneGraph,feedback});
    const graph=expand(design);
    const candidate=Artifact.parse({id:old?.id||`sg-${scene.id}`,sceneId:scene.id,enabled:old?.enabled??true,intent:beat.intent,narrativeRefs:scene.narrativeRefs,startFrame,endFrame,priority:5,nodes:[],assetRequestIds:[],sceneGraph:graph});
    feedback=await inspectGraphLayout(project,candidate,ctx.signal,true);
    ctx.onGraphDraft?.(candidate.sceneGraph!, feedback);
    if(!feedback.length){
      const ids=graph.nodes.flatMap(n=>n.kind==='image'?[n.assetId]:[]).concat(graph.soundCues.map(c=>c.assetId));
      for(const id of ids){assetRecord(id);if(!project.assetIds.includes(id))project.assetIds.push(id);}
      return candidate;
    }
    if(round===1)throw new Error(`Graphic failed layout validation: ${feedback.slice(0,4).join('; ')}`);
  }
  throw new Error('Motion design could not be completed');
}
