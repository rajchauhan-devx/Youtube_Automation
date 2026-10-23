import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import puppeteer from 'puppeteer';

let script = { id: 'google-voice-test', name: 'Hindi narrator test', status: 'draft', lastUsed: 'Never', locked: false, prompts: [{ id: 'one', name: 'Script', content: 'Write a story.' }], howItWorks: '', duration: 60, narration: 'नमस्ते! आज हम एक कहानी सुनेंगे।' };
const account = { id: 'default', name: 'Voice Test', avatar: 'VT', color: '#3b82f6' };
const previews = [], generations = [];
let previewFails = false;
const wave = Buffer.alloc(44 + 24000);
wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(24000, 24); wave.writeUInt32LE(48000, 28);
wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(24000, 40);
for (let i = 44; i < wave.length; i += 2) wave.writeInt16LE(Math.round(2000 * Math.sin((i - 44) * .04)), i);
const app = express(); app.use(express.json());
app.get('/api/accounts', (_req, res) => res.json({ accounts: [account] }));
app.use('/api/accounts/default/profiles/shorts', (req, res) => {
  if (req.path === '/scripts') return res.json([script]);
  if (req.path === `/scripts/${script.id}`) { if (req.method === 'PUT') script = { ...script, ...req.body }; return res.json(script); }
  if (req.path === '/tts/providers') return res.json({ defaultProvider: 'google', providers: [{ id: 'edge', name: 'Edge Neural TTS', configured: true, kind: 'cloud' }, { id: 'google', name: 'Google Chirp 3 HD', configured: true, kind: 'cloud' }] });
  if (req.path === '/tts/status') return res.json({ ready: true, online: true, state: 'ready', provider: req.query.provider === 'google' ? 'Google Chirp 3 HD' : 'Edge Neural TTS', providerKind: req.query.provider === 'google' ? 'cloud' : 'local' });
  if (req.path === '/tts/voices') {
    const lang = req.query.language || 'en', google = req.query.provider === 'google';
    return res.json({ provider: google ? 'Google Chirp 3 HD' : 'Edge Neural TTS', voices: google ? ['Charon', 'Kore'].map(name => ({ id: `${lang === 'hi' ? 'hi' : 'en'}-IN-Chirp3-HD-${name}`, name: `${name} · ${lang}`, language: lang, source: 'provider' })) : [{ id: 'builtin', name: 'Edge narrator', language: lang, source: 'builtin' }] });
  }
  if (req.path === '/tts/preview') { previews.push(req.body); return previewFails ? res.status(429).json({ error: 'Google speech quota reached.' }) : res.type('audio/wav').send(wave); }
  if (req.path === '/tts/generate') { generations.push(req.body); return res.json({ provider: req.body.provider, publicUrl: '/fixture.wav', filename: 'fixture.wav' }); }
  if (req.path === '/llm/autopilot-topic') return res.status(422).json({ error: 'Fixture stops after production settings have been saved.' });
  if (req.path === '/youtube/status') return res.json({ configured: true, authenticated: false });
  return res.json({});
});
app.get('/fixture.wav', (_req, res) => res.type('audio/wav').send(wave));
app.use(express.static(path.resolve('dist')));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const browser = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1100 });
  await page.evaluateOnNewDocument(() => {
    if (!localStorage.getItem('tubeflow:v1')) localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'preview', selectedScriptId: 'google-voice-test' }));
    window.systemPreviewCalls = 0;
    window.speechSynthesis.speak = () => window.systemPreviewCalls++;
  });
  const click = async label => {
    await page.waitForFunction(label => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === label && !el.disabled), {}, label);
    await page.evaluate(label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label).click(), label);
  };
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle0' });
  await click('Run Auto-Pilot');
  await page.waitForSelector('[aria-label="Voice engine"]');
  assert.deepEqual(await page.$$eval('[aria-label="Voice language"] option', els => els.map(el => el.value)), ['en', 'hi']);
  assert.equal(await page.$eval('[aria-label="Voice language"]', el => el.value), 'hi');
  await page.select('[aria-label="Voice engine"]', 'google');
  await page.waitForFunction(() => document.querySelector('[aria-label="Narration voice"]').value.startsWith('hi-IN-Chirp3'));
  await page.select('[aria-label="Narration voice"]', 'hi-IN-Chirp3-HD-Kore');
  await page.type('[aria-label="Voice preview text"]', 'नमस्ते! यह मेरी कहानी है।');
  await click('Preview voice');
  await page.waitForFunction(() => document.querySelector('[aria-label="Narrator preview playback"]').readyState >= 2);
  assert.equal(previews.at(-1).provider, 'google'); assert.equal(previews.at(-1).voice, 'hi-IN-Chirp3-HD-Kore'); assert.equal(previews.at(-1).language, 'hi');
  assert.equal(previews.at(-1).text, 'नमस्ते! यह मेरी कहानी है।');
  await page.$eval('[aria-label="Voice preview text"]', el => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'artifacts/google-tts/autopilot-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.$eval('[aria-label="Voice preview text"]', el => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'artifacts/google-tts/autopilot-mobile.png', fullPage: true });
  await page.setViewport({ width: 1440, height: 1100 });
  await page.select('[aria-label="Voice language"]', 'en');
  await page.waitForFunction(() => document.querySelector('[aria-label="Narration voice"]').value.startsWith('en-IN-Chirp3'));
  assert.equal(await page.$eval('[aria-label="Narrator preview playback"]', el => el.hidden), true, 'language switch clears old playback');
  await page.select('[aria-label="Voice language"]', 'hi');
  await page.waitForFunction(() => document.querySelector('[aria-label="Narration voice"]').value === 'hi-IN-Chirp3-HD-Kore');
  // A real click on the submit control saves the exact auditioned voice before production.
  await page.$eval('form:has(#run-topic)', form => form.requestSubmit());
  await page.waitForFunction(() => !document.querySelector('#run-topic'));
  assert.equal(script.autoPilotSettings.voice.provider, 'google'); assert.equal(script.autoPilotSettings.voice.language, 'hi'); assert.equal(script.autoPilotSettings.voice.voiceId, 'hi-IN-Chirp3-HD-Kore');
  await page.evaluate(() => { localStorage.removeItem('tubeflow:v1:default'); localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'generation', selectedScriptId: 'google-voice-test' })); });
  await page.evaluate(() => localStorage.setItem('tubeflow:voice:default:Google Chirp 3 HD:hi', 'hi-IN-Chirp3-HD-Charon'));
  await page.reload({ waitUntil: 'networkidle0' });
  await click('Audio');
  await page.waitForSelector('[aria-label="Voice engine"]');
  await page.waitForFunction(() => document.querySelector('[aria-label="Narration voice"]').value === 'hi-IN-Chirp3-HD-Kore');
  assert.equal(await page.$eval('[aria-label="Voice engine"]', el => el.value), 'google', 'manual Audio restores the saved run engine');
  await page.select('[aria-label="Voice engine"]', 'google');
  await page.select('#narration-language', 'hi');
  await page.waitForFunction(() => document.querySelector('[aria-label="Narration voice"]').value.startsWith('hi-IN-Chirp3'));
  await page.select('[aria-label="Narration voice"]', 'hi-IN-Chirp3-HD-Kore');
  previewFails = true;
  await click('Preview voice');
  await page.waitForFunction(() => document.body.textContent.includes('Google speech quota reached.'));
  assert.equal(await page.evaluate(() => window.systemPreviewCalls), 0, 'provider failure never substitutes a browser voice');
  previewFails = false;
  await click('Generate audio');
  await page.waitForFunction(() => document.body.textContent.includes('Download'));
  assert.equal(generations.at(-1).provider, 'google'); assert.equal(generations.at(-1).language, 'hi'); assert.equal(generations.at(-1).voice, 'hi-IN-Chirp3-HD-Kore');
  await page.screenshot({ path: 'artifacts/google-tts/manual-audio.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Cloud speech selectors, Hindi/English previews, audio playback, run persistence, error handling and manual generation passed.');
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
