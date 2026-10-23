import { chromium } from '../server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS_DIR = path.resolve('server/shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const PROFILES = [
  {
    name: 'Ancient Dharma',
    accountId: 'default',
    scriptId: 'usr_1787934167716', // Ancient Dharma Short
    slug: 'ancient_dharma',
  },
  {
    name: 'Rule Zero',
    accountId: 'acct_3ea89878-0f41-4dc9-86e5-3f55cda46ef7',
    scriptId: 'usr_71b74662-02bc-4de7-8ee1-d46cdf57b132', // Short - Image
    slug: 'rule_zero',
  },
  {
    name: 'Against the Odds',
    accountId: 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab',
    scriptId: 'usr_deed717b-3542-4466-834d-0ff8c890ece2', // Short - Image only
    slug: 'against_the_odds',
  },
];

async function runProfile(profile, browser) {
  console.log('\n================================================================');
  console.log(`   STARTING GENERATION FOR: ${profile.name.toUpperCase()}`);
  console.log(`   Account: ${profile.accountId}`);
  console.log(`   Script:  ${profile.scriptId}`);
  console.log('================================================================\n');

  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' || text.includes('error') || text.includes('Error')) {
      console.log(`[${profile.slug} BROWSER CONSOLE]`, text);
    }
  });

  page.on('pageerror', err => {
    console.error(`[${profile.slug} PAGE ERROR]`, err.message);
  });

  console.log(`[1] Navigating to http://localhost:5173 for ${profile.name}...`);
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
    // Clear any previous autopilot keys for this profile
    localStorage.removeItem(`tubeflow:autopilot:${accountId}:shorts`);
    localStorage.removeItem(`tubeflow:autopilot_completed:${accountId}:shorts`);
  }, { accountId: profile.accountId, scriptId: profile.scriptId });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  console.log(`[3] Checking for Resume or Run Auto-Pilot buttons for ${profile.name}...`);
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
    await apBtn.waitFor({ state: 'visible', timeout: 15000 });
    await apBtn.click();
    await page.waitForTimeout(2000);

    const modalSubmit = page.locator('.fixed form button[type="submit"]');
    await modalSubmit.waitFor({ state: 'visible', timeout: 15000 });

    // Wait for voice check to make button enabled
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
  await page.screenshot({ path: path.join(SHOTS_DIR, `${profile.slug}_started.png`) });
  console.log(`  -> Auto-Pilot active in app for ${profile.name}! Monitoring real-time execution...\n`);

  let seenLogs = new Set();
  let lastStage = '';
  let lastProgress = -1;
  const startTime = Date.now();
  let completed = false;
  let finalResult = null;

  // Monitor for up to 30 minutes per video
  while (Date.now() - startTime < 30 * 60 * 1000) {
    await page.waitForTimeout(3000);
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    const elapsedMins = (elapsedSec / 60).toFixed(1);

    // 1. Check completed storage key
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

    // 2. Check active autopilot state
    const apData = await page.evaluate(({ accountId }) => {
      try {
        const raw = localStorage.getItem(`tubeflow:autopilot:${accountId}:shorts`);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }, { accountId: profile.accountId });

    if (apData) {
      if (apData.stage !== lastStage || Math.abs((apData.progressPercent || 0) - lastProgress) >= 4) {
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
    } else {
      // Check if rendered video is in DOM or status
      const hudLines = await page.locator('.fixed h2, .fixed p, [role="status"]').allInnerTexts().catch(() => []);
      if (hudLines.length > 0) {
        console.log(`[${profile.slug} ${elapsedMins}m] HUD: ${hudLines.filter(Boolean).slice(0, 3).join(' | ')}`);
      }
    }
  }

  await page.screenshot({ path: path.join(SHOTS_DIR, `${profile.slug}_final.png`) });
  await page.close();

  if (!completed) {
    throw new Error(`${profile.name} did not complete. Last status: ${JSON.stringify(finalResult)}`);
  }

  return finalResult;
}

async function main() {
  console.log('================================================================');
  console.log('   TUBEFLOW MULTI-PROFILE AUTONOMOUS GENERATOR');
  console.log('   Profiles: Ancient Dharma, Rule Zero, Against the Odds');
  console.log('   Section:  Shorts (Image Only)');
  console.log('   YouTube Export: SKIPPED (Bypass Enabled)');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const profile of PROFILES) {
      const res = await runProfile(profile, browser);
      results.push({ profile: profile.name, videoUrl: res.renderedVideoUrl, topic: res.topic });
      console.log(`\nWaiting 5 seconds before next profile...\n`);
      await new Promise(r => setTimeout(r, 5000));
    }

    console.log('\n================================================================');
    console.log('   ALL THREE PROFILES COMPLETED TO THE FINAL STAGE!');
    console.log('================================================================');
    for (const r of results) {
      console.log(` • ${r.profile}: ${r.videoUrl} (Topic: "${r.topic}")`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('[FATAL RUNNER ERROR]:', err);
  process.exit(1);
});
