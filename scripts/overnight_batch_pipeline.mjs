import { chromium } from '../server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

const SCRIPTS_FILE = path.resolve('server/data/scripts.json');
const SUMMARY_FILE = path.resolve('scratch/overnight_batch_summary.json');
const ARTIFACTS_DIR = 'C:/Users/zrajc/.gemini/antigravity/brain/bea78f37-acbc-4eb2-838f-c4a35c19b687';

function getScript(scriptId) {
  try {
    const data = JSON.parse(fs.readFileSync(SCRIPTS_FILE, 'utf8'));
    return data.find((s) => s.id === scriptId) || null;
  } catch {
    return null;
  }
}

function saveScript(scriptData) {
  const data = JSON.parse(fs.readFileSync(SCRIPTS_FILE, 'utf8'));
  const idx = data.findIndex((s) => s.id === scriptData.id);
  if (idx >= 0) {
    data[idx] = scriptData;
  } else {
    data.push(scriptData);
  }
  fs.writeFileSync(SCRIPTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function createScriptClone(newId, newName, scheduledPublishAt) {
  const data = JSON.parse(fs.readFileSync(SCRIPTS_FILE, 'utf8'));
  const base = data.find((s) => s.id === 'shorts_images_videos');
  if (!base) throw new Error('Base template shorts_images_videos not found');

  const existing = data.find((s) => s.id === newId);
  if (existing) {
    console.log(`ℹ️ Script "${newId}" already exists. Reusing existing entry.`);
    return existing;
  }

  const clone = {
    id: newId,
    name: newName,
    accountId: 'default',
    section: 'shorts',
    prompts: base.prompts,
    howItWorks: base.howItWorks,
    duration: base.duration || 90,
    model: base.model || 'gemini-3.6-flash',
    videoImportsEnabled: true,
    enableSubtitles: false,
    presenter: base.presenter,
    autoPilotSettings: {
      ...base.autoPilotSettings,
      captions: 'off',
      media: {
        ...base.autoPilotSettings?.media,
        flowEnabled: true,
        allowImageFallback: true,
        videoOnly: false,
      },
      flowMusic: {
        ...base.autoPilotSettings?.flowMusic,
        enabled: true,
        imageOnlyReel: false,
      },
      youtube: {
        ...base.autoPilotSettings?.youtube,
        enabled: true,
        privacyStatus: 'private',
        publishMode: 'schedule',
        scheduledPublishAt,
      },
    },
  };

  saveScript(clone);
  console.log(`✨ Created script clone "${newId}" ("${newName}") scheduled for ${scheduledPublishAt}`);
  return clone;
}

async function takeScreenshot(page, filename) {
  try {
    const p1 = path.join(ARTIFACTS_DIR, filename);
    const p2 = path.join('scratch', filename);
    await page.screenshot({ path: p1, fullPage: false });
    fs.copyFileSync(p1, p2);
  } catch (err) {
    // Non-fatal screenshot error
  }
}

async function waitForExport(page, scriptId, timeoutMinutes = 90) {
  console.log(`⏳ Monitoring production & YouTube export for "${scriptId}" (timeout: ${timeoutMinutes}m)...`);
  const start = Date.now();
  const maxMs = timeoutMinutes * 60 * 1000;
  let lastReportedStatus = '';
  let errorCount = 0;

  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(6000);

    // 1. Check if backend has saved the YouTube export
    const current = getScript(scriptId);
    if (current?.youtubeExport?.uploadedVideoUrl || current?.youtubeExport?.uploadedVideoId) {
      console.log(`\n🎉 [EXPORT COMPLETE] Script "${scriptId}" exported to YouTube!`);
      const url = current.youtubeExport.uploadedVideoUrl || ('https://youtu.be/' + current.youtubeExport.uploadedVideoId);
      console.log(`   URL: ${url}`);
      console.log(`   Scheduled At: ${current.youtubeExport.scheduledPublishAt || 'N/A'}`);
      await takeScreenshot(page, `${scriptId}_export_done.png`);
      return current.youtubeExport;
    }

    // 2. Read live status from the browser page
    try {
      const statusTexts = await page.locator('.fixed [class*="font-semibold"], .fixed [class*="text-zinc"], .fixed [class*="text-muted"], .fixed [class*="text-emerald"]').allInnerTexts().catch(() => []);
      const relevant = statusTexts.filter((t) => /Google Flow|Rendering|Generating|Voice|Narration|Compositing|Render MP4|Final Review|Export|Visual Generation|Auto-Pilot/i.test(t));
      if (relevant.length > 0) {
        const text = relevant.slice(0, 2).join(' | ').slice(0, 110);
        if (text !== lastReportedStatus) {
          lastReportedStatus = text;
          console.log(`  [${new Date().toLocaleTimeString()}] ${text}`);
        }
      }
    } catch {}

    // 3. Self-healing: if window.__autoPilotState faulted into 'error' state
    try {
      const isError = await page.evaluate(() => {
        return Boolean(window.__autoPilotState?.stage === 'error' && !window.__autoPilotState?.isActive);
      }).catch(() => false);

      if (isError) {
        errorCount++;
        console.log(`\n🔄 [Self-Healing #${errorCount}] Detected Auto-Pilot error state. Resuming pipeline for "${scriptId}"...`);
        await page.evaluate((id) => {
          if (typeof window.__resumeAutoPilot === 'function') {
            window.__resumeAutoPilot(id);
          }
        }, scriptId);
        await page.waitForTimeout(6000);
      }
    } catch {}
  }

  await takeScreenshot(page, `${scriptId}_timeout_error.png`);
  throw new Error(`Timeout waiting for "${scriptId}" to finish and export to YouTube after ${timeoutMinutes} minutes.`);
}

async function runVideoTask(context, taskInfo) {
  const { taskNum, totalTasks, scriptId, name, topic, scheduledPublishAt } = taskInfo;
  console.log(`\n=============================================================`);
  console.log(`🎬 [${taskNum}/${totalTasks}] Processing: "${topic}"`);
  console.log(`   Script ID: ${scriptId}`);
  console.log(`   Scheduled Publish: ${scheduledPublishAt}`);
  console.log(`=============================================================`);

  // Check if already completed and exported
  const existing = getScript(scriptId);
  if (existing?.youtubeExport?.uploadedVideoUrl || existing?.youtubeExport?.uploadedVideoId) {
    const url = existing.youtubeExport.uploadedVideoUrl || ('https://youtu.be/' + existing.youtubeExport.uploadedVideoId);
    console.log(`✅ Script "${scriptId}" already completed & exported!`);
    console.log(`   URL: ${url}`);
    return {
      title: existing.youtubeExport.title || topic,
      scriptId,
      scheduledPublishAt: existing.youtubeExport.scheduledPublishAt || scheduledPublishAt,
      videoUrl: url,
    };
  }

  // Ensure script clone is created in DB
  createScriptClone(scriptId, name, scheduledPublishAt);

  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (/\[FLOW\]|Flow|Veo|render_video|media-import|Exported to YouTube/i.test(text)) {
      console.log(`  🖥️  ${text}`);
    }
  });

  // Set localStorage so page loads directly on this script
  await page.addInitScript((targetId) => {
    localStorage.setItem('tubeflow:v1', JSON.stringify({
      channelId: 'default',
      section: 'shorts',
      tab: 'generation',
      selectedScriptId: targetId,
    }));
    localStorage.setItem('tubeflow:v1:account:default', JSON.stringify({
      section: 'shorts',
      tab: 'generation',
      selectedScriptId: targetId,
    }));
  }, scriptId);

  console.log(`🌐 Navigating to TubeFlow at http://localhost:5173 for "${scriptId}"...`);
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for App to load and script to appear in scopeScripts
  console.log(`⏳ Waiting for script "${scriptId}" to load into TubeFlow scope...`);
  await page.waitForFunction((targetId) => {
    return typeof window.__runAutoPilot === 'function' &&
           typeof window.__getScopeScripts === 'function' &&
           window.__getScopeScripts().some((s) => s.id === targetId);
  }, scriptId, { timeout: 30000 });

  await page.waitForTimeout(2000);
  await takeScreenshot(page, `${scriptId}_ready.png`);

  console.log(`🚀 Launching Auto-Pilot for "${scriptId}" on topic: "${topic}"...`);
  await page.evaluate(({ id, targetTopic, sched }) => {
    window.__runAutoPilot(id, targetTopic, sched);
  }, { id: scriptId, targetTopic: topic, sched: scheduledPublishAt });

  // Wait for Auto-Pilot to become active
  await page.waitForFunction(() => {
    return Boolean(window.__autoPilotState?.isActive);
  }, { timeout: 15000 });
  console.log(`▶️ Auto-Pilot engine active for "${scriptId}".`);

  // Monitor until YouTube export finishes
  const exportResult = await waitForExport(page, scriptId, 90);

  await page.close();

  const finalUrl = exportResult.uploadedVideoUrl || ('https://youtu.be/' + exportResult.uploadedVideoId);
  return {
    title: exportResult.title || topic,
    scriptId,
    scheduledPublishAt,
    videoUrl: finalUrl,
  };
}

