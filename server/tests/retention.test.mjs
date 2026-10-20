import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { google } from 'googleapis';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-retention-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const ws = await import('../dist/services/workspace.js');
const accounts = await import('../dist/services/accounts.js');
const notes = await import('../dist/services/topic-notes.js');
const retention = await import('../dist/services/retention.js');
const analytics = await import('../dist/services/retention-analytics.js');
const { reviewRenderedVideo, renderFileHash, reviewSampleTimes } = await import('../dist/services/retention-review.js');
const { store } = await import('../dist/services/store.js');
const { runMedia } = await import('../dist/services/media-process.js');
const { renderRevision } = await import('../dist/services/render-revision.js');
const { buildFilterComplex } = await import('../dist/services/video.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');

test('final review covers each scene and late motion graphics instead of only five global frames', () => {
  const scenes = Array.from({ length: 11 }, (_, i) => ({ start: i * 7, end: (i + 1) * 7 }));
  const graphics = [{ start: 36.4, end: 43.9 }, { start: 51.6, end: 59.6 }];
  const times = reviewSampleTimes(77, scenes, graphics);
  for (const window of [...scenes, ...graphics]) {
    for (const t of [0.5, 0.85]) assert.ok(times.includes(Math.round((window.start + (window.end - window.start) * t) * 1000) / 1000));
  }
  assert.ok(times.length > 20);
  assert.ok(times.every((t, i) => t >= 0 && t < 77 && (i === 0 || t > times[i - 1])));
});
const auth = await import('../dist/services/youtube-auth.js');
accounts.updateAccount('default', { name: 'Ancient Dharma' });
const ruleZero = accounts.createAccount('Rule Zero');
const odds = accounts.createAccount('Against the Odds');
const scope = (accountId = 'default', profile = 'shorts') => ({ accountId, profile });
const sourcePlan = { version: 1, title: 'Dharma', thumbnailPrompt: 'A detailed ancient forest', scenes: [
  { id: 'opening', chapter: 'Question', role: 'story', mediaType: 'image', narration: 'Welcome. Today we explore why Hanuman forgot his strength.', imagePrompt: 'A forest with a thoughtful Hanuman beside the ocean.' },
  { id: 'payoff', chapter: 'Insight', role: 'story', mediaType: 'image', narration: 'Jambavan reminds him of his strength. Hanuman acts.', imagePrompt: 'Jambavan talking to Hanuman beside the ocean.' },
] };
const raw = JSON.stringify(sourcePlan);
const planResult = { structure: 'Question → authentic story → insight', viewerPromise: 'Explain the traditional story without treating it as established history.',
  hooks: ['Why did Hanuman forget his strength?', 'Hanuman had strength he could not remember.', 'Jambavan reminded Hanuman of something important.'].map(openingLine => ({ openingLine, openingVisual: 'Hanuman on the shore', curiosity: 'What made him remember?', payoff: 'Jambavan’s reminder and Hanuman’s action', reason: 'Specific, visual and grounded in the story.' })),
  selectedHookIndex: 0, titles: ['Why Hanuman Forgot His Strength', 'A Reminder at the Ocean', 'Hanuman and Jambavan'],
  thumbnailConcept: 'A detailed traditional painting of Hanuman listening to Jambavan beside the sea; no text or logos.', description: 'An account of the traditional story.', tags: ['Hanuman', 'Dharma'], musicMood: 'calm' };
