import { chromium } from '../server/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const TARGET_SCRIPT_ID = 'usr_4d2be8eb-9be4-4e7a-a422-72f795c0315b';
const SHOTS_DIR = path.resolve('server/shots');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function main() {
  console.log('🚀 [Playwright] Launching Chromium browser to monitor Auto-Pilot...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[SUPERVISOR]') || text.includes('Auto-Pilot') || text.includes('Pipeline') || text.includes('error')) {
      console.log(`  [BROWSER CONSOLE] ${msg.type()}: ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`  [PAGE ERROR] ${err.message}`);
  });

  console.log('🌐 [Playwright] Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Take initial snapshot
  await page.screenshot({ path: path.join(SHOTS_DIR, '01_initial_load.png') });
  console.log('📸 [Playwright] Initial screenshot captured: server/shots/01_initial_load.png');

  // Check state on window
  const state = await page.evaluate(() => {
    return {
      autoPilot: window.__autoPilotState || null,
      scripts: (window.__getScopeScripts ? window.__getScopeScripts() : []).map(s => ({ id: s.id, name: s.topicName || s.name, section: s.section })),
    };
  });

  console.log('📊 [Playwright] Current autoPilotState:', JSON.stringify(state.autoPilot?.stage, null, 2));
  console.log('📋 [Playwright] Available scripts in scope:', state.scripts.length);

  // If in another section, switch to Mixed Media tab
  const mixedTab = page.locator('button:has-text("Mixed Media"), a:has-text("Mixed Media"), div:has-text("Mixed Media")').first();
  if (await mixedTab.isVisible().catch(() => false)) {
    console.log('🖱️ [Playwright] Selecting "Mixed Media" section...');
    await mixedTab.click();
    await page.waitForTimeout(2000);
  }

  // Check if Resume button exists in the AutoPilotModal
  const resumeBtn = page.locator('button:has-text("Resume")').first();
  const hasResume = await resumeBtn.isVisible().catch(() => false);

  if (hasResume) {
    console.log('▶️ [Playwright] Found Resume button! Clicking Resume to restart/continue pipeline...');
    await resumeBtn.click();
  } else {
    console.log('▶️ [Playwright] Triggering __resumeAutoPilot via window API...');
    const result = await page.evaluate((scriptId) => {
      if (typeof window.__resumeAutoPilot === 'function') {
        window.__resumeAutoPilot(scriptId);
        return 'resumed';
      }
      if (typeof window.__runAutoPilot === 'function') {
        window.__runAutoPilot(scriptId);
        return 'run';
      }
      return 'unavailable';
    }, TARGET_SCRIPT_ID);
    console.log('   Trigger result:', result);
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SHOTS_DIR, '02_after_resume.png') });

  // Monitoring loop until completion
  console.log('⏱️ [Playwright] Beginning live Auto-Pilot pipeline monitoring loop...');
  let lastStage = '';
  let lastMessage = '';
  let lastProgress = -1;
  let errorCount = 0;
  const startTime = Date.now();
  const MAX_MONITOR_MS = 30 * 60 * 1000; // 30 minutes max

  while (Date.now() - startTime < MAX_MONITOR_MS) {
    await page.waitForTimeout(3000);

    const liveState = await page.evaluate(() => {
      const s = window.__autoPilotState;
      if (!s) return null;
      return {
        isActive: s.isActive,
        isPaused: s.isPaused,
        stage: s.stage,
        stageIndex: s.stageIndex,
        statusMessage: s.statusMessage,
        progressPercent: s.progressPercent,
        sceneCurrent: s.sceneCurrent,
        sceneTotal: s.sceneTotal,
        error: s.error,
        renderedVideoUrl: s.renderedVideoUrl,
        logs: (s.logs || []).slice(-5).map(l => `[${l.stage}] ${l.type}: ${l.message}`),
      };
    });

    if (!liveState) {
      console.log('⚠️ [Playwright] autoPilotState not yet initialized on window...');
      continue;
    }

    if (liveState.stage !== lastStage || liveState.statusMessage !== lastMessage || liveState.progressPercent !== lastProgress) {
      lastStage = liveState.stage;
      lastMessage = liveState.statusMessage;
      lastProgress = liveState.progressPercent;

      const progress = liveState.progressPercent != null ? `${liveState.progressPercent}%` : '';
      const sceneInfo = liveState.sceneTotal ? ` (Scene ${liveState.sceneCurrent}/${liveState.sceneTotal})` : '';
      console.log(`\n📍 [STAGE ${liveState.stageIndex ?? '?'}: ${liveState.stage?.toUpperCase()}] ${progress}${sceneInfo}`);
      console.log(`   Message: ${liveState.statusMessage}`);
      if (liveState.logs?.length) {
        console.log(`   Latest Log: ${liveState.logs[liveState.logs.length - 1]}`);
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, 'autopilot_live.png') });
    }

    // Check for completion
    if (liveState.stage === 'completed' || (liveState.renderedVideoUrl && liveState.stageIndex >= 8)) {
      console.log('\n🎉🎉🎉 [Playwright] VIDEO PRODUCTION FULLY COMPLETED! 🎉🎉🎉');
      console.log(`Rendered Video URL: ${liveState.renderedVideoUrl}`);
      await page.screenshot({ path: path.join(SHOTS_DIR, '03_production_complete.png') });
      await browser.close();
      return;
    }

    // Check for error state
    if (liveState.stage === 'error') {
      errorCount++;
      console.log(`\n❌ [Playwright] Pipeline halted at stage "${liveState.stageIndex}": ${liveState.error || liveState.statusMessage}`);
      await page.screenshot({ path: path.join(SHOTS_DIR, `error_halt_${errorCount}.png`) });

      // Wait a moment for supervisor healing or click Resume
      console.log('🛠️ [Playwright] Checking for supervisor healing or Resume button...');
      await page.waitForTimeout(5000);

      const resumeBtnInError = page.locator('button:has-text("Resume")').first();
      if (await resumeBtnInError.isVisible().catch(() => false)) {
        console.log('🔄 [Playwright] Clicking Resume to retry stage...');
        await resumeBtnInError.click();
        await page.waitForTimeout(2000);
      } else {
        console.log('🔄 [Playwright] Re-triggering __resumeAutoPilot...');
        await page.evaluate((scriptId) => {
          if (window.__resumeAutoPilot) window.__resumeAutoPilot(scriptId);
        }, TARGET_SCRIPT_ID);
      }

      if (errorCount > 10) {
        console.error('⛔ [Playwright] Persistent error threshold exceeded. Stopping monitor.');
        await browser.close();
        process.exit(1);
      }
    }
  }

  console.log('⏱️ [Playwright] Monitoring timeout reached.');
  await browser.close();
}

main().catch(err => {
  console.error('💥 [Playwright] Runner Fatal Error:', err);
  process.exit(1);
});