async function shutdownPC() {
  console.log('\n=============================================================');
  console.log('🛑 [SHUTDOWN] All 4 videos successfully rendered and exported!');
  console.log('🛑 Initiating system shutdown in 120 seconds...');
  console.log('=============================================================');
  exec('shutdown /s /t 120 /c "TubeFlow overnight batch production complete. Shutting down system in 2 minutes."', (err) => {
    if (err) console.error('Shutdown command error:', err);
  });
}

async function main() {
  console.log('=============================================================');
  console.log('🎬 TubeFlow Overnight Batch Production Pipeline');
  console.log('   Target: 4 Total Videos (Current + 3 Scheduled) -> Auto-Shutdown');
  console.log('   Channel: Ancient Dharma (default)');
  console.log('=============================================================');

  const results = [];

  // -------------------------------------------------------------
  // TASK 0: Current Video ("Karna & Kunti on the Banks of Ganga")
  // -------------------------------------------------------------
  const baseScript = getScript('shorts_images_videos');
  if (baseScript?.youtubeExport?.uploadedVideoUrl || baseScript?.youtubeExport?.uploadedVideoId) {
    const url = baseScript.youtubeExport.uploadedVideoUrl || ('https://youtu.be/' + baseScript.youtubeExport.uploadedVideoId);
    console.log(`\n✅ [1/4] Current Video ("Karna & Kunti") is ALREADY EXPORTED!`);
    console.log(`   Title: ${baseScript.youtubeExport.title}`);
    console.log(`   URL: ${url}`);
    console.log(`   Scheduled At: ${baseScript.youtubeExport.scheduledPublishAt || '2026-11-11T03:30:00.000Z'}`);
    results.push({
      title: baseScript.youtubeExport.title,
      scriptId: 'shorts_images_videos',
      scheduledPublishAt: baseScript.youtubeExport.scheduledPublishAt || '2026-11-11T03:30:00.000Z',
      videoUrl: url,
    });
  } else {
    throw new Error('Current video shorts_images_videos is expected to be exported before batch continuation.');
  }

  // Launch headless browser with robust flags
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });

  // -------------------------------------------------------------
  // TASK 1: Tomorrow Evening (Nov 11, 18:00 IST = 12:30 UTC)
  // -------------------------------------------------------------
  const res1 = await runVideoTask(context, {
    taskNum: 2,
    totalTasks: 4,
    scriptId: 'shorts_video_nov11_evening',
    name: 'Shorts · Abhimanyu Chakravyuha',
    topic: 'Abhimanyu and the Chakravyuha: The 16-Year-Old Warrior Who Shook the Kaurava Army',
    scheduledPublishAt: '2026-11-11T12:30:00.000Z',
  });
  results.push(res1);
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(results, null, 2), 'utf8');

  // -------------------------------------------------------------
  // TASK 2: Day After Tomorrow Morning (Nov 12, 09:00 IST = 03:30 UTC)
  // -------------------------------------------------------------
  const res2 = await runVideoTask(context, {
    taskNum: 3,
    totalTasks: 4,
    scriptId: 'shorts_video_nov12_morning',
    name: 'Shorts · Bhishma Bed of Arrows',
    topic: "Bhishma's Bed of Arrows: The Secret Divine Knowledge Imparted to Yudhishthira",
    scheduledPublishAt: '2026-11-12T03:30:00.000Z',
  });
  results.push(res2);
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(results, null, 2), 'utf8');

  // -------------------------------------------------------------
  // TASK 3: Day After Tomorrow Evening (Nov 12, 18:00 IST = 12:30 UTC)
  // -------------------------------------------------------------
  const res3 = await runVideoTask(context, {
    taskNum: 4,
    totalTasks: 4,
    scriptId: 'shorts_video_nov12_evening',
    name: 'Shorts · Ashwatthama Immortal Curse',
    topic: "Ashwatthama's Immortal Curse: The Mani Ripped from His Forehead and 3000 Years of Solitude",
    scheduledPublishAt: '2026-11-12T12:30:00.000Z',
  });
  results.push(res3);
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(results, null, 2), 'utf8');

  await browser.close();

  console.log('\n=============================================================');
  console.log('🎉 ALL 4 VIDEOS COMPLETED & EXPORTED TO YOUTUBE:');
  console.table(results);
  console.log('=============================================================');

  // Initiate system shutdown as requested by the user
  await shutdownPC();
}

main().catch((err) => {
  console.error('\n❌ Overnight Batch Pipeline Error:', err);
  process.exit(1);
});
