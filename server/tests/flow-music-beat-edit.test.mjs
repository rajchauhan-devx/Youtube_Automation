import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import express from 'express';
import sharp from 'sharp';

const tmpDir = fs.mkdtempSync(path.resolve('server/data/flow-music-beat-test-'));
const originalDataDir = process.env.TUBEFLOW_DATA_DIR;
const originalFlowMusicDir = process.env.FLOW_MUSIC_DATA_DIR;
const originalGeminiKey = process.env.GEMINI_API_KEY;

process.env.TUBEFLOW_DATA_DIR = tmpDir;
process.env.FLOW_MUSIC_DATA_DIR = path.join(tmpDir, 'flow-music');
process.env.GEMINI_API_KEY = 'test-gemini-api-key';

const { analyzeBeats } = await import('../dist/services/flow-music/beat-detector.js');
const {
  snapScenesToBeats,
  buildBeatKaraokeAssSubtitles,
  buildPunchZoomTerm,
  buildFlashEnableExpr,
  buildShakeRotateExpr,
  normalizeBeatEditOptions,
  computeSceneBeatEvents,
  groupWordsIntoDisplayChunks,
  isGrammarParticle,
} = await import('../dist/services/flow-music/beat-edit.js');
const {
  buildShortsSceneFilter,
  buildLongSceneFilter,
  buildScenesFromScript,
  setSongApproval,
  rejectSong,
  getSongApproval,
} = await import('../dist/services/flow-music/flow-music-video-service.js');
const { flowMusicRouter } = await import('../dist/routes/flow-music.js');

