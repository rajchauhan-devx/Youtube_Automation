import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {GALLERY_MOTION_LIBRARY,MOTION_LIBRARY,compileMotionTemplate,compileSceneGraph,renderSceneGraphSvg,validateMotionTemplateContent} from '@tubeflow/video-composition';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'script-motion-'));
process.env.TUBEFLOW_DATA_DIR=directory;
fs.writeFileSync(path.join(directory,'accounts.json'),JSON.stringify([{id:'default',name:'Ancient Dharma'}]));
const {parseScenePlan}=await import('../../server/dist/services/scene-plan.js');
const {serializeScenePlan,withScenePlanFormat}=await import('../../server/dist/services/scene-plan-format.js');
const {buildFreePrompt,generationResponseSchema}=await import('../../server/dist/services/script-generation.js');
const {parseMotionScriptHint,refreshMotionHints,MOTION_SCRIPT_PLAN_MARKER}=await import('../../server/dist/services/script-motion.js');
const {fixture}=await import('./motion-fixtures.mjs');
const {inspectGraphLayout}=await import('../../server/dist/services/editing/sceneGraphLayout.js');
const {generateSceneGraph,planGraphBeats,graphEvidenceIssues}=await import('../../server/dist/services/editing/sceneGraphGeneration.js');
const {motionEditorialContext,hasScriptMotionPlan}=await import('../../server/dist/services/editing/motionEditorial.js');
const {store}=await import('../../server/dist/services/store.js');
const narration='यह प्राचीन ज्ञान है। पहला चरण सीखना है।';
const hint={version:1,intent:'Introduce the stated subject',templateId:'ad_lower_third',quote:'प्राचीन ज्ञान',position:'bottom',durationSec:2,layout:'auto',content:{items:[{text:'प्राचीन ज्ञान'}],links:[]}};
const makePlan=()=>({version:1,title:'Test',thumbnailPrompt:'A stone temple',scenes:[{id:'scene_001',chapter:'Test',role:'story',narration,imagePrompt:'A stone temple.',mediaType:'image',motionGraphics:[structuredClone(hint)]}]});
const reply=response=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(response)}]}}]}),{status:200});

test('the actual Preview prompt and structured schema expose all gallery templates and a separate metadata contract',()=>{
  assert.equal(GALLERY_MOTION_LIBRARY.length,30);assert.equal(MOTION_LIBRARY.length,50);
  const prompt=buildFreePrompt('image-only production','Knowledge','',30);
  const ids=generationResponseSchema(30).properties.scenes.items.properties.motionGraphics.items.properties.templateId.enum;
  for(const template of GALLERY_MOTION_LIBRARY){assert.ok(prompt.includes(template.id));assert.ok(ids.includes(template.id));}
  assert.ok(prompt.includes('<motion_graphicN>'));assert.ok(prompt.includes('durationSec'));assert.ok(prompt.includes('position'));
  const once=withScenePlanFormat('Original direction','shorts');
  assert.equal(withScenePlanFormat(once,'shorts'),once);
  assert.ok(withScenePlanFormat('## Shared extraction format V1\nLegacy saved template','shorts').includes(MOTION_SCRIPT_PLAN_MARKER));
});

test('tag and JSON extraction preserve the complete scene plan without leaking metadata into narration or prompts',()=>{
  const plan=makePlan(),tagged=serializeScenePlan(plan),parsed=parseScenePlan(tagged,{isImageOnly:true});
  assert.deepEqual(parseMotionScriptHint(parsed.scenes[0].motionGraphics[0]),hint);
  assert.equal(parsed.scenes[0].narration,narration);
  assert.ok(!parsed.scenes[0].imagePrompt.includes('templateId'));
  assert.deepEqual(parseScenePlan(JSON.stringify(plan)).scenes[0].motionGraphics[0],hint);
  const legacy=parseScenePlan('<script>यह प्राचीन ज्ञान है।</script><image_prompt1>A temple</image_prompt1><motion_graphic1>Intent: Emphasize the subject\nTemplate: ad_lower_third</motion_graphic1>');
  assert.equal(legacy.scenes[0].motionGraphics[0].templateId,'ad_lower_third');
  assert.throws(()=>parseScenePlan(tagged.replace('ad_lower_third','ad_missing')),/Unknown motion/);
  assert.throws(()=>parseScenePlan(tagged.replace('"quote": "प्राचीन ज्ञान"','"quote": "गलत उद्धरण"')),/exactly/);
  assert.throws(()=>parseScenePlan(tagged.replace('"position": "bottom"','"position": "offscreen"')),/Invalid/);
  assert.throws(()=>parseScenePlan(tagged.replace('"durationSec": 2','"durationSec": 999')),/Too big/);
  assert.throws(()=>parseScenePlan(tagged.replaceAll('motion_graphic1','motion_graphic2')),/existing scene/);
  assert.throws(()=>parseScenePlan(tagged.replace('</motion_graphic1>','')),/Unfinished/);
  assert.throws(()=>parseScenePlan(tagged.replace('</motion_graphic1>','</motion_graphic2>')),/numbers must match/);
  const aliased=parseMotionScriptHint({...hint,templateId:'rz_lower_third'});assert.equal(aliased.templateId,'ad_lower_third');
});

