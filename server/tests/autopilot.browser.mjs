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
const app = express(); app.use(express.json());
app.get('/api/accounts', (_req, res) => res.json({ accounts: [account] }));
app.use('/api/accounts/default/profiles/shorts', (req, res) => {
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
  if (req.path === '/retention/edit') { productionCalls.push('edit'); script.retentionEdit = edit; return res.json({ edit }); }
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
  if (req.path === '/llm/research') return res.json({ researchData: 'Verified traditional context.', sources: [] });
  if (req.path === '/llm/chat/stream') { productionCalls.push('script'); return res.type('text/event-stream').send(`data: ${JSON.stringify({ token: '<script>Hanuman rediscovered his strength.</script><image_prompt>A traditional scene in a forest.</image_prompt>', finishReason: 'STOP' })}\n\ndata: {"done":true}\n\n`); }
  if (req.path === '/llm/extract') return res.json({ script: 'Hanuman rediscovered his strength.', ttsText: 'Hanuman rediscovered his strength.', imagePrompts: ['A traditional scene in a forest.'] });
  if (req.path === '/generate/image') return res.json({ generatedImages: [{ index: 0, status: 'done', url: '/fixture.png', prompt: 'A traditional scene in a forest.' }] });
  if (req.path === '/tts/generate') return res.json({ publicUrl: '/fixture.wav', voice: 'builtin' });
  if (req.path === '/render/status/autopilot-test') return res.json({ status: 'done', videos: [{ url: '/api/accounts/default/profiles/shorts/render/file/autopilot-test/final.mp4', filename: 'final.mp4' }] });
  if (req.path === '/youtube/generate-metadata') return res.json({ titles: ['Hanuman’s forgotten strength'], description: 'A traditional story.', tags: ['dharma'] });
  if (req.path === '/youtube/upload') {
    productionCalls.push('upload');
    uploadRequests.push(req.body);
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
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Run Script Only').disabled), true);
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
  await click('Close');
  await page.click('[aria-label="Profile and voices"]');
  await page.waitForFunction(() => document.body.textContent.includes('70.0% average viewed'));
  assert.ok(await page.$('svg[aria-label="Audience retention for Why Hanuman forgot his strength"]'));
  await page.screenshot({ path: 'artifacts/retention-profile-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'artifacts/retention-profile-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Auto-Pilot browser checks passed: optional topic, enabled Run, profile research, repeat rejection, simulated production through YouTube export, desktop and mobile.');
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