const fullPlan = { ...planResult, version: 1, topic: 'Hanuman’s forgotten strength', createdAt: '2026-10-19', memoryEvidence: 'No observations yet.' };
const editedResult = { notes: ['Removed the generic greeting.', 'Made the opening question immediate.'], scenes: sourcePlan.scenes.map((scene, index) => ({
  sceneId: scene.id, narration: index === 0 ? planResult.hooks[0].openingLine : scene.narration,
  imagePrompt: scene.imagePrompt, purpose: index === 0 ? 'Pose the question' : 'Resolve the promised question', motion: 'hold', transition: 'cut',
})) };
const fakeModel = result => async (_url, options) => {
  const request = JSON.parse(options.body);
  assert.ok(request.contents[0].parts[0].text);
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }] });
};
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('profile-specific structures and performance memory use comparable, sufficiently sampled observations', () => {
  assert.match(retention.storyStructure(notes.readTopicNotes()), /traditional story/);
  assert.match(retention.storyStructure(notes.readTopicNotes(ruleZero.id)), /impossible rule/);
  assert.match(retention.storyStructure(notes.readTopicNotes(odds.id)), /verified outcome/);
  const base = { topic: 'Previously uploaded story', scriptId: 'old', videoId: 'old', profile: 'shorts', uploadedAt: '2025-10-01', videoUrl: 'https://youtu.be/old',
    production: { hook: 'Observed opening', structure: 'A story', title: 'Previous story', duration: 60, musicMood: 'calm', scenes: [] },
    performance: { status: 'ready', fetchedAt: '2026-10-19', startDate: '2025-10-01', endDate: '2026-10-19', views: 500, averageViewDuration: 42, averageViewPercentage: 70, curve: [], dips: [] } };
  const history = { ...notes.readTopicNotes(), topics: [base, { ...base, topic: 'Private other format', profile: 'long' },
    { ...base, topic: 'Tiny sample', performance: { ...base.performance, views: 3 } },
    { ...base, topic: 'Different length', production: { ...base.production, duration: 600 } }] };
  const memory = retention.retentionMemory(history, 60);
  assert.match(memory, /Observed opening/);
  assert.doesNotMatch(memory, /Private other format|Tiny sample|Different length/);
  assert.match(memory, /not controlled experiments/);
});

test('hook planning produces exactly three distinct candidates and honest packaging before generation', async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (url, options) => { payload = JSON.parse(options.body); return fakeModel(planResult)(url, options); };
  const options = { topic: fullPlan.topic, template: 'An authentic traditional story in Hindi.', instructions: 'Keep facts and tradition distinct.', duration: 60, model: 'gemini-test', apiKey: 'fixture' };
  try {
    const planned = await retention.createRetentionPlan(options);
    assert.equal(planned.hooks.length, 3);
    assert.equal(planned.musicMood, 'calm');
    assert.match(payload.contents[0].parts[0].text, /BEFORE the script/);
    assert.ok(payload.generationConfig.responseJsonSchema, 'Gemini receives the actual hook response schema');
    assert.match(retention.retentionBrief(planned), /Why did Hanuman forget/);
    assert.match(retention.retentionBrief(planned), /before the CTA/);
    globalThis.fetch = fakeModel({ ...planResult, hooks: planResult.hooks.map(({ reason, ...hook }) => hook) });
    const withoutReasons = await retention.createRetentionPlan(options);
    assert.ok(withoutReasons.hooks.every(hook => hook.reason === ''), 'missing editorial explanations must not halt a valid production');
    let attempts = 0;
    globalThis.fetch = (url, input) => {
      attempts++;
      if (attempts === 1) return fakeModel({ ...planResult, viewerPromise: undefined })(url, input);
      assert.match(JSON.parse(input.body).contents.at(-1).parts[0].text, /Repair the JSON/);
      return fakeModel(planResult)(url, input);
    };
    assert.equal((await retention.createRetentionPlan(options)).viewerPromise, planResult.viewerPromise);
    assert.equal(attempts, 2, 'a required production field gets one bounded repair');
    globalThis.fetch = fakeModel({ ...planResult, hooks: [planResult.hooks[0], planResult.hooks[0], planResult.hooks[2]] });
    await assert.rejects(retention.createRetentionPlan(options), /duplicate openings/);
  } finally { globalThis.fetch = originalFetch; }
});

