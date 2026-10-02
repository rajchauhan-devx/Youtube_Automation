import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import puppeteer from 'puppeteer';

process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-script-ui-'));
const { store } = await import('../dist/services/store.js');
const { accountsRouter } = await import('../dist/routes/accounts.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
store.add('scripts', { id: 'script-ui', accountId: 'default', section: 'shorts', name: 'Before edit',
  status: 'active', locked: false, lastUsed: 'Never', duration: 30, model: 'gemini-3.6-flash', howItWorks: 'Original workflow',
  prompts: [{ id: 'p1', name: 'Story prompt', type: 'Custom', content: 'Original prompt' }], narration: 'Original spoken text.' });
const app = express();
app.use(express.json());
app.use('/api/accounts', accountsRouter);
app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
app.use(express.static(path.resolve('dist')));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const browser = await puppeteer.launch({ executablePath: process.env.EDITING_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'scripts', selectedScriptId: 'script-ui' })));
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('button[title="Edit script and prompts"]');
  await page.click('button[title="Edit script and prompts"]');
  await page.waitForSelector('[role="dialog"][aria-label="Edit Before edit"]');
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent?.includes('Template & prompts'))?.click());
  await page.click('input[aria-label="Script name"]');
  await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
  await page.keyboard.type('After edit');
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent?.includes('Save changes'))?.click());
  await page.waitForFunction(() => document.body.textContent.includes('After edit'));
  assert.equal(store.getById('scripts', 'script-ui').name, 'After edit');
  await page.click('button[title="Edit script and prompts"]');
  await page.waitForSelector('textarea[aria-label="Spoken script"]');
  await page.click('textarea[aria-label="Spoken script"]');
  await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
  await page.keyboard.type('The revised narration.');
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent?.includes('Save changes'))?.click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(store.getById('scripts', 'script-ui').narration, 'The revised narration.');
  assert.deepEqual(errors, []);
} finally { await browser.close(); server.close(); }
