import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = `voices-test-${Date.now()}`;
const directory = path.join(serverRoot, 'data', id);
process.env.CHATTERBOX_VOICE_DIR = directory;
process.env.TTS_PROVIDER = 'chatterbox';
const wav = Buffer.alloc(44 + 24000 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const submitted = [];
const engineApp = express(); engineApp.use(express.json());
engineApp.get('/health', (_req, res) => res.json({ ready: true, state: 'ready' }));
engineApp.post('/v1/audio/speech', (req, res) => { submitted.push(req.body); res.type('audio/wav').send(wav); });
const engine = await new Promise(resolve => { const server = engineApp.listen(0, '127.0.0.1', () => resolve(server)); });
process.env.CHATTERBOX_URL = `http://127.0.0.1:${engine.address().port}`;
const { ttsRouter } = await import('../dist/routes/tts.js');
const app = express(); app.use(express.json({ limit: '12mb' })); app.use('/api/tts', ttsRouter);
const api = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const base = `http://127.0.0.1:${api.address().port}/api/tts`;
const request = (url, body, method = 'POST') => fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const dataUrl = `data:audio/wav;base64,${wav.toString('base64')}`;

test('English/Hindi references persist, play, and select the exact voice for generation', async () => {
  const voices = {};
  for (const language of ['en', 'hi']) {
    const response = await request('/voices', { name: `Test ${language}`, language, dataUrl });
    assert.equal(response.status, 201);
    voices[language] = (await response.json()).voice;
    assert.equal(voices[language].language, language);
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, `${voices[language].id}.json`), 'utf8'));
    assert.equal(metadata.language, language);
    const playback = await fetch(`${base}/voices/${voices[language].id}/reference`, { headers: { Range: 'bytes=0-43' } });
    assert.equal(playback.status, 206);
    assert.equal(Buffer.from(await playback.arrayBuffer()).toString('ascii', 0, 4), 'RIFF');
  }
  // Re-importing the service confirms the library is read from disk, not an upload-only cache.
  const reloaded = await import(`../dist/services/chatterbox-tts.js?restart=${Date.now()}`);
  for (const language of ['en', 'hi']) {
    const listed = (await (await fetch(`${base}/voices?language=${language}`)).json()).voices;
    assert.ok(listed.some(voice => voice.id === voices[language].id));
    assert.ok(!listed.some(voice => voice.id === voices[language === 'en' ? 'hi' : 'en'].id));
    assert.ok((await reloaded.getChatterboxVoices(language)).some(voice => voice.id === voices[language].id));
    const result = await request('/generate', { scriptId: id, language, voice: voices[language].id, text: language === 'en' ? 'Hello world.' : 'नमस्ते दुनिया।' });
    assert.equal(result.status, 200);
    assert.equal(submitted.at(-1).voice, voices[language].id);
    assert.equal(submitted.at(-1).language, language);
    const output = await result.json();
    assert.ok(fs.existsSync(path.join(serverRoot, 'data', 'generated', id, output.filename)));
  }
  const wrongLanguage = await request('/generate', { scriptId: id, language: 'hi', voice: voices.en.id, text: 'नमस्ते' });
  assert.equal(wrongLanguage.status, 400);
  const preview = await request('/preview', { language: 'en', voice: voices.en.id });
  assert.equal(preview.status, 200);
  const customPreview = await request('/preview', { language: 'en', voice: voices.en.id, text: 'A quiet moment... and then a surprise.', seed: 42 });
  assert.equal(customPreview.status, 200);
  assert.equal(submitted.at(-1).input, 'A quiet moment... and then a surprise.');
  assert.equal(submitted.at(-1).exaggeration, 0.5);
  assert.equal(submitted.at(-1).cfg_weight, 0.5);
  assert.equal(submitted.at(-1).seed, 42);
  assert.equal((await request('/preview', { language: 'en', text: 'x'.repeat(501) })).status, 400);
  assert.equal((await fetch(`${base}/voices/${voices.en.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${base}/voices/${voices.en.id}/reference`)).status, 404);
  assert.equal((await request('/preview', { language: 'en', voice: voices.en.id })).status, 400, 'deleted voices cannot use cached previews');
  assert.equal(submitted.length, 4, 'invalid selections must never reach the speech model');
});

test('invalid language and corrupt recordings fail without adding library entries', async () => {
  assert.equal((await fetch(`${base}/voices?language=fr`)).status, 400);
  assert.equal((await request('/voices', { name: 'Invalid', language: 'fr', dataUrl })).status, 400);
  const before = fs.readdirSync(directory);
  const invalid = `data:audio/wav;base64,${Buffer.alloc(2048, 65).toString('base64')}`;
  assert.equal((await request('/voices', { name: 'Corrupt', language: 'en', dataUrl: invalid })).status, 400);
  assert.deepEqual(fs.readdirSync(directory), before);
});

test.after(async () => {
  await Promise.all([new Promise(resolve => api.close(resolve)), new Promise(resolve => engine.close(resolve))]);
  for (const target of [directory, path.join(serverRoot, 'data', 'generated', id)]) {
    const relative = path.relative(serverRoot, path.resolve(target));
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(target) === id);
    fs.rmSync(target, { recursive: true, force: true });
  }
});
