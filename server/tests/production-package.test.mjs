import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScenePlan, validateSync } from '../dist/services/scene-plan.js';

const fixture = `## SECTION 1 — VIDEO OVERVIEW
Title: राम का वनवास
## SECTION 3 — FINAL CLEAN VOICE SCRIPT
अयोध्या सज चुकी थी। लेकिन निर्णय बदल गया। राम वन चले। सीता साथ थीं।
## SECTION 4 — COMPLETE 10-SECOND PRODUCTION TIMELINE
\`\`\`text
BLOCK 001
Time: 00:00–00:10
Asset Type: VIDEO
Narration: अयोध्या सज चुकी थी।
Purpose: Hook
Asset: VIDEO 001

BLOCK 002
Time: 00:10–00:20
Asset Type: IMAGE
Narration: लेकिन निर्णय बदल गया।
Purpose: Context
Asset: IMAGE 002

BLOCK 003
Time: 00:20–00:30
Asset Type: TWO IMAGES
00:20–00:25
Narration: राम वन चले।
Asset: IMAGE 003A
00:25–00:30
Narration: सीता साथ थीं।
Asset: IMAGE 003B
\`\`\`
## SECTION 5 — ALL IMAGE + VIDEO GENERATION PROMPTS
${[
  ['IMAGE 003B', '00:25–00:30', 5],
  ['VIDEO 001', '00:00–00:10', 10],
  ['IMAGE 002', '00:10–00:20', 10],
  ['IMAGE 003A', '00:20–00:25', 5],
].map(([id, time, duration]) => `<long_video>
ASSET: ${id}
TIMELINE: ${time}
DURATION: ${duration} seconds
Prompt:
A complete cinematic scene for ${id}.
Character Consistency:
Full character description.
Negative Prompt:
No modern objects.
AUDIO:
No spoken dialogue.
</long_video>`).join('\n')}
## SECTION 6 — THUMBNAIL
<long_video>
ASSET: THUMBNAIL
Prompt: A separate cover.
THUMBNAIL TEXT: राम का वनवास
</long_video>
## SECTION 7 — BACKGROUND MUSIC PROMPT
Instrumental music.
`;

test('master prompt prose extracts ordered mixed assets, clean narration and separate thumbnail', () => {
  for (const source of [fixture, fixture.replace(/\n/g, '\r\n')]) {
    const plan = parseScenePlan(source);
    assert.equal(plan.title, 'राम का वनवास');
    assert.deepEqual(plan.scenes.map(s => s.id), ['VIDEO_001', 'IMAGE_002', 'IMAGE_003A', 'IMAGE_003B']);
    assert.deepEqual(plan.scenes.map(s => s.duration), [10, 10, 5, 5]);
    assert.deepEqual(plan.scenes.map(s => s.mediaType), ['video', 'image', 'image', 'image']);
    assert.equal(plan.scenes[0].narration, 'अयोध्या सज चुकी थी।');
    assert.match(plan.scenes[0].imagePrompt, /Full character description/);
    assert.match(plan.scenes[0].imagePrompt, /Negative Prompt:\nNo modern objects/);
    assert.match(plan.thumbnailPrompt, /THUMBNAIL TEXT/);
    assert.ok(!plan.scenes.some(s => /cover/.test(s.imagePrompt)));
    let cursor = 0;
    const sync = { version: 1, sampleRate: 48000, totalSamples: 1440000, scenes: plan.scenes.map(s => {
      const startSample = cursor; cursor += s.duration * 48000;
      return { sceneId: s.id, startSample, endSample: cursor };
    }) };
    validateSync(plan, sync);
    sync.scenes[3].endSample -= 48000;
    assert.throws(() => validateSync(plan, sync), /complete audio/);
  }
});

