import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const fixture = path.resolve('artifacts/profile-reference.wav');
fs.mkdirSync(path.dirname(fixture), { recursive: true });
const wav = Buffer.alloc(44 + 48000);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(48000, 40);
fs.writeFileSync(fixture, wav);
const provider = 'Chatterbox Multilingual V3';
let voices = [];
const requests = [];
let script = { id: 'ch1-s1', name: 'Voice library test', lastUsed: 'Today', status: 'draft', locked: false, prompts: [], howItWorks: '', duration: 30, narration: 'Hello. This is a narration test.' };
const browser = await puppeteer.launch({ headless: true });
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
    let body = {}; let status = 200;
    if (url.pathname === '/api/scripts') body = [script];
    if (url.pathname === '/api/scripts/ch1-s1') { script = { ...script, ...JSON.parse(request.postData() || '{}') }; body = script; }
    if (url.pathname === '/api/tts/status') body = { online: true, ready: true, state: 'ready', provider, kind: 'local' };
    if (url.pathname === '/api/tts/voices') {
      if (request.method() === 'POST') {
        const input = JSON.parse(request.postData());
        assert.ok(input.dataUrl.startsWith('data:audio/wav;base64,'));
        const voice = { id: `clone_${input.language}`, name: input.name, language: input.language, source: 'clone', deletable: true };
        voices.push(voice); body = { voice }; status = 201;
      } else {
        const language = url.searchParams.get('language');
        body = { provider, voices: [{ id: 'builtin', name: 'Chatterbox Natural', language }, ...voices.filter(v => v.language === language)] };
      }
    }
    if (request.method() === 'DELETE' && url.pathname.startsWith('/api/tts/voices/')) {
      const id = url.pathname.split('/').pop(); voices = voices.filter(v => v.id !== id); body = { ok: true };
    }
    if (url.pathname === '/api/tts/generate') {
      requests.push(JSON.parse(request.postData())); body = { ok: true, filename: 'generated.wav', publicUrl: '/api/generated.wav' };
    }
    if (url.pathname.endsWith('.wav') || url.pathname.endsWith('/reference')) return void request.respond({ status: 200, contentType: 'audio/wav', body: wav });
    void request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.evaluateOnNewDocument(() => localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'ch1', section: 'shorts', tab: 'generation', selectedScriptId: 'ch1-s1' })));
  await page.goto('http://127.0.0.1:5175', { waitUntil: 'networkidle0' });
  const clickText = async text => {
    for (const element of await page.$$('button')) {
      if ((await element.evaluate(el => el.textContent)).includes(text)) { await element.click(); return; }
    }
    throw new Error(`Missing button: ${text}`);
  };
  await page.click('[aria-label="Profile and voices"]');
  await page.waitForSelector('[aria-label="English voice name"]');
  for (const language of ['English', 'Hindi']) {
    await page.type(`[aria-label="${language} voice name"]`, `My ${language} Voice`);
    await (await page.$(`[aria-label="${language} reference recording"]`)).uploadFile(fixture);
    await clickText(`Save ${language} voice`);
    await page.waitForFunction(label => document.body.textContent.includes(`${label} saved.`), {}, `My ${language} Voice`);
  }
  assert.equal(voices.length, 2);
  await page.screenshot({ path: 'artifacts/profile-voices-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'artifacts/profile-voices-mobile.png', fullPage: true });
  await page.setViewport({ width: 1440, height: 1100 });
  await page.reload({ waitUntil: 'networkidle0' });
  await clickText('Audio Generation');
  await page.waitForFunction(() => document.body.textContent.includes('My English Voice'));
  assert.ok(!(await page.$eval('body', el => el.textContent)).includes('My Hindi Voice'));
  assert.equal(await page.$$eval('div.relative.cursor-pointer', cards => cards.filter(card => card.textContent.includes('My English Voice') && card.className.includes('ring-1')).length), 1, 'the Profile voice is selected automatically in Audio Generation');
  // Voice cards currently use selectable divs; click the exact visible name.
  async function selectVoice(name) {
    const handle = await page.evaluateHandle(name => [...document.querySelectorAll('h4, h3, span, p')].find(el => el.textContent.trim() === name), name);
    await handle.asElement().click();
  }
  await selectVoice('My English Voice');
  await clickText('Start Audio Generation');
  await page.waitForFunction(() => document.body.textContent.includes('Start Re-generation'));
  assert.equal(requests[0].voice, 'clone_en'); assert.equal(requests[0].language, 'en');
  await clickText('Hindi & Hinglish');
  await page.waitForFunction(() => document.body.textContent.includes('My Hindi Voice'));
  await selectVoice('My Hindi Voice');
  await clickText('Start Audio Generation');
  await page.waitForFunction(() => document.body.textContent.includes('Start Re-generation'));
  assert.equal(requests[1].voice, 'clone_hi'); assert.equal(requests[1].language, 'hi');
  await clickText('English (US');
  await page.waitForFunction(() => document.body.textContent.includes('My English Voice'));
  await clickText('Start Re-generation');
  await page.waitForFunction(() => !document.body.textContent.includes('Generating Audio ('));
  assert.equal(requests[2].voice, 'clone_en', 'language-specific selection is remembered');
  await page.click('[aria-label="Profile and voices"]');
  await page.waitForSelector('[aria-label="Delete My English Voice"]');
  page.once('dialog', dialog => dialog.accept());
  await page.click('[aria-label="Delete My English Voice"]');
  await page.waitForFunction(() => !document.querySelector('[aria-label="Delete My English Voice"]'));
  assert.equal(voices.length, 1);
  assert.deepEqual(errors, []);
  console.log('PASS: profile uploads both languages; reload retains voices; language filtering, generation payload, remembered selection, deletion, responsive layout');
} finally { await browser.close(); fs.unlinkSync(fixture); }

