import { chromium } from '../server/node_modules/playwright/index.mjs';

async function test() {
  console.log('Testing resume and stage progression...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => {
    localStorage.setItem('tubeflow:v1', JSON.stringify({
      channelId: 'default',
      section: 'shorts',
      tab: 'generation',
      selectedScriptId: 'shorts_images_videos',
    }));
    localStorage.setItem('tubeflow:v1:account:default', JSON.stringify({
      section: 'shorts',
      tab: 'generation',
      selectedScriptId: 'shorts_images_videos',
    }));
  });

  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (/render|video|stage|plan_motion|review|upload|fail|error/i.test(text)) {
      console.log('  [Console]:', text);
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Resume
  const started = await page.evaluate(() => {
    if (typeof window.__resumeAutoPilot === 'function') {
      window.__resumeAutoPilot();
      return true;
    }
    return false;
  });
  console.log('Resume started via window.__resumeAutoPilot:', started);

  // Monitor for 45s
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(5000);
    const statusTexts = await page.locator('.fixed [class*="font-semibold"], .fixed [class*="text-zinc"], .fixed [class*="text-muted"], .fixed [class*="text-emerald"]').allInnerTexts().catch(() => []);
    console.log(`[Status ${i*5}s]:`, statusTexts.slice(0, 3).join(' | '));
  }

  await page.screenshot({ path: 'scratch/stage_progression_test.png' });
  await browser.close();
}

test().catch(console.error);