function runProcess(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-400)}`));
    });
    proc.on('error', reject);
  });
}

/** 120 BPM dhol-style click track: decaying sine bursts every 0.5s. */
async function makeClickTrack(filePath, durationSec = 16, bpm = 120) {
  const interval = 60 / bpm;
  const expr = `sin(2*PI*900*mod(t\\,${interval}))*exp(-30*mod(t\\,${interval}))+0.5*sin(2*PI*70*t)*exp(-12*mod(t\\,${interval}))`;
  await runProcess('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `aevalsrc=${expr}:d=${durationSec}:s=22050`,
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    filePath,
  ]);
}

async function makeTexturedPng(width, height) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      raw[idx] = (x * 5 + y * 3) & 0xff;
      raw[idx + 1] = ((x ^ y) * 7) & 0xff;
      raw[idx + 2] = (y * 11 + (x >> 2)) & 0xff;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
}

test.after(() => {
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
  if (originalDataDir === undefined) delete process.env.TUBEFLOW_DATA_DIR;
  else process.env.TUBEFLOW_DATA_DIR = originalDataDir;
  if (originalFlowMusicDir === undefined) delete process.env.FLOW_MUSIC_DATA_DIR;
  else process.env.FLOW_MUSIC_DATA_DIR = originalFlowMusicDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('analyzeBeats detects 120 BPM grid, downbeats and bass drops from a click track', async () => {
  const trackPath = path.join(tmpDir, 'click_120.mp3');
  await makeClickTrack(trackPath, 16, 120);

  const analysis = await analyzeBeats(trackPath, { hintBpm: 110 });
  assert.ok(analysis.source === 'analysis', `expected real analysis, got ${analysis.source}`);
  assert.ok(Math.abs(analysis.bpm - 120) <= 4, `expected ~120 BPM, got ${analysis.bpm}`);
  assert.ok(Math.abs(analysis.beatInterval - 0.5) < 0.03, `expected ~0.5s interval, got ${analysis.beatInterval}`);
  assert.ok(analysis.beats.length >= 28, `expected >= 28 beats, got ${analysis.beats.length}`);
  assert.ok(analysis.downbeats.length >= 7, `expected >= 7 downbeats, got ${analysis.downbeats.length}`);

  // Cached second call returns identical map without re-decoding
  const cached = await analyzeBeats(trackPath, { hintBpm: 110 });
  assert.equal(cached.bpm, analysis.bpm);

  // Beat spacing stays near the interval
  const gaps = analysis.beats.slice(1).map((b, i) => b - analysis.beats[i]);
  const maxGap = Math.max(...gaps);
  assert.ok(maxGap < 0.75, `expected max beat gap < 0.75s, got ${maxGap}`);
});

test('snapScenesToBeats lands every scene cut on the beat grid', () => {
  const analysis = {
    duration: 16,
    bpm: 120,
    beatInterval: 0.5,
    beats: Array.from({ length: 32 }, (_, i) => i * 0.5),
    downbeats: Array.from({ length: 8 }, (_, i) => i * 2),
    onsets: [],
    drops: [],
    energy: [],
    reliable: true,
    source: 'analysis',
  };
  const scenes = [
    { line: 'a', caption: 'a', duration: 6.3, effect: 'zoom-in', prompt: 'p' },
    { line: 'b', caption: 'b', duration: 5.2, effect: 'pan-up', prompt: 'p' },
    { line: 'c', caption: 'c', duration: 4.5, effect: 'zoom-out', prompt: 'p' },
  ];
  const snap = snapScenesToBeats(scenes, analysis, 16);
  assert.equal(snap.scenes.length, 3);
  // Boundary 1: 6.3 -> 6.0 or 6.5 (a beat); Boundary 2 must also be a beat
  const b1 = snap.scenes[0].duration;
  const b2 = b1 + snap.scenes[1].duration;
  assert.ok(Math.abs(b1 % 0.5) < 0.01, `first boundary ${b1} not on beat grid`);
  assert.ok(Math.abs(b2 % 0.5) < 0.01, `second boundary ${b2} not on beat grid`);
  const total = snap.scenes.reduce((a, s) => a + s.duration, 0);
  assert.ok(Math.abs(total - 16) < 0.6, `expected total ~16s, got ${total}`);
  assert.ok(snap.snappedBoundaries >= 1, `expected >=1 snapped boundary, got ${snap.snappedBoundaries}`);
});

test('beat karaoke ASS builder emits beat-timed, styled, escaped events for all styles', () => {
  const analysis = {
    duration: 12,
    bpm: 120,
    beatInterval: 0.5,
    beats: Array.from({ length: 24 }, (_, i) => i * 0.5),
    downbeats: Array.from({ length: 6 }, (_, i) => i * 2),
    onsets: [],
    drops: [],
    energy: [],
    reliable: true,
    source: 'analysis',
  };
  const scenes = [
    { line: 'राम रामं जपती...', caption: 'राम रामं जपती...', duration: 6, effect: 'pan-left', prompt: 'p' },
    { line: 'curly {brace} test', caption: 'curly {brace} test', duration: 6, effect: 'zoom-in', prompt: 'p' },
  ];
  const options = normalizeBeatEditOptions({ subtitleStyle: 'karaoke', intensity: 'hype' });
  assert.equal(options.enabled, true);
  assert.equal(options.intensity, 'hype');

  const karaokePath = path.join(tmpDir, 'karaoke.ass');
  buildBeatKaraokeAssSubtitles({ scenes, analysis, options, filePath: karaokePath, format: 'shorts', bannerText: 'Goosebumps 🚩' });
  const karaokeText = fs.readFileSync(karaokePath, 'utf8');
  assert.ok(karaokeText.includes('PlayResX: 1080'));
  assert.ok(karaokeText.includes('Style: BeatCaption'));
  assert.ok(karaokeText.includes('Banner,,0,0,0,,Goosebumps 🚩'));
  assert.ok(karaokeText.includes('\\k'), 'karaoke style must use \\k tags');
  assert.ok(karaokeText.includes('राम'), 'Devanagari caption preserved');
  assert.ok(karaokeText.includes('\\{brace\\}'), 'ASS braces escaped');
  assert.ok(!karaokeText.includes('undefined'));

  const popPath = path.join(tmpDir, 'pop.ass');
  buildBeatKaraokeAssSubtitles({
    scenes,
    analysis,
    options: { ...options, subtitleStyle: 'pop' },
    filePath: popPath,
    format: 'shorts',
  });
  const popText = fs.readFileSync(popPath, 'utf8');
  assert.ok(popText.includes('\\fscx'), 'pop style must scale-punch words');
  assert.ok(popText.includes('&H00D4FF&'), 'downbeat words highlighted gold');
  assert.ok(popText.split('\nDialogue:').length > 6, 'pop style emits per-word events');

  const glowPath = path.join(tmpDir, 'glow.ass');
  buildBeatKaraokeAssSubtitles({
    scenes,
    analysis,
    options: { ...options, subtitleStyle: 'glow' },
    filePath: glowPath,
    format: 'long',
  });
  const glowText = fs.readFileSync(glowPath, 'utf8');
  assert.ok(glowText.includes('PlayResX: 1920'), 'long format uses 1920x1080 canvas');
  assert.ok(glowText.includes('\\blur'), 'glow style must use blur');
});

test('motion style emits huge per-word reel events with heartbeat beat pulses', () => {
  const analysis = {
    duration: 12,
    bpm: 120,
    beatInterval: 0.5,
    beats: Array.from({ length: 24 }, (_, i) => i * 0.5),
    downbeats: Array.from({ length: 6 }, (_, i) => i * 2),
    onsets: [],
    drops: [],
    energy: [],
    reliable: true,
    source: 'analysis',
  };
  const scenes = [
    { line: 'राम रामं जपती...', caption: 'राम रामं जपती...', duration: 6, effect: 'pan-left', prompt: 'p' },
    { line: 'Goosebumps illuminated', caption: 'Goosebumps illuminated', duration: 6, effect: 'zoom-in', prompt: 'p' },
  ];
  const options = normalizeBeatEditOptions({ subtitleStyle: 'motion', intensity: 'hype' });
  assert.equal(options.subtitleStyle, 'motion', 'motion is an accepted style');

  const shortsPath = path.join(tmpDir, 'motion_shorts.ass');
  buildBeatKaraokeAssSubtitles({ scenes, analysis, options, filePath: shortsPath, format: 'shorts' });
  const text = fs.readFileSync(shortsPath, 'utf8');
  assert.ok(text.includes('Style: MotionWord,Nirmala UI,96,'), 'shorts motion style is huge (96px)');
  assert.ok(!text.includes('BeatCaption'), 'motion format does not emit the small caption style');

  const wordEvents = text.split('\n').filter((l) => l.startsWith('Dialogue:') && l.includes(',MotionWord,'));
  assert.ok(wordEvents.length >= 5, `expected >=5 per-word events, got ${wordEvents.length}`);
  for (const l of wordEvents) {
    const body = l.slice(l.lastIndexOf(',,') + 2);
    const visible = body.replace(/\{[^}]*\}/g, '');
    assert.ok(visible.length > 0 && !visible.includes(' '), `event shows a single word, got "${visible}"`);
  }

  assert.ok(text.includes('\\fscx1'), 'entrance pop uses scale > 100');
  assert.ok(text.includes('\\t(0,80,\\fscx100\\fscy100\\blur0)'), 'entrance settles back to rest with blur clear');
  const pulseCount = (text.match(/\\t\(/g) || []).length;
  assert.ok(pulseCount >= 8, `expected >=8 heartbeat pulses, got ${pulseCount}`);
  const colors = new Set();
  for (const m of text.matchAll(/\\1c(&H[0-9A-F]+&)/g)) colors.add(m[1]);
  assert.ok(colors.size >= 3, `expected >=3 vivid word colours cycling per beat, got ${[...colors].join(',')}`);
  assert.ok(text.includes('\\3c&H00D4FF&'), 'downbeat words flash a gold outline');
  assert.ok(!text.includes('undefined'));

  const longPath = path.join(tmpDir, 'motion_long.ass');
  buildBeatKaraokeAssSubtitles({ scenes, analysis, options, filePath: longPath, format: 'long' });
  const longText = fs.readFileSync(longPath, 'utf8');
  assert.ok(longText.includes('Style: MotionWord,Nirmala UI,72,'), 'long format motion style is 72px');
  assert.ok(longText.includes('\\fs'), 'long words get a smaller size override so they never overflow');
});

test('subtitleSize option scales font size across small, medium, large and huge', () => {
  const analysis = {
    duration: 6,
    bpm: 120,
    beatInterval: 0.5,
    beats: [0.5, 1.0, 1.5, 2.0, 2.5, 3.0],
    downbeats: [1.0, 2.0],
    onsets: [],
    drops: [],
    energy: [],
    reliable: true,
    source: 'analysis',
  };
  const scenes = [{ line: 'Size test word', caption: 'Size test word', duration: 4, effect: 'zoom-in', prompt: 'p' }];

  // Small
  const smallOpts = normalizeBeatEditOptions({ subtitleStyle: 'motion', subtitleSize: 'small' });
  assert.equal(smallOpts.subtitleSize, 'small');
  const smallPath = path.join(tmpDir, 'size_small.ass');
  buildBeatKaraokeAssSubtitles({ scenes, analysis, options: smallOpts, filePath: smallPath, format: 'shorts' });
  const smallText = fs.readFileSync(smallPath, 'utf8');
  assert.ok(smallText.includes('Style: MotionWord,Nirmala UI,77,'), 'small size produces 77px');

  // Large
  const largeOpts = normalizeBeatEditOptions({ subtitleStyle: 'motion', subtitleSize: 'large' });
  assert.equal(largeOpts.subtitleSize, 'large');
  const largePath = path.join(tmpDir, 'size_large.ass');
  buildBeatKaraokeAssSubtitles({ scenes, analysis, options: largeOpts, filePath: largePath, format: 'shorts' });
  const largeText = fs.readFileSync(largePath, 'utf8');
  assert.ok(largeText.includes('Style: MotionWord,Nirmala UI,120,'), 'large size produces 120px');

  // Huge
  const hugeOpts = normalizeBeatEditOptions({ subtitleStyle: 'motion', subtitleSize: 'huge' });
  assert.equal(hugeOpts.subtitleSize, 'huge');
  const hugePath = path.join(tmpDir, 'size_huge.ass');
  buildBeatKaraokeAssSubtitles({ scenes, analysis, options: hugeOpts, filePath: hugePath, format: 'shorts' });
  const hugeText = fs.readFileSync(hugePath, 'utf8');
  assert.ok(hugeText.includes('Style: MotionWord,Nirmala UI,149,'), 'huge size produces 149px');

  // Karaoke Large
  const karaokeOpts = normalizeBeatEditOptions({ subtitleStyle: 'karaoke', subtitleSize: 'large' });
  const karaokePath = path.join(tmpDir, 'size_karaoke_large.ass');
  buildBeatKaraokeAssSubtitles({ scenes, analysis, options: karaokeOpts, filePath: karaokePath, format: 'shorts' });
  const karaokeText = fs.readFileSync(karaokePath, 'utf8');
  assert.ok(karaokeText.includes('Style: BeatCaption,Nirmala UI,73,'), 'large karaoke produces 73px');

  // Custom meter numeric size: 210px
  const meterOpts = normalizeBeatEditOptions({ subtitleStyle: 'motion', subtitleSize: 210 });
  assert.equal(meterOpts.subtitleSize, 210, 'numeric meter size is preserved');
  const meterShortsPath = path.join(tmpDir, 'size_meter_shorts.ass');
  buildBeatKaraokeAssSubtitles({ scenes, analysis, options: meterOpts, filePath: meterShortsPath, format: 'shorts' });
  const meterShortsText = fs.readFileSync(meterShortsPath, 'utf8');
  assert.ok(meterShortsText.includes('Style: MotionWord,Nirmala UI,210,'), 'meter size 210px produces 210px font in Shorts');

  // Custom meter in Long video (scales to 0.75x = 158px)
  const meterLongPath = path.join(tmpDir, 'size_meter_long.ass');
  buildBeatKaraokeAssSubtitles({ scenes, analysis, options: meterOpts, filePath: meterLongPath, format: 'long' });
  const meterLongText = fs.readFileSync(meterLongPath, 'utf8');
  assert.ok(meterLongText.includes('Style: MotionWord,Nirmala UI,158,'), 'meter size 210px produces 158px in Long');

  // String number from meter input
  const stringNumOpts = normalizeBeatEditOptions({ subtitleStyle: 'motion', subtitleSize: '240' });
  assert.equal(stringNumOpts.subtitleSize, 240, 'string numeric size is parsed to number');
});

test('beat FFmpeg expressions build into valid filters that render real clips (punch, flash, shake)', async () => {
  const profile = normalizeBeatEditOptions({ intensity: 'balanced' });
  const editOptions = { ...profile, intensity: 'balanced' };
  const punchTerm = buildPunchZoomTerm([0.2, 0.7, 1.2], { punchStrength: 0.075, punchDecay: 0.32, flashBrightness: 0.09, shakeAmp: 0.002, wordPop: 14, pulseSeconds: 0.5 });
  assert.ok(punchTerm.startsWith('+0.075*(between(on/30,'));

  const flashExpr = buildFlashEnableExpr([0.5, 1.5]);
  assert.ok(flashExpr.includes("between(t,0.500,0.585)"));

  const shakeExpr = buildShakeRotateExpr([0.6], { punchStrength: 0.075, punchDecay: 0.32, flashBrightness: 0.09, shakeAmp: 0.002, wordPop: 14, pulseSeconds: 0.5 });
  assert.ok(shakeExpr.includes('sin(46*'));

  const events = { punches: [0.2, 0.7, 1.2], flashes: [0.5, 1.5], shakes: [0.6], options: editOptions };
  const shortsFilter = buildShortsSceneFilter(3, true, events);
  assert.ok(shortsFilter.includes('rotate=a='), 'shorts filter includes drop shake');
  assert.ok(shortsFilter.includes('enable='), 'shorts filter includes flash');
  assert.ok(shortsFilter.includes('between(on/30,0.200,'), 'punch term embedded');

  const longFilter = buildLongSceneFilter(3, false, 1920, 1080, events);
  assert.ok(longFilter.includes('rotate=a='));
  assert.ok(longFilter.includes('format=yuv420p'));

  // Render a real clip through the beat-affected shorts filter
  const png = await makeTexturedPng(1024, 576);
  const inputPng = path.join(tmpDir, 'beat_fx_input.png');
  fs.writeFileSync(inputPng, png);
  const clipPath = path.join(tmpDir, 'beat_fx_clip.mp4');
  await runProcess('ffmpeg', [
    '-y',
    '-loop', '1',
    '-framerate', '30',
    '-t', '3',
    '-i', inputPng,
    '-filter_complex', shortsFilter,
    '-map', '[out]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-t', '3',
    clipPath,
  ]);
  const probe = await runProcess('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,codec_name',
    '-of', 'json',
    clipPath,
  ]);
  const stream = JSON.parse(probe.stdout).streams[0];
  assert.equal(stream.width, 1080);
  assert.equal(stream.height, 1920);
  assert.equal(stream.codec_name, 'h264');
});

test('computeSceneBeatEvents picks punches/flashes/shakes inside the scene window', () => {
  const analysis = {
    duration: 12,
    bpm: 120,
    beatInterval: 0.5,
    beats: Array.from({ length: 24 }, (_, i) => i * 0.5),
    downbeats: Array.from({ length: 6 }, (_, i) => i * 2),
    onsets: [{ time: 0.5, strength: 2 }, { time: 2, strength: 3 }, { time: 4.5, strength: 1.5 }],
    drops: [{ start: 4.2, end: 5.2, strength: 2.4 }],
    energy: [],
    reliable: true,
    source: 'analysis',
  };
  const options = normalizeBeatEditOptions({});
  const events = computeSceneBeatEvents(0, 6, analysis, options);
  // Punches use the downbeat grid (strongest beats), flashes fire on downbeats
  assert.deepEqual(events.punches, [0, 2, 4]);
  assert.deepEqual(events.flashes, [0, 2, 4]);
  assert.deepEqual(events.shakes, [4.2]);
});

test('storyboard director classifies lyric sections and picks image types offline', async () => {
  const scenes = await buildScenesFromScript({
    lyrics: 'राम जी: "हनुमान, मौत आगे बढ़ रही है..."\nआज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!\nराम रामं जपती...',
    topic: 'Hanuman Vow',
    mood: 'heroic',
    targetDuration: 24,
    offlineOnly: true,
  });
  assert.equal(scenes.length, 3);
  assert.ok(scenes.every((s) => s.sectionType && s.sectionType.length > 0));
  assert.ok(scenes.every((s) => s.imageType && s.imageType.length > 0));
  const dropScene = scenes.find((s) => s.line.includes('मार दूंगा'));
  assert.equal(dropScene.sectionType, 'drop');
  assert.ok(dropScene.imageType.includes('monumental'));
  const chantScene = scenes.find((s) => s.line.includes('राम रामं'));
  assert.equal(chantScene.sectionType, 'chant');
});

test('approve -> reject loop persists rejection note and clears on re-approve', async () => {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use('/api/flow-music', flowMusicRouter);
  const server = await new Promise((resolve) => {
    const inst = app.listen(0, '127.0.0.1', () => resolve(inst));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/flow-music`;
  try {
    const rejectRes = await fetch(`${base}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptId: 'reject_loop_1', approved: false, songUrl: '/x.mp3', note: 'more bass please' }),
    });
    assert.equal(rejectRes.status, 200);
    const stored = getSongApproval('reject_loop_1');
    assert.equal(stored.rejected, true);
    assert.equal(stored.rejectNote, 'more bass please');
    assert.equal(stored.rejectCount, 1);
    assert.equal(stored.approved, false);

    const reApprove = await fetch(`${base}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptId: 'reject_loop_1', approved: true, songUrl: '/y.mp3' }),
    });
    assert.equal(reApprove.status, 200);
    const approved = getSongApproval('reject_loop_1');
    assert.equal(approved.approved, true);
    assert.equal(approved.rejected, false);
    assert.equal(approved.rejectCount, 1, 'reject count survives approval');
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test('rejectSong (service) bumps count across repeated rejections', () => {
  setSongApproval('reject_counter', true, '/a.mp3', 'A');
  rejectSong('reject_counter', { note: 'v1' });
  const first = getSongApproval('reject_counter');
  rejectSong('reject_counter', { note: 'v2' });
  const second = getSongApproval('reject_counter');
  assert.equal(first.rejectCount, 1);
  assert.equal(second.rejectCount, 2);
  assert.equal(second.rejectNote, 'v2');
});

