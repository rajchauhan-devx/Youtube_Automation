import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://127.0.0.1:3001';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`API ${endpoint} failed (${res.status}): ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

const CHANNELS = [
  {
    id: 'acct_3ea89878-0f41-4dc9-86e5-3f55cda46ef7',
    name: 'Rule Zero',
    voice: 'en-US-Chirp3-HD-Achird',
    theme: 'tactical-cyber',
    scriptId: `usr_rz_mixed_${Date.now()}`,
    scriptName: 'The Simulation Glitch: Reality Error',
    topic: 'The Simulation Glitch: When Reality Forgot to Render',
    description: 'What happens when reality itself suffers an unhandled exception? An in-depth cinematic sci-fi thought experiment exploring quantum simulation boundaries and the laws of universe code.\n\nSubscribe to Rule Zero for deep speculative science, cyberpunk philosophy, and futuristic anomalies.',
    tags: ['Rule Zero', 'Simulation Theory', 'SciFi', 'Cyberpunk', 'Quantum Computing', 'Futurism', 'Universe', 'AI', 'Glitch in the Matrix'],
    scenes: [
      {
        id: 'scene_001',
        chapter: 'The Glitch',
        role: 'story',
        mediaType: 'video',
        duration: 5.5,
        narration: 'At zero hour, the digital skyline of Neo-Kyoto froze, and the rain hung completely motionless in the air.',
        imagePrompt: 'Cinematic 16:9 landscape wide shot of a rainy cyberpunk metropolis at twilight with neon towers and holographic signs. Individual raindrops are suspended completely frozen mid-air, casting refractions of glowing cyan and magenta light over the wet asphalt streets. Photorealistic, 8k resolution, volumetric atmospheric haze, deep contrast, blade runner aesthetics, no text, no watermark.',
        videoPrompt: 'Slow cinematic camera dolly through the suspended raindrops in the cyberpunk street, rain remaining stationary while volumetric neon fog drifts slowly through the alleyway.',
      },
      {
        id: 'scene_002',
        chapter: 'The Vault',
        role: 'story',
        mediaType: 'image',
        duration: 5.5,
        narration: 'Deep inside the quantum server vault, engineers uncovered an impossible recursive code loop.',
        imagePrompt: 'Cinematic 16:9 landscape interior of a subterranean quantum computing vault. Towering server monoliths with pulsating blue fiber optic filaments flank a central glass pedestal displaying an intricate floating 3D holographic matrix schematic. Dark industrial sci-fi lighting, moody shadows, photorealistic engineering details, 8k, no cartoon, no text.',
      },
      {
        id: 'scene_003',
        chapter: 'The Grid',
        role: 'story',
        mediaType: 'video',
        duration: 5.5,
        narration: 'Beneath the physical world lay raw mathematical geometry, proving humanity lived inside a construct.',
        imagePrompt: 'Cinematic 16:9 landscape shot of a futuristic canyon where physical rock surfaces fracture to reveal glowing wireframe polygon grids and glowing cyan circuit traces beneath the stone. Dramatic sun setting over the digital horizon, cinematic lighting, ultra-realistic textures, 8k resolution, no watermark, no logo.',
        videoPrompt: 'Camera tilts upwards towards the wireframe mountain peaks as geometric light pulses ripple along the subterranean gridlines.',
      },
      {
        id: 'scene_004',
        chapter: 'The Reset',
        role: 'story',
        mediaType: 'image',
        duration: 5.5,
        narration: 'The universe had an undo button, and someone had just reached out to press it.',
        imagePrompt: 'Cinematic 16:9 landscape shot from high orbit looking down at Earth encased in a faint, shimmering geodesic energy grid. In the dark void of space, a colossal luminous cosmic monolith hovers quietly. Dramatic cinematic rim lighting from the rising sun, photorealistic interstellar photograph, 8k resolution, majestic sci-fi scale.',
      },
    ],
  },
  {
    id: 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab',
    name: 'Against the Odds',
    voice: 'en-US-Chirp3-HD-Achernar',
    theme: 'archival-compass',
    scriptId: `usr_ato_mixed_${Date.now() + 1}`,
    scriptName: 'The 10-Mile Crawl: Douglas Mawson Solo Survival',
    topic: 'The 10-Mile Crawl: Douglas Mawson Solo Survival',
    description: 'In 1913, Australian explorer Douglas Mawson faced the most harrowing solo survival ordeal in human history. Starving, suffering from severe frostbite, and falling into bottomless crevasses, he crawled 100 miles across Antarctica.\n\nSubscribe to Against the Odds for incredible true survival stories and human resilience.',
    tags: ['Against the Odds', 'Douglas Mawson', 'Antarctica', 'Survival Story', 'True History', 'Human Endurance', 'Explorer', 'History Documentary'],
    scenes: [
      {
        id: 'scene_001',
        chapter: 'The Abyss',
        role: 'story',
        mediaType: 'video',
        duration: 5.5,
        narration: 'In nineteen thirteen, deep in the frozen hell of Antarctica, Douglas Mawson watched his companions vanish into the abyss.',
        imagePrompt: 'Cinematic 16:9 landscape wide shot of the vast windswept Antarctic ice sheet under an ominous gray blizzard sky. A lone Edwardian explorer in heavy wool and fur-trimmed windproof parka stands near the jagged lip of a colossal blue ice crevasse. Snowdrifts swirl fiercely across the glacier. Photorealistic historical photography, National Geographic style, ultra-high detail, 8k, no cartoon.',
        videoPrompt: 'Slow cinematic pan across the desolate howling blizzard, wind whipping loose snow particles across the frozen crevasses as the lone figure looks down into the chasm.',
      },
      {
        id: 'scene_002',
        chapter: 'The Solitary March',
        role: 'story',
        mediaType: 'image',
        duration: 5.5,
        narration: 'Starving, frostbitten, and alone, he cut his sled in half and began a solitary hundred-mile march.',
        imagePrompt: 'Cinematic 16:9 landscape shot of an exhausted historical explorer trudging forward across jagged sastrugi ice fields. He drags a crude shortened wooden sledge behind him, his face encrusted with thick frost and ice around cracked weathered lips. Golden low polar sun raking across the blue ice ridges, harsh shadows, photorealistic, 8k resolution, heroic historical drama.',
      },
      {
        id: 'scene_003',
        chapter: 'The Fall',
        role: 'story',
        mediaType: 'video',
        duration: 5.5,
        narration: 'When the ice gave way beneath his boots, he dangled over a bottomless void, clawing back inch by inch.',
        imagePrompt: 'Cinematic 16:9 landscape view looking down inside a deep cobalt-blue ice crevasse. A mountaineer in vintage rope harness dangles against the sheer frozen wall, his ice-axe planted firmly into the glacial ice as snow showers tumble into the dark depths below. Dramatic high-stakes lighting, photorealistic textures, 8k, hyper-detailed.',
        videoPrompt: 'Tense slow camera push-in towards the dangling climber as he kicks his crampons into the ice and hauls himself upward on the safety rope.',
      },
      {
        id: 'scene_004',
        chapter: 'Defying the Impossible',
        role: 'story',
        mediaType: 'image',
        duration: 5.5,
        narration: 'Against impossible odds, Mawson dragged his broken body into camp, surviving the greatest solo ordeal in history.',
        imagePrompt: 'Cinematic 16:9 landscape shot of a lone battered explorer collapsing on his knees outside a small snow-buried wooden expedition hut in Commonwealth Bay. In the far distance on the freezing ocean horizon, a three-masted wooden ship sails away through pack ice. Twilight auroral glow in the Antarctic sky, emotionally powerful composition, 8k photorealistic.',
      },
    ],
  },
];

