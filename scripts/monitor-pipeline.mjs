import { chromium } from '../server/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const TARGET_SCRIPT_ID = 'usr_4d2be8eb-9be4-4e7a-a422-72f795c0315b';
const SHOTS_DIR = path.resolve('server/shots');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function main() {
  console.log('🚀 [Playwright Monitor] Starting Auto-Pilot pipeline runner & monitor...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[SUPERVISOR]') || text.includes('Auto-Pilot') || text.includes('Pipeline') || text.includes('[FLOW') || text.includes('[TTS') || text.includes('[RENDER') || text.includes('error')) {
      console.log(`  [BROWSER] ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`  [PAGE ERROR] ${err.message}`);
  });

  console.log('🌐 [Playwright Monitor] Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Switch to Mixed Media if needed
  const mixedBtn = page.locator('button:has-text("Mixed Media"), a:has-text("Mixed Media")').first();
  if (await mixedBtn.isVisible().catch(() => false)) {
    console.log('🖱️ [Playwright Monitor] Ensuring "Mixed Media" section is active...');
    await mixedBtn.click();
    await page.waitForTimeout(1500);
  }

  // Trigger Resume
  console.log(`▶️ [Playwright Monitor] Resuming script ${TARGET_SCRIPT_ID}...`);
  const resumeResult = await page.evaluate((scriptId) => {
    try {
      if (typeof window.__resumeAutoPilot === 'function') {
        const res = window.__resumeAutoPilot(scriptId);
        return { ok: true, type: typeof res };
      }
      return { ok: false, reason: '__resumeAutoPilot not defined' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, TARGET_SCRIPT_ID);

  console.log('   Resume call result:', JSON.stringify(resumeResult));
  await page.waitForTimeout(3000);

  let lastStage = '';
  let lastMessage = '';
  let lastPercent = -1;
  let lastScene = -1;
  let consecutiveErrors = 0;
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 60 * 60 * 1000; // 60 minutes max

  console.log('🔄 [Playwright Monitor] Monitoring pipeline execution until final video completion...');

  while (Date.now() - startTime < MAX_RUNTIME_MS) {
    await page.waitForTimeout(4000);

    const state = await page.evaluate(() => {
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
        youtubeVideoUrl: s.youtubeVideoUrl,
        latestLog: (s.logs && s.logs.length) ? s.logs[s.logs.length - 1] : null,
      };
    });

    if (!state) continue;

    // Check progress change
    if (
      state.stage !== lastStage ||
      state.statusMessage !== lastMessage ||
      state.progressPercent !== lastPercent ||
      state.sceneCurrent !== lastScene
    ) {
      lastStage = state.stage;
      lastMessage = state.statusMessage;
      lastPercent = state.progressPercent;
      lastScene = state.sceneCurrent;

      const pct = state.progressPercent != null ? `${Math.round(state.progressPercent)}%` : '';
      const scene = state.sceneTotal ? ` [Scene ${state.sceneCurrent}/${state.sceneTotal}]` : '';
      console.log(`[${new Date().toLocaleTimeString()}] Stage ${state.stageIndex ?? '?'}: ${state.stage?.toUpperCase()} (${pct})${scene} — ${state.statusMessage}`);
      if (state.latestLog && state.latestLog.message !== state.statusMessage) {
        console.log(`   Log: [${state.latestLog.stage}] ${state.latestLog.message}`);
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, 'live_video_progress.png') }).catch(() => {});
    }

    // Check for pipeline completion!
    if (state.stage === 'completed' || (state.renderedVideoUrl && state.stageIndex >= 8)) {
      console.log('\n============================================================');
      console.log('🎉🎉🎉 FINAL VIDEO PRODUCTION COMPLETED SUCCESSFULLY! 🎉🎉🎉');
      console.log(`Video URL: ${state.renderedVideoUrl}`);
      if (state.youtubeVideoUrl) console.log(`YouTube URL: ${state.youtubeVideoUrl}`);
      console.log('============================================================\n');

      await page.screenshot({ path: path.join(SHOTS_DIR, 'final_video_complete.png') });
      await browser.close();
      return;
    }

    // Check for error halt
    if (state.stage === 'error') {
      consecutiveErrors++;
      console.log(`\n⚠️ [PIPELINE HALTED] Error at Stage ${state.stageIndex}: ${state.error || state.statusMessage}`);
      await page.screenshot({ path: path.join(SHOTS_DIR, `halt_error_${consecutiveErrors}.png`) });

      console.log('🛠️ [AUTONOMOUS HEALING] Pausing 5s then clicking Resume...');
      await page.waitForTimeout(5000);

      const resumeBtn = page.locator('button:has-text("Resume")').first();
      if (await resumeBtn.isVisible().catch(() => false)) {
        await resumeBtn.click();
        console.log('   Clicked UI Resume button.');
      } else {
        await page.evaluate((id) => {
          if (typeof window.__resumeAutoPilot === 'function') window.__resumeAutoPilot(id);
        }, TARGET_SCRIPT_ID);
        console.log('   Invoked __resumeAutoPilot.');
      }

      if (consecutiveErrors >= 15) {
        console.error('❌ Persistent unresolvable errors encountered. Halting monitor.');
        await browser.close();
        process.exit(1);
      }
    } else {
      consecutiveErrors = 0;
    }
  }

  console.log('⏰ Monitor reached maximum runtime.');
  await browser.close();
}

main().catch(err => {
  console.error('Fatal monitor error:', err);
  process.exit(1);
});
