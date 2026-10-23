import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-migration-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const { normalizeSavedVoiceSettings } = await import('../dist/services/voice-settings.js');
const { AutoPilotSettingsSchema, defaultAutoPilotSettings } = await import('../dist/services/autopilot-settings.js');
const { store } = await import('../dist/services/store.js');
const { workspaceDir } = await import('../dist/services/workspace.js');

test('retired saved engines migrate to a valid Google narrator without changing project media', () => {
  const settings = defaultAutoPilotSettings();
  settings.voice = { ...settings.voice, provider: 'retired-local', language: 'hi', voiceId: 'old-reference', obsoleteKnob: 0.7 };
  const project = { id: 'saved', narration: 'मूल कहानी।', generatedAudio: [{ filename: 'original.wav', voice: 'old-reference' }], autoPilotSettings: settings };
  const original = structuredClone(project);
  const folder = workspaceDir(); fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'scripts.json'), JSON.stringify([project]));
  const result = store.getById('scripts', 'saved');
  assert.equal(result.autoPilotSettings.voice.provider, 'google');
  assert.equal(result.autoPilotSettings.voice.voiceId, 'hi-IN-Chirp3-HD-Charon');
  assert.equal('obsoleteKnob' in result.autoPilotSettings.voice, false);
  assert.equal(AutoPilotSettingsSchema.safeParse(result.autoPilotSettings).success, true);
  assert.deepEqual(result.generatedAudio, original.generatedAudio);
  assert.equal(result.narration, original.narration);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'scripts.json')))[0], original, 'opening a project does not rewrite files');
  assert.equal(AutoPilotSettingsSchema.safeParse(settings).success, false, 'new invalid API settings are rejected');
});

test('valid provider choices and delivery settings survive migration', () => {
  for (const [provider, voiceId] of [['google', 'en-US-Chirp3-HD-Kore'], ['edge', 'hi_madhur'], ['openrouter', 'en_brian'], ['omni', 'legacy']]) {
    const settings = defaultAutoPilotSettings(); Object.assign(settings.voice, { provider, voiceId, speed: 1.2 });
    const expected = structuredClone(settings);
    normalizeSavedVoiceSettings(settings);
    assert.deepEqual(settings, expected);
  }
});

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