test('retention edit keeps original source, scene identities and media modes; incomplete edits are rejected', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeModel(editedResult);
  const options = { raw, template: 'Image-only documentary', research: 'Traditional source material.', plan: fullPlan, model: 'gemini-test', apiKey: 'fixture' };
  try {
    const edit = await retention.editForRetention(options);
    assert.equal(edit.sourceHash, retention.responseHash(raw));
    assert.equal(edit.plan.scenes[0].narration, planResult.hooks[0].openingLine);
    assert.equal(sourcePlan.scenes[0].narration.startsWith('Welcome'), true);
    assert.deepEqual(edit.plan.scenes.map(scene => scene.id), ['opening', 'payoff']);
    assert.deepEqual(edit.plan.scenes.map(scene => scene.mediaType), ['image', 'image']);
    const settings = retention.retentionEditing({ retentionPlan: fullPlan, retentionEdit: edit });
    assert.equal(settings.bookendFades, false, 'the hook starts immediately without an automatic black fade');
    assert.equal(settings.overrides.opening.motion, 'hold');
    assert.equal(settings.overrides.payoff.transition, 'cut');
    globalThis.fetch = fakeModel({ ...editedResult, scenes: [editedResult.scenes[0]] });
    await assert.rejects(retention.editForRetention(options), /omitted scene/);
    globalThis.fetch = fakeModel({ ...editedResult, scenes: [...editedResult.scenes].reverse() });
    await assert.rejects(retention.editForRetention(options), /scene identities/);
  } finally { globalThis.fetch = originalFetch; }
});

test('story editing repairs renamed, omitted, duplicated, extra or reordered scenes once with exact IDs', async () => {
  const originalFetch = globalThis.fetch;
  const options = { raw, template: 'Image-only documentary', research: 'Traditional source material.', plan: fullPlan, model: 'gemini-test', apiKey: 'fixture' };
  const invalidResults = [
    { ...editedResult, scenes: [editedResult.scenes[0]] },
    { ...editedResult, scenes: [...editedResult.scenes].reverse() },
    { ...editedResult, scenes: editedResult.scenes.map((scene, i) => ({ ...scene, sceneId: `scene_${i + 1}` })) },
    { ...editedResult, scenes: [editedResult.scenes[0], editedResult.scenes[0]] },
    { ...editedResult, scenes: [...editedResult.scenes, editedResult.scenes[0]] },
  ];
  try {
    for (const invalid of invalidResults) {
      let calls = 0;
      globalThis.fetch = (url, input) => {
        const request = JSON.parse(input.body);
        assert.deepEqual(request.generationConfig.responseJsonSchema.properties.scenes.items.properties.sceneId.enum, ['opening', 'payoff']);
        if (++calls === 1) {
          assert.match(request.contents.at(-1).parts[0].text, /EXACTLY 2 scenes/);
          return fakeModel(invalid)(url, input);
        }
        assert.equal(calls, 2, 'identity repair must stay bounded');
        assert.match(request.contents.at(-1).parts[0].text, /Repair the JSON/);
        assert.equal(JSON.parse(request.contents.at(-2).parts[0].text).scenes.length, invalid.scenes.length);
        return fakeModel(editedResult)(url, input);
      };
      const edited = await retention.editForRetention(options);
      assert.equal(calls, 2);
      assert.deepEqual(edited.plan.scenes.map(scene => scene.id), ['opening', 'payoff']);
      assert.equal(edited.sourceHash, retention.responseHash(raw));
    }
    let calls = 0;
    globalThis.fetch = (url, input) => { calls++; return fakeModel(invalidResults[0])(url, input); };
    await assert.rejects(retention.editForRetention(options), /after one repair attempt.*omitted scene identities/);
    assert.equal(calls, 2, 'persistent omissions must fail without fabricating scenes');
  } finally { globalThis.fetch = originalFetch; }
});

