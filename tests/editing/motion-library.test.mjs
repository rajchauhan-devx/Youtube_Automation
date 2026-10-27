import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {ANCIENT_DHARMA_LIBRARY,compileMotionTemplate,renderSceneGraphSvg,compileSceneGraph} from '@tubeflow/video-composition';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'motion-library-'));
process.env.TUBEFLOW_DATA_DIR=directory;
fs.writeFileSync(path.join(directory,'accounts.json'),JSON.stringify([{id:'default',name:'Ancient Dharma'}]));
const {fixture}=await import('./motion-fixtures.mjs');
const {inspectGraphLayout}=await import('../../server/dist/services/editing/sceneGraphLayout.js');
const {graphEvidenceIssues,generateSceneGraph,planGraphBeats}=await import('../../server/dist/services/editing/sceneGraphGeneration.js');
const {narrationSupports}=await import('../../server/dist/services/editing/motionLibrary.js');
const {parseSimpleTagPackage}=await import('../../server/dist/services/simple-tag-package.js');
const {serializeScenePlan}=await import('../../server/dist/services/scene-plan-format.js');
const {generationResponseSchema}=await import('../../server/dist/services/script-generation.js');
const {store}=await import('../../server/dist/services/store.js');
const words=['पहला चरण','दूसरा चरण','तीसरा चरण','चौथा चरण','पाँचवाँ चरण','छठा चरण','सातवाँ चरण'];
const content=(t,count=t.minItems)=>({items:words.slice(0,count).map(text=>({text})),links:t.recipe==='tree'?Array.from({length:count-1},(_,i)=>({from:0,to:i+1})):[]});
const options=(templateId,data,portrait=false)=>({templateId,content:data,width:portrait?1080:1920,height:portrait?1920:1080,durationFrames:60,fps:30,fontAssetId:'font-demo',sceneId:'scene-0',tokens:[]});

test('timeline adapts three or seven supplied events without retaining sample facts, and export replays the saved graph',()=>{
  const t=ANCIENT_DHARMA_LIBRARY.find(t=>t.id==='ad_timeline');
  for(const count of [3,7])for(const portrait of [false,true]){
    const o=options(t.id,content(t,count),portrait),g=compileMotionTemplate(o);
    assert.deepEqual(g.nodes.filter(n=>n.kind==='text').map(n=>n.text),words.slice(0,count));
    assert.equal(g.template.id,t.id);assert.equal(g.nodes.filter(n=>n.id.startsWith('step-')).length,count-1);
    assert.ok(!JSON.stringify(g).includes('66.0 METERS'));
    const compiled=compileSceneGraph(g,{artifactId:'library',startSec:0,durationSec:2,fps:30,projectWidth:o.width,projectHeight:o.height,motion:'balanced'});
    const stage={innerHTML:''};let clock;
    vm.runInNewContext(compiled.js,{document:{getElementById:()=>stage},tl:{set:()=>{},fromTo:t=>{clock=t;}}});
    for(const frame of [45,0,20,59]){clock.frame=frame;assert.equal(stage.innerHTML,renderSceneGraphSvg(g,frame,{width:o.width,height:o.height,durationFrames:60,fps:30,motion:'balanced',idPrefix:'sg-library',assets:{}}));}
  }
});

test('invalid relationship graphs and unavailable placement are rejected',()=>{
  const t=ANCIENT_DHARMA_LIBRARY.find(t=>t.id==='ad_lineage');
  assert.throws(()=>compileMotionTemplate({...options(t.id,content(t,3)),content:{items:content(t,3).items,links:[{from:1,to:0},{from:0,to:2}]}}),/parent/);
  assert.throws(()=>compileMotionTemplate({...options(t.id,content(t,3)),openArea:'none'}),/No open area/);
  assert.throws(()=>compileMotionTemplate(options('ad_unknown',content(t,3))),/Unknown/);
  assert.equal(narrationSupports('पहला चरण','यह पहला चरण है'),true);
  assert.equal(narrationSupports('66 मीटर','यह पहला चरण है'),false);
  const phraseGraph=compileMotionTemplate({...options('ad_chapter',{items:[{text:'पहला चरण'}],links:[]}),tokens:[{id:'scene-phrase',text:'यह पहला चरण है'}]});
  assert.deepEqual(phraseGraph.evidence[0].narrationTokenIds,['scene-phrase']);
});

