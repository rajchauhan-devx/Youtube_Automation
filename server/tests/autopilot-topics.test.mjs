import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { google } from 'googleapis';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-topic-notes-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const ws = await import('../dist/services/workspace.js');
const accounts = await import('../dist/services/accounts.js');
const notes = await import('../dist/services/topic-notes.js');
const { selectAutoPilotTopic } = await import('../dist/services/autopilot-topic.js');
const { store } = await import('../dist/services/store.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const auth = await import('../dist/services/youtube-auth.js');
const a = accounts.createAccount('Rule Zero');
const b = accounts.createAccount('Against the Odds');
notes.initializeTopicNotes();
const scope = (accountId = 'default', profile = 'shorts') => ({ accountId, profile });
const entry = (topic, videoId = 'first-video') => ({ topic, scriptId: 'production', profile: 'shorts', videoId, videoUrl: `https://youtu.be/${videoId}`, uploadedAt: '2026-10-19T12:00:00.000Z' });
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('three separate notes files share topic history across formats and isolate accounts', async () => {
  const files = ['default', a.id, b.id].map(id => notes.topicNotesPath(id));
  assert.equal(new Set(files).size, 3);
  assert.ok(files.every(file => fs.existsSync(file)));
  assert.match(notes.readTopicNotes(a.id).guidance, /fictional microdramas/);
  ws.workspaceContext.run(scope(a.id), () => {
    notes.recordUploadedTopic(entry('A city where nobody can lie'));
    notes.recordUploadedTopic(entry('A city where nobody can lie'));
    assert.equal(notes.readTopicNotes().topics.length, 1, 'repeated receipt does not duplicate the entry');
  });
  ws.workspaceContext.run(scope(a.id, 'mixed'), () => assert.equal(notes.readTopicNotes().topics.length, 1));
  ws.workspaceContext.run(scope(b.id), () => assert.equal(notes.readTopicNotes().topics.length, 0));
  assert.equal(notes.repeatedTopic('A CITY where nobody can lie!!!', notes.readTopicNotes(a.id).topics), 'A city where nobody can lie');
  assert.equal(notes.repeatedTopic('A different world with invisible doors', notes.readTopicNotes(a.id).topics), undefined);
});

test('history recovers legacy successful exports and receipts without marking unexported work', () => {
  ws.workspaceContext.run(scope(b.id, 'long'), () => {
    store.add('scripts', { id: 'legacy', topicName: 'Apollo 13 survival', youtubeExport: { uploadedVideoId: 'apollo', uploadedAt: '2026-10-01' } });
    store.add('scripts', { id: 'unfinished', topicName: 'Never uploaded', aiResponse: 'Rendered draft' });
    const output = path.join(ws.outputDir(), 'deleted-script');
    fs.mkdirSync(output, { recursive: true });
    accounts.atomicJson(path.join(output, 'upload_receipt.json'), { topic: 'Shackleton and the Endurance', videoId: 'receipt', uploadedAt: '2026-10-02' });
  });
  ws.workspaceContext.run(scope(b.id), () => {
    const history = notes.syncTopicNotes();
    assert.deepEqual(history.topics.map(entry => entry.topic), ['Apollo 13 survival', 'Shackleton and the Endurance']);
    assert.ok(history.topics.every(entry => entry.profile === 'long'));
    assert.equal(notes.syncTopicNotes().topics.length, 2);
  });
});

test('AI research receives this profile, template and full history; rejects exact and semantic repeats', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let candidates = [
    { topic: 'Apollo 13 survival!', duplicateOf: null },
    { topic: 'How the Endurance crew escaped Antarctica', duplicateOf: 'Shackleton and the Endurance' },
    { topic: 'Juliane Koepcke survives the Amazon', reason: 'A verified survival story with a clear hook.', duplicateOf: null },
  ];
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.match(String(url), /generativelanguage/);
    const body = JSON.parse(options.body);
    const prompt = body.contents[0].parts[0].text;
    assert.match(prompt, /Against the Odds/);
    assert.match(prompt, /Apollo 13 survival/);
    assert.match(prompt, /Shackleton and the Endurance/);
    assert.match(prompt, /survival documentary template/);
    assert.doesNotMatch(prompt, /nobody can lie/);
    assert.ok(body.tools, 'automatic discovery enables live Google Search grounding');
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ candidates }) }] } }] });
  };
  const request = { template: 'survival documentary template', instructions: 'Use verifiable stories', duration: 60, model: 'gemini-test', apiKey: 'fixture' };
  try {
    await ws.workspaceContext.run(scope(b.id), async () => {
      const result = await selectAutoPilotTopic(request);
      assert.equal(result.topic, 'Juliane Koepcke survives the Amazon');
      assert.equal(result.historyCount, 2);
      assert.equal(notes.readTopicNotes().topics.length, 2, 'selection is not an upload');
      await assert.rejects(selectAutoPilotTopic({ ...request, topic: 'APOLLO 13 survival!!!' }), /already exported/);
      assert.equal(requests, 1, 'known repeats fail before calling a provider');
      candidates = [{ topic: 'Reworded old subject', duplicateOf: 'Apollo 13 survival' }];
      await assert.rejects(selectAutoPilotTopic(request), /fresh topic/);
    });
  } finally { globalThis.fetch = originalFetch; }
});

