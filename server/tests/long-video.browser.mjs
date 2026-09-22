import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const wav = Buffer.alloc(44 + 48000 * 2 * 6);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const prefix = '/api/accounts/default/profiles/long';
const colors = ['red', 'blue', 'green'];
const scenes = colors.map((color, index) => ({ id:`S${index}`, chapter:'अध्याय', role:'story', narration:`दृश्य ${index + 1} की कहानी।`, imagePrompt:`${color} scene` }));
const plan = { version:1, title:'Long sync browser test', thumbnailPrompt:'Separate thumbnail only', scenes };
const audio = { language:'hi', voice:'test', filename:'voice.wav', url:`${prefix}/generate/file/long-test/voice.wav`, sync:{ version:1,planHash:'fixture',sampleRate:48000,totalSamples:288000,scenes:[{sceneId:'S0',startSample:0,endSample:48000},{sceneId:'S1',startSample:48000,endSample:144000},{sceneId:'S2',startSample:144000,endSample:288000}] } };
let script = { id:'long-test',name:'Long sync browser test',prompts:[],status:'active',duration:900,scenePlan:plan,
  imagePrompts:scenes.map(scene=>scene.imagePrompt),
  narration:scenes.map(scene=>scene.narration).join('\n\n'),generatedAudio:[audio],generatedImages:colors.map((color,index)=>({index,status:'done',prompt:scenes[index].imagePrompt,url:`${prefix}/generate/file/long-test/${color}.svg`})) };
