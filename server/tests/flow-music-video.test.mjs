import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import express from 'express';
import sharp from 'sharp';

const tmpDir = fs.mkdtempSync(path.resolve('server/data/flow-music-video-test-'));
const originalDataDir = process.env.TUBEFLOW_DATA_DIR;
const originalFlowMusicDir = process.env.FLOW_MUSIC_DATA_DIR;
const originalGeminiKey = process.env.GEMINI_API_KEY;
const originalFetch = globalThis.fetch;

process.env.TUBEFLOW_DATA_DIR = tmpDir;
process.env.FLOW_MUSIC_DATA_DIR = path.join(tmpDir, 'flow-music');
process.env.GEMINI_API_KEY = 'test-gemini-api-key';

const { preparePromptForImageGeneration } = await import('../dist/services/comfyui.js');
const { saveCloudflareConfig } = await import('../dist/services/cloudflare-image.js');
const { workspaceContext, generatedDir } = await import('../dist/services/workspace.js');
const { flowMusicDataDir, flowMusicDownloadsDir, saveFlowMusicAccount, getFlowMusicAccount } = await import(
  '../dist/services/flow-music/flow-music-profile.js'
);
const {
  HANUMAN_SCENE_DEFINITIONS,
  generateFlowMusicSceneImage,
  buildShortsSceneFilter,
  buildLongSceneFilter,
  buildScenesFromScript,
  buildShortsAssSubtitles,
  buildLongAssSubtitles,
  resolveApprovedAudioPath,
  setSongApproval,
} = await import('../dist/services/flow-music/flow-music-video-service.js');
const { flowMusicRouter } = await import('../dist/routes/flow-music.js');

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
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 1 })
    .toBuffer();
}

const sampleHdPng = await makeTexturedPng(2048, 1152);
assert.ok(sampleHdPng.length > 10_000, `Expected textured PNG >= 10KB, got ${sampleHdPng.length}`);

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

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
  if (originalDataDir === undefined) delete process.env.TUBEFLOW_DATA_DIR;
  else process.env.TUBEFLOW_DATA_DIR = originalDataDir;
  if (originalFlowMusicDir === undefined) delete process.env.FLOW_MUSIC_DATA_DIR;
  else process.env.FLOW_MUSIC_DATA_DIR = originalFlowMusicDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('HANUMAN_SCENE_DEFINITIONS avoids 2D cartoon triggers and preserves dialogues', () => {
  assert.equal(HANUMAN_SCENE_DEFINITIONS.length, 8);
  for (const scene of HANUMAN_SCENE_DEFINITIONS) {
    assert.ok(scene.line.trim().length > 5);
    assert.ok(scene.caption.trim().length > 5);
    assert.ok(scene.duration > 0);
    assert.doesNotMatch(scene.prompt, /graphic novel|pollinations/i);
    const prepared = preparePromptForImageGeneration(scene.prompt, {
      forCloudflare: false,
      force2dStylized: false,
    });
    assert.equal(prepared.is2dStylized, false);
  }
});

