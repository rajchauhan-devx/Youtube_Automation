import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import {identity,SceneGraph} from '@tubeflow/editing-contracts';
import {renderSceneGraphSvg} from '@tubeflow/video-composition';
const {chromium}=createRequire(new URL('../../server/package.json',import.meta.url))('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scene-graph-render-'));
process.env.TUBEFLOW_DATA_DIR=dir;
const {fixture}=await import('./motion-fixtures.mjs');
const {renderHyperFramesOverlay}=await import('../../server/dist/services/editing/hyperframes-renderer.js');
const {exportVideo}=await import('../../server/dist/services/editing/renderer.js');
const {assetFile,projectDir}=await import('../../server/dist/services/editing/repository.js');
const {runMedia}=await import('../../server/dist/services/media-process.js');
const {prepareMotionAudio}=await import('../../server/dist/services/editing/motionAudio.js');
const base=id=>({id,space:'screen',zIndex:0,transform:identity(),opacity:1,tracks:[]});

test('actual HyperFrames capture matches the shared frame evaluator and complete exports have exact duration', {timeout:120000},async()=>{
  const p=await fixture('museum',false,true);p.settings.visualReview=false;p.settings.soundDesign='off';
  const graph=SceneGraph.parse({version:1,seed:1,bounds:{x:40,y:60,width:560,height:240},nodes:[
    {...base('shape'),kind:'shape',geometry:{kind:'rect',bounds:{x:0,y:0,width:160,height:90},radius:12},paint:{fill:'#164E63',stroke:'#67E8F9',strokeWidth:2,dash:[]},tracks:[{property:'x',keyframes:[{frame:0,value:0,easing:{kind:'linear'}},{frame:24,value:70,easing:{kind:'linear'}},{frame:48,value:20,easing:{kind:'linear'}},{frame:72,value:20,easing:{kind:'linear'}}]}]},
    {...base('text'),zIndex:1,kind:'text',text:'Bronze statue',bounds:{x:20,y:20,width:220,height:60},style:{fontAssetId:p.style.fontAssetIds[0],fontSize:24,fontWeight:'700',color:'#FFFFFF',align:'left',lineHeight:1.3}},
  ],soundCues:[],evidence:[],capabilities:[]});
  p.artifacts=[{id:'render-graph',sceneId:p.scenes[0].id,enabled:true,intent:'Fixture',narrativeRefs:p.scenes[0].narrativeRefs,startFrame:0,endFrame:72,priority:5,nodes:[],assetRequestIds:[],sceneGraph:graph}];
  const overlay=path.join(dir,'overlay.webm');
  await renderHyperFramesOverlay({project:p,outputPath:overlay,signal:AbortSignal.timeout(60000)});
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:640,height:360}});
    const fonts=Object.fromEntries(p.style.fontAssetIds.map(id=>[id,`sg-font-${id}`]));
    const css=p.style.fontAssetIds.map(id=>`@font-face{font-family:sg-font-${id};src:url(data:font/woff2;base64,${fs.readFileSync(assetFile(id)).toString('base64')});font-weight:400;}`).join('');
    for(const frame of [12,36,60]){
      const svg=renderSceneGraphSvg(graph,frame,{width:640,height:360,fps:24,durationFrames:72,idPrefix:'sg-render-graph',fonts,motion:'balanced'});
      await page.setContent(`<style>body{margin:0;background:transparent}${css}</style>${svg}`);await page.evaluate(()=>document.fonts.ready);
      const reference=await page.screenshot({omitBackground:true});
      const decoded=path.join(dir,`decoded-${frame}.png`);
      await runMedia('ffmpeg',['-v','error','-y','-c:v','libvpx-vp9','-i',overlay,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1',decoded]);
      const [a,b]=await Promise.all([reference,fs.readFileSync(decoded)].map(input=>sharp(input).flatten({background:'#000000'}).removeAlpha().raw().toBuffer()));
      const difference=a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
      assert.ok(difference<3,`frame ${frame}: mean pixel difference ${difference}`);
    }
  } finally {await browser.close();}
  const audio=await prepareMotionAudio(p,AbortSignal.timeout(30000));assert.ok(fs.existsSync(audio));
  const id=randomUUID();await exportVideo(p,id,AbortSignal.timeout(60000),()=>{});
  const video=path.join(projectDir(p.id),'renders',id,'video.mp4');
  const probe=JSON.parse(await runMedia('ffprobe',['-v','error','-show_streams','-of','json',video]));
  assert.equal(Number(probe.streams.find(s=>s.codec_type==='video').nb_frames),72);
  assert.equal(Number(probe.streams.find(s=>s.codec_type==='audio').duration),3);
});

test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
