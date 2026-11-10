const { chromium } = require('../server/node_modules/playwright');
const http = require('http');

function apiGet(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3001${urlPath}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function runAutoPilot() {
  console.log('🚀 [Playwright] Launching Chromium browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (/AutoPilot|Flow|Render|Narration|Stage|error|Veo|compositor/i.test(text)) {
      console.log('  [Browser Console]:', text);
    }
  });

  console.log('🌐 [Playwright] Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 1. Check if the AutoPilot modal is already open
  let modal = page.locator('.fixed.inset-0').first();
  let isModalOpen = (await modal.count()) > 0 && (await modal.isVisible().catch(() => false));

  if (isModalOpen) {
    console.log('🎯 [Playwright] Auto-Pilot modal is already open.');
    const resumeInModal = page.locator('.fixed button:has-text("Resume")').first();
    if ((await resumeInModal.count()) > 0 && (await resumeInModal.isVisible().catch(() => false))) {
      console.log('▶️ [Playwright] Clicking Resume in open modal...');
      await resumeInModal.click({ force: true });
    }
  } else {
    // 2. Select the Ramayana Conversational script card
    console.log('🔍 [Playwright] Selecting Ramayana Conversational script card...');
    const card = page.locator('button:has-text("Short — Ramayana Conversational Dialogue")').first();
    if (await card.count()) {
      await card.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 3. Click "Resume Auto-Pilot"
    const resumeBtn = page.locator('button:has-text("Resume Auto-Pilot")').first();
    if ((await resumeBtn.count()) > 0 && (await resumeBtn.isVisible().catch(() => false))) {
      console.log('▶️ [Playwright] Clicking floating "Resume Auto-Pilot" button...');
      await resumeBtn.click({ force: true });
    } else {
      console.log('▶️ [Playwright] Looking for "Run Script" button...');
      const runBtn = page.locator('button:has-text("Run Script")').first();
      if ((await runBtn.count()) > 0) {
        await runBtn.click({ force: true });
        await page.waitForTimeout(1500);
        const modalResumeBtn = page.locator('button:has-text("Resume Auto-Pilot")').first();
        if ((await modalResumeBtn.count()) > 0) {
          console.log('▶️ [Playwright] Clicking "Resume Auto-Pilot" in Run modal...');
          await modalResumeBtn.click({ force: true });
        }
      }
    }
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scratch/autopilot_live.png' });
  console.log('📸 Saved scratch/autopilot_live.png');

  // Monitor loop until final video is rendered and verified
  console.log('🔄 [Playwright] Monitoring Auto-Pilot execution until finished...');
  let lastLoggedMsg = '';
  let pollIteration = 0;
  let finished = false;

  while (!finished) {
    pollIteration++;
    await page.waitForTimeout(5000);

    // Check if Resume button is visible in modal (paused or halted on transient error)
    try {
      const resumeInModal = page.locator('.fixed button:has-text("Resume")').first();
      if ((await resumeInModal.count()) > 0 && (await resumeInModal.isVisible({ timeout: 1000 }).catch(() => false))) {
        console.log(`⚠️ [Playwright] Resume button detected in modal. Resuming...`);
        await page.waitForTimeout(1000);
        await resumeInModal.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    } catch {}

    // Check status message & progress percent from modal
    try {
      const statusLoc = page.locator('.fixed div.text-xs.font-medium, .fixed div.text-sm.font-medium, .fixed p.text-xs').filter({
        hasText: /Google Flow|Rendering|Generating|Synthesizing|Narration|MP4|Visual|Stage|Scene/i
      }).first();
      const statusText = (await statusLoc.count()) > 0 ? (await statusLoc.innerText({ timeout: 1000 }).catch(() => '')) : '';

      const pctLoc = page.locator('.fixed span.font-mono.text-accent.font-bold').first();
      const pctText = (await pctLoc.count()) > 0 ? (await pctLoc.innerText({ timeout: 1000 }).catch(() => '')) : '';

      if (statusText && statusText !== lastLoggedMsg) {
        console.log(`[Auto-Pilot ${pctText || '...'}] ${statusText.replace(/\n+/g, ' ')}`);
        lastLoggedMsg = statusText;
      }
    } catch {}

    // Check latest log from modal console
    try {
      const logEntries = await page.locator('.fixed div.font-mono.text-xs').allInnerTexts().catch(() => []);
      if (logEntries.length > 0) {
        const latest = logEntries[logEntries.length - 1].replace(/\n+/g, ' ').trim();
        if (latest && latest !== lastLoggedMsg) {
          console.log(`  [Log] ${latest}`);
          lastLoggedMsg = latest;
        }
      }
    } catch {}

    // Check backend script & Flow jobs
    if (pollIteration % 3 === 0) {
      try {
        const script = await apiGet('/api/scripts/usr_dharma_conversational_dialogue');
        const scenes = script.scenePlan?.scenes || [];
        const totalScenes = scenes.length || 10;
        const doneVideos = (script.generatedImages || []).filter(img => img.status === 'done' && img.mediaType === 'video').length;
        const audioDone = Boolean(script.generatedAudio?.[0]?.url);

        const jobsData = await apiGet('/api/flow/jobs?scriptId=usr_dharma_conversational_dialogue');
        const runningJob = (jobsData?.jobs || []).find(j => j.state === 'running');
        const jobStatus = runningJob ? `Scene ${runningJob.sceneIndex + 1}: ${runningJob.stage} (${runningJob.progress}%)` : 'none';

        const renderStatus = await apiGet('/api/render/status/usr_dharma_conversational_dialogue');
        if (renderStatus && renderStatus.status === 'running') {
          console.log(`🎬 [Compositor] Final MP4 Rendering: ${renderStatus.stage || 'active'} (${Math.round(renderStatus.progress || 0)}%)`);
        } else if (renderStatus && renderStatus.status === 'done' && renderStatus.videos?.length > 0) {
          console.log('\n🎉🎉🎉 [Compositor] FINAL MP4 VIDEO IS COMPLETE! 🎉🎉🎉');
          console.log('🎥 Video URL:', renderStatus.videos[0].url);
          console.log('🎥 Video Path:', renderStatus.videos[0].path);
          console.log('⏱ Duration:', renderStatus.videos[0].duration, 'seconds');

          await page.waitForTimeout(4000);
          await page.screenshot({ path: 'scratch/final_production_finished.png' });
          console.log('📸 Saved scratch/final_production_finished.png');
          console.log('✅ Pipeline completely finished rendering final video!');
          finished = true;
          break;
        }

        console.log(`📊 [Status Check #${pollIteration}] Videos: ${doneVideos}/${totalScenes} | Active Flow: ${jobStatus} | Audio: ${audioDone ? 'READY' : 'PENDING'} | Render: ${renderStatus?.status || 'idle'}`);
      } catch (err) {
        // ignore network error
      }
    }

    // Check if Download MP4 Video button is visible in modal
    try {
      const downloadBtn = page.locator('.fixed a:has-text("Download MP4 Video")').first();
      if ((await downloadBtn.count()) > 0 && (await downloadBtn.isVisible({ timeout: 1000 }).catch(() => false))) {
        console.log('🎉 [Playwright] "Download MP4 Video" button is visible in modal!');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'scratch/final_production_finished.png' });
        finished = true;
        break;
      }
    } catch {}
  }

  await browser.close();
  console.log('🏁 Auto-Pilot runner completed successfully.');
}

runAutoPilot().catch(err => {
  console.error('❌ Playwright Runner Error:', err);
  process.exit(1);
});
