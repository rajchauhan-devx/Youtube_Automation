import test from 'node:test';
import assert from 'node:assert/strict';
import { streamLocal } from '../dist/services/ollama.js';
import { planAiEdit, planReliableEdit } from '../dist/services/ai-edit.js';
import { editingPreset } from '../dist/services/auto-edit.js';

test('local stream preserves split UTF-8 text, omits thinking and unloads after completion', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(init.headers.Authorization, undefined);
    const body = JSON.parse(init.body);
    assert.equal(body.keep_alive, 0); assert.equal(body.think, true); assert.equal(body.options.num_ctx, 8192);
    const bytes = new TextEncoder().encode('{"message":{"thinking":"private"},"done":false}\n{"message":{"content":"नमस्ते"},"done":false}\n{"done":true,"done_reason":"stop"}');
    return new Response(new ReadableStream({ start(controller) { for(let i=0;i<bytes.length;i+=5) controller.enqueue(bytes.slice(i,i+5)); controller.close(); } }));
  };
  try {
    const events = [];
    for await (const event of streamLocal({ model: 'ollama/qwen3.5:4b:thinking', messages: [{ role: 'user', content: 'Hello' }] })) events.push(event);
    assert.equal(events.map(event => event.token).join(''), 'नमस्ते');
    assert.equal(events.at(-1).finishReason, 'STOP');
  } finally { globalThis.fetch = original; }
});

test('large local editing plans are batched and every scene is validated', async () => {
  const original = globalThis.fetch;
  const sizes = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.format.type, 'object'); assert.equal(body.think, false);
    assert.ok(!body.format.properties.scenes.items.properties.motion.enum.includes('auto'));
    const scenes = JSON.parse(body.messages[1].content).scenes;
    sizes.push(scenes.length);
    const content = JSON.stringify({ summary: 'Gentle motion', scenes: scenes.map(scene => ({ sceneId: scene.id, motion: 'push-in', transition: 'cut' })) });
    return new Response(JSON.stringify({ message: { content }, done: true, done_reason: 'stop' }) + '\n');
  };
  try {
    const plan = { version: 1, title: 'History', thumbnailPrompt: 'Town', scenes: Array.from({length:9}, (_,i)=>({id:`scene-${i}`,chapter:'Town',narration:'A new morning.',imagePrompt:'Town at sunrise',role:'story',mediaType:i===0?'video':'image'})) };
    const result = await planAiEdit('', plan, editingPreset(), undefined, 'ollama/qwen3.5:4b');
    assert.deepEqual(sizes, [4,4,1]); assert.equal(Object.keys(result.editing.overrides).length,9);
    assert.equal(result.editing.overrides['scene-0'].motion,'hold');
  } finally { globalThis.fetch = original; }
});

test('local prompts exceeding the context budget fail before inference', async () => {
  await assert.rejects(async () => { for await (const event of streamLocal({model:'ollama/qwen3.5:4b',messages:[{role:'user',content:'x'.repeat(9000)}]})) void event; }, /too long/);
});

test('invalid local decisions retry once then return a complete labelled preset, including video and motion-off', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const plan = {version:1,title:'Hindi story',thumbnailPrompt:'Cover',scenes:Array.from({length:41},(_,i)=>({id:`S${i}`,chapter:'अध्याय',narration:'कहानी',imagePrompt:'Temple',role:'story',mediaType:i===2?'video':'image'}))};
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({message:{content:JSON.stringify({summary:'Bad output',scenes:Array.from({length:4},()=>({sceneId:'S0',motion:'zoom',transition:'fade'}))})},done:true,done_reason:'stop'})+'\n');
  };
  try {
    const result = await planReliableEdit('',plan,{...editingPreset('documentary'),motion:'off'},undefined,'ollama/qwen3.5:4b');
    assert.equal(calls,2);
    assert.equal(result.source,'preset'); assert.match(result.summary,/instead/);
    assert.equal(Object.keys(result.editing.overrides).length,41);
    assert.ok(Object.values(result.editing.overrides).every(scene=>scene.motion==='hold'));
    assert.equal(result.editing.overrides.S0.transition,'cut');
  } finally {globalThis.fetch=original;}
});

test('offline local editing falls back without repeatedly calling an unavailable provider', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {calls++;throw new Error('offline');};
  try {
    const plan = {scenes:[{id:'one',chapter:'A',narration:'Hello',imagePrompt:'Sky',role:'story'}],title:'Story'};
    const result = await planReliableEdit('',plan,editingPreset(),undefined,'ollama/qwen3.5:4b');
    assert.equal(calls,1);assert.equal(result.source,'preset');
    assert.equal(result.editing.overrides.one.transition,'cut');
  } finally {globalThis.fetch=original;}
});

test('exhausted thinking returns an actionable error instead of an empty script', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"message":{"thinking":"still thinking"},"done":true,"done_reason":"length"}\n');
  try {
    await assert.rejects(async () => {
      for await (const event of streamLocal({model:'ollama/qwen3.5:4b:thinking',messages:[{role:'user',content:'Hello'}]})) void event;
    }, /without a final answer/);
  } finally { globalThis.fetch = original; }
});