test('story editing repairs missing video prompts while keeping the original media modes', async () => {
  const originalFetch = globalThis.fetch;
  const mixed = { ...sourcePlan, scenes: sourcePlan.scenes.map((scene, i) => i === 0 ? { ...scene, mediaType: 'video', videoPrompt: 'A continuous shore shot.' } : scene) };
  let calls = 0;
  globalThis.fetch = (url, input) => {
    if (++calls === 1) return fakeModel(editedResult)(url, input);
    assert.match(JSON.parse(input.body).contents.at(-1).parts[0].text, /opening.*video.*videoPrompt/);
    return fakeModel({ ...editedResult, scenes: editedResult.scenes.map((scene, i) => i === 0 ? { ...scene, videoPrompt: 'A continuous shore shot.' } : scene) })(url, input);
  };
  try {
    const edited = await retention.editForRetention({ raw: JSON.stringify(mixed), template: 'Mixed media documentary', research: '', plan: fullPlan, model: 'gemini-test', apiKey: 'fixture' });
    assert.equal(calls, 2);
    assert.deepEqual(edited.plan.scenes.map(scene => scene.mediaType), ['video', 'image']);
    assert.equal(edited.plan.scenes[0].videoPrompt, 'A continuous shore shot.');
  } finally { globalThis.fetch = originalFetch; }
});

test('watch-time import maps curve drops to scenes and preserves rewatches above 100 percent', () => {
  assert.equal(analytics.youtubeReportDate('2026-10-19T01:00:00.000Z'), '2026-10-18', 'YouTube reports use Pacific calendar days');
  const entry = { production: { duration: 60, scenes: [{ sceneId: 'payoff', start: 30, end: 60, purpose: 'Resolution' }] } };
  const summary = { columnHeaders: [{ name: 'views' }, { name: 'averageViewDuration' }, { name: 'averageViewPercentage' }], rows: [[500, 66, 110]] };
  const curve = { columnHeaders: [{ name: 'elapsedVideoTimeRatio' }, { name: 'audienceWatchRatio' }, { name: 'relativeRetentionPerformance' }], rows: [[0.1, 1.2, 0.8], [0.5, 0.8, 0.6], [0.9, 0.78, 0.5]] };
  const report = analytics.performanceFromReports(entry, summary, curve, '2026-10-01', '2026-10-19');
  assert.equal(report.status, 'ready');
  assert.equal(report.averageViewPercentage, 110);
  assert.equal(report.curve[0].watchRatio, 1.2);
  assert.equal(report.dips[0].sceneId, 'payoff');
  const empty = analytics.performanceFromReports(entry, { rows: [] }, { rows: [] }, '2026-10-01', '2026-10-19');
  assert.equal(empty.status, 'insufficient_data');
});

test('performance sync is channel-bound, persists reports and preserves observations on missing Analytics permission', async () => {
  const originalYoutube = google.youtube;
  const originalAnalytics = google.youtubeAnalytics;
  accounts.atomicJson(auth.CLIENT_SECRET_PATH, { installed: { client_id: 'fixture', client_secret: 'fixture' } });
  accounts.atomicJson(accounts.tokenPath(odds.id), { access_token: 'odds-token' });
  ws.workspaceContext.run(scope(odds.id), () => notes.recordUploadedTopic({ topic: 'Old survival story', scriptId: 'old', videoId: 'video-old', videoUrl: 'https://youtu.be/video-old', profile: 'shorts', uploadedAt: '2025-01-01T12:00:00Z' }));
  google.youtube = () => ({ channels: { list: async () => ({ data: { items: [{ id: 'odds-channel' }] } }) } });
  const calls = [];
  google.youtubeAnalytics = ({ auth: client }) => ({ reports: { query: async options => {
    assert.equal(client.credentials.access_token, 'odds-token');
    assert.equal(options.filters, 'video==video-old');
    calls.push(options);
    return { data: options.dimensions
      ? { columnHeaders: [{ name: 'elapsedVideoTimeRatio' }, { name: 'audienceWatchRatio' }], rows: [[0.1, 1], [0.8, 0.7]] }
      : { columnHeaders: [{ name: 'views' }, { name: 'averageViewDuration' }, { name: 'averageViewPercentage' }], rows: [[200, 42, 70]] } };
  } } });
  try {
    await ws.workspaceContext.run(scope(odds.id), async () => {
      assert.equal((await analytics.syncRetentionPerformance(true)).status, 'updated');
      assert.equal(calls.length, 2);
      const before = notes.readTopicNotes().topics[0].performance;
      assert.equal(before.views, 200);
      google.youtubeAnalytics = () => ({ reports: { query: async () => { throw Object.assign(new Error('Missing permission'), { code: 403 }); } } });
      const unavailable = await analytics.syncRetentionPerformance(true);
      assert.equal(unavailable.status, 'needs_connection');
      assert.deepEqual(notes.readTopicNotes().topics[0].performance, before);
    });
    assert.equal(notes.readTopicNotes('default').topics.length, 0);
  } finally { google.youtube = originalYoutube; google.youtubeAnalytics = originalAnalytics; }
});

