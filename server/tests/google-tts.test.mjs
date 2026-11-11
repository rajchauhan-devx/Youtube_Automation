import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'google-speech-'));
process.env.TUBEFLOW_DATA_DIR = directory;
process.env.TTS_PROVIDER = 'google';
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(directory, 'adc.json');
fs.writeFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, JSON.stringify({ quota_project_id: 'speech-test', refresh_token: 'fixture', client_id: 'fixture', client_secret: 'fixture' }));
const originalFetch = globalThis.fetch;
const submitted = [];
let fault;
const wav = () => {
  const buffer = Buffer.alloc(44 + 4800);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24000, 24); buffer.writeUInt32LE(48000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(4800, 40); buffer.fill(1, 44);
  return buffer;
};
globalThis.fetch = async (url, options) => {
  if (String(url) === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
  if (String(url).startsWith('https://texttospeech.googleapis.com/v1/')) {
    assert.equal(options.headers['X-Goog-User-Project'], 'speech-test');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    if (String(url).endsWith('/voices') && fault === 'catalog-disabled') return Response.json({ error: { details: [{ reason: 'SERVICE_DISABLED' }] } }, { status: 403 });
    if (String(url).endsWith('/voices')) return Response.json({ voices: [
      ...['hi-IN', 'en-IN', 'en-US', 'fr-FR'].map(locale => ({ name: `${locale}-Chirp3-HD-Charon`, ssmlGender: 'MALE' })),
      { name: 'hi-IN-Standard-A', ssmlGender: 'FEMALE' },
    ] });
    submitted.push(JSON.parse(options.body));
    if (fault === 'quota') return Response.json({ error: { message: 'quota exhausted' } }, { status: 429 });
    if (fault === 'disabled') return Response.json({ error: { details: [{ reason: 'SERVICE_DISABLED' }] } }, { status: 403 });
    return Response.json({ audioContent: (fault === 'audio' ? Buffer.from('not a wave') : wav()).toString('base64') });
  }
  return originalFetch(url, options);
};
const { getGoogleTtsVoices, synthesizeGoogleTts, previewGoogleTts, splitGoogleTtsText } = await import('../dist/services/google-tts.js');
const { getVoices, generateTTS, previewTTS, resolveTtsProvider } = await import('../dist/services/omnivoice.js');
const { defaultAutoPilotSettings, AutoPilotSettingsSchema, narrationOptions } = await import('../dist/services/autopilot-settings.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const app = express(); app.use(express.json()); app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const base = `http://127.0.0.1:${server.address().port}/api/accounts/default/profiles/shorts`;

test('voice loading returns the actionable Cloud setup error through the API', async () => {
  fault = 'catalog-disabled';
  try {
    const response = await fetch(`${base}/tts/voices?provider=google&language=hi`);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Enable the Cloud Text-to-Speech API/);
  } finally { fault = undefined; }
});

test('Google catalogs expose only Chirp HD Hindi and English with exact voice IDs and Cloud project billing', async () => {
  const hi = await getVoices('hi', 'google'), en = await getVoices('en', 'google');
  assert.deepEqual(hi.map(v => v.id), ['hi-IN-Chirp3-HD-Charon']);
  assert.deepEqual(en.map(v => v.id).sort(), ['en-IN-Chirp3-HD-Charon', 'en-US-Chirp3-HD-Charon']);
  assert.ok([...hi, ...en].every(v => v.source === 'provider' && v.deletable === false));
  await assert.rejects(getGoogleTtsVoices('fr'), /Hindi or English/);
  assert.equal(resolveTtsProvider(), 'google');
});

test('Hindi chunking uses UTF-8 bytes and preserves combining sequences, punctuation and every word', () => {
  const text = 'कृष्ण और अर्जुन की कहानी है। '.repeat(200).trim();
  const chunks = splitGoogleTtsText(text);
  assert.ok(chunks.length > 1 && chunks.every(chunk => Buffer.byteLength(chunk) <= 4500));
  assert.equal(chunks.join(' '), text);
  const giant = 'क्षि'.repeat(4000);
  const pieces = splitGoogleTtsText(giant, 80);
  assert.equal(pieces.join(''), giant);
  assert.ok(pieces.every(chunk => !/^[\u093e-\u094d]/u.test(chunk) && Buffer.byteLength(chunk) <= 80));
});

test('long Hindi synthesis joins real PCM chunks and never changes voice or reads pause tags', async () => {
  const before = submitted.length;
  const result = await synthesizeGoogleTts('यह हमारी कहानी है। [pause 1s] '.repeat(220), 'hi-IN-Chirp3-HD-Charon', 'hi', 1.1);
  const requests = submitted.slice(before);
  assert.ok(requests.length > 1);
  assert.ok(requests.every(r => r.voice.languageCode === 'hi-IN' && r.voice.name === 'hi-IN-Chirp3-HD-Charon' && r.audioConfig.speakingRate === 1.1));
  assert.ok(requests.every(r => Buffer.byteLength(r.input.text) <= 4500 && !r.input.text.includes('[pause')));
  assert.equal(result.length, 44 + requests.length * 4800);
  const count = submitted.length;
  await assert.rejects(synthesizeGoogleTts('नमस्ते।', 'en-US-Chirp3-HD-Charon', 'hi'), /this language/);
  await assert.rejects(synthesizeGoogleTts('Hello.', 'builtin', 'en'), /this language/);
  assert.equal(submitted.length, count, 'invalid voice never triggers billable synthesis');
});

test('preview and generation use identical Google engine, language, voice and speed; repeated previews are cached', async () => {
  const settings = defaultAutoPilotSettings();
  Object.assign(settings.voice, { provider: 'google', language: 'hi', voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 1.15 });
  assert.equal(AutoPilotSettingsSchema.safeParse(settings).success, true);
  const options = narrationOptions(settings, 'en');
  const before = submitted.length;
  const [a, b] = await Promise.all([previewTTS({ ...options, text: 'नमस्ते दुनिया।' }), previewTTS({ ...options, text: 'नमस्ते दुनिया।' })]);
  assert.equal(a.contentType, 'audio/wav'); assert.deepEqual(a.buffer, b.buffer);
  await previewTTS({ ...options, text: 'नमस्ते दुनिया।' });
  assert.equal(submitted.length - before, 1);
  const sampleRequest = submitted.at(-1);
  const result = await generateTTS({ ...options, scriptId: 'narration', text: 'नमस्ते दुनिया।' });
  assert.deepEqual(submitted.at(-1), sampleRequest);
  assert.ok(result.filename.endsWith('.wav'));
  assert.equal(result.narrationText, 'नमस्ते दुनिया।');
  assert.equal(resolveTtsProvider(), 'google');
});

test('Google scene narration preserves measured sync, reuses cached scenes and invalidates changed delivery', async () => {
  const { assembleNarration } = await import('../dist/services/long-narration.js');
  const plan = { version: 1, title: 'Hindi scene narration', thumbnailPrompt: 'A scene', scenes: [
    { id: 'one', chapter: 'Opening', role: 'story', narration: 'यह पहली कहानी है।', imagePrompt: 'A forest' },
    { id: 'two', chapter: 'Ending', role: 'story', narration: 'यह दूसरी कहानी है।', imagePrompt: 'A river' },
  ] };
  const options = { provider: 'google', language: 'hi', voice: 'hi-IN-Chirp3-HD-Charon', speed: 1, scriptId: 'google-scenes' };
  const before = submitted.length;
  const first = await assembleNarration(plan, options, new AbortController().signal, () => {});
  assert.equal(first.provider, 'google'); assert.equal(first.sync.scenes.length, 2);
  assert.equal(first.sync.totalSamples, 9600);
  assert.equal(submitted.length, before + 2);
  const cached = await assembleNarration(plan, options, new AbortController().signal, () => {});
  assert.deepEqual(cached.sync, first.sync); assert.equal(submitted.length, before + 2);
  await assembleNarration(plan, { ...options, speed: 1.1 }, new AbortController().signal, () => {});
  assert.equal(submitted.length, before + 4, 'changed speed cannot reuse the old scene audio');
});

test('quota, disabled service and invalid audio surface actionable errors without a fallback', async () => {
  try {
    for (const [kind, pattern] of [['quota', /quota/], ['disabled', /Enable the Cloud Text-to-Speech API/], ['audio', /invalid WAV/]]) {
      fault = kind;
      await assert.rejects(previewGoogleTts(`Test ${kind}.`, 'en-IN-Chirp3-HD-Charon', 'en'), pattern);
    }
    fault = undefined;
    assert.ok((await previewGoogleTts('Test quota.', 'en-IN-Chirp3-HD-Charon', 'en')).length > 44, 'failed previews are not cached');
  } finally { fault = undefined; }
});

test('HTTP engine selection, real preview MIME, language validation and run settings survive persistence', async () => {
  const providers = await (await fetch(`${base}/tts/providers`)).json();
  assert.equal(providers.defaultProvider, 'google');
  assert.ok(providers.providers.some(p => p.id === 'google' && p.configured && p.kind === 'cloud'));
  const response = await fetch(`${base}/tts/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'google', voice: 'en-IN-Chirp3-HD-Charon', language: 'en', text: 'Hello from the preview.' }) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'audio/wav');
  assert.equal(Buffer.from(await response.arrayBuffer()).toString('ascii', 0, 4), 'RIFF');
  assert.equal((await fetch(`${base}/tts/voices?provider=google&language=fr`)).status, 400);
  const settings = defaultAutoPilotSettings(); Object.assign(settings.voice, { provider: 'google', language: 'hi', voiceId: 'hi-IN-Chirp3-HD-Charon' });
  const saved = await fetch(`${base}/scripts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'google-run', name: 'Google narration', status: 'draft', prompts: [], autoPilotSettings: settings }) });
  assert.equal(saved.status, 201);
  assert.deepEqual((await (await fetch(`${base}/scripts/google-run`)).json()).autoPilotSettings.voice, settings.voice);
});

test.after(async () => { globalThis.fetch = originalFetch; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
