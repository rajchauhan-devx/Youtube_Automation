import { chromium } from '../server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ACCOUNT_ID = 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab';
const SCRIPT_ID = 'usr_d01557ac-2510-4b84-9bd3-eff090cb82dc'; // Short - Mixed
const SHOTS_DIR = path.resolve('server/shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function run() {
  console.log('================================================================');
  console.log('   TUBEFLOW AUTONOMOUS PIPELINE SUPERVISOR');
  console.log('   Channel: Against the Odds');
  console.log('   Profile: Shorts (9:16 Vertical)');
  console.log('   Script:  Short - Mixed (usr_d01557ac-2510-4b84-9bd3-eff090cb82dc)');
  console.log('================================================================\n');

  console.log('[STEP 1] Launching Chromium browser (headless)...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' || text.includes('error') || text.includes('Error')) {
      console.log(`[BROWSER CONSOLE ${msg.type()}]`, text);
    }
  });

  page.on('pageerror', err => {
    console.error('[BROWSER UNCAUGHT EXCEPTION]', err.message);
  });

  console.log('[STEP 2] Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  console.log('[STEP 3] Configuring active profile & script in localStorage...');
  await page.evaluate(({ accountId, scriptId }) => {
    const state = { channelId: accountId, section: 'shorts', tab: 'preview', selectedScriptId: scriptId };
    localStorage.setItem('tubeflow:v1', JSON.stringify(state));
    localStorage.setItem(`tubeflow:v1:${accountId}`, JSON.stringify(state));
  }, { accountId: ACCOUNT_ID, scriptId: SCRIPT_ID });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  console.log('[STEP 4] Checking for Resume Auto-Pilot or Run Auto-Pilot buttons...');
  const resumeBtn = page.locator('button:has-text("Resume Auto-Pilot")').first();
  const apBtn = page.locator('button:has-text("Run Auto-Pilot")').first();

  const hasResume = await resumeBtn.isVisible().catch(() => false);
  if (hasResume) {
    console.log('[STEP 4] Resuming Auto-Pilot from saved production stage...');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'autopilot_resume_ready.png') });
    await resumeBtn.click();
  } else {
    console.log('[STEP 4] Opening "Run Auto-Pilot" modal...');
    await apBtn.waitFor({ state: 'visible', timeout: 10000 });
    await apBtn.click();
    await page.waitForTimeout(2000);

    const modalSubmit = page.locator('.fixed form button[type="submit"]');
    await modalSubmit.waitFor({ state: 'visible', timeout: 10000 });
    const isEnabled = await modalSubmit.isEnabled();
    console.log(`[STEP 5] Modal submit button ready (isEnabled=${isEnabled})`);
    if (!isEnabled) {
      throw new Error('Submit button is disabled. Check voice or configuration.');
    }
    await page.screenshot({ path: path.join(SHOTS_DIR, 'autopilot_1_modal_ready.png') });
    await modalSubmit.click();
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'autopilot_2_pipeline_active.png') });
  console.log('  -> Pipeline active! Screenshot: server/shots/autopilot_2_pipeline_active.png');

  console.log('\n================================================================');
  console.log('   PIPELINE ACTIVE — MONITORING REAL-TIME EXECUTION');
  console.log('================================================================\n');

  let seenLogs = new Set();
  let lastStage = '';
  let lastProgress = -1;
  const startTime = Date.now();
  let completed = false;
  let finalResult = null;

  while (Date.now() - startTime < 30 * 60 * 1000) { // Up to 30 minutes
    await page.waitForTimeout(3000);
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    const elapsedMins = (elapsedSec / 60).toFixed(1);

    // Read Auto-Pilot state from localStorage
    const apData = await page.evaluate(({ accountId }) => {
      try {
        const key = `tubeflow:autopilot:${accountId}:shorts`;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }, { accountId: ACCOUNT_ID });

    if (apData) {
      // Print stage or progress change
      if (apData.stage !== lastStage || Math.abs((apData.progressPercent || 0) - lastProgress) >= 4) {
        console.log(`\n>>> [${elapsedMins}m | STAGE: ${apData.stage.toUpperCase()} | ${apData.progressPercent || 0}%]`);
        console.log(`    Status: "${apData.statusMessage || ''}"`);
        if (apData.topic) console.log(`    Topic:  "${apData.topic}"`);
        lastStage = apData.stage;
        lastProgress = apData.progressPercent || 0;

        try {
          await page.screenshot({ path: path.join(SHOTS_DIR, `autopilot_stage_${apData.stage}.png`) });
        } catch {}
      }

      // Print any new logs
      if (Array.isArray(apData.logs)) {
        for (const log of apData.logs) {
          const key = `${log.timestamp}_${log.message}`;
          if (!seenLogs.has(key)) {
            seenLogs.add(key);
            const badge = `[${log.type?.toUpperCase() || 'INFO'}]`.padEnd(9);
            console.log(`  [${log.timestamp}] ${badge} ${log.message}`);
          }
        }
      }

      if (apData.stage === 'completed') {
        console.log('\n🎉🎉🎉 [PIPELINE COMPLETED SUCCESSFULLY!] 🎉🎉🎉');
        console.log(`Rendered Video URL: ${apData.renderedVideoUrl}`);
        if (apData.youtubeVideoUrl) console.log(`YouTube Video URL:  ${apData.youtubeVideoUrl}`);
        completed = true;
        finalResult = apData;
        break;
      }

      if (apData.stage === 'error') {
        console.error('\n❌ [PIPELINE ENCOUNTERED AN ERROR]');
        console.error(`Error message: ${apData.error || apData.statusMessage}`);
        await page.screenshot({ path: path.join(SHOTS_DIR, 'autopilot_error.png') });
        finalResult = apData;
        break;
      }
    } else {
      const hudLines = await page.locator('.fixed h2, .fixed p, [role="status"]').allInnerTexts().catch(() => []);
      if (hudLines.length > 0) {
        console.log(`[${elapsedMins}m] HUD: ${hudLines.filter(Boolean).slice(0, 3).join(' | ')}`);
      }
    }
  }

  await page.screenshot({ path: path.join(SHOTS_DIR, 'autopilot_final.png') });
  await browser.close();

  if (!completed) {
    throw new Error(`Auto-Pilot did not complete. Last status: ${JSON.stringify(finalResult)}`);
  }

  return finalResult;
}

run().then(res => {
  console.log('\n=== Supervised Run Finished Successfully! ===');
  process.exit(0);
}).catch(err => {
  console.error('\n[FATAL ERROR IN RUNNER]:', err);
  process.exit(1);
});
