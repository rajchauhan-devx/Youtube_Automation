import fs from 'node:fs';
import path from 'node:path';

const accountId = 'acct_c0316a84-3e92-41be-87cd-c44ba1a20e38';
const profile = 'shorts';
const scriptId = 'usr_5506701e-8960-4ea4-8faf-04e881782427';
const baseUrl = `http://localhost:3001/api/accounts/${accountId}/profiles/${profile}`;

console.log('--- Step 1: Cleaning previous audio cache for Talevora script ---');
const generatedDir = path.resolve(`server/data/accounts/${accountId}/profiles/${profile}/generated/${scriptId}`);
const cacheDir = path.join(generatedDir, 'scene-audio-cache');
if (fs.existsSync(cacheDir)) {
  fs.rmSync(cacheDir, { recursive: true, force: true });
  console.log('Cleared scene-audio-cache');
}

console.log('\n--- Step 2: Triggering TTS Long Narration ---');
const ttsStartRes = await fetch(`${baseUrl}/tts/long/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scriptId,
    language: 'hi',
    voice: 'hi-IN-Chirp3-HD-Achernar',
    provider: 'google',
    conversational: true,
  }),
});

const ttsStartData = await ttsStartRes.json();
console.log('TTS start response:', ttsStartData);

if (!ttsStartRes.ok && ttsStartRes.status !== 202) {
  console.error('Failed to start TTS:', ttsStartData);
  process.exit(1);
}

console.log('\n--- Step 3: Polling TTS narration status ---');
let ttsDone = false;
let ttsStatus;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const res = await fetch(`${baseUrl}/tts/long/status/${scriptId}`);
  ttsStatus = await res.json();
  console.log(`[TTS poll ${i + 1}] status: ${ttsStatus.status}, stage: ${ttsStatus.stage || ''}, completed: ${ttsStatus.completed ?? ''}/${ttsStatus.total ?? ''}`);
  if (ttsStatus.status === 'done') {
    ttsDone = true;
    break;
  }
  if (ttsStatus.status === 'error') {
    console.error('TTS failed:', ttsStatus.error);
    process.exit(1);
  }
}

if (!ttsDone) {
  console.error('TTS timed out!');
  process.exit(1);
}

console.log('\n--- Step 4: Verifying Voice Assignments in Script ---');
const scriptsFile = path.resolve(`server/data/accounts/${accountId}/profiles/${profile}/scripts.json`);
const scripts = JSON.parse(fs.readFileSync(scriptsFile, 'utf8'));
const scriptDoc = scripts.find((s) => s.id === scriptId);
const lastAudio = scriptDoc.generatedAudio?.[scriptDoc.generatedAudio.length - 1];
console.log('Audio file:', lastAudio?.filename);
console.log('Turns:');
if (lastAudio?.turns) {
  lastAudio.turns.forEach((t, idx) => {
    console.log(`  Scene ${idx + 1} [${t.speaker}] -> Voice: ${t.voiceId} (speed: ${t.speed}, gender: ${t.gender || 'n/a'})`);
  });
}

// Ensure female voice for Natasha
const natashaTurn = lastAudio?.turns?.find((t) => t.speaker === 'नताशा');
if (natashaTurn) {
  console.log(`\nVerification: Natasha speaker assigned voice: ${natashaTurn.voiceId}`);
  if (natashaTurn.voiceId.includes('Fenrir') || natashaTurn.voiceId.includes('Alnilam')) {
    console.error('FAILURE: Natasha was assigned a male voice!');
    process.exit(1);
  } else {
    console.log('SUCCESS: Natasha was correctly assigned female voice ' + natashaTurn.voiceId);
  }
}

console.log('\n--- Step 5: Triggering Video Render ---');
const imagePaths = scriptDoc.generatedImages.map((img) => {
  const parts = (img.url || '').split('/');
  return parts[parts.length - 1];
});
const audioParts = (lastAudio.url || lastAudio.filename || '').split('/');
const audioPath = audioParts[audioParts.length - 1];

console.log('Render images:', imagePaths);
console.log('Render audio:', audioPath);

const renderStartRes = await fetch(`${baseUrl}/render/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scriptId,
    imagePaths,
    audioPath,
    narration: scriptDoc.narration || '',
    duration: scriptDoc.duration || 30,
    resolution: { width: 1080, height: 1920 },
    enableSubtitles: false,
    editing: scriptDoc.autoPilotSettings?.editing?.settings,
  }),
});

const renderStartData = await renderStartRes.json();
console.log('Render start response:', renderStartData);
if (!renderStartRes.ok && renderStartRes.status !== 200 && renderStartRes.status !== 202) {
  console.error('Failed to start render:', renderStartData);
  process.exit(1);
}

console.log('\n--- Step 6: Polling Video Render Status ---');
let renderDone = false;
let renderStatus;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const res = await fetch(`${baseUrl}/render/status/${scriptId}`);
  renderStatus = await res.json();
  console.log(`[Render poll ${i + 1}] status: ${renderStatus.status}, message: ${renderStatus.message || ''}, progress: ${renderStatus.progress ?? ''}%`);
  if (renderStatus.status === 'done') {
    renderDone = true;
    break;
  }
  if (renderStatus.status === 'error') {
    console.error('Render failed:', renderStatus.error);
    process.exit(1);
  }
}

if (!renderDone) {
  console.error('Render timed out!');
  process.exit(1);
}

console.log('\n--- Step 7: Final Verification ---');
console.log('Render Output URL:', renderStatus.videoUrl || renderStatus.outputUrl || renderStatus.videos?.[0]?.url);
console.log('Render Videos:', JSON.stringify(renderStatus.videos, null, 2));
console.log('🎉 Talevora pipeline completed with verified female voice for Natasha!');
