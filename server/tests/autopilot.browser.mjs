import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import puppeteer from 'puppeteer';

const account = { id: 'default', name: 'Ancient Dharma', youtubeChannelTitle: 'Ancient Dharma', avatar: 'AD', color: '#3b82f6' };
let script = { id: 'autopilot-test', name: 'Ancient Dharma template', status: 'draft', lastUsed: 'Never', locked: false,
  prompts: [{ id: 'prompt', name: 'Script', content: 'Write an authentic researched story.' }], howItWorks: '', duration: 60 };
const topicRequests = [];
const uploadRequests = [];
const productionCalls = [];
const plan = { version: 1, topic: 'Why Hanuman forgot his strength', createdAt: '2026-10-19T12:00:00Z',
  hooks: [0, 1, 2].map(i => ({ openingLine: `Opening ${i + 1}`, openingVisual: 'A forest', curiosity: 'Why?', payoff: 'Strength rediscovered', reason: 'Clear and relevant' })),
  selectedHookIndex: 1, viewerPromise: 'Explain the traditional story.', structure: 'Question → story → insight',
  titles: ['Hanuman’s forgotten strength', 'A forgotten power', 'Remembering strength'], thumbnailConcept: 'Hanuman beside the ocean',
  description: 'A traditional story.', tags: ['dharma'], musicMood: 'calm', memoryEvidence: 'No sampled history yet.' };
const scenePlan = { version: 1, title: 'Hanuman', thumbnailPrompt: 'A traditional scene', scenes: [{ id: 'scene_1', chapter: 'Opening', role: 'story', mediaType: 'image', imagePrompt: 'A traditional scene in a forest.', narration: 'Hanuman rediscovered his strength.' }] };
const edit = { sourceHash: 'fixture', plan: scenePlan, notes: ['Removed unnecessary setup.'], sceneDirections: [{ sceneId: 'scene_1', purpose: 'Discovery', motion: 'hold', transition: 'cut' }], editedAt: '2026-10-19T12:00:00Z' };
let completeRun = false;
let blockReview = false;
let failImages = false;
let twoScenes = false;
let failAudio = false;
let failRender = false;
let failUpload = false;
let failScript = false;
let failEdit = false;
let failExtraction = false;
let videoOpening = false;
let changePromptDuringGeneration = false;
let diagnoses = 0;
let recoverVisuals = false, visualsRecovered = false, visualCreates = 0, visualResumes = 0;
const visualError = 'Rendered vision review has not passed for 2 motion graphic(s). Retry visual review before exporting.';
const visualPayload = () => ({ stale: false, assets: {}, artifactPreviews: {}, revisions: [],
  project: { id: 'visual-project', revisionId: visualsRecovered ? 'verified' : 'draft', status: visualsRecovered ? 'partial' : 'draft',
    inputs: { audioFilename: 'fixture.wav', imageAssets: script.generatedImages || [] }, settings: { visualReview: true },
    artifacts: visualsRecovered ? [{ id: 'graphic', enabled: true, graphic: { kind: 'composition' }, visualReview: { status: 'passed' } }] : [] },
  jobs: [{ id: 'visual-job', revisionId: 'draft', operation: 'generate', state: visualsRecovered ? 'partial' : 'failed',
    error: visualsRecovered ? undefined : visualError, updatedAt: '2026-10-21T12:00:00Z' }] });