test('corrupt notes fail closed and are preserved', () => {
  const file = notes.topicNotesPath(a.id);
  const original = fs.readFileSync(file, 'utf8');
  try {
    fs.writeFileSync(file, '{broken notes');
    assert.throws(() => notes.readTopicNotes(a.id));
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken notes');
  } finally { fs.writeFileSync(file, original); }
});

test('only successful YouTube uploads record topics; the server persists history and export results', async () => {
  const originalYoutube = google.youtube;
  let failUpload = true, uploadCalls = 0;
  google.youtube = () => ({
    channels: { list: async () => ({ data: { items: [{ id: 'fixture-channel', snippet: { title: 'Fixture' } }] } }) },
    videos: { insert: async options => {
      uploadCalls++;
      options.media.body.destroy();
      if (failUpload) throw new Error('Fixture upload failed');
      return { data: { id: 'successful-upload' } };
    } },
  });
  accounts.atomicJson(auth.CLIENT_SECRET_PATH, { installed: { client_id: 'fixture', client_secret: 'fixture' } });
  accounts.atomicJson(accounts.tokenPath('default'), { access_token: 'fixture', refresh_token: 'fixture' });
  ws.workspaceContext.run(scope(), () => {
    store.add('scripts', { id: 'production', topicName: 'The meaning of dharma', prompts: [] });
    const output = path.join(ws.outputDir(), 'production');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'render.mp4'), 'fixture-video');
  });
  const app = express(); app.use(express.json());
  app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/accounts/default/profiles/shorts`;
  const upload = () => fetch(`${base}/youtube/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptId: 'production', videoFilename: 'render.mp4', title: 'Dharma explained' }) });
  try {
    const blocked = await fetch(`${base}/youtube/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptId: 'production', videoFilename: 'render.mp4', title: 'Dharma explained', autoPilot: true }) });
    assert.equal(blocked.status, 409, 'Auto-Pilot cannot upload without a passing rendered review');
    const failed = await upload();
    assert.equal(failed.status, 500);
    assert.equal(notes.readTopicNotes('default').topics.length, 0);
    failUpload = false;
    const uncertain = await upload(); assert.equal(uncertain.status, 409, 'An ambiguous upload failure must not automatically send the same video again');
    const pending = (await (await fetch(`${base}/youtube/upload-status/production`)).json()).uploads[0];
    const allowRetry = await fetch(`${base}/youtube/uploads/${pending.id}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmedNoVideo: true }) });
    assert.equal(allowRetry.status, 200);
    const successful = await upload();
    assert.equal(successful.status, 200, await successful.clone().text());
    assert.equal((await successful.json()).topicHistorySaved, true);
    assert.equal((await (await upload()).json()).reused, true);
    assert.equal(uploadCalls, 2, 'A completed render must reuse its upload receipt');
    assert.equal(notes.readTopicNotes('default').topics[0].topic, 'The meaning of dharma');
    ws.workspaceContext.run(scope(), () => assert.equal(store.getById('scripts', 'production').youtubeExport.uploadedVideoId, 'successful-upload'));
    const history = await (await fetch(`${base}/llm/topic-notes`)).json();
    assert.equal(history.topics.length, 1);
    const repeat = await fetch(`${base}/llm/autopilot-topic`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'fixture' }, body: JSON.stringify({ scriptId: 'production', topic: 'The meaning of dharma!' }) });
    assert.equal(repeat.status, 422);
    assert.match((await repeat.json()).error, /already exported/);
  } finally {
    google.youtube = originalYoutube;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