test('narration edits invalidate stale content and cues while retaining template intent',()=>{
  const refreshed=refreshMotionHints([hint],'अब विषय बदल गया है।')[0];
  assert.equal(refreshed.templateId,hint.templateId);assert.equal(refreshed.intent,hint.intent);
  assert.equal(refreshed.content,undefined);assert.equal(refreshed.quote,undefined);
  assert.deepEqual(refreshMotionHints([hint],narration)[0],hint);
});

test('numeric diagrams reject absent or fabricated values and invalid percentages',()=>{
  assert.throws(()=>validateMotionTemplateContent('ad_donut_chart',{items:[{text:'चालीस प्रतिशत'}],links:[]}),/require a value/);
  assert.throws(()=>validateMotionTemplateContent('ad_donut_chart',{items:[{text:'४० प्रतिशत',value:50}],links:[]}),/exactly/);
  assert.throws(()=>validateMotionTemplateContent('ad_progress_bar',{items:[{text:'140 प्रतिशत',value:140}],links:[]}),/0 to 100/);
  assert.throws(()=>validateMotionTemplateContent('ad_progress_bar',{items:[{text:'40 दिन',value:40}],links:[]}),/stated percentage/);
  assert.throws(()=>parseMotionScriptHint({...hint,templateId:'ad_progress_bar',quote:'40',content:{items:[{text:'40%',value:40}],links:[]}},'40 दिन'),/exactly/);
  assert.equal(validateMotionTemplateContent('ad_progress_bar',{items:[{text:'४० प्रतिशत',value:40}],links:[]}).items[0].value,40);
});

const words=['पहला चरण','दूसरा चरण','तीसरा चरण','चौथा चरण','पाँचवाँ चरण'];
function contentFor(t){
  const numeric=['progress','donut','bars','trend'].includes(t.recipe);
  return {items:words.slice(0,t.maxItems).map((text,i)=>numeric?{text:`${(i+1)*20} प्रतिशत`,value:(i+1)*20}:{text}),links:t.recipe==='tree'?Array.from({length:t.maxItems-1},(_,i)=>({from:0,to:i+1})):[]};
}

test('all thirty gallery choices compile to native, evidence-bound graphs in both formats and replay without another AI call',{timeout:240000},async()=>{
  const project=await fixture('science',false,true);
  for(const portrait of [false,true])for(const template of GALLERY_MOTION_LIBRARY){
    const content=contentFor(template),width=portrait?1080:1920,height=portrait?1920:1080;
    project.inputs.width=width;project.inputs.height=height;project.inputs.fps=30;project.inputs.durationFrames=90;
    const scene=project.scenes[0];scene.reservedRegions=[{x:0,y:height*0.83,width,height:height*0.17}];
    project.alignment.tokens=content.items.map((item,i)=>({id:`phrase-${i}`,text:item.text,start:i*.3,end:(i+1)*.3}));scene.narrativeRefs=project.alignment.tokens.map(t=>t.id);
    const graph=compileMotionTemplate({templateId:template.id,content,width,height,durationFrames:90,fps:30,fontAssetId:project.style.fontAssetIds[1],sceneId:scene.id,tokens:project.alignment.tokens});
    assert.deepEqual(graphEvidenceIssues(graph,project,scene,[]),[],template.id);
    const artifact={id:'gallery',sceneId:scene.id,startFrame:0,endFrame:90,sceneGraph:graph};
    assert.deepEqual(await inspectGraphLayout(project,artifact,AbortSignal.timeout(30000),true),[],`${template.id} ${portrait?'portrait':'landscape'}`);
    const compiled=compileSceneGraph(graph,{artifactId:'gallery',startSec:0,durationSec:3,fps:30,projectWidth:width,projectHeight:height,motion:'balanced'});
    const stage={innerHTML:''};let clock;
    vm.runInNewContext(compiled.js,{document:{getElementById:()=>stage},tl:{set:()=>{},fromTo:t=>{clock=t;}}});
    for(const frame of [0,45,89]){clock.frame=frame;assert.equal(stage.innerHTML,renderSceneGraphSvg(graph,frame,{width,height,durationFrames:90,fps:30,motion:'balanced',idPrefix:'sg-gallery',assets:{}}));}
  }
});

