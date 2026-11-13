import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

function decodePcm16(audioPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-nostdin', '-v', 'error',
      '-i', audioPath,
      '-f', 's16le', '-ac', '1', '-ar', '16000',
      '-',
    ]);
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg decode failed (${code}): ${stderr}`));
      const buf = Buffer.concat(chunks);
      const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
      resolve(samples);
    });
    proc.on('error', reject);
  });
}

function measureWindow(samples, startSample, endSample) {
  let sumSq = 0;
  let peak = 0;
  const end = Math.min(samples.length, endSample);
  const count = Math.max(1, end - startSample);
  for (let i = startSample; i < end; i++) {
    const v = Math.abs(samples[i]) / 32768;
    sumSq += v * v;
    if (v > peak) peak = v;
  }
  return { rms: Math.sqrt(sumSq / count), peak };
}

test('synthesizeFullSongTrack produces clean non-clipping instrumental intro and clear vocals across duration', async () => {
  const { synthesizeFullSongTrack, probeAudioDuration } = await import(
    '../dist/services/flow-music/song-synthesizer.js'
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-audio-fix-'));
  const outMp3 = path.join(tmpDir, 'clean_song.mp3');

  try {
    const res = await synthesizeFullSongTrack(
      {
        enabled: true,
        prompt: 'Epic cinematic devotional soundtrack with warm pads and punchy drums',
        lyrics: '[Verse]\nFeel the rhythm rising in the sky\n[Chorus]\nStand tall and touch the light tonight',
        lyricsMode: 'custom',
        title: 'Clean Vocal Test',
        mood: 'Heroic',
        theme: 'Inspiration',
        vocalProfile: 'Deep male voice',
        sfxBooms: true,
        sfxRisers: true,
        dholPercussion: true,
        brassSwells: true,
        duration: 18,
        bpm: 120,
        producerModel: 'Google Lyria / Flow Music',
        imageOnlyReel: true,
        letterboxBanner: '',
        vfxParticles: true,
      },
      outMp3,
      18
    );

    assert.ok(fs.existsSync(outMp3), 'MP3 output should exist');
    const measuredDuration = await probeAudioDuration(outMp3);
    assert.ok(Math.abs(measuredDuration - 18) <= 0.5, `Expected ~18s duration, got ${measuredDuration}s`);
    assert.equal(res.duration, 18);

    const samples = await decodePcm16(outMp3);
    // Intro (0-1.1s before vocals at 1.2s): previously peaked at 0.891 due to snareExpr mod(-t) overflow!
    const intro = measureWindow(samples, 0, Math.floor(1.1 * 16000));
    // First vocal phrase (~1.3s-4.5s)
    const vocal1 = measureWindow(samples, Math.floor(1.3 * 16000), Math.floor(4.5 * 16000));
    // Repeated vocal chorus later in the 18s track (~8s-15s)
    const latePart = measureWindow(samples, Math.floor(8.0 * 16000), Math.floor(15.0 * 16000));

    assert.ok(intro.peak < 0.75, `Intro should not have clipped noise explosion (peak=${intro.peak.toFixed(3)})`);
    assert.ok(intro.rms < 0.12, `Intro instrumental should stay clean and subtle (rms=${intro.rms.toFixed(3)})`);
    assert.ok(vocal1.rms > intro.rms * 1.05, `Vocal section should rise clearly above intro (${vocal1.rms.toFixed(3)} vs ${intro.rms.toFixed(3)})`);
    assert.ok(latePart.rms > 0.04, `Later track should remain musically active (${latePart.rms.toFixed(3)})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('startFlowMusicGeneration skips landing-page demo clip when logged out and uses clean local synthesis when ComfyUI disabled', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-worker-fix-'));
  const origFlowDir = process.env.FLOW_MUSIC_DATA_DIR;
  const origDisableComfy = process.env.FLOW_MUSIC_DISABLE_COMFY;
  const origDisablePw = process.env.FLOW_MUSIC_DISABLE_PLAYWRIGHT;

  process.env.FLOW_MUSIC_DATA_DIR = tmpDir;
  process.env.FLOW_MUSIC_DISABLE_COMFY = '1';
  process.env.FLOW_MUSIC_DISABLE_PLAYWRIGHT = '1';

  try {
    const { startFlowMusicGeneration, getFlowMusicJob } = await import(
      '../dist/services/flow-music/flow-music-worker.js'
    );
    const { probeAudioDuration } = await import('../dist/services/flow-music/song-synthesizer.js');

    const job = await startFlowMusicGeneration('test_script_audio_fix', {
      enabled: true,
      prompt: 'Upbeat heroic song',
      lyrics: 'Rise above the storm tonight',
      lyricsMode: 'custom',
      title: 'Worker Test',
      mood: 'Heroic',
      theme: 'Heroic',
      vocalProfile: 'Male',
      sfxBooms: true,
      sfxRisers: true,
      dholPercussion: true,
      brassSwells: true,
      duration: 12,
      bpm: 120,
      producerModel: 'Google Lyria / Flow Music',
      imageOnlyReel: true,
      letterboxBanner: '',
      vfxParticles: true,
    });

    const deadline = Date.now() + 45_000;
    let current = job;
    while (current && (current.state === 'queued' || current.state === 'running') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      current = getFlowMusicJob(job.id);
    }

    assert.equal(current?.state, 'done', `Job should succeed, got ${current?.state}: ${current?.error}`);
    assert.ok(current?.audioPath && fs.existsSync(current.audioPath), 'Output MP3 must exist');
    const dur = await probeAudioDuration(current.audioPath);
    assert.ok(Math.abs(dur - 12) <= 0.5, `Expected 12s output (not 172s cached demo!), got ${dur}s`);
  } finally {
    if (origFlowDir === undefined) delete process.env.FLOW_MUSIC_DATA_DIR;
    else process.env.FLOW_MUSIC_DATA_DIR = origFlowDir;
    if (origDisableComfy === undefined) delete process.env.FLOW_MUSIC_DISABLE_COMFY;
    else process.env.FLOW_MUSIC_DISABLE_COMFY = origDisableComfy;
    if (origDisablePw === undefined) delete process.env.FLOW_MUSIC_DISABLE_PLAYWRIGHT;
    else process.env.FLOW_MUSIC_DISABLE_PLAYWRIGHT = origDisablePw;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('alignLyricsToAudio places subtitles on voiced bursts, skips silent breaks, and preserves pacing in ASS', async () => {
  const { alignLyricsToAudio } = await import('../dist/services/flow-music/lyric-aligner.js');
  const { buildBeatKaraokeAssSubtitles, normalizeBeatEditOptions } = await import(
    '../dist/services/flow-music/beat-edit.js'
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-align-fix-'));
  const wavPath = path.join(tmpDir, 'two_bursts_with_gap.wav');
  const assPath = path.join(tmpDir, 'aligned_motion.ass');

  try {
    // 10s track with two distinct 950Hz vocal-band bursts at [1.0..2.8s] and [5.8..7.8s] separated by 3s silence
    await new Promise((resolve, reject) => {
      const expr = '0.6*(between(t\\,1.0\\,2.8)+between(t\\,5.8\\,7.8))*sin(2*PI*950*t)';
      const proc = spawn('ffmpeg', [
        '-nostdin', '-y', '-f', 'lavfi', '-i', `aevalsrc=${expr}:s=16000:d=10`, wavPath,
      ]);
      proc.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exit ${c}`))));
      proc.on('error', reject);
    });

    const lyrics = [
      'Rise up now',
      'Feel the sacred fire',
      'Extra un-sung verse line one that would overload',
      'Extra un-sung verse line two that would overload',
      'Extra un-sung verse line three that would overload',
      'Extra un-sung verse line four that would overload',
    ].join('\n');

    const aligned = await alignLyricsToAudio({
      audioPath: wavPath,
      lyrics,
      offlineOnly: true,
    });

    assert.equal(aligned.source, 'acoustic-dsp');
    assert.ok(aligned.phrases.length >= 2, `expected >=2 aligned phrases, got ${aligned.phrases.length}`);
    assert.ok(aligned.words.length <= 15, `should cap dense un-sung overflow instead of blurring fast (${aligned.words.length} words)`);

    // Must NOT place words inside the silent intro [0..0.8s] or middle gap [3.1..5.5s] or silent outro [8.1..10s]
    const anyInGap = aligned.words.some((w) => w.start > 3.1 && w.end < 5.5);
    assert.equal(anyInGap, false, 'no subtitle words should fall inside silent 3.1s-5.5s break');
    assert.ok(aligned.words[0].start >= 0.85, `first word should wait for vocal entry ~1.0s, got ${aligned.words[0].start}`);
    assert.ok(aligned.words[aligned.words.length - 1].end <= 8.1, `last word should end near vocal end ~7.8s, got ${aligned.words[aligned.words.length - 1].end}`);

    const analysis = {
      duration: 10,
      bpm: 120,
      beatInterval: 0.5,
      beats: Array.from({ length: 20 }, (_, i) => i * 0.5),
      downbeats: [0, 2, 4, 6, 8],
      onsets: [],
      drops: [],
      energy: [],
      reliable: true,
      source: 'analysis',
    };

    buildBeatKaraokeAssSubtitles({
      scenes: [{ line: 'ignored fixed chunk', caption: 'ignored fixed chunk', duration: 10, effect: 'zoom-in', prompt: 'p' }],
      analysis,
      options: normalizeBeatEditOptions({ subtitleStyle: 'motion', subtitleSize: 180 }),
      filePath: assPath,
      format: 'shorts',
      alignedLyrics: aligned,
    });

    const assText = fs.readFileSync(assPath, 'utf8');
    const dialogues = assText.split('\n').filter((l) => l.startsWith('Dialogue: 1,'));
    assert.ok(dialogues.length >= 2, 'should emit aligned word dialogues');
    assert.ok(!assText.includes('ignored fixed chunk'), 'should render aligned lyrics instead of fixed scene chunk');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
