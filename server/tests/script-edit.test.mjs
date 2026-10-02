import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-script-edit-'));
const { scriptsRouter } = await import('../dist/routes/scripts.js');
const { store } = await import('../dist/services/store.js');
const { outputDir } = await import('../dist/services/workspace.js');
const { serializeShortsPackage } = await import('../dist/services/shorts-package.js');
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api/scripts', scriptsRouter);
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
test.after(() => server.close());
const base = `http://127.0.0.1:${server.address().port}/api/scripts`;
const request = (route, body, method = 'PUT') => fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('script template edits persist without discarding generated work', async () => {
  store.add('scripts', { id: 'edit-me', name: 'Before', prompts: [{ id: 'p1', name: 'Opening', content: 'Old prompt' }], howItWorks: '', narration: 'Saved narration', generatedAudio: [{ filename: 'voice.wav' }] });
  const response = await request('/edit-me', { name: 'After', prompts: [{ id: 'p1', name: 'Opening', content: 'New prompt' }], howItWorks: 'New workflow' });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.name, 'After');
  assert.equal(saved.prompts[0].content, 'New prompt');
  assert.equal(saved.howItWorks, 'New workflow');
  assert.equal(saved.generatedAudio.length, 1);
  assert.equal((await request('/edit-me', { name: '' })).status, 400);
});

test('editing spoken script clears stale audio and rendered output', async () => {
  const dir = path.join(outputDir(), 'edit-me');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'render.mp4'), 'old render');
  const response = await request('/edit-me/spoken-script', { text: 'A revised spoken script.' });
  assert.equal(response.status, 200, await response.clone().text());
  const saved = await response.json();
  assert.equal(saved.narration, 'A revised spoken script.');
  assert.equal(saved.extractedScript, saved.narration);
  assert.deepEqual(saved.generatedAudio, []);
  assert.equal(fs.existsSync(dir), false);
  assert.equal((await request('/edit-me/spoken-script', { text: ' ' })).status, 400);
  store.add('scripts', { ...saved, scenePlan: { version: 1 } });
  assert.equal((await request('/edit-me/spoken-script', { text: 'No scene links.' })).status, 409);
});

test('scene narration edits keep scene prompts linked and invalidate old voice', async () => {
  const oldPlan = { version: 1, title: 'Story', thumbnailPrompt: 'A thumbnail', scenes: [{ id: 'scene_001', chapter: 'Opening', role: 'story', narration: 'Old words.', imagePrompt: 'A stone temple.', mediaType: 'image', duration: 5 }] };
  store.add('scripts', { id: 'scene-edit', name: 'Scene story', prompts: [{ id: 'p1', name: 'Main', content: 'Write scenes' }], scenePlan: oldPlan,
    aiResponse: serializeShortsPackage(oldPlan), narration: 'Old words.', generatedAudio: [{ filename: 'old.wav' }], generatedImages: [{ index: 0, prompt: 'A stone temple.', status: 'done' }] });
  const scenePlan = { ...oldPlan, scenes: [{ ...oldPlan.scenes[0], narration: 'New spoken words.' }] };
  const response = await request('/scene-edit', { scenePlan, narration: 'New spoken words.', extractedScript: 'New spoken words.', aiResponse: serializeShortsPackage(scenePlan), generatedAudio: [] });
  assert.equal(response.status, 200, await response.clone().text());
  const saved = await response.json();
  assert.equal(saved.scenePlan.scenes[0].narration, 'New spoken words.');
  assert.equal(saved.generatedImages.length, 1);
  assert.deepEqual(saved.generatedAudio, []);
});

test('editing a complete AI response resets extracted content for a fresh extraction', async () => {
  store.add('scripts', { id: 'response-edit', name: 'Response story', prompts: [{ id: 'p1', name: 'Main', content: 'Write' }],
    aiResponse: '<script>Old words.</script>', narration: 'Old words.', extractedScript: 'Old words.',
    generatedImages: [{ index: 0, status: 'done', prompt: 'Image' }], generatedAudio: [{ filename: 'old.wav' }] });
  const response = await request('/response-edit', { aiResponse: '<script>New words.</script>', extractedScript: '', narration: '', imagePrompts: [], generatedImages: [], generatedAudio: [] });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.aiResponse, '<script>New words.</script>');
  assert.equal(saved.extractedScript, '');
  assert.deepEqual(saved.generatedImages, []);
  assert.deepEqual(saved.generatedAudio, []);
});
