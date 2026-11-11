import { chromium } from '../server/node_modules/playwright/index.mjs';

async function testResumeAutoPilot() {
  console.log('🚀 [Playwright] Testing Auto-Pilot Resume behavior...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (/AutoPilot|generate_images|render_video|Flow|Veo|Scene|re-running/i.test(text)) {
      console.log('  [Console]:', text);
    }
  });

  console.log('🌐 Loading http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Click floating Resume Auto-Pilot button
  const resumeBtn = page.locator('button:has-text("Resume Auto-Pilot")').first();
  if (await resumeBtn.isVisible().catch(() => false)) {
    console.log('▶️ Clicking floating "Resume Auto-Pilot" button...');
    await resumeBtn.click({ force: true });
    await page.waitForTimeout(2000);
  }

  // Check the AutoPilot modal
  const modalTitle = await page.locator('.fixed h2, .fixed [class*="font-bold"]').first().innerText().catch(() => '');
  console.log('  Modal Title:', modalTitle);

  // Wait 3 seconds to let stage initialization occur
  await page.waitForTimeout(3000);

  // Read the status message and logs
  const statusMsg = await page.locator('.fixed [class*="text-muted"], .fixed [class*="text-zinc"]').allInnerTexts().catch(() => []);
  console.log('  Modal text preview:', statusMsg.slice(0, 5));

  await page.screenshot({ path: 'scratch/autopilot_resumed_stage.png' });
  console.log('📸 Screenshot saved to scratch/autopilot_resumed_stage.png');

  await browser.close();
  console.log('✅ [Playwright] Resume check completed!');
}

testResumeAutoPilot().catch(err => {
  console.error('❌ [Playwright Error]:', err);
  process.exit(1);
});
