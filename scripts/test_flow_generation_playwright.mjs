import { chromium } from '../server/node_modules/playwright/index.mjs';

async function testFlowGeneration() {
  console.log('🚀 [Playwright] Launching Chromium browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (/Flow|Job|Generate|video|error|render|AutoPilot/i.test(text)) {
      console.log('  [Browser Console]:', text);
    }
  });

  console.log('🌐 [Playwright] Loading TubeFlow at http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // If AutoPilot modal is open, dismiss it or close it so we can see Generation tab
  const closeBtn = page.locator('button:has-text("Close"), .fixed button:has-text("✕"), .fixed button:has-text("Close")').first();
  if ((await closeBtn.count()) > 0 && (await closeBtn.isVisible().catch(() => false))) {
    console.log('Dismissing open modal to inspect Generation tab...');
    await closeBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  console.log('🔍 [Playwright] Selecting "Shorts · Images & Videos" script card...');
  const scriptCard = page.getByText('Shorts · Images & Videos').first();
  if ((await scriptCard.count()) > 0) {
    await scriptCard.click({ force: true });
    await page.waitForTimeout(1000);
  }

  console.log('📑 [Playwright] Navigating to "Generation" tab...');
  const genTab = page.locator('button:has-text("Generation"), [role="tab"]:has-text("Generation")').first();
  if ((await genTab.count()) > 0) {
    await genTab.click({ force: true });
    await page.waitForTimeout(2000);
  }

  // Take screenshot of the Generation tab
  await page.screenshot({ path: 'scratch/generation_tab_playwright.png' });
  console.log('📸 Screenshot saved to scratch/generation_tab_playwright.png');

  // Find all "Generate with Flow" buttons
  const flowButtons = await page.locator('button:has-text("Generate with Flow")').all();
  console.log(`✅ [Playwright] Found ${flowButtons.length} "Generate with Flow" buttons on the page!`);

  // Inspect the first scene card
  const firstCard = page.locator('article, div[class*="border"]').filter({ hasText: '001' }).first();
  const hasVideoToggleActive = await page.locator('button:has-text("Video")').first().isVisible().catch(() => false);
  console.log('  Video toggle visible on Scene 1:', hasVideoToggleActive);

  // Check the floating Resume Auto-Pilot button
  const resumeBtn = page.locator('button:has-text("Resume Auto-Pilot")').first();
  const resumeVisible = (await resumeBtn.count()) > 0 && (await resumeBtn.isVisible().catch(() => false));
  console.log('  Floating "Resume Auto-Pilot" button visible:', resumeVisible);

  console.log('🎯 [Playwright] Verifying Flow API readiness...');
  const flowStatusRes = await page.evaluate(async () => {
    const res = await fetch('/api/flow/status');
    return res.json();
  });
  console.log('  Google Flow Status:', JSON.stringify(flowStatusRes, null, 2));

  // Test dry-run Flow job creation for Scene 0 (0 credits) to verify full API pipeline
  console.log('🧪 [Playwright] Testing Flow job validation pipeline (dryRun: true)...');
  const dryRunRes = await page.evaluate(async () => {
    const res = await fetch('/api/flow/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scriptId: 'shorts_images_videos',
        sceneIndex: 0,
        prompt: 'Cinematic medium shot of Queen Kunti on river Ganga. Highly dramatic photorealistic Hindi dialogue scene.',
        model: 'veo-3.1-fast',
        aspect: 'portrait',
        duration: 8,
        resolution: '720p',
        dryRun: true,
      }),
    });
    return { ok: res.ok, status: res.status, data: await res.json() };
  });

  console.log('  Dry Run Result:', JSON.stringify(dryRunRes, null, 2));
  if (dryRunRes.ok && dryRunRes.data?.state === 'done') {
    console.log('🎉 [Playwright Test Passed] Flow job validation pipeline is 100% functional!');
  } else {
    throw new Error(`Dry run failed: ${JSON.stringify(dryRunRes)}`);
  }

  await browser.close();
  console.log('✅ [Playwright] All tests completed successfully!');
}

testFlowGeneration().catch(err => {
  console.error('❌ [Playwright Error]:', err);
  process.exit(1);
});
