import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  page.on('console', msg => console.log('[BROWSER LOG]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[BROWSER ERROR]', err.message));
  page.on('request', req => {
    if (req.url().includes('/api/flow/')) {
      console.log('[FLOW API REQ]', req.method(), req.url());
    }
  });
  page.on('response', async res => {
    if (res.url().includes('/api/flow/')) {
      let preview = '';
      try {
        const text = await res.text();
        preview = text.slice(0, 160);
      } catch {}
      console.log('[FLOW API RES]', res.status(), res.url(), preview);
    }
  });

  console.log('1. Loading TubeFlow UI at http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('2. Selecting "Shorts · Images & Videos" script...');
  const scriptCard = page.locator('text=Shorts · Images & Videos').first();
  await scriptCard.click();
  await page.waitForTimeout(1000);

  console.log('3. Navigating to Generation tab...');
  const genTab = page.locator('button:has-text("Generation"), a:has-text("Generation")').first();
  await genTab.click();
  await page.waitForTimeout(2500);

  // Take screenshot of the Generation tab showing the prominent "Generate with Flow" buttons
  await page.screenshot({ path: 'server/shots/tubeflow_generation_tab_ready.png' });
  console.log('Screenshot saved: server/shots/tubeflow_generation_tab_ready.png');

  // Find the first "Generate with Flow" button
  const flowBtns = await page.locator('button:has-text("Generate with Flow")').all();
  console.log(`Found ${flowBtns.length} "Generate with Flow" buttons on the page!`);

  if (flowBtns.length === 0) {
    throw new Error('No "Generate with Flow" button found on page!');
  }

  console.log('4. Clicking the first "Generate with Flow" button...');
  await flowBtns[0].click();
  console.log('Clicked "Generate with Flow" button!');

  // Monitor for up to 300 seconds (or until done)
  let completed = false;
  const startTime = Date.now();
  while (Date.now() - startTime < 300_000) {
    await page.waitForTimeout(4000);
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    const alertTexts = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
    const statusTexts = await page.locator('[role="status"]').allInnerTexts().catch(() => []);
    const buttonTexts = await page.locator('button:has-text("Generate with Flow"), button:has-text("Cancel"), span:has-text("%")').allInnerTexts().catch(() => []);

    console.log(`[${elapsedSec}s] Status: ${JSON.stringify(statusTexts)} | Alert: ${JSON.stringify(alertTexts)} | Action: ${JSON.stringify(buttonTexts)}`);

    // Check if imported video is now present in scene 2 (the first video scene)
    const videos = await page.locator('article video').all();
    if (videos.length > 0) {
      console.log(`SUCCESS! Found ${videos.length} imported video element(s) in scene cards!`);
      for (const v of videos) {
        console.log('   Video src:', await v.getAttribute('src'));
      }
      completed = true;
      break;
    }

    if (alertTexts.some(a => a.toLowerCase().includes('failed') || a.toLowerCase().includes('error'))) {
      console.error('Failure alert detected:', alertTexts);
      break;
    }
  }

  await page.screenshot({ path: 'server/shots/tubeflow_flow_video_imported_result.png' });
  console.log('Screenshot saved: server/shots/tubeflow_flow_video_imported_result.png');

  await browser.close();

  if (!completed) {
    console.log('Note: Generation was initiated, checking screenshots.');
  }
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
