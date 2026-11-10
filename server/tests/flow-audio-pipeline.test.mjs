import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Google Flow voice provider is registered and recognized across services', async () => {
  const { resolveTtsProvider, ttsProviderName, getVoices, getTtsProviderStatus } = await import('../dist/services/omnivoice.js');
  const { VoiceProvider } = await import('../dist/services/autopilot-settings.js');

  assert.equal(resolveTtsProvider('flow'), 'flow');
  assert.equal(VoiceProvider.parse('flow'), 'flow');
  assert.match(ttsProviderName('flow'), /Google Flow/i);

  const status = await getTtsProviderStatus('flow');
  assert.equal(status.online, true);
  assert.equal(status.ready, true);
  assert.equal(status.providerKind, 'native');

  const voices = await getVoices('hi', 'flow');
  assert.ok(voices.length > 0);
  assert.equal(voices[0].id, 'flow-native');
  assert.match(voices[0].name, /Google Flow Native/i);
});

test('probeHasAudio correctly identifies audio streams in Google Flow MP4 video clips', async () => {
  const { probeHasAudio } = await import('../dist/services/video.js');
  const sampleVideo = path.join(__dirname, '..', 'data', 'flow', 'downloads', 'flow_c784bb09-ee4d-4acf-91e1-aef9f90fef2a.mp4');

  if (fs.existsSync(sampleVideo)) {
    const hasAudio = await probeHasAudio(sampleVideo);
    assert.equal(hasAudio, true, 'Flow video should contain native 48kHz audio stream');
  }
});

test('Flow native audio extraction assembles sample-perfect scene sync and dialogue turns', async () => {
  const { assembleNarration } = await import('../dist/services/long-narration.js');
  const sampleVideo = path.join(__dirname, '..', 'data', 'flow', 'downloads', 'flow_c784bb09-ee4d-4acf-91e1-aef9f90fef2a.mp4');

  if (!fs.existsSync(sampleVideo)) return;

  const testScriptId = 'test_flow_extract_' + Date.now();
  const testDir = path.join(__dirname, '..', 'data', 'generated', testScriptId);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // Copy sample video as import_0 and import_1
    fs.copyFileSync(sampleVideo, path.join(testDir, 'import_0_test.mp4'));
    fs.copyFileSync(sampleVideo, path.join(testDir, 'import_1_test.mp4'));

    const plan = {
      version: 1,
      title: 'Ramayana Dialogue Flow Test',
      thumbnailPrompt: 'Scene prompt',
      scenes: [
        { id: 's1', role: 'story', chapter: 'Part 1', narration: '[सीता]: दशग्रीव! यह तिनका ही तेरी सीमा है!', imagePrompt: 'Sita', mediaType: 'video' },
        { id: 's2', role: 'story', chapter: 'Part 2', narration: '[रावण]: हास्यस्पद! त्रिलोक विजेता रावण को तिनके से रोकोगी?', imagePrompt: 'Ravana', mediaType: 'video' },
      ],
    };

    const options = {
      provider: 'flow',
      language: 'hi',
      voice: 'flow-native',
      scriptId: testScriptId,
      conversational: true,
    };

    const result = await assembleNarration(plan, options, new AbortController().signal, () => {});
    assert.equal(result.provider, 'flow');
    assert.equal(result.voice, 'flow-native');
    assert.equal(result.sync.scenes.length, 2);
    assert.ok(result.sync.totalSamples > 0);
    assert.ok(fs.existsSync(path.join(testDir, result.filename)), 'Master WAV must exist on disk');
    assert.ok(fs.existsSync(path.join(testDir, `${result.filename}.sync.json`)), 'Sync JSON must exist');
    assert.ok(result.turns && result.turns.length === 2, 'Dialogue turns must be recorded');
    assert.equal(result.turns[0].speaker, 'सीता');
    assert.equal(result.turns[1].speaker, 'रावण');
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
