import test from 'node:test';
import assert from 'node:assert/strict';
import { episodeParts, generateLongScenePlan, longGenerationDuration } from '../dist/services/long-script-generation.js';
import { buildGenerationPrompt, generationResponseSchema, generationIssue, promptMinimumWords } from '../dist/services/script-generation.js';
import { parseScenePlan } from '../dist/services/scene-plan.js';

const prompt=buildGenerationPrompt('Original story template.','Ocean survival','',300,'long');
const request={model:'gemini-3.1-flash-lite',jsonSchema:generationResponseSchema(300),messages:[{role:'system',content:'Preserve the story.'},{role:'user',content:prompt}]};
const response=(part,short=false)=>({choices:[{finish_reason:'STOP',message:{content:JSON.stringify({version:1,title:'Ocean survival',thumbnailPrompt:'A stormy ocean',supportingNotes:part===3?'Research notes.':'',scenes:Array.from({length:10},(_,i)=>({id:`scene_${i+1}`,chapter:`Part ${part}`,role:'story',mediaType:'image',duration:10,narration:Array(short?2:35).fill(`Part${part}`).join(' '),imagePrompt:'A sailing ship on a stormy ocean.'}))})}}]});

test('long episodes distribute complete speech and scenes over bounded parts',()=>{
  for(const duration of [300,600,900,1200,3600]) {
    const parts=episodeParts(duration);
    assert.ok(Math.abs(parts.reduce((n,p)=>n+p.seconds,0)-duration)<1e-8);
    assert.ok(parts.every(p=>p.seconds<=120&&p.scenes>0));
    assert.ok(parts.reduce((n,p)=>n+p.scenes,0)<=160);
  }
  assert.equal(longGenerationDuration(request),300);
  assert.equal(longGenerationDuration({...request,jsonSchema:undefined}),undefined);
});
test('short parts repair locally and stream one exact ordered plan without repeated openings or IDs',async()=>{
  let calls=0;let raw='';
  await generateLongScenePlan('fixture',request,300,token=>raw+=token,async(_key,r)=>{
    calls++;
    assert.ok(r.messages[1].content.startsWith(prompt));
    if(!r.jsonSchema.properties.scenes.items.properties.imagePrompt) {
      assert.equal(r.max_tokens,8192);
      return {choices:[{finish_reason:'STOP',message:{content:JSON.stringify({scenes:Array.from({length:10},(_,i)=>({id:`scene_${i+1}`,narration:Array(35).fill('Part1').join(' ')}))})}}]};
    }
    assert.equal(r.max_tokens,16384);
    const part=Number(r.messages[0].content.match(/ONLY part (\d+) of/)[1]);
    if(part>1)assert.match(r.messages[0].content,/Continue the established episode/);
    return response(part,calls===1);
  });
  assert.equal(calls,4);
  const plan=parseScenePlan(raw);
  assert.equal(plan.scenes.length,30);
  assert.equal(new Set(plan.scenes.map(s=>s.id)).size,30);
  assert.equal(plan.scenes[10].narration.split(' ')[0],'Part2');
  assert.equal(plan.scenes[20].narration.split(' ')[0],'Part3');
  assert.equal(plan.supportingNotes,'Research notes.');
  assert.equal(generationIssue(prompt,raw,300),undefined);
});
test('truncated episode parts never publish a completed plan and retries are bounded',async()=>{
  let calls=0,raw='';
  await assert.rejects(generateLongScenePlan('fixture',request,300,token=>raw+=token,async()=>{calls++;return {choices:[{finish_reason:'MAX_TOKENS',message:{content:'{'}}]};}),/Episode part 1\/3/);
  assert.equal(calls,3);assert.equal(raw,'');
});
test('cancelling a long response stops before another provider call',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(generateLongScenePlan('fixture',{...request,signal:controller.signal},300,()=>controller.abort(),async()=>{calls++;return response(1);}));
  assert.equal(calls,1);
});
test('authored visual prompt ranges take precedence over generic minimums',()=>{
  assert.deepEqual(promptMinimumWords('Every image_prompt must be a prompt of roughly 160–240 words. Every video_prompt must be 220–320 words. Expand an image prompt below 140 words and a video prompt below 190 words.'),{image:160,video:220});
});

test('supporting notes see the entire finished episode and repair independently of narration',async()=>{
  const template='## SECTION 4 — ENGLISH TEXT OVERLAYS\n## SECTION 5 — THE REFLECTION ENGINE';
  const fullPrompt=buildGenerationPrompt(template,'Ocean survival','',300,'long');
  let calls=0,notesCalls=0,raw='';
  await generateLongScenePlan('fixture',{...request,messages:[{role:'user',content:fullPrompt}]},300,token=>raw+=token,async(_key,r)=>{
    calls++;
    if(r.jsonSchema.properties.supportingNotes&&!r.jsonSchema.properties.scenes) {
      notesCalls++;assert.match(r.messages[1].content,/scene_030/);assert.match(r.messages[1].content,/Part1/);assert.match(r.messages[1].content,/Part3/);
      assert.deepEqual(r.jsonSchema.properties.supportingNotes.required,['section_4','section_5']);
      return {choices:[{finish_reason:'STOP',message:{content:JSON.stringify({supportingNotes:notesCalls===1?{section_4:'Overlays for all scenes.'}:{section_4:'Overlays for all scenes.',section_5:'Complete reflection and publishing notes.'}})}}]};
    }
    return response(Number(r.messages[0].content.match(/ONLY part (\d+) of/)[1]));
  });
  assert.equal(calls,5);assert.equal(notesCalls,2);
  assert.equal(generationIssue(fullPrompt,raw,300),undefined);
  assert.equal(parseScenePlan(raw).scenes.length,30);
});
