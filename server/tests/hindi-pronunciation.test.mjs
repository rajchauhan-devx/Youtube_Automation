import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hindi-pronunciation-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const submitted = [];
const app = express(); app.use(express.json());
app.get('/health', (_req, res) => res.json({ ready: true, state: 'ready' }));
app.post('/v1/audio/speech', (req, res) => { submitted.push(req.body); res.type('audio/wav').send(wave(1)); });
const engine = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
process.env.CHATTERBOX_URL = `http://127.0.0.1:${engine.address().port}`;
const dictionary = await import('../dist/services/hindi-pronunciation.js');
const { workspaceContext } = await import('../dist/services/workspace.js');
const { previewChatterbox, synthesizeChatterbox, chatterboxCacheIdentity } = await import('../dist/services/chatterbox-tts.js');
const { inspectVoiceReference } = await import('../dist/services/voice-reference.js');
const scope = accountId => ({ accountId, profile: 'shorts' });

test('corrections match complete Unicode words, longest phrases and literal punctuation in one pass', () => {
  const entries = { राम: 'रामजी', रामायण: 'राम कथा', 'New Delhi': 'नई दिल्ली', Delhi: 'दिल्ली', 'C++': 'सी प्लस प्लस', AI: 'ए आई', 'ए आई': 'बदला', pause: 'रुकें' };
  assert.equal(dictionary.applyHindiPronunciations('राम, रामायण और रामायणों। New Delhi, C++ और AI। [pause 0.6s]', entries),
    'रामजी, राम कथा और रामायणों। नई दिल्ली, सी प्लस प्लस और ए आई। [pause 0.6s]');
  assert.equal(dictionary.applyHindiPronunciations('फ़ैज़', { 'फ़ैज़': 'फ़ैज़ साहब' }), 'फ़ैज़ साहब');
});

test('invalid dictionaries cannot inject pause markup, duplicate normalized words or unbounded content', () => {
  for (const input of [null, [], { AI: '' }, { AI: '[pause 5s]' }, { AI: 'ए\nआई' }, Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`word${i}`, 'शब्द']))]) {
    assert.throws(() => dictionary.validatePronunciations(input));
  }
  assert.throws(() => dictionary.validatePronunciations({ ' AI ': 'ए आई', AI: 'ऐ' }));
});

test('saved corrections are private to an account and shared across its video profiles', () => {
  workspaceContext.run(scope('one'), () => dictionary.saveHindiPronunciations({ ChatGPT: 'चैट जी पी टी' }));
  workspaceContext.run(scope('two'), () => assert.deepEqual(dictionary.getHindiPronunciations(), {}));
  workspaceContext.run({ accountId: 'one', profile: 'long' }, () => assert.deepEqual(dictionary.getHindiPronunciations(), { ChatGPT: 'चैट जी पी टी' }));
});

test('Hindi previews apply corrections and invalidate preview/scene identities when edited; English is preserved', async () => {
  await workspaceContext.run(scope('preview'), async () => {
    const original = 'ChatGPT की कहानी।';
    const before = chatterboxCacheIdentity('hi');
    await previewChatterbox(original, 'builtin', 'hi', { seed: 42 });
    assert.equal(submitted.at(-1).input, original);
    dictionary.saveHindiPronunciations({ ChatGPT: 'चैट जी पी टी' });
    assert.notEqual(chatterboxCacheIdentity('hi'), before);
    const requests = submitted.length;
    await previewChatterbox(original, 'builtin', 'hi', { seed: 42 });
    assert.equal(submitted.length, requests + 1);
    assert.equal(submitted.at(-1).input, 'चैट जी पी टी की कहानी।');
    await previewChatterbox(original, 'builtin', 'hi', { seed: 42 });
    assert.equal(submitted.length, requests + 1, 'unchanged correction uses its own preview cache');
    await previewChatterbox('ChatGPT is useful.', 'builtin', 'en', { seed: 42 });
    assert.equal(submitted.at(-1).input, 'ChatGPT is useful.');
    dictionary.saveHindiPronunciations({});
    const beforeRestore = submitted.length;
    await previewChatterbox(original, 'builtin', 'hi', { seed: 42 });
    assert.equal(submitted.length, beforeRestore, 'the original Hindi preview was reused after restoring its exact settings');
  });
});

function wave(seconds, amplitude = 6000) {
  const count = Math.round(seconds * 24000);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) wav.writeInt16LE(amplitude === 32767 ? 32767 : Math.round(amplitude * Math.sin(i / 10)), 44 + i * 2);
  return wav;
}

test('pronunciation expansion cannot send an oversized request to the voice model', async () => {
  await workspaceContext.run(scope('oversized'), async () => {
    dictionary.saveHindiPronunciations({ X: 'क'.repeat(160) });
    const before = submitted.length;
    await assert.rejects(synthesizeChatterbox('X '.repeat(400), 'builtin', 'hi'), /after pronunciation corrections/);
    assert.equal(submitted.length, before);
  });
});

test('reference inspection rejects silence, short/padded clips and clipping; accepts a clear opening', () => {
  assert.equal(inspectVoiceReference(wave(8)).durationSeconds, 8);
  assert.throws(() => inspectVoiceReference(wave(2)), /6 seconds/);
  assert.throws(() => inspectVoiceReference(wave(8, 0)), /audible speech/);
  assert.throws(() => inspectVoiceReference(wave(8, 32767)), /clipped/);
  const padded = wave(8); padded.fill(0, 44 + 24000 * 2);
  assert.throws(() => inspectVoiceReference(padded), /audible speech/);
});

test.after(async () => {
  await new Promise(resolve => engine.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
});
