import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { defaultPresenter } from '../dist/services/presenter-settings.js';
import { presenterAvatars, avatarPreview } from '../dist/services/presenter.js';

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5176', '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
let logs = '';
vite.stdout.on('data', c => { logs += c; }); vite.stderr.on('data', c => { logs += c; });
try {
  for (let i = 0; i < 50; i++) {
    if (vite.exitCode !== null) throw new Error(logs);
    try { if ((await fetch('http://127.0.0.1:5176')).ok) break; } catch { /* Starting test web server. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const avatars = presenterAvatars();
  const avatar = avatars.find(a => a.id === 'avatar_005');
  assert.ok(avatar, 'Real prepared sage avatar is available');
  const clip = fs.readFileSync(avatarPreview(avatar.id));
  const transparentAvatar = avatars.find(a => a.id === 'avatar_007' && a.hasTransparency);
  assert.ok(transparentAvatar, 'Real transparent avatar is available');
  const transparentClip = fs.readFileSync(avatarPreview(transparentAvatar.id, true));
  const wav = Buffer.alloc(44 + 48000 * 2 * 6);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  let script = { id: 'ch1-s1', name: 'Presenter integration preview', lastUsed: 'Today', status: 'draft', locked: false,
    prompts: [], howItWorks: '', duration: 6, narration: 'The sage explains the story.', presenter: { ...defaultPresenter(), enabled: true },
    generatedImages: [{ index: 0, prompt: 'Story', status: 'done', url: '/api/generate/file/ch1-s1/story.svg' }],
    generatedAudio: [{ language: 'en', url: '/api/tts/file/ch1-s1/voice.wav', filename: 'voice.wav' }],
    timelineConfig: { audioUrl: '/api/tts/file/ch1-s1/voice.wav', totalDuration: 6, resolution: { width: 1920, height: 1080 }, zoomFactor: 1.1,
      clips: [{ id: 'one', imageUrl: '/api/generate/file/ch1-s1/story.svg', duration: 6, transition: 'none', transitionDuration: 0, caption: 'The sage explains the story.' }] } };
  let renderRequest;
  browser = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return void request.continue();
    url.pathname = url.pathname.replace(/^\/api\/accounts\/[^/]+\/profiles\/(shorts|long|mixed)/, '/api');
    let body = {};
    if (url.pathname === '/api/accounts') body = { accounts: [{ id: 'default', name: 'My Channel', color: '#3b82f6', avatar: 'MC' }] };
    if (url.pathname === '/api/scripts') body = [script];
    if (url.pathname === '/api/scripts/ch1-s1') { script = { ...script, ...JSON.parse(request.postData() || '{}') }; body = script; }
    if (url.pathname === '/api/presenter/status') body = { installed: true, avatars, message: 'Presenter engine installed. Starts automatically when rendering.' };
    if (url.pathname === '/api/render/start') { renderRequest = JSON.parse(request.postData()); body = { ok: true }; }
    if (url.pathname.startsWith('/api/render/status/')) body = renderRequest ? { status: 'running', progress: 25, message: 'Generating lip sync' } : { status: 'idle', videos: [] };
    if (url.pathname.startsWith('/api/presenter/avatar/')) return void request.respond({ status: 200,
      contentType: url.searchParams.has('transparent') ? 'video/webm' : 'video/mp4', body: url.searchParams.has('transparent') ? transparentClip : clip });
    if (url.pathname.endsWith('.wav')) return void request.respond({ status: 200, contentType: 'audio/wav', body: wav });
    if (url.pathname.endsWith('.svg')) return void request.respond({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#203448"/><text x="120" y="400" fill="white" font-size="90">Story scene</text></svg>' });
    void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.evaluateOnNewDocument(() => localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'ch1', section: 'shorts', tab: 'review', selectedScriptId: 'ch1-s1' })));
  await page.goto('http://127.0.0.1:5176', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[aria-label="Presenter placement preview"] video');
  await page.waitForFunction(() => document.querySelector('[aria-label="Presenter placement preview"] video')?.readyState >= 2);
  const clickText = async text => {
    for (const b of await page.$$('button')) if ((await b.evaluate(el => el.textContent)).includes(text)) { await b.click(); return; }
    throw new Error(`Missing button: ${text}`);
  };
  await clickText('Save presenter settings');
  assert.equal(script.presenter.enabled, true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[aria-label="Presenter placement preview"]');
  await page.select('[aria-label="Presenter framing"]', 'full');
  await clickText('Save presenter settings');
  await page.waitForFunction(() => document.body.innerText.includes('Presenter settings saved.'));
  assert.equal(script.presenter.crop.width, 100);
  await page.select('[aria-label="Presenter framing"]', 'chest');
  await page.select('[aria-label="Presenter character"]', transparentAvatar.id);
  await page.waitForFunction(() => document.querySelector('[aria-label="Presenter placement preview"] video')?.readyState >= 2
    && document.querySelector('[aria-label="Presenter placement preview"] video')?.src.includes('transparent=1'));
  assert.equal(await page.$eval('[aria-label="Presenter appearance"]', el => el.value), 'transparent');
  const alpha = await page.$eval('[aria-label="Presenter placement preview"] video', el => {
    const canvas = document.createElement('canvas'); canvas.width = el.videoWidth; canvas.height = el.videoHeight;
    const context = canvas.getContext('2d'); context.drawImage(el, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0, opaque = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) clear++; if (data[i] === 255) opaque++; }
    return { clear, opaque };
  });
  assert.ok(alpha.clear > 1000 && alpha.opaque > 1000, `preview has real alpha: ${JSON.stringify(alpha)}`);
  async function captionPlacement() {
    return page.evaluate(() => {
      const caption = document.querySelector('[aria-label="Subtitle placement preview"]').getBoundingClientRect();
      const avatar = document.querySelector('[aria-label="Presenter placement preview"]').getBoundingClientRect();
      const canvas = document.querySelector('[aria-label="Subtitle placement preview"]').parentElement.getBoundingClientRect();
      return { center: (caption.left + caption.right) / 2, expectedCenter: (canvas.left + canvas.right) / 2, bottom: caption.bottom, avatarTop: avatar.top, width: caption.width };
    });
  }
  const firstPlacement = await captionPlacement();
  assert.ok(Math.abs(firstPlacement.center - firstPlacement.expectedCenter) < 1);
  assert.ok(firstPlacement.bottom < firstPlacement.avatarTop);
  await page.$eval('[aria-label="Width (%)"]', el => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '40');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('[aria-label="Width (%)"]').value === '40');
  const largerPlacement = await captionPlacement();
  assert.ok(Math.abs(largerPlacement.center - firstPlacement.center) < 1, 'larger avatar must not shift subtitles sideways');
  assert.ok(Math.abs(largerPlacement.width - firstPlacement.width) < 1, 'caption width remains fixed');
  assert.ok(largerPlacement.bottom < largerPlacement.avatarTop, 'caption stays above enlarged avatar');
  await clickText('Save presenter settings');
  await page.waitForFunction(() => document.body.innerText.includes('Presenter settings saved.'));
  assert.equal(script.presenter.style, 'transparent');
  fs.mkdirSync('artifacts/presenter', { recursive: true });
  await page.screenshot({ path: 'artifacts/presenter/editor-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/presenter/editor-mobile.png', fullPage: true });
  await page.click('[aria-label="Show subtitles"]');
  await page.waitForFunction(() => !document.querySelector('[aria-label="Show subtitles"]').disabled && !document.querySelector('[aria-label="Show subtitles"]').checked);
  assert.equal(script.enableSubtitles, false);
  assert.equal(await page.$('[aria-label="Subtitle placement preview"]'), null);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[aria-label="Show subtitles"]');
  assert.equal(await page.$eval('[aria-label="Show subtitles"]', el => el.checked), false, 'subtitle off survives reload');
  assert.equal(await page.$('[aria-label="Subtitle placement preview"]'), null);
  await clickText('Start Video Generation');
  await page.waitForFunction(() => document.body.innerText.includes('Generating lip sync'));
  assert.equal(renderRequest.presenter.avatarId, transparentAvatar.id);
  assert.equal(renderRequest.presenter.style, 'transparent');
  assert.equal(renderRequest.enableSubtitles, false);
  assert.equal(renderRequest.presenter.crop.width, 40);
  assert.equal(renderRequest.audioPath, 'voice.wav');
  assert.deepEqual(errors, []);
  console.log('PASS: presenter source preview, saved settings, crop selection, render request, progress and desktop/mobile layout');
} finally {
  await browser?.close();
  vite.kill();
}
