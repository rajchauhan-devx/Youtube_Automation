import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { llmRouter } from '../dist/routes/llm.js';
import { streamReasoning } from '../dist/services/opencode.js';
import { planAiEdit } from '../dist/services/ai-edit.js';
import { editingPreset } from '../dist/services/auto-edit.js';

test('script streaming selects provider credentials and enables reasoning without leaking it into scripts', async () => {
  const app = express(); app.use(express.json()); app.use('/llm', llmRouter);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const originalFetch = globalThis.fetch;
  const oldGroq = process.env.GROQ_API_KEY;
  const oldRouter = process.env.OPENROUTER_API_KEY;
  process.env.GROQ_API_KEY = 'groq-fixture';
  process.env.OPENROUTER_API_KEY = 'router-fixture';
  globalThis.fetch = async (url, options) => {
    const groq = String(url).startsWith('https://api.groq.com/');
    if (!groq && !String(url).startsWith('https://openrouter.ai/')) return originalFetch(url, options);
    assert.equal(options.headers.Authorization, groq ? 'Bearer groq-fixture' : 'Bearer router-fixture');
    const body = JSON.parse(options.body);
    assert.equal(body.model, groq ? 'openai/gpt-oss-120b' : 'qwen/qwen3.8-27b:free');
    if (groq) { assert.equal(body.reasoning_effort, 'medium'); assert.equal(body.include_reasoning, false); }
    else { assert.equal(body.reasoning.effort, 'medium'); assert.equal(body.provider.max_price.completion, 0); }
    return new Response('data: {"choices":[{"delta":{"reasoning":"internal"}}]}\n\ndata: {"choices":[{"delta":{"content":"Final script"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  };
  try {
    for (const model of ['groq/openai/gpt-oss-120b', 'openrouter/qwen/qwen3.8-27b:free']) {
      const response = await originalFetch(`http://127.0.0.1:${server.address().port}/llm/chat/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'wrong-provider-key' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Write a script' }] }),
      });
      const result = await response.text();
      assert.match(result, /Final script/); assert.match(result, /STOP/); assert.match(result, /"done":true/);
      assert.doesNotMatch(result, /internal|fixture|wrong-provider/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (oldGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldGroq;
    if (oldRouter === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldRouter;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('reasoning provider rejects unlisted paid models before making a request', async () => {
  await assert.rejects(async () => {
    for await (const event of streamReasoning('fixture', { model: 'openrouter/paid-model', messages: [] })) void event;
  }, /available OpenRouter free model/);
});

test('automatic editing validates Groq and OpenRouter plans and rejects truncated responses', async () => {
  const original = globalThis.fetch;
  let finish = 'stop';
  const scene = { id: 'one', chapter: 'Opening', narration: 'A city awakens.', imagePrompt: 'City at dawn', mediaType: 'video', role: 'story' };
  const plan = { version: 1, title: 'City', thumbnailPrompt: 'City', scenes: [scene] };
  const settings = editingPreset('documentary');
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith('https://api.groq.com/') || String(url).startsWith('https://openrouter.ai/'));
    const body = JSON.parse(init.body);
    assert.match(body.messages[0].content, /Return JSON only/);
    const content = JSON.stringify({ summary: 'A calm opening', scenes: [{ sceneId: 'one', motion: 'push-in', transition: 'cut' }] });
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }] })}\n\n`);
  };
  try {
    for (const model of ['groq/openai/gpt-oss-120b', 'openrouter/qwen/qwen3.8-27b:free']) {
      const result = await planAiEdit('fixture', plan, settings, undefined, model);
      assert.equal(result.editing.overrides.one.motion, 'hold', 'video retains source motion');
      assert.equal(result.summary, 'A calm opening');
    }
    finish = 'length';
    await assert.rejects(planAiEdit('fixture', plan, settings, undefined, 'groq/openai/gpt-oss-120b'), /incomplete/);
    assert.deepEqual(settings.overrides, {}, 'input settings are not mutated');
  } finally { globalThis.fetch = original; }
});
