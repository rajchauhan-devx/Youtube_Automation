import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamOpenCode } from '../dist/services/opencode.js';

test('OpenCode chat stream handles split frames, reasoning and token limits', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://opencode.ai/zen/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    assert.equal(JSON.parse(init.body).model, 'mimo-v2.5-free');
    const body = 'data: {"choices":[{"delta":{"reasoning_content":"hidden"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"Hello"}}]}\r\n\r\ndata: {"choices":[{"delta":{},"finish_reason":"length"}]}\r\n\r\ndata: [DONE]\r\n\r\n';
    return new Response(new ReadableStream({ start(controller) {
      for (let index = 0; index < body.length; index += 7) controller.enqueue(new TextEncoder().encode(body.slice(index, index + 7)));
      controller.close();
    } }));
  };
  try {
    const result = [];
    for await (const event of streamOpenCode('test-key', { model: 'opencode/mimo-v2.5-free', messages: [{ role: 'user', content: 'Hello' }] })) result.push(event);
    assert.deepEqual(result, [{ token: 'Hello', finishReason: undefined }, { token: '', finishReason: 'MAX_TOKENS' }]);
  } finally { globalThis.fetch = original; }
});

test('OpenCode Responses models normalize completion events', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(url.endsWith('/responses'));
    assert.equal(JSON.parse(init.body).input[0].role, 'assistant');
    return new Response('data: {"type":"response.output_text.delta","delta":"Script"}\n\ndata: {"type":"response.completed"}\n\n');
  };
  try {
    const result = [];
    for await (const event of streamOpenCode('test-key', { model: 'opencode/muse-spark-1.3-contributor-free', messages: [{ role: 'model', content: 'Previous' }] })) result.push(event);
    assert.equal(result[0].token, 'Script');
    assert.equal(result[1].finishReason, 'STOP');
  } finally { globalThis.fetch = original; }
});

test('OpenCode rejects paid models and sanitizes upstream failures', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('sensitive upstream body', { status: 401 });
  async function consume(model) {
    for await (const event of streamOpenCode('test-key', { model, messages: [] })) void event;
  }
  try {
    await assert.rejects(consume('opencode/paid-model'), /available OpenCode free model/);
    await assert.rejects(consume('opencode/mimo-v2.5-free'), error => error.message.includes('401') && !error.message.includes('sensitive'));
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { type: 'FreeTierError' } }), { status: 403 });
    await assert.rejects(consume('opencode/mimo-v2.5-free'), /restricts its free tier/);
  } finally { globalThis.fetch = original; }
});
