import test from 'node:test';
import assert from 'node:assert/strict';
import { repairNarrationBudget } from '../dist/services/narration-budget-repair.js';
import { spokenText } from '../dist/services/scene-plan.js';
const plan={version:1,title:'Episode',thumbnailPrompt:'Ocean',supportingNotes:'Research',scenes:[1,2].map(i=>({id:`scene_00${i}`,chapter:'Survival',role:'story',mediaType:'image',duration:15,narration:Array(80).fill('fact').join(' '),imagePrompt:'A ship on the ocean.'}))};
test('speech budget repair retains exact scene, visual and editorial identities',async()=>{
  const original=structuredClone(plan);let calls=0;
  const updated=await repairNarrationBudget('fixture',plan,30,'Preserve facts','gemini-3.1-flash-lite',undefined,async()=>{
    calls++;return {choices:[{finish_reason:'STOP',message:{content:JSON.stringify({scenes:plan.scenes.map(s=>({id:s.id,narration:Array(53).fill('fact').join(' ')}))})}}]};
  });
  assert.equal(calls,1);assert.equal(spokenText(updated).split(/\s+/).length,106);assert.deepEqual(plan,original);
  assert.deepEqual(updated.scenes.map(({narration,...s})=>s),original.scenes.map(({narration,...s})=>s));assert.equal(updated.supportingNotes,original.supportingNotes);
});
test('missing narration IDs cannot silently drop the rest of the story',async()=>{
  let calls=0;
  await assert.rejects(repairNarrationBudget('fixture',plan,30,'Preserve facts','gemini-3.1-flash-lite',undefined,async()=>{calls++;return {choices:[{finish_reason:'STOP',message:{content:'{"scenes":[{"id":"other","narration":"Brief"}]}'}}]};}),/still has/);
  assert.equal(calls,5);
});

test('near-boundary retries use the measured word excess and preserve all scenes',async()=>{
  let calls=0;
  const updated=await repairNarrationBudget('fixture',plan,30,'Preserve facts','gemini-3.1-flash-lite',undefined,async(_key,request)=>{
    calls++;
    assert.match(request.messages[0].content,/Count words separated by spaces/);
    if(calls===2) assert.match(request.messages[0].content,/current part has 118 words/);
    return {choices:[{finish_reason:'STOP',message:{content:JSON.stringify({scenes:plan.scenes.map(s=>({id:s.id,narration:Array(calls===1?59:53).fill('fact').join(' ')}))})}}]};
  });
  assert.equal(calls,2);assert.equal(spokenText(updated).split(/\s+/).length,106);
});

test('counted fallback joins complete words without truncation or changing visuals',async()=>{
  let calls=0;
  const updated=await repairNarrationBudget('fixture',plan,30,'Preserve facts','gemini-3.1-flash-lite',undefined,async(_key,request)=>{
    calls++;
    const counted=request.jsonSchema.properties.scenes.items.properties.narrationWords;
    if(calls<3){assert.equal(counted,undefined);return {choices:[{finish_reason:'STOP',message:{content:JSON.stringify({scenes:plan.scenes.map(s=>({id:s.id,narration:s.narration}))})}}]};}
    assert.equal(counted.minItems,48);assert.equal(counted.maxItems,57);
    return {choices:[{finish_reason:'STOP',message:{content:JSON.stringify({scenes:plan.scenes.map(s=>({id:s.id,narrationWords:Array(53).fill('fact.')}))})}}]};
  });
  assert.equal(calls,3);assert.equal(spokenText(updated).split(/\s+/).length,106);
  assert.equal(updated.scenes[0].narration,Array(53).fill('fact.').join(' '));
  assert.deepEqual(updated.scenes.map(({narration,...s})=>s),plan.scenes.map(({narration,...s})=>s));
});

test('counted items cannot hide extra words inside one item',async()=>{
  await assert.rejects(repairNarrationBudget('fixture',plan,30,'Preserve facts','gemini-3.1-flash-lite',undefined,async()=>({choices:[{finish_reason:'STOP',message:{content:JSON.stringify({scenes:plan.scenes.map(s=>({id:s.id,narrationWords:Array(53).fill('hidden extra words')}))})}}]})),/still has/);
});
