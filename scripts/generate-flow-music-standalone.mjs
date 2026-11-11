import { chromium } from './server/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';

async function main() {
  const profileDir = path.resolve('server/data/flow/profile-default');
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
    try { fs.unlinkSync(path.join(profileDir, f)); } catch {}
  }

  const downloadsDir = path.resolve('server/data/flow-music/downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });
  const outputFile = path.join(downloadsDir, 'hanuman_vedic_trailer_flow.mp3');

  console.log('Launching browser with profile:', profileDir);
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'msedge',
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    acceptDownloads: true,
  });

  const page = context.pages()[0] || (await context.newPage());

  // Listen for audio network responses (e.g. mp3/wav/ogg or cdn urls)
  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('audio') || url.includes('.mp3') || url.includes('.wav') || (url.includes('audio') && response.status() === 200)) {
      console.log(`[Network Audio Response] URL: ${url.slice(0, 100)} (type: ${ct})`);
      if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size < 10000) {
        try {
          const buffer = await response.body();
          if (buffer.length > 50000) { // at least 50KB
            fs.writeFileSync(outputFile, buffer);
            console.log(`>>> Audio saved directly from network response: ${outputFile} (${buffer.length} bytes)`);
          }
        } catch {}
      }
    }
  });

  console.log('Navigating to https://www.flowmusic.app/ ...');
  try {
    await page.goto('https://www.flowmusic.app/', { waitUntil: 'load', timeout: 30000 });
  } catch {
    console.log('Navigation continuing after load timeout...');
  }
  await page.waitForTimeout(3000);

  // 1. Handle Privacy Notice Modal
  console.log('Checking for Privacy Notice modal...');
  const continueBtn = page.locator('button:has-text("Continue")');
  if (await continueBtn.count() && (await continueBtn.first().isVisible().catch(() => false))) {
    console.log('Clicking "Continue" button on Privacy Notice...');
    await continueBtn.first().click({ force: true });
    await page.waitForTimeout(2000);
  }

  // 2. Handle Creative Suite "Ok" Modal
  console.log('Checking for Creative Suite "Ok" modal...');
  const okBtn = page.locator('button').filter({ hasText: /^Ok$/i });
  if (await okBtn.count() && (await okBtn.first().isVisible().catch(() => false))) {
    console.log('Clicking "Ok" button on Creative Suite modal...');
    await okBtn.first().click({ force: true });
    await page.waitForTimeout(2000);
  }

  // Double check if any modal overlay remains
  const anyModal = page.locator('.fixed.inset-0');
  if (await anyModal.count() && (await anyModal.first().isVisible().catch(() => false))) {
    console.log('Modal overlay still visible, clicking Ok/Continue if present...');
    const modalBtn = anyModal.locator('button:has-text("Ok"), button:has-text("Continue"), button:has-text("Agree")').last();
    if (await modalBtn.count()) {
      await modalBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  // Find composer
  console.log('Locating composer textarea...');
  const composer = page.locator('textarea[aria-label="Chat message"], textarea[placeholder*="create" i], textarea').first();
  await composer.waitFor({ state: 'visible', timeout: 20000 });
  console.log('Composer found and visible!');

  const fullPrompt = `Epic cinematic trailer soundtrack, heavy indian percussion, dhol drums, orchestral brass swells, deep sub-bass drops, emotional sad strings transitioning into aggressive action hybrid music, Sanskrit chants, high energy war theme.

Dialogue & Chants:
राम जी: "हनुमान, अगर सूर्य निकल गया तो लक्ष्मण मर जाएगा।"
हनुमान जी: "प्रभु, सूर्यदेव मेरा स्वभाव जानते हैं... जब तक जड़ी-बूटी लेकर नहीं आऊँगा, सूरज को उगने नहीं दूंगा।"
राम जी: "हनुमान, मौत आगे बढ़ रही है..."
हनुमान जी: "प्रभु, आप कहते हैं मौत लक्ष्मण को खा जाएगी? मैं आपकी कसम खा के कहता हूँ... आज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!"

राम रामं जपती... हनुमान अतुलितबलधामम्... हनुमान महाकाल शंभोरावतारः... बजरंगबली!`;

  console.log('Clicking composer and typing prompt...');
  await composer.click({ force: true });
  await composer.fill(fullPrompt);
  await page.waitForTimeout(1500);

  // Send message button
  const sendBtn = page.locator('button[aria-label="Send message"]');
  console.log('Send button count:', await sendBtn.count(), 'enabled:', await sendBtn.isEnabled().catch(() => false));
  
  if (await sendBtn.isEnabled().catch(() => false)) {
    console.log('Clicking "Send message" button...');
    await sendBtn.click({ force: true });
  } else {
    console.log('Pressing Enter to submit composer...');
    await composer.press('Enter');
  }

  console.log('Prompt submitted! Now monitoring song generation on Google Flow Music...');
  await page.waitForTimeout(5000);

  // Take screenshot right after submission
  await page.screenshot({ path: path.resolve('server/data/flow-music/submitted_screen.png') });

  // Poll for up to 3 minutes for generation completion
  let downloaded = false;
  for (let i = 1; i <= 36; i++) {
    await page.waitForTimeout(5000);
    const elapsed = i * 5;
    console.log(`[Progress ${i}/36] Elapsed: ${elapsed}s`);

    // 1. Check if audio file was saved from response event
    if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 50000) {
      console.log(`Audio already downloaded from network: ${fs.statSync(outputFile).size} bytes!`);
      downloaded = true;
      break;
    }

    // 2. Check for audio element in DOM with src
    const audioTags = page.locator('audio');
    const audioCount = await audioTags.count();
    if (audioCount > 0) {
      for (let j = 0; j < audioCount; j++) {
        const src = await audioTags.nth(j).getAttribute('src').catch(() => '');
        if (src && src.startsWith('http')) {
          console.log(`Found audio element with src: ${src}`);
          try {
            const audioData = await page.evaluate(async (url) => {
              const res = await fetch(url);
              const b = await res.arrayBuffer();
              return Array.from(new Uint8Array(b));
            }, src);
            if (audioData.length > 50000) {
              fs.writeFileSync(outputFile, Buffer.from(audioData));
              console.log(`Saved audio from <audio> src (${fs.statSync(outputFile).size} bytes)!`);
              downloaded = true;
              break;
            }
          } catch (e) {
            console.warn('Fetch audio err:', e.message);
          }
        }
      }
      if (downloaded) break;
    }

    // 3. Check for Download button
    const dlBtn = page.locator('button[aria-label*="download" i], a[download], button:has-text("Download")').first();
    if (await dlBtn.count() && (await dlBtn.isVisible().catch(() => false))) {
      console.log('Found Download button, clicking...');
      const dlPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
      await dlBtn.click({ force: true });
      const dl = await dlPromise;
      if (dl) {
        await dl.saveAs(outputFile);
        console.log(`Download event captured! Saved ${fs.statSync(outputFile).size} bytes to ${outputFile}`);
        downloaded = true;
        break;
      }
    }

    // Print text snippet to monitor chat/generation messages
    const stateSnippet = await page.evaluate(() => {
      const messages = Array.from(document.querySelectorAll('[data-message], .chat-message, p, h1, h2, h3')).map(el => el.textContent?.trim()).filter(Boolean);
      return messages.slice(-5).join(' | ');
    }).catch(() => '');
    if (stateSnippet) {
      console.log(`Recent page text: ${stateSnippet.slice(0, 200)}`);
    }
  }

  // Save final screenshot
  const finalScreenshot = path.resolve('server/data/flow-music/final_studio_generated.png');
  await page.screenshot({ path: finalScreenshot });
  console.log('Final screenshot saved to:', finalScreenshot);

  if (fs.existsSync(outputFile)) {
    console.log(`\nSUCCESS! Song file verified on disk: ${outputFile} (${fs.statSync(outputFile).size} bytes)`);
  } else {
    console.warn(`\nSong file was not captured directly. Checking if files were downloaded elsewhere...`);
  }

  await context.close();
}

main().catch(console.error);
