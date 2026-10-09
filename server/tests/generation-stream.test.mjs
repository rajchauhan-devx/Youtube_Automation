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

test('research endpoint gathers topic & script data and returns structured research dossier and sources', async () => {
  const app = express(); app.use(express.json()); app.use('/llm', llmRouter);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const u = String(url);
    if (u.startsWith('https://en.wikipedia.org/w/api.php') && u.includes('list=search')) {
      return Response.json({ query: { search: [{ pageid: 101, title: 'Apollo 13', snippet: 'Lunar mission' }] } });
    }
    if (u.startsWith('https://en.wikipedia.org/w/api.php') && u.includes('prop=extracts')) {
      return Response.json({ query: { pages: { '101': { extract: 'Apollo 13 was the seventh crewed mission in the Apollo space program.' } } } });
    }
    if (u.startsWith('https://generativelanguage.googleapis.com/')) {
      const body = JSON.parse(options.body);
      assert.ok(Array.isArray(body.tools), 'Gemini research enables Google Search grounding');
      return Response.json({
        candidates: [{
          content: { parts: [{ text: '1. Verified Facts: Oxygen tank 2 ruptured at 55 hours 54 minutes.' }] },
          groundingMetadata: {
            groundingChunks: [{ web: { title: 'NASA Apollo 13 Archive', uri: 'https://www.nasa.gov/apollo13' } }],
          },
        }],
      });
    }
    return originalFetch(url, options);
  };
  try {
    const res = await originalFetch(`http://127.0.0.1:${server.address().port}/llm/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'fixture' },
      body: JSON.stringify({
        topic: 'Apollo 13 survival',
        template: '## SECTION 1 — Survival Story',
        instructions: 'Highlight Lovell and Haise',
        duration: 60,
        model: 'gemini-3.6-flash',
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.match(data.researchData, /Oxygen tank 2 ruptured/);
    assert.ok(data.sources.some(s => s.title === 'Apollo 13'));
    assert.ok(data.sources.some(s => s.title === 'NASA Apollo 13 Archive'));
  } finally {
    globalThis.fetch = originalFetch;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
