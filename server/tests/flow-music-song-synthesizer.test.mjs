import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

test('Song Synthesizer & Vocal Language Suite', async (t) => {
  const { detectSongLanguage, synthesizeFullSongTrack } = await import('../dist/services/flow-music/song-synthesizer.js');

  const testOutputDir = path.join(REPO_ROOT, 'server/data/flow-music/test-output');
  fs.mkdirSync(testOutputDir, { recursive: true });

  await t.test('detectSongLanguage correctly classifies Devanagari, Romanized Hindi / Hinglish, English, and overrides', () => {
    // Devanagari
    assert.equal(detectSongLanguage({}, 'जय बजरंगबली तोड़ दे दुश्मन की नली'), 'hi');
    assert.equal(detectSongLanguage({}, 'तुम ही हो अब तुम ही हो'), 'hi');

    // Romanized Hindi / Hinglish
    assert.equal(detectSongLanguage({}, 'Jai Bajrangbali tod de dushman ki nali'), 'hi');
    assert.equal(detectSongLanguage({}, 'Main pal do pal ka shayar hoon, pal do pal meri kahani hai'), 'hi');
    assert.equal(detectSongLanguage({}, 'Tu hi meri shab hai subah hai tu hi din hai mera'), 'hi');
    assert.equal(detectSongLanguage({}, 'Hum tere bin ab reh nahi sakte tere bina kya wajood mera'), 'hi');
    assert.equal(detectSongLanguage({}, 'Jai Shri Ram Jai Sita Ram'), 'hi');

    // English Prompt with Hindi lyrics
    assert.equal(detectSongLanguage({ prompt: 'Soulful Bollywood devotional song' }, 'Walking along the path'), 'hi');

    // English song
    assert.equal(detectSongLanguage({}, 'Rhythm of the heart feel the bass drop tonight'), 'en');

    // Explicit overrides
    assert.equal(detectSongLanguage({ language: 'hi' }, 'Walking on sunshine'), 'hi');
    assert.equal(detectSongLanguage({ language: 'en' }, 'जय श्री राम'), 'en');
    assert.equal(detectSongLanguage({ language: 'instrumental' }, 'Any lyrics here'), 'instrumental');
    assert.equal(detectSongLanguage({ lyricsMode: 'instrumental' }, 'Any lyrics here'), 'instrumental');
  });

  await t.test('synthesizeFullSongTrack synthesizes English track with en-US vocals', async () => {
    const testAudio = path.join(testOutputDir, 'synth_english_test.mp3');
    try { fs.unlinkSync(testAudio); } catch {}

    const testLyrics = 'Rhythm of the heart feel the bass drop tonight';
    const settings = {
      prompt: 'Upbeat EDM song',
      lyrics: testLyrics,
      title: 'English Test Song',
      bpm: 128,
      duration: 8,
    };

    const result = await synthesizeFullSongTrack(settings, testAudio, 8);
    assert.ok(fs.existsSync(testAudio), 'Generated audio file must exist');
    assert.ok(fs.statSync(testAudio).size > 10000, 'Audio size must be > 10KB');
    console.log('[Test English] Whisper transcribed text:', result.transcription);

    try { fs.unlinkSync(testAudio); } catch {}
  });

  await t.test('synthesizeFullSongTrack synthesizes Romanized Hindi / Hinglish lyrics with hi-IN vocals', async () => {
    const testAudio = path.join(testOutputDir, 'synth_hinglish_test.mp3');
    try { fs.unlinkSync(testAudio); } catch {}

    const hinglishLyrics = 'Jai Shri Ram Jai Bajrangbali Tod De Dushman Ki Nali';
    const settings = {
      prompt: 'Devotional song',
      lyrics: hinglishLyrics,
      title: 'Bajrangbali Devotional Song',
      bpm: 110,
      duration: 8,
    };

    const result = await synthesizeFullSongTrack(settings, testAudio, 8);
    assert.ok(fs.existsSync(testAudio), 'Generated audio file must exist');
    assert.ok(fs.statSync(testAudio).size > 10000, 'Audio size must be > 10KB');
    console.log('[Test Hinglish] Whisper transcribed text:', result.transcription);

    try { fs.unlinkSync(testAudio); } catch {}
  });

  await t.test('synthesizeFullSongTrack synthesizes Devanagari lyrics with hi-IN vocals', async () => {
    const testAudio = path.join(testOutputDir, 'synth_devanagari_test.mp3');
    try { fs.unlinkSync(testAudio); } catch {}

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
    assert.ok(fs.statSync(testAudio).size > 10000, 'Audio size must be > 10KB');
    console.log('[Test Hindi] Whisper transcribed text:', result.transcription);

    try { fs.unlinkSync(testAudio); } catch {}
  });
});
