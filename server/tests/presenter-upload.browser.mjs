// Opt-in real upload: exercises the UI, HTTP upload, worker and prepared preview.
// Requires npm run setup:presenter and access to the local GPU (or CPU).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { presenterRouter } from '../dist/routes/presenter.js';
import { museTalkRoot, presenterHealth } from '../dist/services/presenter.js';

assert.equal(presenterHealth().canPrepare, true, 'Install bundled MuseTalk first');
const directory = path.resolve('artifacts/presenter');
fs.mkdirSync(directory, { recursive: true });
const fixture = fs.mkdtempSync(path.join(directory, 'upload-ui-'));
const sample = path.join(fixture, 'avatar.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(museTalkRoot(), 'MuseTalk/data/video/sun.mp4'), '-t', '0.4', '-an', sample]);
fs.writeFileSync(path.join(fixture, 'index.html'), '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="./fixture.tsx"></script></body></html>');
fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PresenterPanel, PresenterPreview } from '/src/components/editor/PresenterPanel';
import { defaultPresenter } from '/server/src/services/presenter-settings';
import '/src/index.css';
function Demo() {
 const [value,setValue] = useState(defaultPresenter());
 const [avatars,setAvatars] = useState([]);
 const avatar = avatars.find(a => a.id === value.avatarId);
 return <main style={{maxWidth:900,margin:'24px auto',padding:16,background:'#151922'}}>
 <PresenterPanel value={value} onChange={setValue} onSave={async()=>{}} onAvatars={setAvatars} disabled={false}/>
 {avatar && value.enabled && <div style={{position:'relative',aspectRatio:'16/9',background:'#203448',marginTop:20}}><PresenterPreview avatar={avatar} value={value} landscape playing/></div>}
 <output id="settings" style={{display:'none'}}>{JSON.stringify(value)}</output></main>;
}
createRoot(document.getElementById('root')).render(<Demo/>);
`);
const app = express(); app.use('/api/presenter', presenterRouter);
const api = await new Promise((resolve, reject) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); server.on('error', reject); });
let vite, browser, importedAvatar;
try {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, proxy: { '/api': `http://127.0.0.1:${api.address().port}` } } });
  await vite.listen();
  browser = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1100, height: 1100 });
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/${path.relative(process.cwd(), fixture)}/index.html`);
  const input = await page.waitForSelector('[aria-label="Upload presenter avatar"]');
  await input.uploadFile(sample);
  await page.waitForFunction(() => document.querySelector('[aria-label="Upload presenter avatar"]').disabled);
  await page.waitForFunction(() => {
    const data = JSON.parse(document.querySelector('#settings').textContent);
    return data.enabled && data.avatarId.startsWith('avatar_') && data.avatarId.length > 20;
  }, { timeout: 180000 });
  const value = await page.$eval('#settings', el => JSON.parse(el.textContent));
  importedAvatar = value.avatarId;
  assert.equal(value.style, 'card');
  assert.deepEqual(value.crop, { x: 0, y: 0, width: 100, height: 100 });
  await page.waitForFunction(() => document.querySelector('[aria-label="Presenter placement preview"] video')?.readyState >= 2);
  assert.equal(await page.$eval('[aria-label="Upload presenter avatar"]', el => el.disabled), false);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(directory, 'upload-desktop.png'), fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Presenter panel fits a mobile viewport');
  await page.screenshot({ path: path.join(directory, 'upload-mobile.png'), fullPage: true });
  console.log(JSON.stringify({ success: true, avatarId: value.avatarId, test: 'Real avatar upload, preparation, selection and video preview' }));
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise(resolve => api.close(resolve));
  fs.rmSync(fixture, { recursive: true, force: true });
  if (importedAvatar && /^avatar_[a-f0-9]{32}$/.test(importedAvatar)) fs.rmSync(path.join(museTalkRoot(), 'avatars/prepared', importedAvatar), { recursive: true, force: true });
}
