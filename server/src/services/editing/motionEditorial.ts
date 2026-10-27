import { MotionScriptHint } from '@tubeflow/editing-contracts';
import { motionLibraryTemplate } from '@tubeflow/video-composition';
import type {EditingProject,SceneGraphData} from '@tubeflow/editing-contracts';
import {getAccount} from '../accounts.js';
import {store} from '../store.js';
import {currentWorkspace} from '../workspace.js';
import {channelMotionPolicy,isImageOnlyShorts} from '../motion-editorial-policy.js';
import {parseSimpleTagPackage} from '../simple-tag-package.js';

export function motionEditorialContext(project: EditingProject) {
  const account=getAccount(currentWorkspace().accountId);
  const script=store.getById<any>('scripts',project.scriptId);
  const policy=channelMotionPolicy(account,project.inputs.language,`${script?.name || ''} ${project.inputs.narrationText}`);
  let plan=script?.scenePlan;
  if (!plan && /<(?:metadata|motion_graphic)\d*\b/i.test(script?.aiResponse || '')) {
    try {plan=parseSimpleTagPackage(script.aiResponse,{isImageOnly:true});} catch { /* Older responses may not have a complete scene package. */ }
  }
  const bounded=(value:unknown)=>{const json=JSON.stringify(value || []);return json.length<=6000?value:{truncated:true,note:'Oversized metadata omitted; use narration and source observations.'};};
  const scenes=project.scenes.map((scene,sceneIndex)=>{
    const index=project.inputs.imageAssets[sceneIndex]?.promptIndex ?? sceneIndex;
    const source=plan?.scenes?.[index];
    return {sceneId:scene.id,hints:bounded(source?.motionGraphics || plan?.motionMetadata?.filter((h:any)=>h.sceneNum===index+1 || h.sceneId===source?.id) || [])};
  });
  return {...policy,imageOnlyShorts:isImageOnlyShorts(script||{},currentWorkspace().profile),channelName:account?.youtubeChannelTitle || account?.name || '',metadataRole:'Optional design hints only. Validate facts against narration; AI may skip any hint, including English or modern styling that conflicts with the channel.',sceneHints:scenes};
}

export function motionLanguageIssues(project: EditingProject, texts: string[]): string[] {
  if (motionEditorialContext(project).displayLanguage !== 'hi') return [];
  return texts.some(text=>/[A-Za-z]/.test(text)) ? ['Visible English words are not allowed for this channel/narration. Use supported Hindi Devanagari phrases or a wordless diagram.'] : [];
}

export function graphEditorialIssues(project:EditingProject,graph:SceneGraphData):string[] {
  const texts=graph.nodes.flatMap(n=>n.kind==='text'?[n.text]:n.kind==='metric'?[n.label||'',n.subLabel||'',n.unit||'',n.prefix||'',n.suffix||'']:[]);
  const issues=motionLanguageIssues(project,texts);
  if (motionEditorialContext(project).key==='ancient_dharma') {
    // These identifiers describe electronic treatments, not neutral diagram geometry.
    if (graph.nodes.some(n=>/hud|radar|neon|dashboard|glitch|telemetry|terminal|scan[-_ ]?grid/i.test(n.id)))
      issues.push('Modern electronic/HUD treatments do not fit Ancient India; use restrained historical linework and typography.');
    if(graph.nodes.some(n=>n.kind==='metric'))issues.push('Use supported Hindi wording or a static diagram instead of a modern rolling counter for Ancient India.');
    const colors=graph.nodes.flatMap(n=>n.kind==='text'||n.kind==='metric'?[n.style.color]:'paint' in n?[n.paint.fill||'',n.paint.stroke||'']:[]);
    if(colors.some(color=>{const r=parseInt(color.slice(1,3),16),g=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16);return (r<100&&g>200&&b>200)||(r<100&&g>220&&b<120)||(r>220&&g<100&&b>200);}))
      issues.push('Replace neon electronic colors with muted stone, saffron, gold or ivory for Ancient India.');
  }
  return issues;
}

export function hasScriptMotionPlan(project: EditingProject): boolean {
  return motionEditorialContext(project).sceneHints.some(scene=>Array.isArray(scene.hints)&&scene.hints.some(raw=>{
    const parsed=MotionScriptHint.safeParse(raw);
    return parsed.success && !!parsed.data.templateId && (parsed.data.templateId==='custom'||!!motionLibraryTemplate(parsed.data.templateId));
  }));
}
