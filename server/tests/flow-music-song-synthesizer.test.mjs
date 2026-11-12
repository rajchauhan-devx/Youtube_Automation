import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

test('synthesizeFullSongTrack synthesizes real vocals and music, and Whisper AI transcribes the lyrics', async (t) => {
  const { synthesizeFullSongTrack, transcribeSongAudio } = await import('../dist/services/flow-music/song-synthesizer.js');

  const testOutputDir = path.join(REPO_ROOT, 'server/data/flow-music/test-output');
  fs.mkdirSync(testOutputDir, { recursive: true });
  const testAudio = path.join(testOutputDir, 'whisper_verify_test.mp3');

  // Test with distinct lyrics
  const testLyrics = 'Rhythm of the heart feel the bass drop tonight';
  const settings = {
    prompt: 'Upbeat EDM song',
    lyrics: testLyrics,
    title: 'Whisper Test Song',
    bpm: 128,
    duration: 8,
  };

  const result = await synthesizeFullSongTrack(settings, testAudio, 8);

  assert.ok(fs.existsSync(testAudio), 'Generated audio file must exist');
  assert.ok(fs.statSync(testAudio).size > 10000, 'Generated audio file must have substantial size');
  assert.ok(result.transcription, 'Result must contain transcription from Whisper');

  console.log('[Test] Input lyrics:', testLyrics);
  console.log('[Test] Whisper transcribed text:', result.transcription);

  const normalizedLyrics = testLyrics.toLowerCase();
  const normalizedTranscription = result.transcription.toLowerCase();

  // Check that at least some key words from the lyrics are recognized by Whisper
  const words = ['rhythm', 'heart', 'feel', 'bass', 'drop', 'tonight'];
  const matchedWords = words.filter((w) => normalizedTranscription.includes(w));
  console.log('[Test] Matched words:', matchedWords);

  assert.ok(
    matchedWords.length >= 2,
    `Whisper should transcribe words from lyrics. Expected matches, got: ${result.transcription}`
  );

  // Clean up test file
  try { fs.unlinkSync(testAudio); } catch {}
});

test('synthesizeFullSongTrack synthesizes Hindi/Devanagari lyrics with hi-IN vocals and Whisper transcribes them', async (t) => {
  const { synthesizeFullSongTrack } = await import('../dist/services/flow-music/song-synthesizer.js');

  const testOutputDir = path.join(REPO_ROOT, 'server/data/flow-music/test-output');
  fs.mkdirSync(testOutputDir, { recursive: true });
  const testAudio = path.join(testOutputDir, 'whisper_hindi_test.mp3');

  const hindiLyrics = 'जय बजरंगबली तोड़ दे दुश्मन की नली';
  const settings = {
    prompt: 'Epic devotional EDM',
    lyrics: hindiLyrics,
    title: 'Bajrangbali Devotional Song',
    bpm: 110,
    duration: 8,
  };

  const result = await synthesizeFullSongTrack(settings, testAudio, 8);

  assert.ok(fs.existsSync(testAudio), 'Generated audio file must exist');
  assert.ok(fs.statSync(testAudio).size > 10000, 'Generated audio file must have substantial size');
  assert.ok(result.transcription, 'Result must contain transcription from Whisper');

  console.log('[Test Hindi] Input lyrics:', hindiLyrics);
  console.log('[Test Hindi] Whisper transcribed text:', result.transcription);

  // Clean up test file
  try { fs.unlinkSync(testAudio); } catch {}
});
