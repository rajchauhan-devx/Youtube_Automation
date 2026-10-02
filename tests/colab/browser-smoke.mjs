import assert from 'node:assert/strict';
import path from 'node:path';
import express from '../../server/node_modules/express/index.js';
import puppeteer from 'puppeteer';

// Verify the actual compiled generation screen, without starting any GPU model.
const fixture = {
  id: 'colab-browser', name: 'Colab browser fixture', accountId: 'default', section: 'long',
  status: 'active', duration: 60, prompts: [], generatedAudio: [],
  imagePrompts: ['Existing still', 'New still'],
  generatedImages: [{ index: 0, prompt: 'Existing still', status: 'done', url: '/fixture.png' }],
};
const app = express();
app.use(express.static(path.resolve('dist')));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: process.env.EDITING_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [], requests = [];
  let pendingImage;
  let blockImage = true;
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1100 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'long', tab: 'generation', selectedScriptId: 'colab-browser' }));
    localStorage.setItem('colab_url', 'https://fixture.trycloudflare.com');
    localStorage.setItem('colab_key', 'fixture-key');
  });
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    const json = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (!url.pathname.startsWith('/api/')) {
      if (url.pathname === '/fixture.png') return request.respond({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY9kAAAAASUVORK5CYII=', 'base64') });
      return request.continue();
    }
    requests.push({ path: url.pathname, headers: request.headers(), body: request.postData() });
    if (url.pathname === '/api/accounts') return json([{ id: 'default', name: 'My Channel', color: '#3b82f6', avatar: 'MC' }]);
    if (url.pathname.endsWith('/generate/colab-image')) {
      if (blockImage) { pendingImage = request; return; }
      return json({ ok: true, url: '/fixture.png', elapsedMs: 5 });
    }
    if (url.pathname.endsWith('/generate/colab-cancel')) {
      if (pendingImage) {
        await pendingImage.respond({ status: 499, contentType: 'application/json', body: JSON.stringify({ error: 'Cancelled' }) });
        pendingImage = undefined;
      }
      return json({ ok: true, cancelled: true });
    }
    if (url.pathname.endsWith('/generate/colab-status')) return json({ configured: true, reachable: true, detail: 'Fixture worker reachable.' });
    if (url.pathname.endsWith('/generate/status')) return json({ online: false, detail: 'Local engine is stopped.' });
    if (url.pathname.endsWith('/generate/models')) return json({ models: ['fixture.safetensors'] });
    if (url.pathname.endsWith('/scripts')) return json([fixture]);
    if (url.pathname.endsWith(`/scripts/${fixture.id}`)) {
      if (request.method() === 'PUT') Object.assign(fixture, JSON.parse(request.postData()));
      return json(fixture);
    }
    return json({});
  });
  const clickText = async text => {
    const clicked = await page.evaluate(text => {
      const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text);
      if (!button || button.disabled) return false;
      button.click(); return true;
    }, text);
    assert.equal(clicked, true, `Missing enabled button: ${text}`);
  };
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[aria-label="Media provider"]');
  assert.match(await page.$eval('body', el => el.textContent), /Image Model is offline/);
  await page.select('[aria-label="Media provider"]', 'colab');
  assert.doesNotMatch(await page.$eval('body', el => el.textContent), /Image Model is offline|Art Style:|Computer rest:/);
  await clickText('Test Colab');
  await page.waitForFunction(() => document.body.textContent.includes('Fixture worker reachable.'));
  await clickText('Resume Generation');
  await page.waitForFunction(() => document.querySelector('[aria-label="Media provider"]').disabled);
  await page.waitForFunction(() => document.body.textContent.includes('Generating...'));
  const deadline = Date.now() + 3000;
  while (!pendingImage && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(pendingImage, 'No remote generation request');
  const submitted = requests.find(request => request.path.endsWith('/generate/colab-image'));
  assert.equal(submitted.headers['x-colab-key'], 'fixture-key');
  assert.equal(submitted.headers['x-colab-url'], 'https://fixture.trycloudflare.com');
  assert.deepEqual(JSON.parse(submitted.body), { scriptId: fixture.id, index: 1, prompt: 'New still' });
  await clickText('Cancel');
  await page.waitForFunction(() => !document.querySelector('[aria-label="Media provider"]').disabled);
  assert.ok(requests.some(request => request.path.endsWith('/generate/colab-cancel')));
  assert.equal(requests.some(request => request.path.endsWith('/generate/cancel')), false);
  assert.equal(fixture.generatedImages[0].status, 'done');
  assert.equal(fixture.generatedImages[1].status, 'pending');
  blockImage = false;
  await clickText('Resume Generation');
  await page.waitForFunction(() => document.body.textContent.includes('2/2 done'));
  assert.equal(fixture.generatedImages.every(image => image.status === 'done'), true);
  assert.equal(requests.filter(request => request.path.endsWith('/generate/colab-image')).length, 2);
  assert.equal(requests.some(request => request.path.endsWith('/generate/start') || request.path.endsWith('/generate/image')), false);
  await page.select('[aria-label="Media provider"]', 'local');
  assert.match(await page.$eval('body', el => el.textContent), /Image Model is offline/);
  assert.deepEqual(errors, []);
  console.log('Colab browser smoke passed: provider controls, key headers, cancellation, retry, and completed-image reuse.');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
