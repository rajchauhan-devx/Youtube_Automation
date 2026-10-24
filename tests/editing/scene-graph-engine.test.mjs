import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const {gsap}=createRequire(import.meta.url)('gsap');
import { SceneGraph, Settings, identity, sceneGraphIssues } from '@tubeflow/editing-contracts';
import { renderSceneGraphSvg, compileSceneGraph } from '@tubeflow/video-composition';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'scene-graph-test-'));
process.env.TUBEFLOW_DATA_DIR=directory;
const {fixture}=await import('./motion-fixtures.mjs');
const {assetFile,saveAsset}=await import('../../server/dist/services/editing/repository.js');
const {motionAudioFilter,prepareMotionAudio,motionSoundEvents}=await import('../../server/dist/services/editing/motionAudio.js');
const {runMedia}=await import('../../server/dist/services/media-process.js');
const {inspectGraphLayout}=await import('../../server/dist/services/editing/sceneGraphLayout.js');
const {graphEvidenceIssues,graphCardIssues}=await import('../../server/dist/services/editing/sceneGraphGeneration.js');
const paint={fill:null,stroke:'#00FFFF',strokeWidth:2,dash:[]};
const base=id=>({id,transform:identity(),opacity:1,zIndex:0,space:'screen',tracks:[]});
const node=(id,x,y,text='Bronze statue')=>({...base(id),kind:'text',text,bounds:{x,y,width:180,height:44},style:{fontAssetId:'font-main',fontSize:24,fontWeight:'700',color:'#FFFFFF',align:'left',lineHeight:1.2}});
const graph=(nodes=[node('label',20,20)])=>SceneGraph.parse({version:1,seed:42,bounds:{x:40,y:80,width:540,height:200},nodes,soundCues:[],evidence:[],capabilities:[]});
const options={width:640,height:360,fps:30,durationFrames:90,motion:'balanced',idPrefix:'test'};

test('card surfaces and enclosing outlines are rejected while free-floating diagram labels remain valid',()=>{
  const label=node('label',20,20);
  const surface={...base('panel'),kind:'shape',geometry:{kind:'rect',bounds:{x:0,y:0,width:240,height:100},radius:12},paint:{...paint,fill:'#101820DD'}};
  assert.match(graphCardIssues(graph([surface,label])).join(';'),/remove the card/);
  assert.match(graphCardIssues(graph([{...surface,paint:{...paint,fill:null}},label])).join(';'),/enclosing frame/);
  assert.match(graphCardIssues(graph([{...label,style:{...label.style,background:'#000000AA'}}])).join(';'),/remove the text backing/);
  const bar={...surface,geometry:{kind:'rect',bounds:{x:20,y:80,width:180,height:8},radius:0}};
  assert.deepEqual(graphCardIssues(graph([bar,label])),[]);
  assert.deepEqual(graphCardIssues(graph([{...surface,paint:{...paint,fill:'#00000000',stroke:null}},label])),[]);
});

test('graphs reject dangling parents, cycles, conflicting tracks, invalid anchors and unordered keyframes',()=>{
  assert.throws(()=>graph([{...base('a'),kind:'group',parentId:'missing'}]),/parent/);
  assert.throws(()=>graph([{...base('a'),kind:'group',parentId:'b'},{...base('b'),kind:'group',parentId:'a'}]),/cycle/);
  assert.throws(()=>graph([{...base('line'),kind:'connector',from:{kind:'node',nodeId:'missing',point:{x:0,y:0},offset:{x:0,y:0}},to:{kind:'screen',point:{x:1,y:2}},paint,route:'line'}]),/anchor/);
  const track={property:'opacity',keyframes:[{frame:10,value:1,easing:{kind:'linear'}},{frame:5,value:0,easing:{kind:'linear'}}]};
  assert.throws(()=>graph([{...node('a',20,20),tracks:[track]}]),/ordered/);
  const valid={...track,keyframes:track.keyframes.slice().reverse()};
  assert.throws(()=>graph([{...node('a',20,20),tracks:[valid,valid]}]),/conflicting/);
  assert.match(sceneGraphIssues(graph([{...node('a',20,20),tracks:[valid]}]),5).join(' '),/outside/);
});