let renderRequest;
let musicJob = {status:'idle',installed:true};
let musicRequest;
let job = { status:'idle',completed:0,total:3 };
const browser = await puppeteer.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
  const page = await browser.newPage(); await page.setViewport({width:1440,height:1100});
  const errors = []; page.on('pageerror', error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request=>{
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return void request.continue();
    const route = url.pathname.replace(prefix,'/api');
    let body = {};
    if (route === '/api/accounts') body = {accounts:[{id:'default',name:'My Channel',color:'#3b82f6',avatar:'MC'}]};
    if (route === '/api/scripts') body = [script];
    if (route === '/api/scripts/long-test') { if (request.method()==='PUT') script={...script,...JSON.parse(request.postData())}; body=script; }
    if (route === '/api/render/music-tracks') body={tracks:[]};
    if (route === '/api/render/music/status/long-test') body=musicJob;
    if (route === '/api/render/music/prompt/long-test') body={prompt:'Quiet tanpura and soft bamboo flute, sparse and clean beneath the narration.'};
    if (route === '/api/render/music/generate/long-test') {musicRequest=JSON.parse(request.postData());musicJob={status:'running',stage:'Composing music',installed:true};body=musicJob;}
    if (route === '/api/render/music/cancel/long-test') {musicJob={status:'cancelled',installed:true};body=musicJob;}
    if (route.startsWith('/api/render/status/')) body={status:'idle',videos:[]};
    if (route === '/api/render/start') {renderRequest=JSON.parse(request.postData());body={ok:true};}
    if (route === '/api/llm/editing-plan') body={editing:{...script.editing,overrides:{S0:{motion:'hold',transition:'cut'},S1:{motion:'push-in',transition:'dissolve'},S2:{motion:'hold',transition:'cut'}}},source:'preset',summary:'AI could not produce a complete valid plan. Applied the documentary preset instead.'};
    if (route === '/api/tts/status') body={online:true,ready:true,provider:'Chatterbox',kind:'local',state:'ready'};
    if (route === '/api/tts/voices') body={voices:[{id:'test',name:'Test voice',language:'hi',gender:'male'}]};
    if (route.startsWith('/api/tts/long/status/')) body=job;
    if (route === '/api/tts/long/start') {job={status:'running',completed:1,total:3};body=job;}
    if (route.startsWith('/api/tts/long/cancel/')) {job={status:'idle',completed:0,total:3};body={ok:true};}
    if (route.endsWith('.wav')) return void request.respond({status:200,contentType:'audio/wav',body:wav});
    if (route.endsWith('.svg')) {
      const color=colors.find(color=>route.endsWith(`${color}.svg`));
      return void request.respond({status:200,contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="${color}"/></svg>`});
    }
    void request.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.evaluateOnNewDocument(()=>localStorage.setItem('tubeflow:v1',JSON.stringify({channelId:'default',section:'long',tab:'review',selectedScriptId:'long-test'})));
  await page.goto('http://127.0.0.1:5175',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.body.innerText.includes('Audio sync ready: 3 scenes'));
  console.log('Long timeline loaded');
  assert.equal(await page.$eval('[aria-label="Video format"]',el=>el.value),'1920x1080');
  await page.$eval('button:has(img[src$="blue.svg"])', button => button.click());
  console.log('Scene selected');
  assert.equal(await page.$eval('[aria-label="Scene duration"]',el=>el.matches(':disabled')),true);
  assert.equal(await page.$eval('[aria-label="Scene duration"]',el=>Number(el.value)),2);
  assert.ok(await page.evaluate(()=>document.body.innerText.includes('Narration: दृश्य 2 की कहानी।')));
  const click = async text => page.evaluate(text=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===text || button.title===text);if(!button)throw new Error(`Missing button ${text}`);button.click();},text);
  await click('Play Timeline (Space)');
  await page.waitForFunction(()=>document.querySelector('audio').currentTime>0.2);
  await click('Pause (Space)');
  console.log('Audio preview verified');
  assert.ok(Math.abs(await page.$eval('[aria-label="Narration playhead"]',el=>Number(el.value))-await page.$eval('audio',el=>el.currentTime))<0.15);
  await page.click('[aria-label="Apply Documentary"]');
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Editing AI model"]').disabled);
  await click('Create AI Editing Plan');
  await page.waitForFunction(()=>document.body.innerText.includes('Applied the documentary preset instead.'));
  assert.equal(script.editing.overrides.S1.transition,'dissolve');
  assert.ok(!await page.$eval('[aria-label="Editing AI model"]',el=>el.textContent.includes('Thinking')));
  await page.select('[aria-label="Music track"]','none');
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Music volume"]'));
  for(let i=0;i<50&&script.timelineConfig?.bgmTrack!=='none';i++) await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(script.timelineConfig.bgmTrack,'none');
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.body.innerText.includes('Audio sync ready: 3 scenes'));
  assert.equal(await page.$eval('[aria-label="Music track"]',el=>el.value),'none');
  assert.ok(await page.evaluate(()=>/0:06\s+narration/i.test(document.body.innerText)));
  await page.select('[aria-label="Music source"]','ai');
  await page.waitForSelector('[aria-label="AI music description"]');
  await click('Auto-generate prompt from video');
  await page.waitForFunction(()=>document.querySelector('[aria-label="AI music description"]').value.includes('sparse and clean'));
  await click('Generate music locally');
  await page.waitForFunction(()=>document.body.innerText.includes('Cancel music generation'));
  assert.match(musicRequest.prompt,/sparse and clean/); assert.equal(musicRequest.duration,60);
  await click('Cancel music generation');
  await page.waitForFunction(()=>!document.body.innerText.includes('Cancel music generation'));
  await click('Generate music locally');
  await page.waitForFunction(()=>document.body.innerText.includes('Cancel music generation'));
  const generatedMusic={filename:'music_fixture.mp3',url:`${prefix}/generate/file/long-test/music.wav`,duration:60,prompt:'Gentle instrumental flute',seed:1,contextHash:'fixture',createdAt:new Date().toISOString()};
  musicJob={status:'done',installed:true,music:generatedMusic};
  await page.waitForSelector('[aria-label="Generated music preview"]');
  for(let i=0;i<50&&!script.generatedMusic;i++)await new Promise(r=>setTimeout(r,20));
  assert.equal(script.generatedMusic.filename,'music_fixture.mp3');
  await page.$eval('[aria-label="Generated music preview"]',el=>el.play());
  await page.waitForFunction(()=>document.querySelector('[aria-label="Generated music preview"]').currentTime>0.1);
  await page.$eval('[aria-label="Generated music preview"]',el=>el.pause());
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('[aria-label="Generated music preview"]');
  assert.equal(await page.$eval('[aria-label="Music source"]',el=>el.value),'ai');
  fs.mkdirSync('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/long-video-timeline.png',fullPage:true});
  await click('Start Video Generation');
  for (let i=0;i<50&&!renderRequest;i++) await new Promise(resolve=>setTimeout(resolve,20));
  assert.deepEqual(renderRequest.timelineConfig.clips.map(clip=>clip.duration),[1,2,3]);
  assert.equal(renderRequest.bgmTrack,'ai');
  assert.equal(renderRequest.editing.overrides.S1.transition,'dissolve');
  assert.deepEqual(renderRequest.timelineConfig.clips.map(clip=>clip.transition),['none','none','none']);
  await click('Generation'); await click('Audio Generation');
  console.log('Audio tab opened');
  await page.waitForSelector('textarea[readonly]');
  assert.equal(await page.$eval('textarea[readonly]',el=>el.readOnly),true);
  job={status:'running',completed:1,total:3};
  await page.waitForFunction(()=>document.body.innerText.includes('1 of 3 scenes complete'));
  await click('Assets');
  assert.ok(await page.evaluate(()=>document.body.innerText.includes('Separate thumbnail prompt')));
  await click('Generation'); await click('Audio Generation');
  await page.waitForFunction(()=>document.body.innerText.includes('1 of 3 scenes complete'));
  await click('Cancel after current voice request');
  await page.waitForFunction(()=>!document.body.innerText.includes('Cancel after current voice request'));
  await click('Assets'); await click('Edit');
  await page.$eval('[aria-label="Scene narration"]', element => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(element,'बदली हुई कहानी।');
    element.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await click('Save scene');
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Scene narration"]'));
  assert.equal(script.scenePlan.scenes[0].narration,'बदली हुई कहानी।');
  assert.equal(script.generatedAudio.length,0);
  assert.equal(script.generatedImages.length,3);
  assert.ok(script.aiResponse.includes('बदली हुई कहानी।'));
  assert.deepEqual(errors,[]);
  console.log('PASS: measured render request, landscape format, locked boundaries, narration preview, scene editing and invalidation, separate thumbnail, narration job reconnect and cancel');
} finally {await browser.close();}