test('re-render pipeline with reuseImages: true preserves existing keyframes and applies new subtitle styles', async () => {
  const { startFlowVideoPipeline, getFlowVideoJob } = await import('../dist/services/flow-music/flow-music-video-service.js');
  const { flowMusicDownloadsDir } = await import('../dist/services/flow-music/flow-music-profile.js');

  const trackPath = path.join(tmpDir, 'click_120.mp3');
  setSongApproval('rerender_test_1', true, trackPath, 'Test');

  const outDir = path.join(flowMusicDownloadsDir(), 'videos');
  fs.mkdirSync(outDir, { recursive: true });
  const dummyImg = path.join(outDir, 'prev_job_scene_0.png');
  await sharp({
    create: { width: 1280, height: 720, channels: 3, background: { r: 80, g: 20, b: 20 } },
  }).png().toFile(dummyImg);

  const scenes = [{ line: 'Re-render Beat Test', caption: 'Re-render Beat Test', duration: 4, effect: 'zoom-in', prompt: 'test' }];
  const job = await startFlowVideoPipeline('rerender_test_1', {
    scenes,
    duration: 4,
    songUrl: trackPath,
    videoFormat: 'both',
    beatEdit: { subtitleStyle: 'motion', intensity: 'hype' },
    reuseImages: true,
    existingImages: [{ filename: 'prev_job_scene_0.png' }],
  });

  assert.ok(job.id, 'job started successfully');

  let done = false;
  let status = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    status = getFlowVideoJob(job.id);
    if (status && (status.state === 'done' || status.state === 'error')) {
      done = true;
      break;
    }
  }

  assert.ok(done, 'job finished within timeout');
  assert.equal(status.state, 'done', `job completed with done state, got ${status?.error}`);
  assert.ok(fs.existsSync(status.shortsPath), 'shorts video rendered with reused keyframe');
  assert.ok(fs.existsSync(status.longPath), 'long video rendered with reused keyframe');
  assert.equal(status.images.length, 1, 'job images array populated');
});

