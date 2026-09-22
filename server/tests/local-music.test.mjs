import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=fs.mkdtempSync(path.resolve('server/data/music-test-'));
process.env.TUBEFLOW_DATA_DIR=root;
process.env.COMFYUI_PATH=path.join(root,'comfy');
const ws=await import('../dist/services/workspace.js');
const {store}=await import('../dist/services/store.js');
const music=await import('../dist/services/local-music.js');
for(const [directory,filename] of [...Object.entries(music.MUSIC_MODELS),['text_encoders','qwen_1.7b_ace15.safetensors']]){
 const target=path.join(process.env.COMFYUI_PATH,'models',directory,filename);
 fs.mkdirSync(path.dirname(target),{recursive:true}); const fd=fs.openSync(target,'w');fs.ftruncateSync(fd,1000001);fs.closeSync(fd);
}
const fixture=path.join(root,'tone.wav');
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=220:duration=30','-y',fixture],{windowsHide:true});
const audio=fs.readFileSync(fixture);
const scope={accountId:'default',profile:'mixed'};
const script={id:'story',name:'Temple story',narration:'A temple was carved from stone.'};
const originalFetch=globalThis.fetch;
let calls=[],completed=true,onHistory;
function mockFetch(){
 calls=[];
 globalThis.fetch=async(url,init)=>{
  const u=new URL(url); calls.push({path:u.pathname,body:init?.body?JSON.parse(init.body):undefined});
  if(u.pathname==='/system_stats')return Response.json({});
  if(u.pathname==='/queue')return Response.json({queue_running:[],queue_pending:[]});
  if(u.pathname==='/prompt')return Response.json({prompt_id:'music-job'});
  if(u.pathname==='/history/music-job'){
   onHistory?.();
   return Response.json(completed?{'music-job':{status:{completed:true},outputs:{'10':{audio:[{filename:'tone.flac',subfolder:'music'}]}}}}:{});
  }
  if(u.pathname==='/view')return new Response(audio);
  if(u.pathname==='/free')return Response.json({});
  throw new Error(`Unexpected request ${u.pathname}`);
 };
}
async function settled(){for(let i=0;i<200;i++){const status=music.musicJobStatus(script.id);if(status.status!=='running')return status;await new Promise(r=>setTimeout(r,25));}throw new Error('Job did not settle');}

test('local music generates instrumental audio, persists it, scopes access and rejects stale story tracks',async()=>ws.workspaceContext.run(scope,async()=>{
 store.add('scripts',script);mockFetch();
 try{
  music.startMusic(script.id,'Quiet flute beneath narration',30);
  assert.throws(()=>music.startMusic(script.id,'Another',30),/already running/);
  const status=await settled();assert.equal(status.status,'done',status.error);
  assert.ok(status.music.duration>=30 && status.music.duration<31);
  assert.ok(fs.existsSync(music.resolveGeneratedMusic(script.id)));
  const workflow=calls.find(c=>c.path==='/prompt').body.prompt;
  assert.equal(workflow['4'].inputs.lyrics,'[Instrumental]');
  assert.match(workflow['4'].inputs.tags,/one to three complementary instruments/i);
  assert.match(workflow['4'].inputs.tags,/quiet and supportive beneath narration/i);
  assert.equal(workflow['6'].inputs.batch_size,1);
  assert.equal(workflow['9'].class_type,'VAEDecodeAudioTiled');
  await new Promise(r=>setTimeout(r,20)); assert.ok(calls.some(c=>c.path==='/free'));
  ws.workspaceContext.run({accountId:'other',profile:'mixed'},()=>assert.throws(()=>music.resolveGeneratedMusic(script.id),/Generate music/));
  store.add('scripts',{...store.getById('scripts',script.id),narration:'Changed story'});
  assert.throws(()=>music.resolveGeneratedMusic(script.id),/Generate music/);
 }finally{globalThis.fetch=originalFetch;}
}));

test('cancelled generation keeps the previous track and cannot publish new output',async()=>ws.workspaceContext.run(scope,async()=>{
 const saved=store.getById('scripts',script.id).generatedMusic;
 store.add('scripts',{...script,generatedMusic:saved});mockFetch();completed=false;
 try{
  music.startMusic(script.id,'Flute',30);
  for(let i=0;i<50&&!calls.some(c=>c.path==='/history/music-job');i++)await new Promise(r=>setTimeout(r,10));
  await music.cancelMusic(script.id);
  assert.equal(music.musicJobStatus(script.id).status,'cancelled');
  assert.equal(store.getById('scripts',script.id).generatedMusic.filename,saved.filename);
  assert.ok(!calls.some(c=>c.path==='/interrupt'),'must not interrupt unrelated ComfyUI work');
 }finally{completed=true;globalThis.fetch=originalFetch;}
}));

test('deleting a story during generation cannot restore it or publish orphaned audio',async()=>ws.workspaceContext.run(scope,async()=>{
 store.add('scripts',script);mockFetch();onHistory=()=>store.remove('scripts',script.id);
 try{
  music.startMusic(script.id,'Ambient music',30);
  const status=await settled();assert.equal(status.status,'error');assert.match(status.error,/story changed/i);
  assert.equal(store.getById('scripts',script.id),undefined);
 }finally{onHistory=undefined;globalThis.fetch=originalFetch;}
}));

test('music requests reject path traversal and unsupported duration before generation',()=>ws.workspaceContext.run(scope,()=>{
 assert.throws(()=>music.startMusic('../other','Flute',30),/Invalid script/);
 assert.throws(()=>music.startMusic('story','Flute',600),/30, 60, or 90/);
}));

test.after(()=>{globalThis.fetch=originalFetch;assert.ok(root.startsWith(path.resolve('server/data')+path.sep));fs.rmSync(root,{recursive:true,force:true});});
