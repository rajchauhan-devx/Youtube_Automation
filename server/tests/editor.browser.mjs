import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const wav = Buffer.alloc(44 + 48000 * 2 * 6);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const colors = ['red', 'blue', 'green'];
const images = colors.map((color, index) => ({ index, prompt: `${color} scene`, status: 'done', url: `/api/generate/file/ch1-s1/${color}.svg` }));
let script = { id: 'ch1-s1', name: 'Editor timing test', lastUsed: 'Today', status: 'draft', locked: false,
  prompts: [], howItWorks: '', duration: 6, narration: 'One scene. Another scene. Final scene.', generatedImages: images,
  generatedAudio: [{ language: 'en', url: '/api/generate/file/ch1-s1/voice.wav', filename: 'voice.wav' }],
  timelineConfig: { audioUrl: '/api/generate/file/ch1-s1/voice.wav', totalDuration: 6,
    resolution: { width: 1080, height: 1920 }, zoomFactor: 1.15,
    clips: images.map((img, i) => ({ id: `clip${i}`, imageUrl: img.url, prompt: img.prompt,
      duration: [1, 2, 3][i], transition: 'none', transitionDuration: 0.5, caption: '' })) } };
const browser = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return void request.continue();
    url.pathname = url.pathname.replace(/^\/api\/accounts\/[^/]+\/profiles\/(shorts|long)/, '/api');
    if (url.pathname === '/api/accounts') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ accounts: [{ id: 'default', name: 'My Channel', color: '#3b82f6', avatar: 'MC' }] }) });
    let body = {};
    if (url.pathname === '/api/scripts') body = [script];
    if (url.pathname === '/api/scripts/ch1-s1') {
      script = { ...script, ...JSON.parse(request.postData() || '{}') }; body = script;
    }
    if (url.pathname === '/api/render/music-tracks') body = { tracks: [] };
    if (url.pathname.startsWith('/api/render/status/')) body = { status: 'idle', videos: [] };
    if (url.pathname.endsWith('.wav')) {
      const range = request.headers().range;
      if (range) {
        const start = Number(/bytes=(\d+)/.exec(range)?.[1] || 0);
        return void request.respond({ status: 206, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${wav.length - 1}/${wav.length}` }, body: wav.subarray(start) });
      }
      return void request.respond({ status: 200, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: wav });
    }
    if (url.pathname.endsWith('.svg')) {
      const color = colors.find(color => url.pathname.endsWith(`${color}.svg`));
      return void request.respond({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><rect width="540" height="960" fill="${color}"/></svg>` });
    }
    void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.evaluateOnNewDocument(() => localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'ch1', section: 'shorts', tab: 'review', selectedScriptId: 'ch1-s1' })));
  await page.goto('http://127.0.0.1:5175', { waitUntil: 'networkidle0' });
  await page.waitForSelector('[aria-label="Narration playhead"]');
  console.log('Editor loaded');
  assert.deepEqual(script.timelineConfig.clips.map(c => c.duration), [1, 2, 3], 'metadata must not overwrite edits');
  const click = async text => {
    const buttons = await page.$$('button');
    for (const button of buttons) if ((await button.evaluate(el => el.textContent.trim())) === text) { await button.click(); return; }
    throw new Error(`Button not found: ${text}`);
  };
  await page.locator('button:has(img[src$="red.svg"])').click();
  console.log('Scene selected');
  await click('Later');
  console.log('Scene moved');
  await page.waitForFunction(() => document.querySelector('img[alt="Preview"]')?.getAttribute('src')?.endsWith('blue.svg') || [...document.images].some(img => img.className.includes('h-full w-full object-cover') && img.src.endsWith('blue.svg')));
  await click('Undo');
  await click('Redo');
  await page.$eval('[aria-label="Narration playhead"]', el => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2.5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  console.log('Playhead moved');
  assert.ok(Math.abs(await page.$eval('audio', el => el.currentTime) - 2.5) < 0.1, 'seek must update narration');
  await click('End scene at playhead');
  await page.waitForFunction(() => document.querySelector('[aria-label="Scene duration"]').value === '0.5');
  await click('Remove scene');
  await click('Fit timing to narration');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[aria-label="Narration playhead"]');
  assert.equal(script.timelineConfig.clips.length, 2, 'edits survive reload');
  assert.ok(Math.abs(script.timelineConfig.totalDuration - 6) < 0.001);
  await click('Play Timeline (Space)');
  await page.waitForFunction(() => document.querySelector('audio').currentTime > 0.15);
  assert.ok(Math.abs(await page.$eval('audio', el => el.currentTime) - await page.$eval('[aria-label="Narration playhead"]', el => Number(el.value))) < 0.2, 'audio must drive preview clock');
  await click('Pause (Space)');
  await page.locator('button:has(img[src$="blue.svg"])').click();
  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/editor-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/editor-mobile.png', fullPage: true });
  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log('PASS: duration preservation, reorder, undo/redo, audio seeking, scene boundary, removal, persistence, desktop/mobile screenshots');
} finally { await browser.close(); }