const imageCalls = [];
let audioCalls = 0;
let renderCalls = 0;
const app = express(); app.use(express.json());
app.get('/api/accounts', (_req, res) => res.json({ accounts: [account] }));
app.use('/api/accounts/default/profiles/shorts', (req, res) => {
  if (req.path === '/recovery') return res.json({ fingerprint: 'fixture', stores: [], backups: [] });
  if (req.path === '/scripts') return res.json([script]);
  if (req.path === '/scripts/autopilot-test') {
    if (req.method === 'PUT') script = { ...script, ...req.body };
    return res.json(script);
  }
  if (req.path === '/youtube/retention/sync') return res.json({ status: 'updated', updated: 1, message: 'Imported actual watch-time observations.' });
  if (req.path === '/llm/topic-notes') return res.json({ name: 'Ancient Dharma', guidance: 'Traditional stories and clear explanations.', topics: [{
    topic: plan.topic, videoId: 'fixture-youtube', production: { hook: 'Opening 2', structure: plan.structure, duration: 60, scenes: [] },
    performance: { status: 'ready', views: 500, averageViewDuration: 42, averageViewPercentage: 70,
      startDate: '2026-10-01', endDate: '2026-10-19', curve: [{ elapsed: 0, watchRatio: 1 }, { elapsed: 0.5, watchRatio: 0.8 }, { elapsed: 1, watchRatio: 0.7 }],
      dips: [{ elapsed: 0.5, drop: 0.2, purpose: 'A clear story transition' }] },
  }] });
  if (req.path === '/retention/plan') { productionCalls.push('plan'); script.retentionPlan = plan; return res.json({ plan, brief: 'Start directly with the selected hook.' }); }
  if (req.path === '/retention/edit') { productionCalls.push('edit'); if (failEdit) return res.status(422).json({ error: 'Story edit unavailable for test.' }); script.retentionEdit = edit; return res.json({ edit }); }
  if (req.path === '/retention/review') {
    productionCalls.push('review');
    const review = { status: blockReview ? 'blocked' : 'passed', summary: blockReview ? 'Narration is inaudible at the opening.' : 'Opening and ending samples fulfill the promise.', findings: blockReview ? [{ severity: 'blocker', category: 'audio', detail: 'Voice is inaudible.' }] : [], duration: 60, sampleTimes: [0, 1.5, 4, 30, 59] };
    script.retentionReview = review; return res.json({ review });
  }
  if (req.path === '/llm/autopilot-topic') {
    topicRequests.push(req.body);
    return req.body.topic
      ? res.status(422).json({ error: 'This profile already exported this topic. Choose a new topic or leave Topic blank.' })
      : res.json({ topic: 'Why Hanuman forgot his strength', reason: 'A strong narrative matched to this profile.', historyCount: 7 });
  }
  if (req.path === '/youtube/status') return res.json({ configured: true, authenticated: completeRun });
  // Production is simulated; no live model, rendering or uploads are used.
  if (req.path === '/tts/status') return res.json({ ready: true });
  if (req.path === '/tts/voices') return res.json({ provider: 'Chatterbox', voices: [{ id: 'builtin', name: 'Built-in narrator' }] });
  if (req.path === '/llm/research') return res.json({ researchData: 'Verified traditional context.', sources: [] });
  if (req.path === '/llm/chat/stream') { productionCalls.push('script'); return res.type('text/event-stream').send(failScript ? `data: {"error":"Script unavailable for test."}\n\n` : `data: ${JSON.stringify({ token: '<script>Hanuman rediscovered his strength.</script><image_prompt>A traditional scene in a forest.</image_prompt>', finishReason: 'STOP' })}\n\ndata: {"done":true}\n\n`); }
  if (req.path === '/llm/extract') {
    if (failExtraction) return res.status(422).json({ error: 'Extraction unavailable for test.' });
    const extractedPlan = videoOpening ? { ...scenePlan, scenes: [
      { ...scenePlan.scenes[0], mediaType: 'video', videoPrompt: 'A tracking shot through the forest.' },
      { ...scenePlan.scenes[0], id: 'scene_2', imagePrompt: 'The ocean.' },
    ] } : undefined;
    return res.json({ script: 'Hanuman rediscovered his strength.', ttsText: 'Hanuman rediscovered his strength.',
      imagePrompts: extractedPlan ? extractedPlan.scenes.map(scene => scene.imagePrompt) : twoScenes ? ['A traditional scene in a forest.', 'The ocean.'] : ['A traditional scene in a forest.'],
      ...(extractedPlan ? { scenePlan: extractedPlan } : {}) });
  }
  if (req.path === '/supervisor/diagnose') { diagnoses++; return res.json({ recoveryAction: 'retry_stage' }); }
  if (recoverVisuals && req.path === '/editing/projects') { visualCreates++; return res.json(visualPayload()); }
  if (recoverVisuals && req.path === '/editing/projects/visual-project') return res.json(visualPayload());
  if (recoverVisuals && req.path === '/editing/projects/visual-project/generate') return res.json({ jobId: 'visual-job' });
  if (recoverVisuals && req.path === '/editing/jobs/visual-job/resume') { visualResumes++; visualsRecovered = true; return res.json({ id: 'visual-job', state: 'queued' }); }
  if (recoverVisuals && req.path === '/editing/jobs/visual-job') return res.json({ state: visualsRecovered ? 'partial' : 'failed', error: visualsRecovered ? undefined : visualError });
  if (req.path === '/generate/image') {
    imageCalls.push(req.body.index);
    if (changePromptDuringGeneration && req.body.index === 1) {
      changePromptDuringGeneration = false;
      script.scenePlan.scenes[1].imagePrompt = 'The ocean at sunset.';
      return res.status(400).json({ error: 'Choose a valid scene with its current extracted prompt.' });
    }
    if (videoOpening) assert.equal(req.body.prompt, script.scenePlan.scenes[req.body.index].imagePrompt);
    if (failImages && req.body.index === 1) return res.status(422).json({ error: 'Image quota unavailable for test.' });
    return res.json({ url: `/fixture-${req.body.index}.png`, seed: 42 });
  }
  if (req.path === '/tts/generate') { audioCalls++; return failAudio ? res.status(422).json({ error: 'Narration unavailable for test.' }) : res.json({ publicUrl: '/fixture.wav', filename: 'fixture.wav', voice: 'builtin' }); }
  if (req.path === '/tts/long/start') { audioCalls++; return res.json({ ok: true }); }
  if (req.path === '/tts/long/status/autopilot-test') return res.json({ status: 'done', result: { url: '/fixture.wav', filename: 'fixture.wav', voice: 'builtin', language: 'en' } });
  if (req.path === '/render/start') { renderCalls++; return failRender ? res.status(422).json({ error: 'Render unavailable for test.' }) : res.json({ ok: true }); }
  if (req.path === '/render/status/autopilot-test') return res.json({ status: 'done', videos: [{ url: '/api/accounts/default/profiles/shorts/render/file/autopilot-test/final.mp4', filename: 'final.mp4' }] });
  if (req.path === '/youtube/generate-metadata') return res.json({ titles: ['Hanuman’s forgotten strength'], description: 'A traditional story.', tags: ['dharma'] });
  if (req.path === '/youtube/upload') {
    productionCalls.push('upload');
    uploadRequests.push(req.body);
    if (failUpload) return res.status(422).json({ error: 'YouTube export unavailable for test.' });
    return res.json({ success: true, videoId: 'fixture-youtube', videoUrl: 'https://youtu.be/fixture-youtube', uploadedAt: '2026-10-19T12:00:00Z', privacyStatus: 'private', topicHistorySaved: true });
  }
  return res.json({});
});
app.use(express.static(path.resolve('dist')));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1050 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'preview', selectedScriptId: 'autopilot-test' })));
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle0' });
  const click = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    button.click();
  }, text);
  await click('Run Auto-Pilot');
  await page.waitForSelector('#run-topic');
  assert.equal(await page.$eval('#run-topic', input => input.required), false);
  assert.equal(await page.$eval('#run-topic', input => input.value), '');
  assert.equal(await page.$eval('form:has(#run-topic) button[type="submit"]', button => button.disabled), false);
  await click('Script only');
  assert.equal(await page.$eval('form:has(#run-topic) button[type="submit"]', button => button.disabled), true);
  await click('Auto-Pilot');
  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/autopilot-run-desktop.png' });
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'artifacts/autopilot-run-mobile.png' });
  await page.click('form:has(#run-topic) button[type="submit"]');
  await page.waitForFunction(() => document.body.textContent.includes('Connect this profile’s YouTube account before running Auto-Pilot.'));
  assert.equal(topicRequests.length, 1);
  assert.equal(topicRequests[0].topic, '');
  assert.equal(topicRequests[0].scriptId, script.id);
  assert.ok(await page.evaluate(() => document.body.textContent.includes('Checked 7 previously exported topics.')));
  assert.ok(await page.evaluate(() => document.body.textContent.includes('Why Hanuman forgot his strength')));
  await page.setViewport({ width: 1440, height: 1050 });
  await click('Close');
  await click('Run Auto-Pilot');
  await page.type('#run-topic', 'An already covered topic');
  await page.click('form:has(#run-topic) button[type="submit"]');
  await page.waitForFunction(() => document.body.textContent.includes('This profile already exported this topic.'));
  assert.equal(topicRequests[1].topic, 'An already covered topic');
  await click('Close');
  completeRun = true;
  await click('Run Auto-Pilot');
  await page.click('form:has(#run-topic) button[type="submit"]');
  await page.waitForFunction(() => document.body.textContent.includes('Production complete! Video exported to YouTube and topic recorded.'), { timeout: 30000 });
  assert.equal(uploadRequests.length, 1);
  assert.equal(uploadRequests[0].scriptId, script.id);
  assert.equal(uploadRequests[0].videoFilename, 'final.mp4');
  assert.equal(uploadRequests[0].privacyStatus, 'private');
  assert.equal(uploadRequests[0].title, 'Hanuman’s forgotten strength');
  assert.equal(uploadRequests[0].autoPilot, true);
  assert.deepEqual(productionCalls, ['plan', 'script', 'edit', 'review', 'upload']);
  assert.equal(script.topicName, 'Why Hanuman forgot his strength');
  assert.ok(await page.$('a[href="https://youtu.be/fixture-youtube"]'));
  await click('Close');
  // Return to the assistant and verify a failing final review never uploads.
  await page.evaluate(() => { localStorage.removeItem('tubeflow:v1:default'); localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'preview', selectedScriptId: 'autopilot-test' })); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'artifacts/autopilot-retention-plan.png' });
  blockReview = true;
  await click('Run Auto-Pilot');
  await page.$eval('#run-topic', input => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('form:has(#run-topic) button[type="submit"]');
  await page.waitForFunction(() => document.body.textContent.includes('Final review needs attention: Narration is inaudible at the opening.'), { timeout: 30000 });
  assert.equal(uploadRequests.length, 1, 'blocked final review must prevent a second upload');
  const beforeReviewResume = { production: productionCalls.length, images: imageCalls.length, audio: audioCalls, renders: renderCalls };
  blockReview = false;
  await click('Resume');
  await page.waitForFunction(() => document.body.textContent.includes('Production complete! Video exported to YouTube and topic recorded.'), { timeout: 30000 });
  assert.deepEqual(productionCalls.slice(beforeReviewResume.production), ['review', 'upload']);
  assert.equal(imageCalls.length, beforeReviewResume.images);
  assert.equal(audioCalls, beforeReviewResume.audio);
  assert.equal(renderCalls, beforeReviewResume.renders, 'review resume must reuse the finished MP4');
  await click('Close');

  // Fail halfway through images, reload, and keep all completed work on Resume.
  await page.evaluate(() => { localStorage.removeItem('tubeflow:v1:default'); localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'preview', selectedScriptId: 'autopilot-test' })); });
  await page.reload({ waitUntil: 'networkidle0' });
  twoScenes = true;
  failScript = true;
  failImages = true;
  await click('Run Auto-Pilot');
  await page.$eval('#run-topic', input => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('form:has(#run-topic) button[type="submit"]');
  await page.waitForFunction(() => document.body.textContent.includes('Pipeline halted: Script generation finished without response content.'), { timeout: 30000 });
  const hooksBeforeResume = productionCalls.filter(call => call === 'plan').length;
  failScript = false;
  failEdit = true;
  await click('Resume');
  await page.waitForFunction(() => document.body.textContent.includes('Pipeline halted: Story edit unavailable for test.'), { timeout: 30000 });
  assert.equal(productionCalls.filter(call => call === 'plan').length, hooksBeforeResume, 'script resume must preserve its hook plan');
  const scriptsBeforeResume = productionCalls.filter(call => call === 'script').length;
  failEdit = false;
  failExtraction = true;
  await click('Resume');
  await page.waitForFunction(() => document.body.textContent.includes('Pipeline halted: Extraction unavailable for test.'), { timeout: 30000 });
  assert.equal(productionCalls.filter(call => call === 'script').length, scriptsBeforeResume, 'story edit resume must preserve the generated script');
  const editsBeforeResume = productionCalls.filter(call => call === 'edit').length;
  failExtraction = false;
  await click('Resume');
  await page.waitForFunction(() => document.body.textContent.includes('Pipeline halted: Scene 2 image generation failed'), { timeout: 30000 });
  assert.equal(productionCalls.filter(call => call === 'edit').length, editsBeforeResume, 'extraction resume must preserve its story edit');
  assert.equal(script.generatedImages.length, 1);
  const beforeImagesResume = { production: productionCalls.length, topic: topicRequests.length, images: imageCalls.length };
  await page.screenshot({ path: 'artifacts/autopilot-resume-error.png' });
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'artifacts/autopilot-resume-mobile.png' });
  await page.setViewport({ width: 1440, height: 1050 });
  // Existing productions created before checkpoints were introduced can resume too.
  await page.evaluate(() => localStorage.removeItem('tubeflow:autopilot:default:shorts'));
  await page.reload({ waitUntil: 'networkidle0' });
  failImages = false;
  failAudio = true;
  await click('Resume Auto-Pilot');
  await page.waitForFunction(() => document.body.textContent.includes('Pipeline halted: Narration unavailable for test.'), { timeout: 30000 });
  assert.equal(topicRequests.length, beforeImagesResume.topic);
  assert.deepEqual(imageCalls.slice(beforeImagesResume.images), [1], 'only the missing scene should regenerate');
  assert.equal(productionCalls.length, beforeImagesResume.production, 'hooks, research and editing must not rerun');
  assert.equal(script.generatedImages.length, 2);

  const beforeAudioResume = imageCalls.length;
  await page.reload({ waitUntil: 'networkidle0' });
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Resume')));
  await click('Close');
  failAudio = false;
  failRender = true;
  await click('Resume Auto-Pilot');
  await page.waitForFunction(() => document.body.textContent.includes('Pipeline halted: Render unavailable for test.'), { timeout: 30000 });
  assert.equal(imageCalls.length, beforeAudioResume, 'audio resume must preserve images');
  const beforeRenderResume = { audio: audioCalls, renders: renderCalls, production: productionCalls.length };
  failRender = false;
  failUpload = true;
  await click('Resume');
  await page.waitForFunction(() => document.body.textContent.includes('Pipeline halted: YouTube export unavailable for test.'), { timeout: 30000 });
  assert.equal(audioCalls, beforeRenderResume.audio, 'render resume must preserve narration');
  assert.equal(renderCalls, beforeRenderResume.renders + 1);
  assert.deepEqual(productionCalls.slice(beforeRenderResume.production), ['review', 'upload']);
  const beforeUploadResume = { audio: audioCalls, renders: renderCalls, production: productionCalls.length };
  failUpload = false;
  await click('Resume');
  await page.waitForFunction(() => document.body.textContent.includes('Production complete! Video exported to YouTube and topic recorded.'), { timeout: 30000 });
  assert.deepEqual(productionCalls.slice(beforeUploadResume.production), ['upload']);
  assert.equal(audioCalls, beforeUploadResume.audio);
  assert.equal(renderCalls, beforeUploadResume.renders);
  assert.equal(await page.evaluate(() => localStorage.getItem('tubeflow:autopilot:default:shorts')), null);
  await click('Close');

  // A real extracted plan can start with video and recover a prompt race on its
  // next scene automatically, preserving the opening keyframe without Resume.
  await page.evaluate(() => { localStorage.removeItem('tubeflow:v1:default'); localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'preview', selectedScriptId: 'autopilot-test' })); });
  await page.reload({ waitUntil: 'networkidle0' });
  videoOpening = true;
  changePromptDuringGeneration = true;
  const beforeRecovery = { images: imageCalls.length, diagnoses, uploads: uploadRequests.length };
  await click('Run Auto-Pilot');
  await page.$eval('#run-topic', input => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('form:has(#run-topic) button[type="submit"]');
  await page.waitForFunction(() => document.body.textContent.includes('Production complete! Video exported to YouTube and topic recorded.'), { timeout: 30000 });
  assert.deepEqual(imageCalls.slice(beforeRecovery.images), [0, 1, 1], 'automatic scene refresh must reuse the completed opening');
  assert.equal(diagnoses, beforeRecovery.diagnoses, 'a prompt race uses deterministic recovery without model diagnosis');
  assert.equal(uploadRequests.length, beforeRecovery.uploads + 1);
  assert.equal(script.generatedImages[1].prompt, 'The ocean at sunset.');
  assert.ok(script.scenePlan.scenes.every(scene => scene.mediaType === 'image'), 'allowed still fallback reconciles the plan before narration and rendering');
  await click('Close');

  // Explicitly opt into graphics, then verify a failed optional visual stage
  // continues with footage rather than repeatedly halting the production.
  await page.evaluate(() => { localStorage.removeItem('tubeflow:v1:default'); localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'preview', selectedScriptId: 'autopilot-test' })); });
  await page.reload({ waitUntil: 'networkidle0' });
  recoverVisuals = true;
  const beforeVisualRecovery = { diagnoses, uploads: uploadRequests.length };
  await click('Run Auto-Pilot');
  await page.click('input[aria-label="Add optional graphics"]');
  await page.$eval('#run-topic', input => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('form:has(#run-topic) button[type="submit"]');
  await page.waitForFunction(() => document.body.textContent.includes('Production complete! Video exported to YouTube and topic recorded.'), { timeout: 30000 });
  assert.equal(visualCreates, 1, 'visual recovery must not generate another project');
  assert.equal(visualResumes, 0, 'optional graphics must not trigger a blocking repair loop');
  assert.equal(diagnoses, beforeVisualRecovery.diagnoses, 'rendered review errors have deterministic recovery');
  assert.equal(uploadRequests.length, beforeVisualRecovery.uploads + 1);
  await click('Close');
  await page.click('[aria-label="Profile and voices"]');
  await page.waitForFunction(() => document.body.textContent.includes('70.0% average viewed'), { timeout: 5000 }).catch(async error => {
    console.error(await page.evaluate(() => document.body.innerText));
    throw error;
  });
  assert.ok(await page.$('svg[aria-label="Audience retention for Why Hanuman forgot his strength"]'));
  await page.screenshot({ path: 'artifacts/retention-profile-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'artifacts/retention-profile-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Auto-Pilot browser checks passed: script, story edit, extraction, partial images, narration, render, review and upload Resume; automatic prompt recovery; video-opening keyframes and fallback; saved media reuse; desktop and mobile.');
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
