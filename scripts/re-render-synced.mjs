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
      headers: { ...headers },
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
            resolve({ status: res.statusCode, data: JSON.parse(buf.toString('utf8')), headers: res.headers });
          } catch {
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
  if (res.status !== 200) throw new Error(`Failed to load script ${SCRIPT_ID}`);
  return res.data;
}

async function synthesizeNaturalNarration() {
  console.log('=== STEP 1: SYNTHESIZING NATURAL AUDIO WITH BREATH PAUSES & PACING ===');
  const startRes = await apiRequest('POST', '/api/tts/long/start', {
    scriptId: SCRIPT_ID,
    language: 'hi',
    voice: 'hi-IN-Chirp3-HD-Charon',
    provider: 'google',
    conversational: true,
  });

  if (startRes.status !== 200 && startRes.status !== 202) {
    throw new Error(`TTS start failed: ${startRes.status} ${JSON.stringify(startRes.data)}`);
  }

  console.log('[TTS] Synthesis started. Polling status...');
  while (true) {
    await sleep(2000);
    const statusRes = await apiRequest('GET', `/api/tts/long/status/${SCRIPT_ID}`);
    if (statusRes.status !== 200) continue;

    const data = statusRes.data;
    console.log(`[TTS] Status: ${data.status} (progress: ${data.progress || 0}%)`);

    if (data.status === 'done') {
      console.log('[TTS] Natural narration synthesized successfully!');
      return data.result;
    }

    if (data.status === 'error') {
      throw new Error(`TTS failed: ${data.error}`);
    }
  }
}

async function renderVideo(script) {
  console.log('\n=== STEP 2: RENDERING FINAL LIP-SYNCED MP4 ===');
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
  while (true) {
    await sleep(3000);
    const pollRes = await apiRequest('GET', `/api/render/status/${SCRIPT_ID}`);
    if (pollRes.status !== 200) continue;

    const job = pollRes.data;
    console.log(`[Render] Status: ${job.status} (progress: ${job.progress || 0}%, stage: ${job.stage || ''})`);

    if (job.status === 'done') {
      console.log('\n🎉 RE-RENDER COMPLETED SUCCESSFULLY WITH NATURAL LIP-SYNC & BREATH TIMING!');
      const videos = job.videos || [];
      console.log('[Render] Output videos:', JSON.stringify(videos, null, 2));
      return videos;
    }

    if (job.status === 'error') {
      throw new Error(`Render failed: ${job.error}`);
    }
  }
}

async function main() {
  console.log('====================================================');
  console.log('LIP-SYNC & NATURAL AUDIO RE-SYNTHESIS AND RENDER');
  console.log('Script ID: ' + SCRIPT_ID);
  console.log('====================================================\n');

  // Step 1: Synthesize natural audio
  await synthesizeNaturalNarration();

  // Step 2: Reload script and render
  const script = await getScript();
  const videos = await renderVideo(script);

  console.log('\n====================================================');
  console.log('✅ ALL STAGES COMPLETE!');
  console.log('New Rendered Video:', videos);
  console.log('====================================================');
}

main().catch((err) => {
  console.error('\n❌ EXECUTION FAILED:', err);
  process.exit(1);
});