test('HTTP editing preserves the source; extraction uses only a matching edited version', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => String(url).startsWith('https://generativelanguage') ? fakeModel(editedResult)(url, options) : originalFetch(url, options);
  ws.workspaceContext.run(scope(), () => store.add('scripts', { id: 'story', topicName: fullPlan.topic, prompts: [], duration: 60, aiResponse: raw, retentionPlan: fullPlan }));
  const app = express(); app.use(express.json()); app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/accounts/default/profiles/shorts`;
  const post = (route, body) => originalFetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'fixture' }, body: JSON.stringify(body) });
  try {
    const edited = await post('/retention/edit', { scriptId: 'story' });
    assert.equal(edited.status, 200, await edited.clone().text());
    assert.equal(store.getById('scripts', 'story').aiResponse, raw);
    const extracted = await (await post('/llm/extract', { scriptId: 'story', rawText: raw })).json();
    assert.equal(extracted.scenePlan.scenes[0].narration, planResult.hooks[0].openingLine);
    const otherRaw = JSON.stringify({ ...sourcePlan, title: 'Changed source' });
    const unchanged = await (await post('/llm/extract', { scriptId: 'story', rawText: otherRaw })).json();
    assert.equal(unchanged.scenePlan.scenes[0].narration.startsWith('Welcome'), true);
    const notFound = await originalFetch(base.replace('/default/', `/${ruleZero.id}/`) + '/retention/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptId: 'story' }) });
    assert.equal(notFound.status, 404);
  } finally { globalThis.fetch = originalFetch; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('final review sends actual rendered frames and mixed audio; rejects blockers and stale upload approvals', async () => {
  const output = path.join(ws.outputDir(), 'review-story');
  fs.mkdirSync(output, { recursive: true });
  const file = path.join(output, 'final.mp4');
  await runMedia('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
  const script = { id: 'review-story', topicName: fullPlan.topic, retentionPlan: fullPlan, retentionEdit: { sceneDirections: [] }, scenePlan: sourcePlan,
    narration: 'An intelligible narration.', generatedAudio: [{ url: '/voice.wav' }], generatedImages: [{ index: 0, url: '/first.png' }, { index: 1, url: '/second.png' }] };
  store.add('scripts', script);
  accounts.atomicJson(`${file}.json`, { revision: renderRevision(script.id) });
  const originalFetch = globalThis.fetch;
  let block = false, reviewCalls = 0, captionBlock = false, permanentError = false;
  globalThis.fetch = async (_url, options) => {
    if (++reviewCalls === 1) return new Response('Temporarily overloaded', { status: 503 });
    if (permanentError) return new Response('Invalid credentials', { status: 401 });
    const body = JSON.parse(options.body);
    const images = body.contents[0].parts.filter(part => part.inlineData?.mimeType === 'image/jpeg');
    const audio = body.contents[0].parts.filter(part => part.inlineData?.mimeType === 'audio/mp3');
    const clips = body.contents[0].parts.filter(part => part.inlineData?.mimeType === 'video/mp4');
    assert.ok(images.length >= 1 && images.length <= 6, 'bounded batches keep review image quota manageable');
    assert.ok(images.every(part => Buffer.from(part.inlineData.data, 'base64').length > 100));
    assert.ok(audio.length <= 1);
    assert.equal(clips.length, 1, 'actual video gives caption phrase transitions temporal context');
    assert.equal(clips[0].videoMetadata.fps, 4);
    assert.ok(Buffer.from(clips[0].inlineData.data, 'base64').length > 1000);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ summary: block ? 'A concrete problem was found.' : 'The sampled material fulfills its promise.', findings: captionBlock ? [{ severity: 'blocker', category: 'captions', detail: 'Caption is cut off at the bottom edge at 1s.' }] : block ? [{ severity: 'blocker', category: 'audio', detail: 'Opening speech is inaudible at 0s.' }] : [] }) }] } }] });
  };
  try {
    const passed = await reviewRenderedVideo(script, 'final.mp4', 'fixture');
    assert.equal(reviewCalls, Math.ceil(passed.sampleTimes.length / 6) + 1, 'transient overload retries only its batch');
    assert.equal(passed.status, 'passed');
    assert.equal(passed.videoFilename, 'final.mp4');
    assert.equal(passed.renderHash, renderFileHash(file));
    block = true;
    assert.equal((await reviewRenderedVideo(script, 'final.mp4', 'fixture')).status, 'blocked');
    captionBlock = true;
    const clipped = await reviewRenderedVideo(script, 'final.mp4', 'fixture');
    assert.equal(clipped.status, 'blocked', 'concrete caption clipping must not be downgraded');
    assert.equal(clipped.findings[0].severity, 'blocker');
    captionBlock = false;
    permanentError = true;
    const callsBeforePermanentError = reviewCalls;
    await assert.rejects(reviewRenderedVideo(script, 'final.mp4', 'fixture'), /HTTP 401/);
    assert.equal(reviewCalls, callsBeforePermanentError + 1, 'permanent errors are not retried');
    permanentError = false;
    assert.notEqual(passed.productionHash, retention.productionHash({ ...script, narration: 'Changed narration' }));
    const priorHash = passed.renderHash;
    fs.utimesSync(file, new Date(), new Date(Date.now() + 2000));
    assert.notEqual(priorHash, renderFileHash(file));
    await assert.rejects(reviewRenderedVideo({ ...script, generatedImages: [] }, 'final.mp4', 'fixture'), /missing its visual/);
    // Exercise the upload gate over HTTP, including exact-render invalidation.
    const originalYoutube = google.youtube;
    let uploads = 0;
    google.youtube = () => ({ channels: { list: async () => ({ data: { items: [{ id: 'review-channel' }] } }) },
      videos: { insert: async options => { for await (const _chunk of options.media.body) { /* consume fixture */ } uploads++; return { data: { id: 'review-approved-video' } }; } } });
    accounts.atomicJson(accounts.tokenPath('default'), { access_token: 'fixture' });
    const app = express(); app.use(express.json()); app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const upload = () => originalFetch(`http://127.0.0.1:${server.address().port}/api/accounts/default/profiles/shorts/youtube/upload`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptId: script.id, videoFilename: 'final.mp4', title: fullPlan.titles[0], autoPilot: true }),
    });
    try {
      store.add('scripts', { ...script, retentionReview: passed });
      assert.equal((await upload()).status, 409, 'a replaced render invalidates an earlier passing review');
      assert.equal(uploads, 0);
      block = false;
      const refreshed = await reviewRenderedVideo(script, 'final.mp4', 'fixture');
      store.add('scripts', { ...script, retentionReview: refreshed });
      const uploaded = await upload();
      assert.equal(uploaded.status, 200, await uploaded.clone().text());
      assert.equal(uploads, 1);
      const memory = notes.readTopicNotes().topics.find(topic => topic.videoId === 'review-approved-video');
      assert.equal(memory.production.hook, fullPlan.hooks[0].openingLine);
      assert.ok(memory.production.duration >= 2 && memory.production.duration < 2.2);
      assert.equal(memory.production.scenes.length, 2);
    } finally { google.youtube = originalYoutube; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  } finally { globalThis.fetch = originalFetch; }
});

