import http from 'http';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:3001';
const SCRIPT_ID = 'usr_dharma_conversational_dialogue';

function apiRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        ...headers,
      },
    };

    let postData = null;
    if (body) {
      if (Buffer.isBuffer(body)) {
        postData = body;
        options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/octet-stream';
        options.headers['Content-Length'] = body.length;
      } else {
        postData = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }
    }

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            const parsed = JSON.parse(buf.toString('utf8'));
            resolve({ status: res.statusCode, data: parsed, headers: res.headers });
          } catch (e) {
            resolve({ status: res.statusCode, raw: buf, headers: res.headers });
          }
        } else {
          resolve({ status: res.statusCode, raw: buf, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getScript() {
  const res = await apiRequest('GET', `/api/scripts/${SCRIPT_ID}`);
  if (res.status !== 200) throw new Error(`Failed to load script ${SCRIPT_ID}: ${res.status}`);
  return res.data;
}

async function updateScript(patch) {
  const res = await apiRequest('PUT', `/api/scripts/${SCRIPT_ID}`, patch);
  if (res.status !== 200) {
    console.error('Failed to update script:', res.status, res.data);
  }
  return res.data;
}

async function generateImage(index, prompt) {
  console.log(`[Image] Generating keyframe for Scene ${index + 1}...`);
  const res = await apiRequest('POST', '/api/generate/image', {
    scriptId: SCRIPT_ID,
    index,
    prompt,
    preset: 'standard',
    provider: 'google',
  });
  if (res.status !== 200 || !res.data?.ok) {
    throw new Error(`Scene ${index + 1} image generation failed: ${JSON.stringify(res.data)}`);
  }
  console.log(`[Image] Scene ${index + 1} keyframe generated: ${res.data.url}`);
  return res.data;
}

async function generateFlowVideo(index, prompt) {
  console.log(`[Flow] Submitting Flow Veo video job for Scene ${index + 1}...`);
  const jobRes = await apiRequest('POST', '/api/flow/jobs', {
    scriptId: SCRIPT_ID,
    sceneIndex: index,
    prompt,
    model: 'veo-3.1-fast',
    aspect: 'portrait',
    duration: 8,
    resolution: '720p',
    dryRun: false,
  });

  if (jobRes.status !== 200 && jobRes.status !== 202) {
    throw new Error(`Flow job submission failed: ${jobRes.status} ${JSON.stringify(jobRes.data)}`);
  }

  const jobId = jobRes.data.id;
  console.log(`[Flow] Job submitted: ${jobId}. Polling status...`);

  let attempts = 0;
  while (attempts < 60) {
    await sleep(4000);
    attempts++;
    const pollRes = await apiRequest('GET', `/api/flow/jobs/${jobId}`);
    if (pollRes.status !== 200) continue;

    const job = pollRes.data;
    console.log(`[Flow] Job ${jobId} status: ${job.state} (${job.stage || ''} ${job.progress || 0}%)`);

    if (job.state === 'done') {
      const downloadId = job.result?.downloadId;
      if (!downloadId) throw new Error('Job completed but no downloadId');

      console.log(`[Flow] Downloading video ${downloadId}...`);
      const dlRes = await apiRequest('GET', `/api/flow/downloads/${downloadId}`);
      if (dlRes.status !== 200 || !dlRes.raw) throw new Error(`Download failed with status ${dlRes.status}`);

      console.log(`[Flow] Importing video into Scene ${index + 1}...`);
      const importRes = await apiRequest('POST', `/api/media-import/${SCRIPT_ID}/${index}?extension=mp4`, dlRes.raw, {
        'Content-Type': 'application/octet-stream',
      });
      if (importRes.status !== 200) throw new Error(`Import failed with status ${importRes.status}`);

      console.log(`[Flow] Scene ${index + 1} video imported successfully!`);
      return true;
    }

    if (job.state === 'error') {
      throw new Error(`Flow generation error: ${job.error || 'Unknown error'}`);
    }
  }

  throw new Error(`Flow generation timed out after ${attempts * 4}s`);
}

async function synthesizeNarration() {
  console.log('\n=== STEP 2: VOICE NARRATION SYNTHESIS ===');
  console.log('[TTS] Starting multi-voice conversational narration synthesis (Hindi Chirp HD)...');

  const startRes = await apiRequest('POST', '/api/tts/long/start', {
    scriptId: SCRIPT_ID,
    language: 'hi',
    voice: 'hi-IN-Chirp3-HD-Charon',
    provider: 'google',
    rate: 0,
    pitch: 0,
    speed: 1,
    conversational: true,
  });

  if (startRes.status !== 200 && startRes.status !== 202) {
    throw new Error(`TTS start failed: ${startRes.status} ${JSON.stringify(startRes.data)}`);
  }

  console.log('[TTS] Synthesis started. Polling status...');
  let attempts = 0;
  while (attempts < 60) {
    await sleep(2000);
    attempts++;
    const statusRes = await apiRequest('GET', `/api/tts/long/status/${SCRIPT_ID}`);
    if (statusRes.status !== 200) continue;

    const data = statusRes.data;
    console.log(`[TTS] Status: ${data.status} (progress: ${data.progress || 0}%)`);

    if (data.status === 'done') {
      console.log('[TTS] Narration synthesis complete!');
      console.log('[TTS] Result:', JSON.stringify(data.result || data));
      return data.result;
    }

    if (data.status === 'error') {
      throw new Error(`TTS failed: ${data.error}`);
    }
  }

  throw new Error('TTS timed out');
}

async function renderVideo(script) {
  console.log('\n=== STEP 3: FINAL MP4 VIDEO RENDERING ===');
  const sortedAssets = [...(script.generatedImages || [])]
    .filter((img) => img.url)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const imagePaths = sortedAssets.map((img) => img.url.split('/').pop());
  const audioUrl = script.generatedAudio?.[0]?.url || '';
  const audioPath = audioUrl.split('/').pop();

  if (!audioPath) throw new Error('No audioPath found in script.generatedAudio');
  if (imagePaths.length !== 10) throw new Error(`Expected 10 image/video paths, got ${imagePaths.length}`);

  console.log(`[Render] imagePaths (${imagePaths.length}):`, imagePaths);
  console.log(`[Render] audioPath: ${audioPath}`);

  // Trigger cleanup
  await apiRequest('POST', '/api/supervisor/cleanup').catch(() => {});

  const renderPayload = {
    scriptId: SCRIPT_ID,
    imagePaths,
    audioPath,
    presenter: { enabled: false },
    narration: script.narration || '',
    duration: script.duration || 50,
    resolution: { width: 1080, height: 1920 },
    zoomFactor: 1.15,
    transitionDuration: 0.35,
    sceneAnalysis: {
      effects: imagePaths.map((_, i) => (i % 2 === 0 ? 'zoom_in' : 'pan_up')),
      transitions: imagePaths.map((_, i) => (i > 0 && i % 3 === 0 ? 'dissolve' : 'none')),
    },
    enableSubtitles: false,
    bgmTrack: 'tense',
    bgmVolume: 0.1,
    ttsVolume: 1,
    colorGrade: 'none',
    enableVignette: false,
    enableSfx: false,
  };

  const startRes = await apiRequest('POST', '/api/render/start', renderPayload);
  if (startRes.status !== 200 && startRes.status !== 202) {
    throw new Error(`Render start failed: ${startRes.status} ${JSON.stringify(startRes.data)}`);
  }

  console.log('[Render] Video render started. Polling status...');
  let attempts = 0;
  while (attempts < 120) {
    await sleep(3000);
    attempts++;
    const pollRes = await apiRequest('GET', `/api/render/status/${SCRIPT_ID}`);
    if (pollRes.status !== 200) continue;

    const job = pollRes.data;
    console.log(`[Render] Status: ${job.status} (progress: ${job.progress || 0}%, stage: ${job.stage || ''})`);

    if (job.status === 'done') {
      console.log('\n🎉 VIDEO RENDERING COMPLETED SUCCESSFULLY!');
      const videos = job.videos || [];
      console.log('[Render] Output videos:', JSON.stringify(videos, null, 2));
      return videos;
    }

    if (job.status === 'error') {
      throw new Error(`Render failed: ${job.error}`);
    }
  }

  throw new Error('Video render timed out');
}

async function main() {
  console.log('====================================================');
  console.log('AUTO-PILOT PIPELINE COMPLETION ENGINE');
  console.log('Script ID: ' + SCRIPT_ID);
  console.log('====================================================\n');

  let script = await getScript();
  const prompts = script.imagePrompts || [];
  const scenes = script.scenePlan?.scenes || [];

  console.log(`Total scenes: ${prompts.length}`);

  // Speaking scene indices where characters talk directly
  const speakingIndices = [0, 2, 4, 6, 7];

  for (let i = 0; i < prompts.length; i++) {
    script = await getScript();
    const existing = (script.generatedImages || []).find((g) => g.index === i && g.status === 'done');
    const isSpeaking = speakingIndices.includes(i);

    console.log(`\n--- SCENE ${i + 1} / 10 ---`);
    console.log(`Speaker: ${scenes[i]?.speaker || 'Unknown'}`);
    console.log(`Type: ${isSpeaking ? 'Speaking Character (Video)' : 'Narrator (Keyframe)'}`);

    if (existing) {
      console.log(`Asset already exists: mediaType=${existing.mediaType}, url=${existing.url}`);
      // If speaking scene and already has video, skip
      if (!isSpeaking || existing.mediaType === 'video') {
        continue;
      }
    }

    // Step A: Ensure keyframe image exists
    let keyframeUrl = existing?.url;
    if (!existing) {
      const imgRes = await generateImage(i, prompts[i]);
      keyframeUrl = imgRes.url;
      await sleep(1000);
    }

    // Step B: If speaking scene and doesn't have video yet, generate Flow video
    if (isSpeaking) {
      const currentAsset = (script.generatedImages || []).find((g) => g.index === i && g.status === 'done');
      if (currentAsset?.mediaType !== 'video') {
        const videoPrompt = scenes[i]?.videoPrompt || prompts[i];
        try {
          await generateFlowVideo(i, videoPrompt);
        } catch (flowErr) {
          console.warn(`[Flow Warning] Scene ${i + 1} video failed: ${flowErr.message}. Using image keyframe fallback.`);
        }
      }
    }
  }

  // Reconcile scene plan with generated assets
  script = await getScript();
  if (script.scenePlan?.scenes && script.generatedImages) {
    let planChanged = false;
    script.scenePlan.scenes.forEach((sc, idx) => {
      const asset = script.generatedImages.find((g) => g.index === idx);
      if (asset) {
        const actual = asset.mediaType || (asset.url && asset.url.endsWith('.mp4') ? 'video' : 'image');
        if (sc.mediaType !== actual) {
          sc.mediaType = actual;
          planChanged = true;
        }
      }
    });
    if (planChanged) {
      await updateScript({ scenePlan: script.scenePlan });
      console.log('[Reconcile] Scene plan mediaTypes synced with assets.');
    }
  }

  // Step 2: Voice Narration
  await synthesizeNarration();

  // Reload script to get generatedAudio
  script = await getScript();

  // Step 3: Video Render
  const renderedVideos = await renderVideo(script);

  console.log('\n====================================================');
  console.log('✅ ALL STAGES COMPLETED!');
  console.log('Final Rendered Video:');
  console.log(renderedVideos);
  console.log('====================================================');
}

main().catch((err) => {
  console.error('\n❌ PIPELINE EXECUTION FAILED:', err);
  process.exit(1);
});