test('saved script content places a real artifact at its spoken cue, honors safe position/duration, and needs no content provider call',{timeout:60000},async()=>{
  const p=await fixture('science',false,true),scene=p.scenes[0];
  scene.endFrame=180;p.inputs.width=1920;p.inputs.height=1080;p.inputs.fps=30;p.inputs.durationFrames=180;p.inputs.narrationText=narration;
  p.alignment.mode='word';p.alignment.tokens=[{id:'a',text:'यह',start:0,end:.5},{id:'b',text:'प्राचीन',start:1,end:1.5},{id:'c',text:'ज्ञान',start:1.5,end:2},{id:'d',text:'है',start:2,end:2.2}];scene.narrativeRefs=p.alignment.tokens.map(t=>t.id);
  const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Content already exists in the script; no provider call expected');};
  try{
    const a=await generateSceneGraph(p,scene,{...hint,sceneId:scene.id},{signal:AbortSignal.timeout(50000),job:{usage:[]},maxCalls:8,persist:()=>{},stage:()=>{}},'fixture',undefined,{openArea:'center'});
    assert.equal(a.startFrame,30);assert.equal(a.endFrame,90);assert.equal(a.sceneGraph.template.id,'ad_lower_third');
    assert.equal(a.sceneGraph.bounds.y,1080*.46);
    assert.deepEqual(a.sceneGraph.nodes.filter(n=>n.kind==='text').map(n=>n.text),['प्राचीन ज्ञान']);
    const moved=await generateSceneGraph(p,scene,{...hint,sceneId:scene.id},{signal:AbortSignal.timeout(50000),job:{usage:[]},maxCalls:8,persist:()=>{},stage:()=>{}},'fixture',undefined,{openArea:'left'});
    assert.equal(moved.sceneGraph.bounds.width,1920*.40);assert.ok(p.diagnostics.some(d=>d.code==='MOTION_PLACEMENT_ADJUSTED'));
    await assert.rejects(()=>generateSceneGraph(p,scene,{...hint,sceneId:scene.id},{signal:AbortSignal.timeout(50000),job:{usage:[]},maxCalls:8,persist:()=>{},stage:()=>{}},'fixture',undefined,{openArea:'none'}),/No open area/);
  }finally{globalThis.fetch=original;}
});

test('full pipeline consumes extracted metadata even on a directed project and preserves the saved result on resume',{timeout:60000},async()=>{
  const {runPipeline}=await import('../../server/dist/services/editing/pipeline.js');
  const {hash}=await import('../../server/dist/services/editing/repository.js');
  const {approximateAlignment}=await import('../../server/dist/services/editing/timing.js');
  const p=await fixture('science',false,true);
  const plan=parseScenePlan(serializeScenePlan(makePlan()));
  store.add('scripts',{...store.getById('scripts',p.scriptId),id:p.scriptId,scenePlan:plan});
  p.inputs.narrationText=narration;p.inputs.narrationHash=hash(narration);p.inputs.language='hi';p.inputs.width=1920;p.inputs.height=1080;
  p.alignment=approximateAlignment(p.inputs,3);p.settings.graphicEngine='directed';p.settings.soundDesign='off';p.settings.visualReview=false;
  assert.equal(hasScriptMotionPlan(p),true);
  const original=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='fixture-key';let calls=0;
  globalThis.fetch=async(_url,init)=>{
    calls++;const system=JSON.parse(init.body).system_instruction.parts[0].text;
    if(system.startsWith('Inspect each supplied image'))return reply({scenes:[{sceneId:p.scenes[0].id,visibleObjects:['stone'],openArea:'center',containsText:false,annotatedDiagram:false}]});
    if(system.includes('Select only moments')){
      const payload=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text.split('\nThe previous response')[0]);
      assert.equal(payload.motionLibrary.length,50);assert.equal(payload.editorialPolicy.sceneHints[0].hints[0].content.items[0].text,'प्राचीन ज्ञान');
      return reply({beats:[{sceneId:p.scenes[0].id,quote:hint.quote,intent:hint.intent,templateId:hint.templateId}]});
    }
    throw new Error(`Unexpected content regeneration: ${system.slice(0,80)}`);
  };
  try{
    const ctx={signal:AbortSignal.timeout(50000),job:{id:randomUUID(),operation:'generate',usage:[]},maxCalls:8,persist:()=>{},stage:()=>{}};
    const result=await runPipeline(p,ctx);
    assert.equal(calls,2);assert.equal(result.artifacts[0]?.sceneGraph.template.id,'ad_lower_third',JSON.stringify(result.diagnostics));
    assert.equal(result.artifacts[0].endFrame-result.artifacts[0].startFrame,2*p.inputs.fps);
    assert.equal(result.sceneOutcomes[0].state,'complete');
    const resumed=await runPipeline(p,ctx);assert.equal(calls,2);assert.deepEqual(resumed.artifacts,result.artifacts);
  }finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test('selected media retain the corresponding source-scene hint rather than the first script hint',async()=>{
  const p=await fixture('science',false,true);
  p.inputs.imageAssets[0].promptIndex=2;
  store.add('scripts',{...store.getById('scripts',p.scriptId),id:p.scriptId,scenePlan:{scenes:[{motionGraphics:[]},{motionGraphics:[]},{motionGraphics:[hint]}]}});
  assert.equal(motionEditorialContext(p).sceneHints[0].hints[0].templateId,'ad_lower_third');
});

test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
