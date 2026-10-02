import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { parseScenePlan, spokenText, normalizeNarration } from '../dist/services/scene-plan.js';
import { normalizeScenePlanResponse, serializeScenePlan, withScenePlanFormat, SCENE_PLAN_FORMAT_MARKER } from '../dist/services/scene-plan-format.js';
import { incompleteResponse } from '../dist/services/generation-status.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-shared-format-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const { llmRouter } = await import('../dist/routes/llm.js');
const { scriptsRouter } = await import('../dist/routes/scripts.js');
const { workspaceContext } = await import('../dist/services/workspace.js');
const { store } = await import('../dist/services/store.js');
test.after(() => {
  assert.ok(directory.startsWith(path.join(os.tmpdir(), 'tubeflow-shared-format-')));
  fs.rmSync(directory, { recursive: true, force: true });
});

const fixture = fs.readFileSync(new URL('./fixtures/against-the-odds.txt', import.meta.url), 'utf8');
const voice = fixture.match(/<script>([\s\S]*?)<\/script>/i)[1].trim();

test('Against the Odds numbered production response preserves speech and maps five scenes exactly', () => {
  for (const raw of [fixture, fixture.replace(/\r\n/g, '\n')]) {
    const plan = parseScenePlan(raw);
    assert.equal(plan.title, 'Left For Dead on Everest');
    assert.deepEqual(plan.scenes.map(scene => scene.mediaType), ['video', 'image', 'image', 'video', 'image']);
    assert.deepEqual(plan.scenes.map(scene => scene.duration), [6, 7, 6, 7, 6]);
    assert.equal(spokenText(plan), voice.replace(/\r/g, ''));
    assert.match(plan.scenes[0].imagePrompt, /partially buried in deep snow/);
    assert.match(plan.scenes[0].videoPrompt, /camera slowly pushes forward/);
    assert.match(plan.scenes[3].imagePrompt, /full-length vertical shot/);
    assert.match(plan.scenes[3].videoPrompt, /two uncoordinated, staggering steps/);
    assert.match(plan.thumbnailPrompt, /Bold ivory text/);
    assert.ok(plan.scenes.every(scene => !/Subscribe for more true survival stories|minimalist vertical graphic/.test(scene.imagePrompt)));
    const normalized = normalizeScenePlanResponse(raw, plan);
    assert.deepEqual(parseScenePlan(normalized), plan);
    assert.equal((normalized.match(/<long_video>/g) || []).length, 1);
    assert.ok(!/<(?:shorts|image_prompt|video_prompt|script)>/i.test(normalized));
    assert.ok(normalized.replace(/\r/g, '').includes(voice.replace(/\r/g, '')));
    assert.ok(normalized.includes('The miraculous survival of Beck Weathers'));
    assert.equal(normalizeScenePlanResponse(normalized, plan), normalized, 'Already formatted responses remain unchanged');
  }
});

test('Formatting refuses ambiguous, incomplete or changed content without guessing or rewriting it', () => {
  const invalid = [
    fixture.replace('#video 1            | Establish', '#video 99           | Establish'),
    fixture.replace('Reference Image: #image 4', 'Reference Image: #image 3'),
    fixture.replace('</video_prompt>', ''),
    fixture.replace('Target Usable Duration: 7 seconds', 'Target Usable Duration: 5 seconds'),
    fixture.replace('Scene 4/L4', 'Scene 3/L4'),
    fixture.replace('#video 2            | Depict', '#video 1            | Depict'),
    fixture.replace('0:06–0:13   | Scene 2', '0:07–0:13   | Scene 2'),
    fixture.replace('<script>', '<script>Extra spoken words. '),
  ];
  for (const raw of invalid) assert.throws(() => parseScenePlan(raw));
  assert.throws(() => parseScenePlan(invalid.at(-1), true), /differs/, 'Recovery must not rewrite legacy narration');
});

test('Every profile appends the same format contract without altering custom prompt content', () => {
  const custom = 'Tell this survival story in Hindi. Preserve sources, story details and continuity. Return my old image tags.';
  for (const profile of ['shorts', 'long', 'mixed']) {
    const prompt = withScenePlanFormat(custom, profile);
    assert.equal(prompt.slice(0, custom.length), custom);
    assert.match(prompt, /Return exactly ONE <long_video> block/);
    assert.equal((prompt.match(new RegExp(SCENE_PLAN_FORMAT_MARKER, 'g')) || []).length, 1);
    assert.equal(withScenePlanFormat(prompt, profile), prompt);
    assert.match(incompleteResponse(prompt, 'Finished prose without a package.'), /Missing shared/);
  }
});

test('All profiles extract the same JSON shape without an LLM key and the converted response can be saved', async () => {
  const app = express(); app.use(express.json());
  const router = express.Router(); router.use('/scripts', scriptsRouter); router.use(llmRouter);
  app.use('/:profile', (req, _res, next) => workspaceContext.run({ accountId: 'fixture', profile: req.params.profile }, next), router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const extract = (profile, rawText) => fetch(`http://127.0.0.1:${server.address().port}/${profile}/extract`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText }),
    });
    const legacy = await extract('shorts', fixture);
    assert.equal(legacy.status, 200);
    const converted = await legacy.json();
    assert.equal(converted.ttsText, voice.replace(/\r/g, ''));
    assert.deepEqual(parseScenePlan(converted.normalizedResponse), converted.scenePlan);
    workspaceContext.run({ accountId: 'fixture', profile: 'shorts' }, () => store.add('scripts', {
      id: 'against-the-odds', name: 'Against the Odds', aiResponse: fixture,
      prompts: [{ id: 'custom', name: 'Custom story', content: 'Preserve the author\'s content.' }], generatedImages: [], generatedAudio: [],
    }));
    const save = await fetch(`http://127.0.0.1:${server.address().port}/shorts/scripts/against-the-odds`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiResponse: converted.normalizedResponse, scenePlan: converted.scenePlan, narration: converted.ttsText,
        extractedScript: converted.script, imagePrompts: converted.imagePrompts }),
    });
    const saved = await save.json();
    assert.equal(save.status, 200, JSON.stringify(saved));
    assert.deepEqual(saved.scenePlan, converted.scenePlan, 'Format conversion must not reset extracted assets');
    assert.equal(saved.narration, converted.ttsText);
    assert.equal(saved.prompts[0].content, 'Preserve the author\'s content.');
    const images = { ...converted.scenePlan, scenes: converted.scenePlan.scenes.map(({ videoPrompt, ...scene }) => ({ ...scene, mediaType: 'image' })) };
    const raw = serializeScenePlan(images);
    let first;
    for (const profile of ['shorts', 'long', 'mixed']) {
      const response = await extract(profile, raw);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.scenePlan, images);
      assert.equal(body.normalizedResponse, raw);
      assert.equal(normalizeNarration(body.ttsText), normalizeNarration(voice));
      if (first) assert.deepEqual(body, first);
      first = body;
      const invalid = await extract(profile, '<script>Unlinked words.</script>');
      assert.equal(invalid.status, 400);
      await invalid.json();
    }
    const unsupported = await extract('long', converted.normalizedResponse);
    assert.equal(unsupported.status, 400, 'Same schema retains the Long Video image-only rule');
    assert.match((await unsupported.json()).error, /Mixed Media/);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