test('all library families fit real Hindi fonts in portrait and landscape at their supported maximum item counts',{timeout:180000},async()=>{
  const p=await fixture('science',false,true);
  for(const portrait of [false,true])for(const t of ANCIENT_DHARMA_LIBRARY){
    const o=options(t.id,content(t,t.maxItems),portrait);
    p.inputs.width=o.width;p.inputs.height=o.height;p.inputs.fps=o.fps;p.inputs.durationFrames=o.durationFrames;
    p.scenes[0].reservedRegions=[{x:0,y:o.height*0.83,width:o.width,height:o.height*0.17}];
    const g=compileMotionTemplate({...o,fontAssetId:p.style.fontAssetIds[1]});
    const a={id:'fit',sceneId:p.scenes[0].id,startFrame:0,endFrame:o.durationFrames,sceneGraph:g};
    assert.deepEqual(await inspectGraphLayout(p,a,AbortSignal.timeout(30000),true),[],`${t.id}, ${portrait?'portrait':'landscape'}`);
  }
});

test('the director receives the library and script intent, can choose custom or clean, and rejects unknown families',async()=>{
  const p=await fixture('science',false,true),scene=p.scenes[0];
  store.add('scripts',{...store.getById('scripts',p.scriptId),id:p.scriptId,scenePlan:{scenes:[{motionGraphics:[{intent:'Explain change',templateId:'ad_process'}]}]}});
  const original=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='fixture-key';
  let payload,mode='custom';
  globalThis.fetch=async(_url,init)=>{
    payload=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text.split('\nThe previous response')[0]);
    const beats=mode==='clean'?[]:[{sceneId:scene.id,quote:p.inputs.narrationText,intent:'Explain the narrated change',templateId:mode}];
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({beats})}]}}]}),{status:200});
  };
  const ctx=()=>({signal:AbortSignal.timeout(30000),job:{usage:[]},maxCalls:8,persist:()=>{},stage:()=>{}});
  try{
    const result=await planGraphBeats(p,ctx(),'gemini-fixture',p.scenes,[]);
    assert.equal(result[0].templateId,'custom');assert.equal(payload.motionLibrary.length,50);
    assert.equal(payload.editorialPolicy.sceneHints[0].hints[0].intent,'Explain change');
    mode='clean';assert.deepEqual(await planGraphBeats(p,ctx(),'gemini-fixture',p.scenes,[]),[]);
    mode='ad_unknown';await assert.rejects(()=>planGraphBeats(p,ctx(),'gemini-fixture',p.scenes,[]),/available library ID/);
  }finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test('production adapts grounded content and asks for a correction when a sample fact is invented',{timeout:60000},async()=>{
  const p=await fixture('science',false,true),scene=p.scenes[0];
  const phrase='पानी गर्म होता है';
  p.inputs.narrationText=`${phrase}।`;
  p.alignment.tokens=[{id:'phrase',text:phrase,start:0,end:3}];scene.narrativeRefs=['phrase'];
  p.inputs.width=1920;p.inputs.height=1080;p.inputs.fps=24;p.inputs.durationFrames=72;
  scene.reservedRegions=[];
  const original=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='fixture-key';let calls=0;
  globalThis.fetch=async()=>{calls++;const response={items:[{text:calls===1?'66 मीटर':phrase}],links:[],layout:'auto'};return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(response)}]}}]}),{status:200});};
  try{
    const ctx={signal:AbortSignal.timeout(50000),job:{usage:[]},maxCalls:8,persist:()=>{},stage:()=>{}};
    const a=await generateSceneGraph(p,scene,{templateId:'ad_chapter',intent:'Explain heating',quote:phrase},ctx,'gemini-fixture',undefined,{openArea:'top'});
    assert.equal(calls,2);assert.equal(a.sceneGraph.template.id,'ad_chapter');
    assert.deepEqual(a.sceneGraph.nodes.filter(n=>n.kind==='text').map(n=>n.text),[phrase]);
    assert.deepEqual(graphEvidenceIssues(a.sceneGraph,p,scene,[]),[]);
    assert.deepEqual(a.sceneGraph.evidence[0].narrationTokenIds,['phrase']);
    await assert.rejects(()=>generateSceneGraph(p,scene,{templateId:'ad_chapter',intent:'Explain heating',quote:phrase},ctx,'gemini-fixture',undefined,{openArea:'none'}),/No open area/);
  }finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test('script metadata preserves explanatory intent and optional family suggestions',()=>{
  const plan=parseSimpleTagPackage('<script>पहला चरण आता है।</script>\n<image_prompt1>Scene 1: A stone temple.</image_prompt1>\n<motion_graphic1>Scene: 1\nIntent: Explain the order\nTemplate: ad_process\nType: process</motion_graphic1>',{isImageOnly:true});
  assert.equal(plan.motionMetadata[0].intent,'Explain the order');assert.equal(plan.motionMetadata[0].templateId,'ad_process');
  assert.ok(generationResponseSchema(60).properties.scenes.items.properties.motionGraphics);
  const serialized=serializeScenePlan({version:1,title:'Test',thumbnailPrompt:'Temple',scenes:[{id:'scene_001',chapter:'Test',role:'story',narration:'पहला चरण आता है।',imagePrompt:'Temple',mediaType:'image',motionGraphics:[{intent:'Explain the order',templateId:'ad_process'}]}]});
  const roundTrip=parseSimpleTagPackage(serialized,{isImageOnly:true});
  assert.equal(roundTrip.scenes[0].motionGraphics[0].intent,'Explain the order');
  assert.equal(roundTrip.scenes[0].motionGraphics[0].templateId,'ad_process');
});