test('generateFlowMusicSceneImage requests 2K on gemini-3.1-flash-image, retries on 400 imageSize error, and never hits Pollinations', async () => {
  saveCloudflareConfig({
    provider: 'google',
    googleModel: 'gemini-3.1-flash-image',
    endpoints: [],
  });

  const googleBodies = [];
  let rejectImageSizeOnce = false;

  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    assert.ok(!urlStr.includes('pollinations.ai'), `Forbidden Pollinations request: ${urlStr}`);

    if (urlStr.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'mock-adc-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.includes('generativelanguage.googleapis.com')) {
      const parsed = init.body ? JSON.parse(String(init.body)) : {};
      googleBodies.push({ url: urlStr, body: parsed });

      if (rejectImageSizeOnce && parsed?.generationConfig?.imageConfig?.imageSize) {
        rejectImageSizeOnce = false;
        return new Response(JSON.stringify({ error: { message: 'Unknown field imageSize' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: sampleHdPng.toString('base64'),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.startsWith('http://127.0.0.1:8188')) {
      throw new Error('ComfyUI offline in test');
    }

    throw new Error(`Unexpected network call in test: ${urlStr}`);
  };

  // 1. Direct 2K generation
  const outPng1 = path.join(tmpDir, 'scene_2k.png');
  const res1 = await workspaceContext.run({ accountId: 'ancient_dharma', profile: 'shorts' }, () =>
    generateFlowMusicSceneImage({
      prompt: HANUMAN_SCENE_DEFINITIONS[0].prompt,
      outputPath: outPng1,
      seed: 1008,
      aspectRatio: '16:9',
      index: 0,
    })
  );

  assert.equal(res1.provider, 'google');
  assert.equal(res1.model, 'gemini-3.1-flash-image');
  assert.ok(fs.existsSync(outPng1));
  const meta1 = await sharp(outPng1).metadata();
  assert.equal(meta1.format, 'png');
  assert.equal(meta1.width, 2048);
  assert.equal(meta1.height, 1152);
  assert.equal(googleBodies[0].body.generationConfig.imageConfig.imageSize, '2K');
  assert.equal(googleBodies[0].body.generationConfig.imageConfig.aspectRatio, '16:9');
  const genRoot = workspaceContext.run({ accountId: 'ancient_dharma', profile: 'shorts' }, () => generatedDir());
  assert.equal(fs.existsSync(genRoot) ? fs.readdirSync(genRoot).filter((d) => d.startsWith('flow_music_')).length : 0, 0);

  // 2. Endpoint 400 rejecting imageSize automatically retries without imageSize
  rejectImageSizeOnce = true;
  const outPng2 = path.join(tmpDir, 'scene_retry.png');
  const res2 = await workspaceContext.run({ accountId: 'ancient_dharma', profile: 'shorts' }, () =>
    generateFlowMusicSceneImage({
      prompt: HANUMAN_SCENE_DEFINITIONS[1].prompt,
      outputPath: outPng2,
      seed: 1050,
      aspectRatio: '16:9',
      index: 1,
    })
  );
  assert.equal(res2.provider, 'google');
  assert.equal(googleBodies.length, 3);
  assert.equal(googleBodies[1].body.generationConfig.imageConfig.imageSize, '2K');
  assert.equal(googleBodies[2].body.generationConfig.imageConfig.imageSize, undefined);
  assert.equal(googleBodies[2].body.generationConfig.imageConfig.aspectRatio, '16:9');
});

test('generateFlowMusicSceneImage fails over from Google to Cloudflare (keeping 16:9 in shorts profile) and refuses brown placeholder on total failure', async () => {
  saveCloudflareConfig({
    provider: 'google',
    googleModel: 'gemini-3.1-flash-image',
    model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    endpoints: [
      {
        id: 'cf-test-worker',
        label: 'Test Worker',
        mode: 'worker',
        workerUrl: 'https://free-image-api.example.workers.dev/generate',
        workerApiKey: 'secret-worker-key',
        accountId: '',
        apiToken: '',
        disabled: false,
      },
    ],
  });

  const cfBodies = [];
  let failCloudflare = false;

  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    assert.ok(!urlStr.includes('pollinations.ai'), `Forbidden Pollinations request: ${urlStr}`);

    if (urlStr.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'mock-adc-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.startsWith('https://free-image-api.example.workers.dev')) {
      cfBodies.push(init.body ? JSON.parse(String(init.body)) : {});
      if (failCloudflare) {
        return new Response(JSON.stringify({ error: 'Worker overloaded' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(sampleHdPng, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }

    if (urlStr.startsWith('http://127.0.0.1:8188')) {
      throw new Error('ComfyUI offline in test');
    }

    throw new Error(`Unexpected network call in test: ${urlStr}`);
  };

  const cfOut = path.join(tmpDir, 'scene_cf_failover.png');
  const failoverRes = await workspaceContext.run({ accountId: 'ancient_dharma', profile: 'shorts' }, () =>
    generateFlowMusicSceneImage({
      prompt: HANUMAN_SCENE_DEFINITIONS[2].prompt,
      outputPath: cfOut,
      seed: 1092,
      aspectRatio: '16:9',
      index: 2,
    })
  );

  assert.equal(failoverRes.provider, 'cloudflare');
  // Must stay landscape 16:9 (width > height) even when workspace profile is 'shorts'
  assert.ok(cfBodies[0].width > cfBodies[0].height, `Expected landscape dims, got ${cfBodies[0].width}x${cfBodies[0].height}`);
  const cfMeta = await sharp(cfOut).metadata();
  assert.ok((cfMeta.width || 0) > (cfMeta.height || 0));

  // When every provider fails, reject instead of drawing a solid brown FFmpeg placeholder box
  failCloudflare = true;
  const failedOut = path.join(tmpDir, 'scene_should_not_exist.png');
  await assert.rejects(
    () =>
      workspaceContext.run({ accountId: 'ancient_dharma', profile: 'shorts' }, () =>
        generateFlowMusicSceneImage({
          prompt: HANUMAN_SCENE_DEFINITIONS[3].prompt,
          outputPath: failedOut,
          seed: 1134,
          aspectRatio: '16:9',
          index: 3,
        })
      ),
    /HD scene image generation failed/
  );
  assert.equal(fs.existsSync(failedOut), false);
});

test('HD FFmpeg Lanczos filters build cleanly and render valid 1080x1920 Shorts & 1920x1080 Long clips', async () => {
  const shortsFilter = buildShortsSceneFilter(1, true);
  assert.ok(shortsFilter.includes('scale=2560:1440:flags=lanczos'));
  assert.ok(shortsFilter.includes('unsharp='));
  assert.ok(!shortsFilter.includes('1280:720'));

  const longFilter = buildLongSceneFilter(1, false, 1920, 1080);
  assert.ok(longFilter.includes('scale=3840:2160:flags=lanczos'));
  assert.ok(longFilter.includes('unsharp='));
  assert.ok(!longFilter.includes('vignette=PI/4'));

  const inputPng = path.join(tmpDir, 'ffmpeg_hd_input.png');
  fs.writeFileSync(inputPng, sampleHdPng);

  const shortsMp4 = path.join(tmpDir, 'smoke_shorts.mp4');
  await runProcess('ffmpeg', [
    '-y',
    '-loop', '1',
    '-framerate', '30',
    '-t', '1',
    '-i', inputPng,
    '-filter_complex', shortsFilter,
    '-map', '[out]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '14',
    '-pix_fmt', 'yuv420p',
    '-t', '1',
    shortsMp4,
  ]);
  const shortsProbe = await runProcess('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,codec_name',
    '-of', 'json',
    shortsMp4,
  ]);
  const shortsStream = JSON.parse(shortsProbe.stdout).streams[0];
  assert.equal(shortsStream.width, 1080);
  assert.equal(shortsStream.height, 1920);
  assert.equal(shortsStream.codec_name, 'h264');

  const longMp4 = path.join(tmpDir, 'smoke_long.mp4');
  await runProcess('ffmpeg', [
    '-y',
    '-loop', '1',
    '-framerate', '30',
    '-t', '1',
    '-i', inputPng,
    '-vf', longFilter,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '14',
    '-pix_fmt', 'yuv420p',
    '-t', '1',
    longMp4,
  ]);
  const longProbe = await runProcess('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,codec_name',
    '-of', 'json',
    longMp4,
  ]);
  const longStream = JSON.parse(longProbe.stdout).streams[0];
  assert.equal(longStream.width, 1920);
  assert.equal(longStream.height, 1080);
  assert.equal(longStream.codec_name, 'h264');
});

test('custom script scene planning, ASS banner/escaping, audio upload, state persistence, and clean reset preserve login', async () => {
  // 1. Plan custom script scenes deterministically (no Hanuman hardcode or 2D trigger)
  const customScenes = await buildScenesFromScript({
    lyrics: '[Verse 1]\nMoonlight falls on silent pine trees\nA traveler walks through golden mist\nDestiny calls across {the} canyon',
    topic: 'Traveler Under Moonlight',
    mood: 'mysterious cinematic',
    targetDuration: 30,
    offlineOnly: true,
  });
  assert.equal(customScenes.length, 3);
  assert.equal(customScenes[0].caption, 'Moonlight falls on silent pine trees');
  assert.doesNotMatch(customScenes[0].prompt, /graphic novel|hanuman/i);

  // Blank banner omits Goosebumps header; custom caption escapes ASS braces cleanly
  const blankBannerAss = path.join(tmpDir, 'custom_blank_banner.ass');
  buildShortsAssSubtitles(customScenes, 30, blankBannerAss, '');
  const blankAssText = fs.readFileSync(blankBannerAss, 'utf8');
  assert.doesNotMatch(blankAssText, /Goosebumps/);
  assert.ok(blankAssText.includes('\\{the\\}'));

  const customBannerAss = path.join(tmpDir, 'custom_with_banner.ass');
  buildShortsAssSubtitles(customScenes, 30, customBannerAss, 'Night Journey');
  assert.ok(fs.readFileSync(customBannerAss, 'utf8').includes('Banner,,0,0,0,,Night Journey'));

  // 2. Mount flowMusicRouter and test normal-user upload -> approve -> state -> reset workflow
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  app.use('/api/flow-music', flowMusicRouter);

  const server = await new Promise((resolve) => {
    const inst = app.listen(0, '127.0.0.1', () => resolve(inst));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/flow-music`;

  try {
    saveFlowMusicAccount({ account: 'creator@example.com', status: 'ok' });

    // Upload a real small WAV file
    const wavBuf = Buffer.alloc(44 + 400);
    wavBuf.write('RIFF', 0);
    wavBuf.writeUInt32LE(36 + 400, 4);
    wavBuf.write('WAVEfmt ', 8);
    wavBuf.writeUInt32LE(16, 16);
    wavBuf.writeUInt16LE(1, 20);
    wavBuf.writeUInt16LE(1, 22);
    wavBuf.writeUInt32LE(8000, 24);
    wavBuf.writeUInt32LE(8000, 28);
    wavBuf.writeUInt16LE(1, 32);
    wavBuf.writeUInt16LE(8, 34);
    wavBuf.write('data', 36);
    wavBuf.writeUInt32LE(400, 40);

    const uploadRes = await originalFetch(`${base}/upload-track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/wav',
        'x-track-filename': 'moonlight.wav',
        'x-track-title': encodeURIComponent('Moonlight Theme'),
        'x-script-id': 'custom_proj_1',
      },
      body: wavBuf,
    });
    assert.equal(uploadRes.status, 200);
    const uploadData = await uploadRes.json();
    assert.equal(uploadData.track.title, 'Moonlight Theme');

    // /latest-track returns the real uploaded track title, not Hanuman
    const latestTrackRes = await originalFetch(`${base}/latest-track`);
    const latestTrackData = await latestTrackRes.json();
    assert.equal(latestTrackData.track.title, 'Moonlight Theme');

    // Downloading uploaded WAV returns audio/wav
    const dlRes = await originalFetch(`http://127.0.0.1:${server.address().port}${latestTrackData.track.url}`);
    assert.equal(dlRes.status, 200);
    assert.equal(dlRes.headers.get('content-type'), 'audio/wav');

    // Approve uploaded track and ensure resolveApprovedAudioPath finds the uploaded file directly
    setSongApproval('custom_proj_1', true, latestTrackData.track.url, latestTrackData.track.title);
    const resolvedPath = resolveApprovedAudioPath('custom_proj_1');
    assert.ok(resolvedPath.endsWith('.wav') && fs.existsSync(resolvedPath));

    // Persist studio state & dummy video artifacts, then call /reset
    await originalFetch(`${base}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scriptId: 'custom_proj_1',
        title: 'Moonlight Theme',
        lyrics: 'Moonlight falls on silent pine trees',
        scenes: customScenes,
      }),
    });
    const vidDir = path.join(flowMusicDownloadsDir(), 'videos');
    fs.mkdirSync(vidDir, { recursive: true });
    fs.writeFileSync(path.join(vidDir, 'fv_123_abc_scene_0.png'), sampleHdPng);
    fs.writeFileSync(path.join(vidDir, 'fv_123_abc_shorts.mp4'), Buffer.from('mp4'));

    const resetRes = await originalFetch(`${base}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptId: 'custom_proj_1', scope: 'all' }),
    });
    assert.equal(resetRes.status, 200);
    const resetJson = await resetRes.json();
    assert.ok(resetJson.cleared.clearedTracks >= 1);
    assert.ok(resetJson.cleared.clearedVideoFiles >= 2);
    assert.ok(resetJson.cleared.clearedApprovals >= 1);
    assert.equal(resetJson.cleared.stateReset, true);
    assert.equal(resetJson.state.title, '');
    assert.deepEqual(resetJson.state.scenes, []);

    // Latest track & videos are clean empty, while login account remains intact
    const afterTrack = await (await originalFetch(`${base}/latest-track`)).json();
    assert.equal(afterTrack.track, null);
    const afterVideos = await (await originalFetch(`${base}/latest-videos`)).json();
    assert.equal(afterVideos.shorts, null);
    assert.equal(afterVideos.long, null);
    assert.deepEqual(afterVideos.images, []);
    assert.equal(getFlowMusicAccount().account, 'creator@example.com');
    assert.ok(fs.existsSync(path.join(flowMusicDataDir(), 'account.json')));
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
