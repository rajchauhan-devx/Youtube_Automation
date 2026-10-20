import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.resolve('server/data/keyframe-test-'));
process.env.TUBEFLOW_DATA_DIR = directory;
process.env.COMFYUI_BASE_URL = 'http://keyframe-model.test';
const { workspaceContext } = await import('../dist/services/workspace.js');
const { store } = await import('../dist/services/store.js');
const { generateRouter } = await import('../dist/routes/generate.js');
const originalFetch = globalThis.fetch;
const prompts = [];
let duringGeneration;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith(process.env.COMFYUI_BASE_URL)) return originalFetch(url, options);
  if (String(url).endsWith('/prompt')) {
    prompts.push(JSON.parse(options.body).prompt['6'].inputs.text);
    duringGeneration?.();
    duringGeneration = undefined;
    return Response.json({ prompt_id: 'fixture' });
  }
  if (String(url).includes('/history/')) return Response.json({ fixture: { outputs: { '9': { images: [{ filename: 'fixture.png', type: 'output' }] } } } });
  if (String(url).includes('/view?')) return new Response(Buffer.from('fixture image'));
  throw new Error(`Unexpected model request: ${url}`);
};
const app = express();
app.use(express.json());
app.use('/:profile/generate', (req, _res, next) => workspaceContext.run({ accountId: 'default', profile: req.params.profile }, next), generateRouter);
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });

test('video keyframes accept distinct still prompts across profiles and reject stale results', async () => {
  try {
    for (const profile of ['shorts', 'mixed', 'long']) {
      const scope = { accountId: 'default', profile };
      const read = () => workspaceContext.run(scope, () => store.getById('scripts', 'episode'));
      const save = script => workspaceContext.run(scope, () => store.add('scripts', script));
      const scene = { id: 'hook', chapter: 'Opening', role: 'story', mediaType: 'video', narration: 'Ancient iron resists corrosion.',
        imagePrompt: 'An iron pillar at sunrise, still frame.', videoPrompt: 'A smooth tracking shot moving toward the iron pillar.' };
      save({ id: 'episode', scenePlan: { version: 1, title: 'Iron pillar', thumbnailPrompt: 'Cover', scenes: [scene] }, generatedImages: [] });
      const request = (route, prompt = scene.imagePrompt, index = 0) => originalFetch(`http://127.0.0.1:${server.address().port}/${profile}/generate/${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptId: 'episode', index, prompt, provider: 'local' }),
      });
      const before = prompts.length;
      for (const [prompt, index] of [['outdated prompt', 0], [scene.imagePrompt, 1]]) assert.equal((await request('image', prompt, index)).status, 400);
      assert.equal(prompts.length, before, 'invalid requests must never reach a provider');
      let response = await request('image');
      assert.equal(response.status, 200, await response.text());
      assert.equal(prompts.at(-1), scene.imagePrompt, 'the provider receives the authored still prompt');
      assert.equal(read().generatedImages[0].prompt, scene.imagePrompt);
      assert.equal(read().scenePlan.scenes[0].mediaType, 'video', 'keyframes do not rewrite the scene plan');

      const imported = { index: 0, prompt: scene.videoPrompt, mediaType: 'video', status: 'done', url: '/imported.mp4' };
      save({ ...read(), generatedImages: [imported] });
      response = await request('image');
      assert.equal(response.status, 200, await response.text());
      assert.deepEqual(read().generatedImages, [imported], 'a new reference image preserves completed video');
      assert.equal(read().referenceFrames[0].prompt, scene.imagePrompt);
      for (const prompt of [scene.imagePrompt, scene.videoPrompt]) {
        response = await request('reference-frame', prompt);
        assert.equal(response.status, 200, await response.text());
      }
      const referenceFrames = read().referenceFrames;
      for (const route of ['image', 'reference-frame']) {
        const currentPrompt = read().scenePlan.scenes[0].imagePrompt;
        duringGeneration = () => {
          const current = read();
          save({ ...current, scenePlan: { ...current.scenePlan, scenes: [{ ...current.scenePlan.scenes[0], imagePrompt: `${currentPrompt} Updated.` }] } });
        };
        response = await request(route, currentPrompt);
        assert.equal(response.status, 409, await response.text());
        assert.deepEqual(read().generatedImages, [imported]);
        assert.deepEqual(read().referenceFrames, referenceFrames, 'a still prompt edit invalidates in-flight output even when motion is unchanged');
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.ok(directory.startsWith(path.resolve('server/data') + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