test('polished audio graph maps voice and music inputs correctly for multiple images', async () => {
  const options = { scriptId: 'audio-graph', imagePaths: ['first.png', 'second.png'], audioPath: 'voice.wav', duration: 2,
    resolution: { width: 160, height: 90 }, polishAudio: true, bgmPath: path.join(directory, 'bed.wav') };
  fs.writeFileSync(options.bgmPath, 'fixture');
  const graph = buildFilterComplex(options, ['first.png', 'second.png']);
  assert.match(graph, /\[2:a\]aresample=48000/);
  assert.match(graph, /\[3:a\]aresample=48000/);
  assert.match(graph, /sidechaincompress/);
  assert.match(graph, /loudnorm=I=-16/);
  // Execute the actual generated audio filter section against real audio streams.
  const audioGraph = graph.slice(graph.indexOf('[2:a]aresample'));
  await runMedia('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=s=160x90:d=2', '-f', 'lavfi', '-i', 'color=s=160x90:d=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=110:duration=2', '-filter_complex', audioGraph, '-map', '[a]', path.join(directory, 'mixed.wav')]);
  assert.ok(fs.statSync(path.join(directory, 'mixed.wav')).size > 1000);
});

test('rate limited final review saves completed batches and resumes without repeating them', async () => {
  const dir = path.join(ws.outputDir(), 'review-resume'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'final.mp4');
  await runMedia('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10:d=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
  const script = { id: 'review-resume', topicName: fullPlan.topic, retentionPlan: fullPlan,
    scenePlan: sourcePlan, narration: 'Test narration.', generatedAudio: [{ url: '/voice.wav' }],
    generatedImages: [{ index: 0, url: '/first.png' }, { index: 1, url: '/second.png' }] };
  store.add('scripts', script); accounts.atomicJson(`${file}.json`, { revision: renderRevision(script.id) });
  const previous = globalThis.fetch; const seen = []; let attempts = 0;
  globalThis.fetch = async (_, options) => {
    attempts++;
    const parts = JSON.parse(options.body).contents[0].parts;
    seen.push(parts.filter(p => p.text?.startsWith('Rendered frame')).map(p => p.text));
    if (attempts === 2) return Response.json({ error: { details: [{ retryDelay: '90s' }] } }, { status: 429 });
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ summary: 'Sampled batch clear.', findings: [] }) }] } }] });
  };
  try {
    await assert.rejects(reviewRenderedVideo(script, 'final.mp4', 'fixture'), e => e.retryAfterSeconds >= 90 && e.completed === 1);
    const checkpoint = `${file}.review-progress.json`;
    const saved = JSON.parse(fs.readFileSync(checkpoint, 'utf8'));
    assert.equal(saved.results.length, 1);
    await assert.rejects(reviewRenderedVideo(script, 'final.mp4', 'fixture'), /waiting to retry/);
    assert.equal(attempts, 2, 'Retry-After blocks premature provider calls');
    accounts.atomicJson(checkpoint, { ...saved, retryAt: 0 });
    const result = await reviewRenderedVideo(script, 'final.mp4', 'fixture');
    assert.equal(result.status, 'passed');
    assert.equal(attempts, 3);
    assert.deepEqual(seen[1], seen[2], 'only the rate-limited batch is retried');
    assert.notDeepEqual(seen[0], seen[2]);
  } finally { globalThis.fetch = previous; }
});
