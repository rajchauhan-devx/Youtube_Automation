import { chromium } from '../server/node_modules/playwright/index.mjs';
import fs from 'node:fs';

async function main() {
  console.log('🚀 [Playwright] Starting Real-User Auto-Pilot Video Generation Test...');
  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });

  // Seed localStorage before page loads
  await context.addInitScript(() => {
    localStorage.setItem('tubeflow:v1', JSON.stringify({
      channelId: 'default',
      section: 'shorts',
      tab: 'generation',
      selectedScriptId: 'shorts_images_videos'
    }));
    localStorage.setItem('tubeflow:v1:account:default', JSON.stringify({
      section: 'shorts',
      tab: 'generation',
      selectedScriptId: 'shorts_images_videos'
    }));
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (/\[FLOW\]|Flow|Veo|generate_images|render_video|Scene|media-import|AutoPilot/i.test(text)) {
      console.log('  🖥️  [Browser Console]:', text);
    }
  });

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/flow/jobs') || url.includes('/api/media-import') || url.includes('/api/generate/image')) {
      console.log(`  🌐 [Network Request]: ${req.method()} ${url}`);
      if (req.method() === 'POST' && url.includes('/api/flow/jobs')) {
        console.log(`     Payload:`, req.postData());
      }
    }
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/flow/jobs') && !url.includes('/api/flow/jobs/')) {
      try {
        const data = await res.json();
        console.log(`  📦 [Flow Job Response]: state=${data.state}, id=${data.id}, dryRun=${data.dryRun}`);
      } catch {}
    }
    if (url.includes('/api/media-import')) {
      console.log(`  📥 [Media Import Response]: status=${res.status()}`);
    }
  });

  console.log('🌐 [Playwright] Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Take initial screenshot
  await page.screenshot({ path: 'scratch/step1_initial.png' });
  console.log('📸 Screenshot saved: scratch/step1_initial.png');

  // Look for the floating "Resume Auto-Pilot" button
  const floatingResumeBtn = page.locator('button:has-text("Resume Auto-Pilot")').first();
  const resumeModalBtn = page.locator('button:has-text("Resume")').first();
  const runAutoPilotBtn = page.locator('button:has-text("Run Auto-Pilot")').first();

  if (await floatingResumeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('▶️ [Playwright] Floating "Resume Auto-Pilot" button found. Clicking it...');
    await floatingResumeBtn.click();
  } else if (await resumeModalBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('▶️ [Playwright] Modal is open. Clicking "Resume" inside modal...');
    await resumeModalBtn.click();
  } else if (await runAutoPilotBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('▶️ [Playwright] Clicking "Run Auto-Pilot" on Generation tab...');
    await runAutoPilotBtn.click();
    await page.waitForTimeout(1000);
    const confirmBtn = page.locator('.fixed button:has-text("Run Auto-Pilot")').first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      console.log('▶️ [Playwright] Confirming in Run Auto-Pilot modal...');
      await confirmBtn.click();
    }
  } else {
    console.log('⚠️ [Playwright] Could not find Resume or Run buttons. Inspecting page...');
    const buttons = await page.locator('button').allInnerTexts().catch(() => []);
    console.log('  Available buttons:', buttons.slice(0, 20));
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scratch/step2_resumed.png' });
  console.log('📸 Screenshot saved: scratch/step2_resumed.png');

  // Monitor flow generation activity
  console.log('⏳ [Playwright] Monitoring video generation (up to 180s)...');
  const startTime = Date.now();
  let videoDone = false;

  while (Date.now() - startTime < 180000) {
    await page.waitForTimeout(4000);

    // Read modal status text or stage
    const statusTexts = await page.locator('.fixed [class*="font-semibold"], .fixed [class*="text-zinc"], .fixed [class*="text-muted"], .fixed [class*="text-emerald"]').allInnerTexts().catch(() => []);
    const relevant = statusTexts.filter(t => /Google Flow|Rendering Scene|Generating Scene|imported|Visual Generation|Auto-Pilot|Veo/i.test(t));
    if (relevant.length > 0) {
      console.log('  📊 [Status]:', relevant.slice(0, 3).join(' | '));
    }

    // Check backend scripts.json
    try {
      const scriptsJson = JSON.parse(fs.readFileSync('server/data/scripts.json', 'utf8'));
      const script = scriptsJson.find(s => s.id === 'shorts_images_videos');
      const videoAsset = script?.generatedImages?.find(img => img.mediaType === 'video' && img.url);
      if (videoAsset) {
        console.log(`\n🎉🎉🎉 [SUCCESS] Video clip imported into script!`);
        console.log(`  Scene Index: ${videoAsset.index}`);
        console.log(`  MediaType: ${videoAsset.mediaType}`);
        console.log(`  URL: ${videoAsset.url}`);
        console.log(`  Duration: ${videoAsset.duration || 'N/A'}`);
        videoDone = true;
        break;
      }
    } catch {}

    const errorText = await page.locator('.text-red-400, .text-rose-400').first().innerText().catch(() => null);
    if (errorText) {
      console.log('  ⚠️ Error in UI:', errorText);
    }
  }

  await page.screenshot({ path: 'scratch/step3_final.png' });
  console.log('📸 Final screenshot saved: scratch/step3_final.png');

  await browser.close();

  if (videoDone) {
    console.log('✅ [Playwright Test PASSED] Video generation and import verified end-to-end!');
    process.exit(0);
  } else {
    console.log('❌ [Playwright Test Incomplete] Video was not imported within the time limit.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ [Playwright Test Error]:', err);
  process.exit(1);
});
