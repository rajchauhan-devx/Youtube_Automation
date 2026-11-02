import path from 'node:path';
import fs from 'node:fs';
import { workspaceContext } from '../server/src/services/workspace.js';
import { store } from '../server/src/services/store.js';
import { renderLongVideo, getOutputDir, resolveInputPath, type RenderOptions } from '../server/src/services/video.js';
import { mediaScenes } from '../server/src/services/shorts-media.js';
import { assertNarrationCurrent } from '../server/src/services/long-narration.js';
import { retentionEditing } from '../server/src/services/retention.js';
import { renderRevision } from '../server/src/services/render-revision.js';
import { atomicJson } from '../server/src/services/accounts.js';
import { saveRenderJob } from '../server/src/services/render-jobs.js';
import { resolveMusicTrack } from '../server/src/services/music.js';

async function main() {
  await workspaceContext.run({ accountId: 'acct_3ea89878-0f41-4dc9-86e5-3f55cda46ef7', profile: 'shorts' }, async () => {
    const scriptId = 'usr_e4ebaf4b-71d2-4e52-813f-5ecd171a7281';
    const script = store.getById<any>('scripts', scriptId);
    if (!script) throw new Error('Script not found');

    console.log('Script loaded:', script.name || scriptId);

    // Ensure dynamic graphics and popups are completely cleared
    script.dynamicMotionGraphics = [];
    script.extraPopups = [];
    if (script.autoPilotSettings?.graphics) {
      script.autoPilotSettings.graphics.enabled = false;
    }
    store.add('scripts', script);

    const audioEntry = script.generatedAudio[0];
    const resolvedAudio = resolveInputPath(audioEntry.url, scriptId);
    const audioFilename = path.basename(resolvedAudio);
    console.log('Audio file:', audioFilename);

    const longSync = assertNarrationCurrent(script, audioFilename);
    const longPlan = { ...script.scenePlan, scenes: mediaScenes({ ...script, section: 'shorts' }) };
    console.log(`Narration sync: ${longSync.scenes.length} scenes. Scene plan: ${longPlan.scenes.length} scenes.`);

    const effectiveEditing = retentionEditing(script);
    const resolvedBgm = resolveMusicTrack('auto');
    const imagePaths = script.generatedImages.map((img: any) => img.url);

    const renderOptions: RenderOptions = {
      polishAudio: Boolean(script.retentionPlan && script.retentionEdit && effectiveEditing?.enabled !== false),
      signal: new AbortController().signal,
      scriptId,
      imagePaths,
      audioPath: audioEntry.url,
      duration: longSync.totalSamples / longSync.sampleRate,
      resolution: { width: 1080, height: 1920 },
      zoomFactor: 1.15,
      transitionDuration: 0.35,
      sceneAnalysis: script.sceneAnalysis,
      enableSubtitles: true,
      bgmPath: resolvedBgm || undefined,
      bgmVolume: 0.1,
      ttsVolume: 1.0,
      colorGrade: 'none',
      enableVignette: false,
      enableSfx: false,
      editing: effectiveEditing,
      presenter: { enabled: false },
      onProgress: (pct) => {
        if (pct % 15 === 0 || pct >= 95) {
          console.log(`[Render Progress] ${pct}%`);
        }
      },
    };

    console.log('Starting renderLongVideo (clean scenes + narration + bgm + subtitles, zero overlays)...');
    const start = Date.now();
    const result = await renderLongVideo(renderOptions, longPlan, longSync);
    console.log(`Render finished in ${((Date.now() - start) / 1000).toFixed(1)}s! Output: ${result.filename} (${(result.size / 1024 / 1024).toFixed(2)} MB)`);

    const revision = renderRevision(scriptId);
    atomicJson(`${result.outputPath}.json`, {
      revision,
      resolution: '1080x1920',
      duration: result.duration,
    });

    saveRenderJob({
      scriptId,
      request: {
        scriptId,
        imagePaths,
        audioPath: audioEntry.url,
        duration: result.duration,
        resolution: { width: 1080, height: 1920 },
      },
      revision,
      status: 'done',
      progress: 100,
      stage: 'Render complete (clean video)',
      outputFilename: result.filename,
    });

    console.log('Render job record and metadata updated successfully.');
  });
}

main().catch(err => {
  console.error('Render error:', err);
  process.exit(1);
});
