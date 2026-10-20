import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { getGeminiApiKey } from '../dist/services/gemini.js';
import { modelCredential } from '../dist/services/model-json.js';
import { llmRouter } from '../dist/routes/llm.js';

const previousKey = process.env.GEMINI_API_KEY;
const originalFetch = globalThis.fetch;
const app = express();
app.use(express.json());
app.use('/llm', llmRouter);
const server = await new Promise(resolve => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});

test.after(() => {
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousKey;
  globalThis.fetch = originalFetch;
  server.closeAllConnections();
  return new Promise(resolve => server.close(resolve));
});

test('Gemini chat and Auto-Pilot credentials use the server key over a saved browser key', async () => {
  process.env.GEMINI_API_KEY = ' server-gemini-fixture ';
  const browserKey = 'stale-openrouter-fixture';
  assert.equal(modelCredential('gemini-3.6-flash', { get: () => browserKey }), 'server-gemini-fixture');
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).searchParams.get('key'), 'server-gemini-fixture');
    assert.equal(JSON.parse(options.body).contents[0].parts[0].text, 'Hello');
    calls++;
    return Response.json({ candidates: [{ content: { parts: [{ text: 'GEMINI_OK' }] }, finishReason: 'STOP' }] });
  };
  const response = await originalFetch(`http://127.0.0.1:${server.address().port}/llm/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': browserKey },
    body: JSON.stringify({ model: 'gemini-3.6-flash', messages: [{ role: 'user', content: 'Hello' }] }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, 'GEMINI_OK');
  assert.equal(calls, 1);
});

test('explicit Gemini request keys still work when no server key is configured', () => {
  delete process.env.GEMINI_API_KEY;
  assert.equal(getGeminiApiKey(' request-gemini-fixture '), 'request-gemini-fixture');
  assert.equal(modelCredential('gemini-3.6-flash', { get: () => 'request-gemini-fixture' }), 'request-gemini-fixture');
  assert.equal(getGeminiApiKey(), '');
  process.env.GEMINI_API_KEY = '   ';
  assert.equal(getGeminiApiKey('request-gemini-fixture'), 'request-gemini-fixture');
});
