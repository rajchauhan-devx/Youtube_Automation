import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-run-settings-'));
process.env.TUBEFLOW_DATA_DIR = directory;
process.env.TTS_PROVIDER = 'google';
process.env.OPENROUTER_API_KEY = 'fixture-key';
const { AutoPilotSettingsSchema, defaultAutoPilotSettings, narrationOptions } = await import('../dist/services/autopilot-settings.js');
const { getVoices, resolveTtsProvider, TTS_PROVIDER, generateTTS } = await import('../dist/services/omnivoice.js');
const { retentionEditing, productionHash } = await import('../dist/services/retention.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const { store } = await import('../dist/services/store.js');
const { renderRevision } = await import('../dist/services/render-revision.js');
const app = express(); app.use(express.json()); app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/api/accounts/default/profiles/shorts`;
const post = (url, body, method = 'POST') => fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const settings = defaultAutoPilotSettings();

test('run settings validate real controls and preserve independent graphics and caption choices', () => {
  assert.equal(settings.graphics.enabled, false, 'graphics are opt-in');
  const a = structuredClone(settings); a.media.flowResolution = '1080p'; a.media.flowDuration = 4;
  a.graphics.enabled = false; a.captions = 'motion'; a.voice.provider = 'edge'; a.voice.voiceId = 'en_brian';
  assert.deepEqual(AutoPilotSettingsSchema.parse(a), a);
  assert.equal(AutoPilotSettingsSchema.safeParse({ ...a, media: { ...a.media, flowResolution: '4k' } }).success, false);
  assert.equal(AutoPilotSettingsSchema.safeParse({ ...a, audio: { ...a.audio, musicVolume: 7 } }).success, false);
  assert.equal(AutoPilotSettingsSchema.safeParse({ ...a, voice: { ...a.voice, voiceId: '' } }).success, false);
  assert.equal(AutoPilotSettingsSchema.safeParse({ ...a, editing: { mode: 'custom', settings: {} } }).success, false);
});

test('publishing preferences make scheduling explicit and reject a missing date', () => {
  const a = structuredClone(settings); a.youtube.publishMode = 'schedule';
  assert.equal(AutoPilotSettingsSchema.safeParse(a).success, false);
  a.youtube.scheduledPublishAt = new Date(Date.now() + 3600000).toISOString();
  assert.equal(AutoPilotSettingsSchema.safeParse(a).success, true);
});

test('narration tuning is routed to the selected engine without changing the configured default', async () => {
  const a = structuredClone(settings); Object.assign(a.voice, { provider: 'edge', language: 'hi', voiceId: 'hi_madhur', rate: 15, pitch: -3 });
  const options = narrationOptions(a, 'en');
  assert.equal(options.provider, 'edge'); assert.equal(options.language, 'hi'); assert.equal(options.voice, 'hi_madhur');
  assert.equal(options.rate, '+15%'); assert.equal(options.pitch, '-3Hz');
  const [edge, cloud] = await Promise.all([getVoices('hi', 'edge'), getVoices('en', 'openrouter')]);
  assert.ok(edge.some(v => v.language === 'hi')); assert.ok(cloud.some(v => v.language === 'en'));
  assert.equal(resolveTtsProvider(), TTS_PROVIDER); assert.equal(TTS_PROVIDER, 'google');
  assert.throws(() => resolveTtsProvider('unknown'), /supported voice engine/);
});

test('a per-run cloud engine reaches its own synthesis adapter without changing the Google default', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://openrouter.ai/api/v1/audio/speech');
    request = JSON.parse(options.body);
    return new Response(Buffer.alloc(256, 1), { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  try {
    const audio = await generateTTS({ scriptId: 'provider-test', text: 'A short test.', language: 'en', voice: 'en_brian', provider: 'openrouter', speed: 1.25 });
    assert.equal(request.voice, 'onyx'); assert.equal(request.speed, 1.25);
    assert.equal(audio.filename.endsWith('.mp3'), true);
    assert.equal(resolveTtsProvider(), 'google');
  } finally { globalThis.fetch = originalFetch; }
});

test('HTTP settings persist before a run; invalid saves do not overwrite settings and Clear retains preferences', async () => {
  const script = { id: 'run-settings', name: 'Test template', status: 'draft', prompts: [], duration: 30, enableSubtitles: false, autoPilotSettings: settings };
  assert.equal((await post('/scripts', script)).status, 201);
  const next = structuredClone(settings); next.media.flowResolution = '1080p'; next.graphics.enabled = false; next.captions = 'motion';
  assert.equal((await post('/scripts/run-settings', { autoPilotSettings: next, editingProjectId: null }, 'PUT')).status, 200);
  const saved = await (await fetch(base + '/scripts/run-settings')).json(); assert.deepEqual(saved.autoPilotSettings, next); assert.equal(saved.editingProjectId, null);
  const before = renderRevision('run-settings');
  assert.equal((await post('/scripts/run-settings', { autoPilotSettings: { ...next, audio: { ...next.audio, musicVolume: 4 } } }, 'PUT')).status, 400);
  assert.deepEqual((await (await fetch(base + '/scripts/run-settings')).json()).autoPilotSettings, next);
  assert.equal((await post('/scripts/run-settings/clear', {})).status, 200);
  assert.deepEqual((await (await fetch(base + '/scripts/run-settings')).json()).autoPilotSettings, next);
  assert.equal((await fetch(base + '/tts/voices?provider=unsupported')).status, 400);
  const providers = await (await fetch(base + '/tts/providers')).json();
  assert.equal(providers.defaultProvider, 'google'); assert.ok(providers.providers.some(p => p.id === 'edge'));
  const voices = await (await fetch(base + '/tts/voices?provider=edge&language=hi')).json();
  assert.equal(voices.provider, 'Edge Neural TTS'); assert.ok(voices.voices.every(v => v.language === 'hi'));
  assert.equal(typeof before, 'string');
});

test('custom and disabled editing override prior presets; changed run settings invalidate review and render identity', () => {
  const original = { id: 'identity', narration: 'One scene.', retentionPlan: {}, retentionEdit: { sceneDirections: [] }, enableSubtitles: false };
  const a = structuredClone(settings); a.editing.mode = 'custom'; a.editing.settings.motion = 'off'; a.editing.settings.voicePolish = false; a.captions = 'motion';
  const edited = retentionEditing({ ...original, autoPilotSettings: a });
  assert.equal(edited.motion, 'off'); assert.equal(edited.voicePolish, false); assert.equal(edited.captions, false);
  const first = { ...original, autoPilotSettings: a }; store.add('scripts', first);
  const hash = productionHash(first), revision = renderRevision(first.id);
  const b = structuredClone(a); b.editing.mode = 'off'; b.audio.music = 'none';
  assert.equal(retentionEditing({ ...original, autoPilotSettings: b }).enabled, false);
  assert.notEqual(productionHash({ ...original, autoPilotSettings: b }), hash);
  store.add('scripts', { ...first, autoPilotSettings: b }); assert.notEqual(renderRevision(first.id), revision);
});

test.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
