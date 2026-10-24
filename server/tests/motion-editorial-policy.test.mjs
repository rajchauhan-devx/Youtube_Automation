import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'motion-policy-'));
process.env.TUBEFLOW_DATA_DIR=temp;
const {channelMotionPolicy,isImageOnlyShorts}=await import('../dist/services/motion-editorial-policy.js');
const {defaultAutoPilotSettings,AutoPilotSettingsSchema}=await import('../dist/services/autopilot-settings.js');
const {workspaceContext}=await import('../dist/services/workspace.js');
const {store}=await import('../dist/services/store.js');
const {motionEditorialContext,graphEditorialIssues}=await import('../dist/services/editing/motionEditorial.js');
const {planGraphBeats}=await import('../dist/services/editing/sceneGraphGeneration.js');
fs.writeFileSync(path.join(temp,'accounts.json'),JSON.stringify([{id:'ancient',name:'My Channel',youtubeChannelTitle:'Ancient Dharma'},{id:'survival',name:'Against the Odds'},{id:'noir',name:'Rule Zero'}]));

test('image-only Shorts detection respects media settings and excludes mixed and long profiles',()=>{
  assert.equal(isImageOnlyShorts({name:'Short - Image'},'shorts'),true);
  assert.equal(isImageOnlyShorts({name:'Ancient Dharma Short',autoPilotSettings:{media:{flowEnabled:false}}},'shorts'),true);
  assert.equal(isImageOnlyShorts({name:'Short - Image',videoImportsEnabled:true},'shorts'),false);
  assert.equal(isImageOnlyShorts({name:'Short - Image only'},'long'),false);
  assert.equal(isImageOnlyShorts({name:'Short - Mixed',autoPilotSettings:{media:{flowEnabled:true}}},'shorts'),false);
});

test('new image-only templates use selective callouts while long-form media defaults stay separate',()=>{
  const settings=defaultAutoPilotSettings({name:'Short - Image only',section:'shorts'});
  AutoPilotSettingsSchema.parse(settings);
  assert.equal(settings.media.flowEnabled,false);assert.equal(settings.graphics.mode,'callouts');assert.equal(settings.graphics.enabled,true);assert.equal(settings.graphics.density,'subtle');
  assert.match(settings.graphics.style,/allow zero graphics/);
  assert.equal(defaultAutoPilotSettings({name:'Image-only history',section:'long'}).media.flowEnabled,true);
});

test('channel metadata selects distinct visual, language and sound directions',()=>{
  const ancient=channelMotionPolicy({name:'My Channel',youtubeChannelTitle:'Ancient Dharma'},'en');
  assert.equal(ancient.key,'ancient_dharma');assert.equal(ancient.displayLanguage,'hi');
  assert.deepEqual(ancient.soundNames,['paper_slide']);assert.match(ancient.direction,/No modern HUDs/);assert.match(ancient.direction,/wordless diagram/);
  const survival=channelMotionPolicy({name:'Against the Odds'},'en');
  assert.equal(survival.key,'against_the_odds');assert.equal(survival.displayLanguage,'en');
  const noir=channelMotionPolicy({name:'Rule Zero'},'hi');
  assert.equal(noir.key,'rule_zero');assert.equal(noir.displayLanguage,'hi');
  assert.equal(channelMotionPolicy({name:'Unrelated Channel'},'en').key,'documentary_standard');
});

function setup(){
  const scenes=Array.from({length:7},(_,i)=>({id:`scene-${i}`,assetId:`image-${i}`,startFrame:i*210,endFrame:(i+1)*210,narrativeRefs:[`span-${i}`]}));
  const p={scriptId:'image-short',inputs:{scriptId:'image-short',language:'hi',fps:30,durationFrames:1524,narrationText:'रामायण में यह कथा आती है',imageAssets:scenes.map((s,i)=>({assetId:s.assetId,promptIndex:i}))},settings:{density:'subtle',visualReview:false,stylePreference:''},scenes,diagnostics:[],alignment:{tokens:scenes.map((s,i)=>({id:`span-${i}`,text:'रामायण में यह कथा आती है'}))}};
  store.add('scripts',{id:p.scriptId,name:'Ancient Dharma Short',autoPilotSettings:{media:{flowEnabled:false}},scenePlan:{scenes:scenes.map((s,i)=>({id:`source-${i}`,motionGraphics:i===2?[{type:'hud',title:'ENGLISH METADATA'}]:[]}))}});
  return p;
}

test('Ancient Dharma rejects English and electronic treatments but accepts Hindi linework',async()=>{
  await workspaceContext.run({accountId:'ancient',profile:'shorts'},()=>{
    const p=setup();
    assert.match(graphEditorialIssues(p,{nodes:[{id:'label',kind:'text',text:'ANCIENT INDIA',style:{color:'#FFFFFF'}}]}).join(';'),/English words/);
    assert.match(graphEditorialIssues(p,{nodes:[{id:'hud-radar',kind:'shape'}]}).join(';'),/Modern electronic/);
    assert.deepEqual(graphEditorialIssues(p,{nodes:[{id:'narration-label',kind:'text',text:'रामायण',style:{color:'#FFF3D7'}}]}),[]);
    assert.match(graphEditorialIssues(p,{nodes:[{id:'narration-label',kind:'text',text:'रामायण',style:{color:'#00FFFF'}}]}).join(';'),/neon/);
    assert.equal(motionEditorialContext(p).sceneHints[2].hints[0].title,'ENGLISH METADATA');
  });
});

test('AI planning receives optional scene metadata and channel policy, limits coverage, and can choose zero graphics',async()=>{
  await workspaceContext.run({accountId:'ancient',profile:'shorts'},async()=>{
    const p=setup(),oldFetch=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY='fixture-key';let request;
    globalThis.fetch=async(_url,init)=>{request=JSON.parse(init.body);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({beats:[]})}]}}]}),{status:200});};
    try {
      const beats=await planGraphBeats(p,{signal:AbortSignal.timeout(10000),job:{usage:[]},maxCalls:8,persist:()=>{},stage:()=>{}},'gemini-fixture',p.scenes,[]);
      assert.deepEqual(beats,[]);
      const data=JSON.parse(request.contents[0].parts[0].text);
      assert.equal(data.limit,2);assert.equal(data.editorialPolicy.displayLanguage,'hi');
      assert.equal(data.editorialPolicy.sceneHints[2].hints[0].type,'hud');
      assert.match(data.editorialPolicy.metadataRole,/may skip any hint/);
      assert.match(data.pacing,/not a target/);
    }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
  });
});

test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
