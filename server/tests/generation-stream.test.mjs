import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { llmRouter } from '../dist/routes/llm.js';
import { incompleteResponse } from '../dist/services/generation-status.js';

test('completion checks follow user sections and detect the reported cutoff without imposing a schema', () => {
  const prompt = Array.from({ length: 9 }, (_, i) => `## SECTION ${i + 1} — Required`).join('\n');
  assert.match(incompleteResponse(prompt, '## SECTION 1 — Overview\n## SECTION 2 — Script\n## SECTION 3 — Voice\nक्या'), /4, 5, 6, 7, 8, 9/);
  assert.equal(incompleteResponse(prompt, prompt), undefined);
  assert.equal(incompleteResponse('Write a poem.', 'A complete poem.'), undefined);
  assert.match(incompleteResponse('Write tagged assets.', '<long_video>Prompt'), /Unfinished/);
});

test('stream reports interrupted EOF, preserves STOP and exposes provider failures', async () => {
  const app = express(); app.use(express.json()); app.use('/llm', llmRouter);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const originalFetch = globalThis.fetch;
  let providerData = '';
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://generativelanguage.googleapis.com/')) return new Response(providerData, { headers: { 'Content-Type': 'text/event-stream' } });
    return originalFetch(url, options);
  };
  const request = async () => (await originalFetch(`http://127.0.0.1:${server.address().port}/llm/chat/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'fixture' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'My exact prompt' }] }),
  })).text();
  try {
    providerData = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'क्या' }] } }] })}\n\n`;
    let result = await request();
    assert.match(result, /क्या/); assert.match(result, /STREAM_INTERRUPTED/);
    providerData = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Complete' }] }, finishReason: 'STOP' }] })}\n\n`;
    result = await request(); assert.match(result, /STOP/); assert.doesNotMatch(result, /STREAM_INTERRUPTED/);
    providerData = 'data: {invalid}\n\n';
    result = await request(); assert.match(result, /malformed provider/); assert.doesNotMatch(result, /"done":true/);
    providerData = `data: ${JSON.stringify({ error: { message: 'Quota exhausted' } })}\n\n`;
    result = await request(); assert.match(result, /Quota exhausted/);
  } finally {
    globalThis.fetch = originalFetch;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