test('videoFormat: "shorts" renders only portrait 9:16 video and skips long video', async () => {
  const { startFlowVideoPipeline, getFlowVideoJob } = await import('../dist/services/flow-music/flow-music-video-service.js');
  const { flowMusicDownloadsDir } = await import('../dist/services/flow-music/flow-music-profile.js');

  const trackPath = path.join(tmpDir, 'click_120.mp3');
  setSongApproval('format_shorts_only', true, trackPath, 'Test');

  const outDir = path.join(flowMusicDownloadsDir(), 'videos');
  const dummyImg = path.join(outDir, 'format_test_scene_0.png');
  await sharp({
    create: { width: 1280, height: 720, channels: 3, background: { r: 10, g: 80, b: 20 } },
  }).png().toFile(dummyImg);

  const scenes = [{ line: 'Shorts only test', caption: 'Shorts only test', duration: 4, effect: 'zoom-in', prompt: 'test' }];
  const job = await startFlowVideoPipeline('format_shorts_only', {
    scenes,
    duration: 4,
    songUrl: trackPath,
    videoFormat: 'shorts',
    beatEdit: { subtitleStyle: 'motion', intensity: 'balanced' },
    reuseImages: true,
    existingImages: [{ filename: 'format_test_scene_0.png' }],
  });

  let done = false;
  let status = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    status = getFlowVideoJob(job.id);
    if (status && (status.state === 'done' || status.state === 'error')) {
      done = true;
      break;
    }
  }

  assert.ok(done, 'job finished within timeout');
  assert.equal(status.state, 'done');
  assert.ok(fs.existsSync(status.shortsPath), 'shorts video exists');
  assert.equal(status.longVideoUrl, undefined, 'long video url is omitted');
  assert.equal(status.longPath, undefined, 'long path is omitted');
});