test('Long Video still-image prose preserves the complete narration and excludes the thumbnail', async () => {
  const raw = fixture.replaceAll('VIDEO 001', 'IMAGE 001').replace('Asset Type: VIDEO', 'Asset Type: IMAGE').replace('COMPLETE 10-SECOND PRODUCTION TIMELINE', 'PRODUCTION TIMELINE');
  const plan = parseScenePlan(raw);
  assert.deepEqual(plan.scenes.map(scene => scene.id), ['IMAGE_001', 'IMAGE_002', 'IMAGE_003A', 'IMAGE_003B']);
  assert.ok(plan.scenes.every(scene => scene.mediaType === 'image'));
  assert.equal(plan.scenes.map(scene => scene.narration).join(' '), 'अयोध्या सज चुकी थी। लेकिन निर्णय बदल गया। राम वन चले। सीता साथ थीं।');
  assert.match(plan.thumbnailPrompt, /separate cover/);
  const { default: express } = await import('express');
  const { llmRouter } = await import('../dist/routes/llm.js');
  const { workspaceContext } = await import('../dist/services/workspace.js');
  const app = express(); app.use(express.json());
  app.use('/:profile', (req, _res, next) => workspaceContext.run({ accountId: 'default', profile: req.params.profile }, next), llmRouter);
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const extract = (profile, text) => fetch(`http://127.0.0.1:${server.address().port}/${profile}/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: text }) });
    const long = await extract('long', raw), mixed = await extract('mixed', raw);
    assert.equal(long.status, 200);
    assert.deepEqual(await long.json(), await mixed.json(), 'both profiles extract the same readable image package');
    const invalid = await extract('long', fixture);
    assert.equal(invalid.status, 400, 'Long Video rejects actual video assets');
    assert.match((await invalid.json()).error, /Video scenes belong in the Mixed Media profile/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('prose extraction rejects missing, duplicate, inconsistent and unlinked assets', () => {
  assert.throws(() => parseScenePlan(fixture.replace('ASSET: IMAGE 003B', 'ASSET: IMAGE 004')), /Missing generation prompt/);
  assert.throws(() => parseScenePlan(fixture.replace('ASSET: IMAGE 003B', 'ASSET: IMAGE 003A')), /Duplicate asset/);
  assert.throws(() => parseScenePlan(fixture.replace('Narration: राम वन चले।', 'Narration: बदली हुई कहानी।')), /differs/);
  assert.throws(() => parseScenePlan(fixture.replace('TIMELINE: 00:25–00:30', 'TIMELINE: 00:24–00:29')), /disagree/);
  assert.throws(() => parseScenePlan(fixture.replace('</long_video>', '')), /incomplete/);
  assert.throws(() => parseScenePlan(fixture.replace('## SECTION 3 — FINAL CLEAN VOICE SCRIPT', '## Other section')), /Missing production section/);
});

test('bulleted inline timeline fields preserve single and split asset links', () => {
  const inline = fixture
    .replace(/BLOCK (00[12])\nTime: ([^\n]+)\nAsset Type: ([^\n]+)\nNarration: ([^\n]+)\nPurpose: ([^\n]+)\nAsset: ([^\n]+)/g,
      '* **BLOCK $1** | Time: $2 | Type: $3 | Purpose: $5 | Asset: $6\n  * Narration: $4')
    .replace('BLOCK 003\nTime: 00:20–00:30\nAsset Type: TWO IMAGES', '* **BLOCK 003** | Time: 00:20–00:30 | Type: TWO IMAGES')
    .replace(/^(00:2[05]–[^\n]+)\nNarration: /gm, '  * $1 | Narration: ')
    .replace(/^Asset: IMAGE 003/gm, '  * Asset: IMAGE 003');
  assert.deepEqual(parseScenePlan(inline), parseScenePlan(fixture));
  assert.deepEqual(parseScenePlan(inline.replace(/\n/g, '\r\n')), parseScenePlan(fixture));
});

test('timeline narration recovery is explicit and still validates asset timing and links', () => {
  const mismatch = fixture.replace('Narration: राम वन चले।', 'Narration: राम वन की ओर चले।');
  assert.throws(() => parseScenePlan(mismatch), /differs/);
  assert.equal(parseScenePlan(mismatch, true).scenes[2].narration, 'राम वन की ओर चले।');
  assert.throws(() => parseScenePlan(mismatch.replace('TIMELINE: 00:25–00:30', 'TIMELINE: 00:24–00:29'), true), /disagree/);
  assert.throws(() => parseScenePlan(mismatch.replace('ASSET: IMAGE 003B', 'ASSET: IMAGE 004'), true), /Missing generation prompt/);
});

test('bold bullet fields and timestamp-prefixed narration preserve split scenes', () => {
  const markdown = fixture
    .replace(/^(00:2[05]–[^\n]+)\nNarration:/gm, '$1 Narration:')
    .replace(/^BLOCK (\d+)/gm, '* **BLOCK $1**')
    .replace(/^(Time|Asset Type|Narration|Purpose|Asset|00:2[05]–[^\n]+ Narration):/gm, '  * **$1:**');
  for (const source of [markdown, markdown.replace(/\n/g, '\r\n')]) {
    assert.deepEqual(parseScenePlan(source), parseScenePlan(fixture));
    assert.throws(() => parseScenePlan(source.replace('  * **Asset:** IMAGE 003A', ''), true), /could not pair/);
  }
});

test('annotated and repeated asset references resolve without losing narration', () => {
  for (const label of ['VIDEO / IMAGE 002 (IMAGE 002)', '`IMAGE 002`', 'IMAGE 002 (still image)', 'IMAGE 002 / IMAGE 002']) {
    assert.deepEqual(parseScenePlan(fixture.replace('Asset: IMAGE 002', `Asset: ${label}`)), parseScenePlan(fixture));
  }
  assert.throws(() => parseScenePlan(fixture.replace('Asset: IMAGE 002', 'Asset: VIDEO 001 / IMAGE 002')), /multiple asset references/);
  assert.throws(() => parseScenePlan(fixture.replace('Asset: IMAGE 002', 'Asset: unspecified')), /no recognizable/);
  assert.throws(() => parseScenePlan(fixture.replace('Asset: IMAGE 002', 'Asset: IMAGE 999')), /Missing generation prompt/);
  assert.throws(() => parseScenePlan(fixture.replace('Narration: सीता साथ थीं।', 'Missing: सीता साथ थीं।')), /could not pair/);
});