async function runPipelineForChannel(ch) {
  const prefix = `/api/accounts/${ch.id}/profiles/mixed`;
  console.log(`\n============================================================`);
  console.log(`🚀 STARTING PRODUCTION FOR CHANNEL: "${ch.name}" (${ch.id})`);
  console.log(`============================================================`);

  // Step 1: Create Mixed Media Script
  console.log(`\n[1/6] Creating 16:9 Mixed Media Script: "${ch.scriptName}"...`);
  const fullNarration = ch.scenes.map((s) => s.narration).join(' ');
  const imagePrompts = ch.scenes.map((s) => s.imagePrompt);

  const scriptDoc = {
    id: ch.scriptId,
    name: ch.scriptName,
    topicName: ch.topic,
    status: 'draft',
    locked: false,
    duration: 22,
    language: 'en',
    section: 'mixed',
    accountId: ch.id,
    howItWorks: '16:9 Landscape Mixed Media Video',
    prompts: [
      { id: 'mixed_template', name: 'Mixed Media 16:9 Master', content: 'Production V3' },
    ],
    scenePlan: {
      version: 1,
      title: ch.scriptName,
      thumbnailPrompt: ch.scenes[0].imagePrompt,
      scenes: ch.scenes,
      supportingNotes: '',
    },
    imagePrompts,
    narration: fullNarration,
    extractedScript: fullNarration,
  };

  await api(`${prefix}/scripts`, {
    method: 'POST',
    body: JSON.stringify(scriptDoc),
  });
  console.log(`✔ Script created successfully: ${ch.scriptId}`);

  // Step 2: Two-Step Verification & AI Orchestration
  console.log(`\n[2/6] Running AI Two-Step Verification & Overlay Orchestration...`);
  try {
    const verifyRes = await api(`/api/editing/two-step-verify`, {
      method: 'POST',
      body: JSON.stringify({
        scriptId: ch.scriptId,
        channelName: ch.name,
        theme: ch.theme,
      }),
    });
    console.log(`✔ Two-Step Verification Passed! Retention Score: ${verifyRes.report?.retentionScore}/100, Hook: ${verifyRes.report?.hookStrength}`);
    if (verifyRes.report?.mistakesCorrected?.length) {
      console.log(`  Fixes applied: ${verifyRes.report.mistakesCorrected.join('; ')}`);
    }
  } catch (err) {
    console.warn(`⚠ Two-Step Verification notice:`, err.message);
  }

  // Step 3: Synchronized Scene Narration (Google Chirp 3 HD)
  console.log(`\n[3/6] Generating Synchronized Voiceover (Chirp 3 HD: ${ch.voice})...`);
  await api(`${prefix}/tts/long/start`, {
    method: 'POST',
    body: JSON.stringify({
      scriptId: ch.scriptId,
      language: 'en',
      voice: ch.voice,
      provider: 'google',
    }),
  });

  // Poll TTS status
  let ttsReady = false;
  let audioAsset = null;
  while (!ttsReady) {
    await sleep(2000);
    const status = await api(`${prefix}/tts/long/status/${ch.scriptId}`);
    process.stdout.write(`  TTS progress: ${status.completed || 0}/${status.total || ch.scenes.length} scenes...\r`);
    if (status.status === 'done') {
      ttsReady = true;
      audioAsset = status.result;
      console.log(`\n✔ Synchronized audio generated: ${audioAsset?.url || audioAsset?.filename}`);
    } else if (status.status === 'error') {
      throw new Error(`TTS generation failed: ${status.error}`);
    }
  }

  // Step 4: Generate 16:9 Scene Keyframe Media (Google Cloud AI Image)
  console.log(`\n[4/6] Generating 16:9 Landscape Scene Visuals (Google AI / Cloudflare)...`);
  for (let i = 0; i < ch.scenes.length; i++) {
    const scene = ch.scenes[i];
    console.log(`  Generating Scene ${i + 1}/${ch.scenes.length} (${scene.mediaType}): ${scene.chapter}...`);
    const imgRes = await api(`${prefix}/generate/image`, {
      method: 'POST',
      body: JSON.stringify({
        scriptId: ch.scriptId,
        index: i,
        prompt: scene.imagePrompt,
        provider: 'google',
      }),
    });
    console.log(`  ✔ Scene ${i + 1} generated: ${imgRes.url}`);
  }

  // Refresh script state from store
  const currentScripts = await api(`${prefix}/scripts`);
  const activeScript = currentScripts.find((s) => s.id === ch.scriptId) || scriptDoc;
  const imagePaths = (activeScript.generatedImages || []).map((img) => img.url);
  const audioPath = (activeScript.generatedAudio?.[0]?.url) || (audioAsset?.url) || '';

  console.log(`✔ All scene assets ready: ${imagePaths.length} keyframes, Audio: ${audioPath}`);

  // Step 5: Render Broadcast-Quality 1080p Landscape MP4 Video
  console.log(`\n[5/6] Rendering 1920x1080 16:9 Video with Synchronized Audio & Motion...`);
  await api(`${prefix}/render/start`, {
    method: 'POST',
    body: JSON.stringify({
      scriptId: ch.scriptId,
      imagePaths,
      audioPath,
      narration: fullNarration,
      resolution: { width: 1920, height: 1080 },
      enableSubtitles: true,
      zoomFactor: 1.06,
    }),
  });

  // Poll render status
  let renderDone = false;
  let finalVideoFilename = '';
  let finalVideoUrl = '';
  while (!renderDone) {
    await sleep(3000);
    const rStatus = await api(`${prefix}/render/status/${ch.scriptId}`);
    if (rStatus.status === 'running') {
      process.stdout.write(`  Rendering: ${rStatus.progress || 10}% - ${rStatus.message || 'Processing'}...\r`);
    } else if (rStatus.status === 'done' && rStatus.videos?.length > 0) {
      renderDone = true;
      finalVideoFilename = rStatus.videos[0].filename;
      finalVideoUrl = rStatus.videos[0].url;
      console.log(`\n✔ Video rendered successfully! File: ${finalVideoFilename}`);
    } else if (rStatus.status === 'error') {
      throw new Error(`Video rendering failed: ${rStatus.error}`);
    }
  }

  // Step 6: Direct Upload & Publish to YouTube
  console.log(`\n[6/6] Publishing directly to YouTube (${ch.name})...`);
  const uploadRes = await api(`${prefix}/youtube/upload`, {
    method: 'POST',
    body: JSON.stringify({
      scriptId: ch.scriptId,
      videoFilename: finalVideoFilename,
      title: ch.scriptName,
      description: ch.description,
      tags: ch.tags,
      privacy: 'public',
      isShort: false,
    }),
  });

  console.log(`\n🎉 SUCCESS! Video published to YouTube for ${ch.name}!`);
  console.log(`  Title: ${uploadRes.title || ch.scriptName}`);
  console.log(`  YouTube Video ID: ${uploadRes.videoId}`);
  console.log(`  YouTube Live URL: ${uploadRes.videoUrl || `https://youtu.be/${uploadRes.videoId}`}`);

  return {
    channel: ch.name,
    title: uploadRes.title || ch.scriptName,
    videoId: uploadRes.videoId,
    videoUrl: uploadRes.videoUrl || `https://youtu.be/${uploadRes.videoId}`,
  };
}

async function main() {
  console.log(`============================================================`);
  console.log(`⭐ AUTONOMOUS MULTI-CHANNEL PRODUCTION & YOUTUBE PUBLISHER`);
  console.log(`Channels: 1. Rule Zero | 2. Against the Odds`);
  console.log(`Profile: Mixed Media (16:9 Landscape)`);
  console.log(`============================================================`);

  const results = [];
  for (const ch of CHANNELS) {
    try {
      const res = await runPipelineForChannel(ch);
      results.push(res);
    } catch (err) {
      console.error(`\n❌ Error during production for ${ch.name}:`, err);
      throw err;
    }
  }

  console.log(`\n============================================================`);
  console.log(`🏆 ALL PRODUCTIONS COMPLETE & PUBLISHED TO YOUTUBE!`);
  console.log(`============================================================`);
  results.forEach((r, idx) => {
    console.log(`${idx + 1}. [${r.channel}] ${r.title}`);
    console.log(`   Link: ${r.videoUrl}`);
  });
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