test('groupWordsIntoDisplayChunks groups rapid single words into readable, comfortable chunks without strobe flashing', () => {
  const sampleWords = [
    { word: 'रणभूमि', start: 0.32, end: 1.02, onBeat: true, onDownbeat: false, beatIndex: 0 },
    { word: 'में', start: 1.02, end: 1.26, onBeat: false, onDownbeat: false, beatIndex: -1 },
    { word: 'सन्नाटा,', start: 1.26, end: 1.94, onBeat: true, onDownbeat: true, beatIndex: 1 },
    { word: 'लंका', start: 2.02, end: 2.56, onBeat: false, onDownbeat: false, beatIndex: -1 },
    { word: 'का', start: 2.56, end: 2.98, onBeat: true, onDownbeat: false, beatIndex: 2 },
    { word: 'मैदान,', start: 2.98, end: 3.92, onBeat: false, onDownbeat: false, beatIndex: -1 },
  ];

  const chunks = groupWordsIntoDisplayChunks(sampleWords, 'shorts');
  assert.ok(chunks.length >= 2 && chunks.length <= 4, `expected 2-4 chunks, got ${chunks.length}`);

  // First chunk must combine "रणभूमि में" so particle "में" does not flash alone for 240ms
  assert.ok(chunks[0].word.includes('रणभूमि में'), `expected particle combined with root word, got "${chunks[0].word}"`);
  assert.ok(chunks[0].end - chunks[0].start >= 0.5, `chunk must stay visible at least 0.5s, got ${chunks[0].end - chunks[0].start}`);

  // No chunk should be an isolated functional particle
  for (const c of chunks) {
    assert.equal(isGrammarParticle(c.word), false, `isolated particle found: "${c.word}"`);
    const dur = c.end - c.start;
    assert.ok(dur >= 0.40, `chunk "${c.word}" duration ${dur}s is too fast (< 0.40s)`);
  }
});

