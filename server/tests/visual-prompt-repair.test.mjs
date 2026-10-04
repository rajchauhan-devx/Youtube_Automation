import test from 'node:test';
import assert from 'node:assert/strict';
import { repairVisualPrompts } from '../dist/services/visual-prompt-repair.js';

const plan={version:1,title:'Keep this title',thumbnailPrompt:'Keep this thumbnail',supportingNotes:'Keep research.',scenes:[
  {id:'scene_001',chapter:'Opening',role:'story',mediaType:'image',duration:10,narration:'Keep these exact spoken words.',imagePrompt:'Short visual description'},
  {id:'scene_002',chapter:'Movement',role:'story',mediaType:'video',duration:10,narration:'Keep the next spoken words.',imagePrompt:Array(75).fill('existing').join(' '),videoPrompt:'Short motion direction'},
]};
const template='Every image_prompt must be 70–120 words. Every video_prompt must be 90–150 words.';
const reply=prompts=>({choices:[{finish_reason:'STOP',message:{content:JSON.stringify({prompts})}}]});
test('visual field repairs preserve all speech, timing, metadata and already valid prompts',async()=>{
  const original=structuredClone(plan);let calls=0;
  const updated=await repairVisualPrompts('fixture',plan,template,'gemini-3.1-flash-lite',undefined,async(_key,request)=>{
    calls++;assert.ok(request.messages[1].content.startsWith(template));
    return reply([{id:'scene_001',imagePrompt:Array(90).fill('expanded').join(' ')},{id:'scene_002',imagePrompt:'An unsolicited different image',videoPrompt:Array(120).fill('motion').join(' ')}]);
  });
  assert.equal(calls,1);assert.deepEqual(plan,original);
  assert.deepEqual(updated.scenes.map(s=>s.narration),original.scenes.map(s=>s.narration));
  assert.deepEqual(updated.scenes.map(s=>s.duration),[10,10]);
  assert.equal(updated.scenes[1].imagePrompt,original.scenes[1].imagePrompt);
  assert.equal(updated.supportingNotes,original.supportingNotes);
  assert.equal(updated.thumbnailPrompt,original.thumbnailPrompt);
});
test('wrong or duplicate scene IDs cannot overwrite visual fields',async()=>{
  let calls=0;
  await assert.rejects(repairVisualPrompts('fixture',plan,template,'gemini-3.1-flash-lite',undefined,async()=>{calls++;return reply([{id:'other',imagePrompt:Array(90).fill('invalid').join(' ')}]);}),/below the template minimum/);
  assert.equal(calls,3);assert.equal(plan.scenes[0].imagePrompt,'Short visual description');
});
test('already adequate visual prompts require no provider call',async()=>{
  const valid={...plan,scenes:plan.scenes.map(s=>({...s,imagePrompt:Array(80).fill('image').join(' '),...(s.mediaType==='video'?{videoPrompt:Array(100).fill('motion').join(' ')}:{})}))};
  const result=await repairVisualPrompts('fixture',valid,template,'gemini-3.1-flash-lite',undefined,async()=>{throw Error('Unnecessary call');});
  assert.deepEqual(result,valid);
});

test('thumbnail motion repair remains separate and preserves every playback scene',async()=>{
  const valid={...plan,scenes:plan.scenes.map(s=>({...s,imagePrompt:Array(80).fill('image').join(' '),...(s.mediaType==='video'?{videoPrompt:Array(100).fill('motion').join(' ')}:{})}))};
  const authored=template+'\nGemini motion prompts provided for EXACTLY 3 images: Thumbnail + 2 scene images';
  const result=await repairVisualPrompts('fixture',valid,authored,'gemini-3.1-flash-lite',undefined,async()=>reply([{id:'thumbnail:motion',imagePrompt:'Do not replace the thumbnail',videoPrompt:Array(100).fill('cover').join(' ')}]));
  assert.deepEqual(result.scenes,valid.scenes);assert.equal(result.thumbnailPrompt,valid.thumbnailPrompt);
  assert.equal(result.thumbnailMotionPrompt,Array(100).fill('cover').join(' '));assert.equal(valid.thumbnailMotionPrompt,undefined);
});