test('all animation segments evaluate deterministically in arbitrary seek order and safe markup stays inert',()=>{
  const n={...node('a',20,20,'<script>alert("x")</script>'),tracks:[{property:'x',keyframes:[{frame:0,value:0,easing:{kind:'linear'}},{frame:30,value:100,easing:{kind:'linear'}},{frame:60,value:20,easing:{kind:'linear'}},{frame:90,value:20,easing:{kind:'linear'}}]}]};
  const g=graph([n]);
  const middle=renderSceneGraphSvg(g,45,options);
  assert.match(middle,/matrix\(1 0 0 1 60 0\)/);
  assert.ok(!middle.includes('<script>'));
  assert.ok(middle.includes('&lt;script&gt;'));
  for(const frame of [89,0,30,15,60,45])assert.equal(renderSceneGraphSvg(g,frame,options),renderSceneGraphSvg(g,frame,options));
  assert.match(renderSceneGraphSvg(g,-1,options),/translate\(40 80\)" opacity="0"/);
  assert.match(renderSceneGraphSvg(g,90,options),/translate\(40 80\)" opacity="0"/);
});

test('connectors honor anchor offsets and transformed parents; images and gradients compile',()=>{
  const group={...base('parent'),kind:'group',transform:{...identity(),x:50,y:10}};
  const label={...node('label',20,20),parentId:'parent',space:'parent'};
  const connector={...base('line'),kind:'connector',from:{kind:'node',nodeId:'label',point:{x:0,y:0},offset:{x:4,y:6}},to:{kind:'screen',point:{x:300,y:100}},paint,route:'line'};
  const image={...base('photo'),kind:'image',assetId:'source',fit:'contain',bounds:{x:320,y:10,width:120,height:120}};
  const g=graph([group,label,connector,image]);
  assert.match(renderSceneGraphSvg(g,30,{...options,assets:{source:'/asset.png'}}),/M 74 36 L 300 100/);
  assert.match(renderSceneGraphSvg(g,30,{...options,assets:{source:'/asset.png'}}),/href="\/asset.png"/);
  assert.throws(()=>renderSceneGraphSvg(g,30,options),/Missing image/);
});

test('export embeds the same evaluator and frame setter works without GSAP callbacks',()=>{
  const g=graph(),compiled=compileSceneGraph(g,{artifactId:'demo',startSec:1,durationSec:3,fps:30,projectWidth:640,projectHeight:360,motion:'balanced'});
  const target={innerHTML:''};let clock;
  vm.runInNewContext(compiled.js,{document:{getElementById:()=>target},tl:{set:()=>{},fromTo:(t)=>{clock=t;}}});
  for(const frame of [30,70,2,45,0,90]){
    clock.frame=frame;
    assert.equal(target.innerHTML,renderSceneGraphSvg(g,frame,{...options,idPrefix:'sg-demo',assets:{}}));
  }
});


test('real GSAP random/backward seeks match shared frames even when callbacks are suppressed',()=>{
  const g=graph(),compiled=compileSceneGraph(g,{artifactId:'seeking',startSec:1,durationSec:3,fps:30,projectWidth:640,projectHeight:360,motion:'balanced'});
  const target={innerHTML:'',visibility:'hidden'};const tl=gsap.timeline({paused:true});
  vm.runInNewContext(compiled.js,{document:{getElementById:()=>target},tl});
  for(const frame of [30,70,2,45,0,89]){
    tl.seek(1+frame/30,true);
    assert.equal(target.innerHTML,renderSceneGraphSvg(g,frame,{...options,idPrefix:'sg-seeking',assets:{}}));
  }
  tl.kill();
});

test('actual glyph/layout validation detects clipped text and overlap in portrait and landscape',async()=>{
  for (const portrait of [false,true]) {
    const p=await fixture(portrait?'science':'museum',portrait,true);
    const text={...node('label',20,10,portrait?'पानी गर्म होता है। Water becomes vapor.':'Bronze statue'),bounds:{x:20,y:10,width:portrait?260:200,height:portrait?180:60},style:{...node('a',0,0).style,fontAssetId:p.style.fontAssetIds[portrait?1:0]}};
    const g=graph([text]);if(portrait)g.bounds={x:20,y:120,width:320,height:300};
    const a={id:'g',sceneId:p.scenes[0].id,startFrame:0,endFrame:72,sceneGraph:g};
    assert.deepEqual(await inspectGraphLayout(p,a,AbortSignal.timeout(30000)),[]);
    a.sceneGraph.nodes[0].text='This text is far too long for its tiny bounded area';
    a.sceneGraph.nodes[0].bounds.width=60;a.sceneGraph.nodes[0].bounds.height=20;
    assert.ok((await inspectGraphLayout(p,a,AbortSignal.timeout(30000))).some(s=>s.includes('overflows')));
  }
});

test('sound cues use sample timing, honor silence, reject narration-as-effect and produce exact-length PCM',async()=>{
  const p=await fixture('museum',false,true);
  const soundFile=path.join(directory,'cue.wav');
  await runMedia('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=f=880:r=48000:d=0.25','-c:a','pcm_s16le',soundFile]);
  const sound=saveAsset(fs.readFileSync(soundFile),{mime:'audio/wav',duration:0.25,alpha:false,method:'fixture',providerVersion:'test-cue'});
  const g=graph();g.soundCues=[{id:'hit',assetId:sound.id,localFrame:12,gainDb:0,transientOffsetMs:20}];
  p.inputs.fps=24;p.settings.soundDesign='balanced';p.artifacts=[{id:'sound-graph',enabled:true,startFrame:6,endFrame:60,sceneGraph:g}];p.assetIds.push(sound.id);
  const events=await motionSoundEvents(p);assert.equal(events[0].startSample,35040);assert.equal(events[0].gainDb,-12);
  assert.match(motionAudioFilter(events,0,1,3).join(';'),/adelay=35040S:all=1/);
  const wav=await prepareMotionAudio(p,AbortSignal.timeout(30000));
  const probe=JSON.parse(await runMedia('ffprobe',['-v','error','-show_streams','-of','json',wav]));
  assert.equal(Number(probe.streams[0].sample_rate),48000);assert.equal(Number(probe.streams[0].duration),3);
  const raw=path.join(directory,'mixed.pcm');await runMedia('ffmpeg',['-v','error','-y','-i',wav,'-f','s16le','-ac','2',raw]);
  assert.equal(fs.statSync(raw).size,3*48000*2*2);
  const baseline=path.join(directory,'baseline.pcm');
  await runMedia('ffmpeg',['-v','error','-y','-i',assetFile(p.inputs.audioAssetId),'-af','aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo','-f','s16le','-ac','2',baseline]);
  const mixed=fs.readFileSync(raw),voice=fs.readFileSync(baseline);let onset=-1;
  for(let sample=0;sample<48000*2;sample++)if(Math.abs(mixed.readInt16LE(sample*4)-voice.readInt16LE(sample*4))>32){onset=sample;break;}
  assert.ok(onset>=events[0].startSample-2&&onset<events[0].startSample+480,`Effect starts at the saved sample offset, got ${onset}`);
  p.settings.soundDesign='off';assert.deepEqual(await motionSoundEvents(p),[]);
  p.settings.soundDesign='balanced';g.soundCues[0].assetId=p.inputs.audioAssetId;
  await assert.rejects(()=>motionSoundEvents(p),/narration/);
});

test('evidence validation distinguishes narration support and rejects fabricated display values',async()=>{
  const p=await fixture('museum',false,true),scene=p.scenes[0];
  const g=graph([{...node('label',20,20,'bronze statue'),style:{...node('x',0,0).style,fontAssetId:p.style.fontAssetIds[0]}}]);
  g.evidence=[{targetNodeId:'label',sourceId:scene.id,narrationTokenIds:scene.narrativeRefs,verifiedValue:'bronze statue',status:'narration'}];
  assert.deepEqual(graphEvidenceIssues(g,p,scene,[]),[]);
  g.nodes[0].text='2,000 survivors';assert.ok(graphEvidenceIssues(g,p,scene,[]).length);
  g.evidence[0].status='verified';assert.ok(graphEvidenceIssues(g,p,scene,[]).some(s=>s.includes('status narration')));
  assert.equal(Settings.parse({stylePreference:'',density:'balanced',maxProviderCalls:40,maxGeneratedAssets:0}).soundDesign,'off');
});

test('clips use the declared coordinate space and metric supporting labels are visible',()=>{
  const text={...node('label',20,20),transform:{...identity(),x:10},clip:{kind:'geometry',space:'parent',geometry:{kind:'rect',bounds:{x:0,y:0,width:220,height:80},radius:0}},tracks:[{property:'clipProgress',keyframes:[{frame:0,value:0.5,easing:{kind:'linear'}}]}]};
  const markup=renderSceneGraphSvg(graph([text]),30,options);
  assert.match(markup,/clipPath id="test-label-clip" transform="matrix\(1 0 0 1 -10 0\)"/);
  assert.match(markup,/id="test-label-reveal"><rect x="20" y="20" width="90"/);
  const metric={...base('count'),kind:'metric',targetValue:60,startValue:0,decimals:0,label:'signals',subLabel:'Storage',bounds:{x:20,y:10,width:300,height:180},style:node('n',0,0).style};
  const rendered=renderSceneGraphSvg(graph([metric]),50,options);
  assert.ok(rendered.includes('signals'));assert.ok(rendered.includes('Storage'));
});

test('the actual generation pipeline saves a novel graph and resumes without more provider calls',async()=>{
  const {runPipeline}=await import('../../server/dist/services/editing/pipeline.js');
  const {randomUUID}=await import('node:crypto');
  const p=await fixture('museum',false,true);
  p.settings.graphicEngine='generative';p.settings.soundDesign='off';p.settings.visualReview=false;
  const scene=p.scenes[0],originalFetch=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='fixture-key';let calls=0;
  globalThis.fetch=async(_url,init)=>{
    calls++;const body=JSON.parse(init.body),prompt=body.system_instruction.parts[0].text;
    const response=prompt.startsWith('Inspect each supplied image')?{scenes:[{sceneId:scene.id,visibleObjects:['bronze statue'],openArea:'top',containsText:false,annotatedDiagram:false}]}:
      prompt.includes('Select only moments')?{beats:[{sceneId:scene.id,quote:'a bronze statue and its hand',intent:'Explain the statue and its hand'}]}:
      {nodes:[{id:'subject',kind:'text',x:20,y:20,width:260,height:80,text:'bronze statue',fontSize:24,tracks:[]}],soundCues:[],evidence:[{targetNodeId:'subject',sourceId:scene.id,narrationTokenIds:scene.narrativeRefs,verifiedValue:'bronze statue',status:'narration'}]};
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(response)}]}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    const ctx={signal:AbortSignal.timeout(30000),job:{id:randomUUID(),operation:'generate',usage:[]},maxCalls:8,persist:()=>{},stage:()=>{}};
    const generated=await runPipeline(p,ctx);
    assert.equal(calls,3);assert.equal(generated.artifacts.length,1);assert.ok(generated.artifacts[0].sceneGraph);assert.equal(generated.status,'ready');
    assert.equal(generated.artifacts[0].graphic,undefined);
    const resumed=await runPipeline(p,ctx);assert.equal(calls,3);assert.deepEqual(resumed.artifacts,generated.artifacts);
  } finally {globalThis.fetch=originalFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test('word alignment rebinds saved graph evidence without changing its design',async()=>{
  const {measuredTokens}=await import('../../server/dist/services/editing/wordAlignment.js');
  const {alignProject}=await import('../../server/dist/services/editing/alignProject.js');
  const {objectHash,atomic,projectDir}=await import('../../server/dist/services/editing/repository.js');
  const p=await fixture('museum',false,true),scene=p.scenes[0];
  const aligned=measuredTokens(p,{provider:'whisperx',version:'fixture',words:p.inputs.narrationText.split(/\s+/u).map((word,i)=>({word,start:i*0.12,end:i*0.12+0.1,score:0.9}))});
  const file=path.join(projectDir(p.id),'alignment',`${objectHash({audio:p.inputs.audioHash,text:p.inputs.narrationHash,language:p.inputs.language,version:'measured-words-v1'})}.words.json`);atomic(file,aligned);
  p.alignment.tokens.forEach(t=>{t.id=`old-${t.id}`;});scene.narrativeRefs=p.alignment.tokens.map(t=>t.id);
  const g=graph([{...node('label',20,20,'bronze statue'),style:{...node('n',0,0).style,fontAssetId:p.style.fontAssetIds[0]}}]);
  g.evidence=[{targetNodeId:'label',sourceId:scene.id,narrationTokenIds:scene.narrativeRefs,verifiedValue:'bronze statue',status:'narration'}];
  p.artifacts=[{id:'saved',sceneId:scene.id,enabled:true,intent:'Statue',narrativeRefs:scene.narrativeRefs,startFrame:0,endFrame:72,priority:5,nodes:[],assetRequestIds:[],sceneGraph:g}];
  const updated=await alignProject(p,AbortSignal.timeout(30000));
  const binding=updated.artifacts[0].sceneGraph.evidence[0];
  assert.equal(binding.narrationTokenIds.length,2);assert.ok(binding.narrationTokenIds.every(id=>!id.startsWith('old-')));
  assert.deepEqual(updated.artifacts[0].sceneGraph.nodes,g.nodes);
});

test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
