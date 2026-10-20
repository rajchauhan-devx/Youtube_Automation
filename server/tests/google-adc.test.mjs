import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAdcFilePath, isAdcConfigured, getGoogleAuthToken } from '../dist/services/google-adc.js';
import { chat, geminiRequestTarget } from '../dist/services/gemini.js';
import { runGeminiGroundedResearch } from '../dist/services/script-research.js';
import { llmRouter } from '../dist/routes/llm.js';
import express from 'express';

const names = ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'CLOUDSDK_CONFIG', 'APPDATA', 'XDG_CONFIG_HOME', 'GEMINI_USE_ADC', 'GEMINI_API_KEY'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-adc-test-'));
const originalFetch = globalThis.fetch;
test.beforeEach(() => {
  for (const name of names) delete process.env[name];
});
test.after(() => {
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
  globalThis.fetch = originalFetch;
  assert.ok(directory.startsWith(path.join(os.tmpdir(), 'tubeflow-adc-test-')));
  fs.rmSync(directory, { recursive: true, force: true });
});

test('an explicit ADC file takes priority over SDK and platform defaults', () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(directory, 'explicit.json');
  process.env.CLOUDSDK_CONFIG = path.join(directory, 'sdk');
  process.env.APPDATA = path.join(directory, 'roaming');
  assert.equal(getAdcFilePath(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
  assert.equal(isAdcConfigured(), false);
});

test('ADC honors a custom Cloud SDK configuration directory', () => {
  process.env.CLOUDSDK_CONFIG = path.join(directory, 'custom-sdk');
  process.env.APPDATA = path.join(directory, 'roaming');
  assert.equal(getAdcFilePath(), path.join(process.env.CLOUDSDK_CONFIG, 'application_default_credentials.json'));
});

test('ADC discovers the platform credential file and refreshes it without an explicit path', async () => {
  process.env.APPDATA = path.join(directory, 'roaming');
  process.env.XDG_CONFIG_HOME = path.join(directory, 'config');
  const expected = path.join(process.platform === 'win32' ? process.env.APPDATA : process.env.XDG_CONFIG_HOME,
    'gcloud', 'application_default_credentials.json');
  assert.equal(getAdcFilePath(), expected);
  fs.mkdirSync(path.dirname(expected), { recursive: true });
  fs.writeFileSync(expected, JSON.stringify({ type: 'authorized_user', client_id: 'fixture-id', client_secret: 'fixture-secret', refresh_token: 'fixture-refresh', quota_project_id: 'fixture-project' }));
  assert.equal(isAdcConfigured(), true);
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(options.body.get('refresh_token'), 'fixture-refresh');
    calls++;
    return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
  };
  assert.deepEqual(await getGoogleAuthToken(), { token: 'fixture-access', projectId: 'fixture-project' });
  assert.deepEqual(await getGoogleAuthToken(), { token: 'fixture-access', projectId: 'fixture-project' });
  assert.equal(calls, 1);
});

test('ADC text mode routes chat, grounded research and streaming to the selected Cloud project', async () => {
  process.env.GEMINI_USE_ADC = 'true';
  process.env.GEMINI_API_KEY = 'unused-api-key';
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(directory, 'adc-text.json');
  fs.writeFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, JSON.stringify({ type: 'authorized_user', client_id: 'fixture-id', client_secret: 'fixture-secret', refresh_token: 'fixture-refresh', quota_project_id: 'fixture-project' }));
  const urls = [];
  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    urls.push(url);
    assert.equal(new URL(url).hostname, 'aiplatform.googleapis.com');
    assert.ok(!String(url).includes('unused-api-key'));
    assert.equal(options.headers.Authorization, 'Bearer fixture-access');
    assert.equal(options.headers['X-Goog-User-Project'], 'fixture-project');
    const output = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'GEMINI_OK' }] } }] };
    return String(url).includes(':streamGenerateContent')
      ? new Response(`data: ${JSON.stringify(output)}\n\n`)
      : Response.json(output);
  };
  const request = { model: 'gemini-3.6-flash', messages: [{ role: 'user', content: 'Hello' }] };
  assert.equal((await chat('unused-api-key', request)).choices[0].message.content, 'GEMINI_OK');
  assert.equal((await runGeminiGroundedResearch('unused-api-key', request.model, request.messages)).text, 'GEMINI_OK');
  const app = express(); app.use(express.json()); app.use('/llm', llmRouter);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/llm/chat/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
    });
    assert.match(await response.text(), /GEMINI_OK/);
    assert.equal(urls.length, 3);
    assert.match(urls[2], /:streamGenerateContent\?alt=sse$/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  delete process.env.GEMINI_USE_ADC;
  const keyTarget = await geminiRequestTarget(request.model, 'generateContent', 'key-fixture');
  assert.equal(new URL(keyTarget.url).hostname, 'generativelanguage.googleapis.com');
  assert.equal(new URL(keyTarget.url).searchParams.get('key'), 'key-fixture');
  assert.equal(keyTarget.headers.Authorization, undefined);
});
