import { chromium } from '../server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS_DIR = path.resolve('server/shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const profile = {
  name: 'Against the Odds',
  accountId: 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab',
  scriptId: 'usr_deed717b-3542-4466-834d-0ff8c890ece2',
  slug: 'against_the_odds',
};

async function main() {
  console.log('================================================================');
  console.log(`   RESUMING GENERATION FOR: ${profile.name.toUpperCase()}`);
  console.log(`   Account: ${profile.accountId}`);
  console.log(`   Script:  ${profile.scriptId}`);
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' || text.includes('error') || text.includes('Error')) {
      console.log(`[BROWSER CONSOLE]`, text);
    }
  });

  page.on('pageerror', err => {
    console.error(`[PAGE ERROR]`, err.message);
  });

  console.log(`[1] Navigating to http://localhost:5173...`);
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  console.log(`[2] Configuring state in localStorage (enforcing skip_youtube_upload=true)...`);
  await page.evaluate(({ accountId, scriptId }) => {
    const state = {
      channelId: accountId,
      section: 'shorts',
      tab: 'preview',
      selectedScriptId: scriptId,
    };
    localStorage.setItem('tubeflow:v1', JSON.stringify(state));
    localStorage.setItem(`tubeflow:v1:${accountId}`, JSON.stringify(state));
    localStorage.setItem('tubeflow:skip_youtube_upload', 'true');
    // Clear completed key so it runs through to completion
    localStorage.removeItem(`tubeflow:autopilot_completed:${accountId}:shorts`);
  }, { accountId: profile.accountId, scriptId: profile.scriptId });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  console.log(`[3] Checking for Resume or Run Auto-Pilot buttons...`);
  const resumeBtn = page.locator('button:has-text("Resume Auto-Pilot")').first();
  const apBtn = page.locator('button:has-text("Run Auto-Pilot")').first();

  let hasResume = false;
  try {
    await resumeBtn.waitFor({ state: 'visible', timeout: 5000 });
    hasResume = true;
  } catch {
    hasResume = false;
  }

  if (hasResume) {
    console.log(`  -> Found Resume Auto-Pilot button, clicking resume...`);
    await resumeBtn.click();
  } else {
    console.log(`  -> Resume button not found, clicking Run Auto-Pilot...`);
    await apBtn.waitFor({ state: 'visible', timeout: 15000 });
    await apBtn.click();
    await page.waitForTimeout(2000);

    const modalSubmit = page.locator('.fixed form button[type="submit"]');
    await modalSubmit.waitFor({ state: 'visible', timeout: 15000 });

    let attempts = 0;
    while (!(await modalSubmit.isEnabled()) && attempts < 30) {
      await page.waitForTimeout(1000);
      attempts++;
    }

    if (!(await modalSubmit.isEnabled())) {
      throw new Error(`Submit button in modal remained disabled for ${profile.name}`);
    }

    console.log(`  -> Starting Auto-Pilot from modal...`);
    await modalSubmit.click();
  }

  await page.waitForTimeout(3000);
  console.log(`  -> Auto-Pilot running! Monitoring progress...\n`);

  let seenLogs = new Set();
  let lastStage = '';
  let lastProgress = -1;
  const startTime = Date.now();
  let completed = false;
  let finalResult = null;

  while (Date.now() - startTime < 25 * 60 * 1000) {
    await page.waitForTimeout(3000);
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    const elapsedMins = (elapsedSec / 60).toFixed(1);

    const completedData = await page.evaluate(({ accountId }) => {
      try {
        const raw = localStorage.getItem(`tubeflow:autopilot_completed:${accountId}:shorts`);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }, { accountId: profile.accountId });

    if (completedData) {
      console.log(`\n🎉🎉🎉 [${profile.name} COMPLETED TO FINAL STAGE!] 🎉🎉🎉`);
      console.log(`Rendered Video URL: ${completedData.renderedVideoUrl}`);
      console.log(`Topic:              "${completedData.topic || ''}"`);
      completed = true;
      finalResult = completedData;
      break;
    }

    const apData = await page.evaluate(({ accountId }) => {
      try {
        const raw = localStorage.getItem(`tubeflow:autopilot:${accountId}:shorts`);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }, { accountId: profile.accountId });

    if (apData) {
      if (apData.stage !== lastStage || Math.abs((apData.progressPercent || 0) - lastProgress) >= 3) {
        console.log(`>>> [${profile.name} | ${elapsedMins}m | STAGE: ${apData.stage.toUpperCase()} | ${apData.progressPercent || 0}%]`);
        console.log(`    Status: "${apData.statusMessage || ''}"`);
        if (apData.topic) console.log(`    Topic:  "${apData.topic}"`);
        lastStage = apData.stage;
        lastProgress = apData.progressPercent || 0;

        try {
          await page.screenshot({ path: path.join(SHOTS_DIR, `${profile.slug}_stage_${apData.stage}.png`) });
        } catch {}
      }

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
        console.log(`\n🎉🎉🎉 [${profile.name} COMPLETED SUCCESSFULLY!] 🎉🎉🎉`);
        console.log(`Rendered Video URL: ${apData.renderedVideoUrl}`);
        completed = true;
        finalResult = apData;
        break;
      }

      if (apData.stage === 'error') {
        if (apData.renderedVideoUrl) {
          console.log(`\n🎉🎉🎉 [${profile.name} COMPLETED TO FINAL STAGE!] 🎉🎉🎉`);
          console.log(`Rendered Video URL: ${apData.renderedVideoUrl}`);
          completed = true;
          finalResult = apData;
          break;
        }
        console.error(`\n❌ [${profile.name} ENCOUNTERED AN ERROR]`);
        console.error(`Error message: ${apData.error || apData.statusMessage}`);
        await page.screenshot({ path: path.join(SHOTS_DIR, `${profile.slug}_error.png`) });
        finalResult = apData;
        break;
      }
    }
  }

  await page.screenshot({ path: path.join(SHOTS_DIR, `${profile.slug}_final.png`) });
  await page.close();
  await browser.close();

  if (!completed) {
    throw new Error(`${profile.name} did not complete. Last status: ${JSON.stringify(finalResult)}`);
  }

  return finalResult;
}

main().catch(err => {
  console.error('[FATAL RESUME ERROR]:', err);
  process.exit(1);
});
