import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';

const directory = fs.mkdtempSync(path.resolve('server/data/shorts-media-test-'));
process.env.TUBEFLOW_DATA_DIR = directory;
process.env.COMFYUI_BASE_URL = 'http://shorts-image-model.test';
const ws = await import('../dist/services/workspace.js');
const { store } = await import('../dist/services/store.js');
const { mediaScenes } = await import('../dist/services/shorts-media.js');
const { serializeShortsPackage } = await import('../dist/services/shorts-package.js');
const { SHORTS_MEDIA_TEMPLATE, LEGACY_SHORTS_MEDIA_TEMPLATE } = await import('../dist/services/shorts-media.js');
const { assembleNarration } = await import('../dist/services/long-narration.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const { accountsRouter } = await import('../dist/routes/accounts.js');
const app = express(); app.use(express.json());
app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
app.use('/api/accounts', accountsRouter);
app.use(express.static(path.resolve('dist')));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const host = `http://127.0.0.1:${server.address().port}`;
const prefix = '/api/accounts/default/profiles/shorts';
const scope = { accountId: 'default', profile: 'shorts' };
const plan = { version: 1, title: 'Shorts test', thumbnailPrompt: 'Portrait cover', scenes: [
  { id: 'scene_001', chapter: 'Hook', role: 'story', mediaType: 'image', duration: 1, narration: 'A red sky.', imagePrompt: 'Red sky portrait still' },
  { id: 'scene_002', chapter: 'Payoff', role: 'story', mediaType: 'video', duration: 3, narration: 'Clouds move.', imagePrompt: 'Clouds portrait still', videoPrompt: 'Clouds moving, slow pan, portrait video' },
] };
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { windowsHide: true, stdio: 'pipe' });
const image = path.join(directory, '001.png'), video = path.join(directory, '002.mp4');
ff(['-f', 'lavfi', '-i', 'color=c=red:s=90x160', '-frames:v', '1', image]);
ff(['-f', 'lavfi', '-i', 'testsrc2=s=90x160:r=30', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
const originalFetch = globalThis.fetch;
let modelRequests = 0;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith(process.env.COMFYUI_BASE_URL)) return originalFetch(url, options);
  if (String(url).endsWith('/system_stats')) return Response.json({});
  if (String(url).endsWith('/prompt')) { modelRequests++; return Response.json({ prompt_id: 'fixture' }); }
  if (String(url).includes('/history/')) return Response.json({ fixture: { outputs: { '9': { images: [{ filename: 'test.png', type: 'output' }] } } } });
  if (String(url).includes('/view?')) return new Response(fs.readFileSync(image));
  throw new Error(`Unexpected model request: ${url}`);
};
const json = (route, body, method = 'POST') => originalFetch(host + prefix + route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const read = () => ws.workspaceContext.run(scope, () => store.getById('scripts', 'episode'));
const upload = (index, file, extension) => originalFetch(`${host}${prefix}/media-import/episode/${index}?extension=${extension}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(file) });

test('Shorts imports, mode persistence, image generation, speech timing and portrait rendering', { timeout: 180000 }, async () => {
  let browser;
  try {
    let list = await (await originalFetch(host + prefix + '/scripts')).json();
    assert.deepEqual(list, [], 'new profiles do not inherit starter scripts');
    const created = await json('/scripts', { id: 'shorts_images_videos', name: 'Shorts media template',
      prompts: [{ id: 'master', content: SHORTS_MEDIA_TEMPLATE }], status: 'draft', duration: 60 });
    assert.equal(created.status, 201);
    list = await (await originalFetch(host + prefix + '/scripts')).json();
    assert.equal(list.filter(s => s.id === 'shorts_images_videos').length, 1);
    assert.match(list[0].prompts[0].content, /<video_prompt>/);
    list = await (await originalFetch(host + prefix + '/scripts')).json();
    assert.equal(list.length, 1, 'explicitly created template persists');
    ws.workspaceContext.run(scope, () => store.add('scripts', { ...list[0], narration: 'Keep existing work', prompts: [{ ...list[0].prompts[0], content: LEGACY_SHORTS_MEDIA_TEMPLATE }] }));
    ws.workspaceContext.run(scope, () => store.remove('template_migrations', 'shorts-media-v3'));
    const upgraded = (await (await originalFetch(host + prefix + '/scripts')).json())[0];
    assert.equal(upgraded.prompts[0].content, SHORTS_MEDIA_TEMPLATE);
    assert.equal(upgraded.narration, 'Keep existing work');
    ws.workspaceContext.run(scope, () => store.add('scripts', { ...upgraded, prompts: [{ ...upgraded.prompts[0], content: 'My custom production template' }] }));
    assert.equal((await (await originalFetch(host + prefix + '/scripts')).json())[0].prompts[0].content, 'My custom production template');
    await originalFetch(host + prefix + '/scripts/shorts_images_videos', { method: 'DELETE' });
    assert.equal((await (await originalFetch(host + prefix + '/scripts')).json()).length, 0, 'deleted template stays deleted');
    const response = await json('/llm/extract', { rawText: serializeShortsPackage(plan) });
    assert.equal(response.status, 200);
    const extracted = await response.json();
    assert.deepEqual(extracted.scenePlan, plan);
    assert.equal((await json('/llm/extract', { rawText: serializeShortsPackage(plan).replace('</video_prompt>', '') })).status, 400);
    assert.equal((await json('/llm/extract', { rawText: '<long_video>{broken}</long_video>' })).status, 400);
    await json('/scripts', { id: 'episode', name: 'Shorts media test', section: 'shorts', status: 'active', duration: 2, prompts: [],
      videoImportsEnabled: true, scenePlan: plan, narration: extracted.ttsText, imagePrompts: extracted.imagePrompts });
    assert.equal((await upload(0, image, 'png')).status, 200);
    assert.equal((await upload(1, image, 'png')).status, 400);
    assert.equal((await upload(1, video, 'mp4')).status, 200);
    const importedVideo = read().generatedImages.find(a => a.mediaType === 'video');
    assert.equal(importedVideo.prompt, plan.scenes[1].videoPrompt);
    assert.equal((await originalFetch(host + importedVideo.url, { headers: { Range: 'bytes=0-99' } })).status, 206);
    assert.equal((await originalFetch(host + importedVideo.url.replace('/shorts/', '/mixed/'))).status, 404);
    assert.equal((await json('/generate/image', { scriptId: 'episode', index: 1, prompt: plan.scenes[1].videoPrompt })).status, 400);
    assert.equal(modelRequests, 0);
    assert.equal((await json('/scripts/episode', { videoImportsEnabled: false }, 'PUT')).status, 200);
    assert.equal((await upload(1, video, 'mp4')).status, 400, 'disabled videos rejected by server');
    const generated = await json('/generate/image', { scriptId: 'episode', index: 1, prompt: plan.scenes[1].imagePrompt });
    assert.equal(generated.status, 200, await generated.text());
    assert.equal(modelRequests, 1);
    assert.equal(read().generatedImages.length, 3, 'still and video alternatives both survive');
    assert.deepEqual(mediaScenes(read()).map(s => s.mediaType), ['image', 'image']);
    await json('/scripts/episode', { videoImportsEnabled: true }, 'PUT');
    assert.deepEqual(mediaScenes(read()).map(s => s.mediaType), ['image', 'video']);
    assert.deepEqual(read().generatedImages.find(a => a.mediaType === 'video'), importedVideo);
    const audio = await ws.workspaceContext.run(scope, () => assembleNarration(plan, { scriptId: 'episode', language: 'en', voice: 'fixture' }, new AbortController().signal, () => {}, async opts => {
      const filename = 'fixture.wav';
      ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', path.join(ws.generatedDir(), opts.scriptId, filename)]);
      return { filename };
    }));
    ws.workspaceContext.run(scope, () => store.add('scripts', { ...read(), generatedAudio: [audio] }));

    if (process.env.SHORTS_MEDIA_BROWSER === '1') {
      const { default: puppeteer } = await import('puppeteer');
      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1050 });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.evaluateOnNewDocument(() => { if (!localStorage.getItem('tubeflow:v1')) localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'generation', selectedScriptId: 'episode' })); });
      await page.goto(host, { waitUntil: 'networkidle0' });
      await page.waitForSelector('article video');
      fs.mkdirSync('artifacts', { recursive: true });
      await page.screenshot({ path: 'artifacts/shorts-media-generation.png', fullPage: true });
      await page.click('input[type=checkbox]');
      await page.waitForFunction(() => document.querySelectorAll('article img').length === 2 && !document.querySelector('article video'));
      await page.reload({ waitUntil: 'networkidle0' });
      assert.equal(await page.$eval('input[type=checkbox]', el => el.checked), false);
      await page.click('input[type=checkbox]'); await page.waitForSelector('article video');
      // Exercise both single and bulk imports through the file picker.
      await page.click('[aria-label="Add or replace image for scene 1"]');
      await (await page.$('input[type=file]')).uploadFile(image);
      await page.waitForFunction(() => document.body.innerText.includes('Saved 1 of 1 imports.'));
      await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent === 'Bulk import').click());
      await (await page.$('input[type=file]')).uploadFile(video);
      await page.waitForFunction(() => !document.querySelector('[aria-label="Add or replace video for scene 2"]').disabled);
      await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Timeline & Render').click());
      await page.waitForSelector('button:has(video)');
      await page.$eval('button:has(video)', el => el.click());
      await page.waitForSelector('[aria-label="Scene duration"]');
      assert.equal(await page.$eval('[aria-label="Scene duration"]', el => el.matches(':disabled')), true);
      assert.equal(await page.$eval('[aria-label="Video format"]', el => el.value), '1080x1920');
      await page.screenshot({ path: 'artifacts/shorts-media-timeline.png', fullPage: true });
      assert.deepEqual(errors, []);

      // Exercise the actual Preview -> Assets path, rather than only its API.
      await json('/scripts', { id: 'tagged-ui', name: 'Tagged Shorts extraction', section: 'shorts', status: 'draft', duration: 30,
        prompts: [{ id: 'master', name: 'Production master', content: SHORTS_MEDIA_TEMPLATE }], videoImportsEnabled: true });
      await page.evaluate(() => localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'preview', selectedScriptId: 'tagged-ui' })));
      await page.reload({ waitUntil: 'networkidle0' });
      const click = text => page.evaluate(text => {
        const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text);
        if (!button) throw new Error(`Missing button: ${text}`);
        button.click();
      }, text);
      const fill = (selector, value) => page.$eval(selector, (el, value) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
      await click('Paste AI Response');
      await page.waitForSelector('#external-ai-response');
      await fill('#external-ai-response', serializeShortsPackage(plan));
      await click('Save & Extract Assets');
      await page.waitForFunction(() => document.body.innerText.includes('Copy video prompt'));
      let uiScript = await (await originalFetch(host + prefix + '/scripts/tagged-ui')).json();
      assert.deepEqual(uiScript.scenePlan, plan);
      assert.equal(uiScript.narration, extracted.ttsText);
      assert.deepEqual(uiScript.imagePrompts, plan.scenes.map(s => s.imagePrompt));
      await page.evaluate(() => [...document.querySelectorAll('button')].filter(el => el.textContent.trim() === 'Edit')[1].click());
      await page.waitForSelector('[aria-label="Video prompt"]');
      const revisedPrompt = 'Revised portrait shot of moving clouds with a steady camera';
      await fill('[aria-label="Video prompt"]', revisedPrompt);
      await click('Save scene');
      await page.waitForFunction(() => !document.querySelector('[aria-label="Video prompt"]'));
      uiScript = await (await originalFetch(host + prefix + '/scripts/tagged-ui')).json();
      assert.equal(uiScript.scenePlan.scenes[1].videoPrompt, revisedPrompt);
      assert.match(uiScript.aiResponse, /^<shorts>/);
      assert.equal(uiScript.narration, extracted.ttsText);
      await click('Generation');
      await page.waitForSelector('[aria-label="Add or replace video for scene 2"]');
      assert.ok(await page.evaluate(prompt => document.body.innerText.includes(prompt), revisedPrompt));

      // Malformed tagged output must show an error, never fall back to guessing image prompts.
      await click('Preview');
      await click('Paste AI Response');
      await fill('#external-ai-response', serializeShortsPackage(plan).replace('</video_prompt>', ''));
      await click('Save & Extract Assets');
      await page.waitForFunction(() => document.body.innerText.includes('Incomplete or unexpected Shorts tags'));
      uiScript = await (await originalFetch(host + prefix + '/scripts/tagged-ui')).json();
      assert.equal(uiScript.scenePlan, undefined);
      assert.deepEqual(uiScript.imagePrompts, []);
      assert.equal(uiScript.pipeline[0].status, 'error');
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.body.innerText.includes('Incomplete or unexpected Shorts tags'));
      assert.deepEqual(errors, []);
    }

    for (const enabled of [true, false]) {
      await json('/scripts/episode', { videoImportsEnabled: enabled }, 'PUT');
      assert.equal(read().generatedAudio[0].filename, audio.filename, 'mode changes preserve narration');
      const script = read();
      const assets = mediaScenes(script).map((s, i) => script.generatedImages.find(a => a.index === i && a.mediaType === s.mediaType));
      const result = await json('/render/start', { scriptId: 'episode', imagePaths: assets.map(a => a.url), audioPath: audio.filename,
        resolution: { width: 1080, height: 1920 }, narration: extracted.ttsText, enableSubtitles: false });
      assert.equal(result.status, 200, await result.text());
      let status;
      for (let i = 0; i < 120; i++) {
        status = await (await originalFetch(host + prefix + '/render/status/episode')).json();
        if (status.status !== 'running') break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      assert.equal(status.status, 'done', JSON.stringify(status));
      const bytes = await (await originalFetch(host + status.videos[0].url)).arrayBuffer();
      const output = path.join(directory, `output-${enabled}.mp4`); fs.writeFileSync(output, Buffer.from(bytes));
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', output], { encoding: 'utf8', windowsHide: true }));
      const visual = probe.streams.find(s => s.codec_type === 'video');
      assert.equal(visual.width, 1080); assert.equal(visual.height, 1920);
      assert.ok(Math.abs(Number(visual.duration) - 2) < 0.04);
      if (enabled) {
        const frame = time => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', output, '-frames:v', '1', '-vf', 'scale=18:32', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
        assert.notDeepEqual(frame(1.2), frame(1.8), 'video retains motion');
      }
    }
    const edited = { ...plan, scenes: plan.scenes.map(s => ({ ...s, narration: `${s.narration} Updated.` })) };
    const saved = await json('/scripts/episode', { scenePlan: edited, narration: edited.scenes.map(s => s.narration).join('\n\n'), aiResponse: serializeShortsPackage(edited) }, 'PUT');
    assert.equal(saved.status, 200); assert.deepEqual(read().scenePlan, edited); assert.deepEqual(read().generatedAudio, []);
  } finally {
    await browser?.close(); globalThis.fetch = originalFetch;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert.ok(directory.startsWith(path.resolve('server/data') + path.sep)); fs.rmSync(directory, { recursive: true, force: true });
  }
});