test('the full production pipeline saves the selected family and resumes the same composition without another model call',{timeout:60000},async()=>{
  const {runPipeline}=await import('../../server/dist/services/editing/pipeline.js');
  const {hash}=await import('../../server/dist/services/editing/repository.js');
  const p=await fixture('science',false,true),sceneId=p.scenes[0].id;
  const narration=words.slice(0,3).join('। ');
  p.inputs.narrationText=narration;p.inputs.narrationHash=hash(narration);p.inputs.language='hi';p.inputs.width=1920;p.inputs.height=1080;
  const {approximateAlignment}=await import('../../server/dist/services/editing/timing.js');
  p.alignment=approximateAlignment(p.inputs,3);
  p.settings.graphicEngine='generative';p.settings.soundDesign='off';p.settings.visualReview=false;
  const original=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='fixture-key';let calls=0;
  globalThis.fetch=async(_url,init)=>{
    calls++;const system=JSON.parse(init.body).system_instruction.parts[0].text;
    const response=system.startsWith('Inspect each supplied image')?{scenes:[{sceneId,visibleObjects:['stone'],openArea:'left',containsText:false,annotatedDiagram:false}]}:
      system.includes('Select only moments')?{beats:[{sceneId,quote:narration,intent:'Explain the stated order',templateId:'ad_timeline'}]}:
      {items:words.slice(0,3).map(text=>({text})),links:[],layout:'auto'};
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(response)}]}}]}),{status:200});
  };
  try{
    const ctx={signal:AbortSignal.timeout(50000),job:{id:randomUUID(),operation:'generate',usage:[]},maxCalls:8,persist:()=>{},stage:()=>{}};
    const result=await runPipeline(p,ctx);
    assert.equal(calls,3);assert.equal(result.status,'ready');assert.equal(result.artifacts[0].sceneGraph.template.id,'ad_timeline');
    const resumed=await runPipeline(p,ctx);assert.equal(calls,3);assert.deepEqual(resumed.artifacts,result.artifacts);
  }finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
