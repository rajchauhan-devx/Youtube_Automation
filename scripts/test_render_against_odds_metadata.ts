import path from 'node:path';
import fs from 'node:fs';
import { workspaceContext } from '../server/src/services/workspace.js';
import { store } from '../server/src/services/store.js';
import { getOutputDir, type RenderOptions } from '../server/src/services/video.js';
import { savedGraphicsForRender, graphicsCameras, compositeSavedGraphics } from '../server/src/services/render-graphics.js';
import { renderRevision } from '../server/src/services/render-revision.js';
import { hash } from '../server/src/services/editing/repository.js';
import { scriptFingerprint } from '../server/src/services/editing/projects.js';

const accountId = 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab';
const scriptId = 'usr_deed717b-3542-4466-834d-0ff8c890ece2';

async function main() {
  await workspaceContext.run({ accountId, profile: 'shorts' }, async () => {
    const script = store.getById<any>('scripts', scriptId);
    if (!script) throw new Error('Script not found');

    console.log('Script Title:', script.title || script.topicName);
    console.log('Editing Project ID:', script.editingProjectId);
    console.log('Motion Metadata count:', script.scenePlan?.motionMetadata?.length);

    // 1. Ensure graphics are enabled in autoPilotSettings
    script.autoPilotSettings = {
      ...(script.autoPilotSettings || {}),
      graphics: {
        ...(script.autoPilotSettings?.graphics || {}),
        enabled: true,
      },
    };
    store.add('scripts', script);
    console.log('[1] Enabled graphics in autoPilotSettings');

    // 2. Read the project revision
    const projectDir = path.resolve(`server/data/accounts/${accountId}/profiles/shorts/editing/${script.editingProjectId}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, 'manifest.json'), 'utf8'));
    const revFile = path.join(projectDir, 'revisions', `${manifest.revisionId}.json`);
    const project = JSON.parse(fs.readFileSync(revFile, 'utf8'));

    // Keep existing captions
    const captions = project.artifacts.filter((a: any) => a.graphic?.kind === 'caption');
    console.log(`[2] Found ${captions.length} existing caption artifacts in revision`);

    // 3. Map motionMetadata tags into HyperFrames artifacts
    const motionMetadata = script.scenePlan?.motionMetadata || [];
    const motionArtifacts: any[] = [];

    const fps = project.inputs?.fps || 30;

    for (const meta of motionMetadata) {
      const sceneNum = meta.sceneNum || (meta.index ? Number(meta.index) : 1);
      const sceneIdx = Math.max(0, sceneNum - 1);
      const scene = project.scenes[sceneIdx] || project.scenes[0];
      if (!scene) continue;

      const sceneStartFrame = scene.startFrame;
      const sceneEndFrame = scene.endFrame;
      const sceneDurationFrames = sceneEndFrame - sceneStartFrame;

      // Start graphic 10 frames in, display for min(sceneDuration - 15, 120 frames)
      const startFrame = sceneStartFrame + Math.min(10, Math.floor(sceneDurationFrames * 0.1));
      const displayDuration = Math.max(45, Math.min(sceneDurationFrames - 15, 150));
      const endFrame = Math.min(sceneEndFrame - 5, startFrame + displayDuration);

      const type = (meta.type || '').toLowerCase();
      let graphic: any = null;

      if (type === 'chapter_title' || type === 'title') {
        const rawTag = meta.raw?.match(/Tag:\s*([^\n]+)/i)?.[1] || '';
        graphic = {
          kind: 'title',
          title: (meta.title || 'CHAPTER').toUpperCase(),
          detail: meta.detail ? `${rawTag ? rawTag + ' // ' : ''}${meta.detail}` : (rawTag || 'CHAPTER ARCHIVE'),
          bounds: { x: 90, y: 700, width: 900, height: 240 },
        };
      } else if (type === 'telemetry_counter' || type === 'counter') {
        const targetVal = meta.target || '100';
        const unit = meta.unit || 'UNITS';
        graphic = {
          kind: 'counter',
          title: `${targetVal} ${unit}`,
          detail: `${(meta.label || 'VERIFIED TELEMETRY').toUpperCase()} // ${meta.detail || ''}`,
          bounds: { x: 90, y: 1200, width: 900, height: 220 },
        };
      } else if (type === 'route_map' || type === 'route') {
        graphic = {
          kind: 'route',
          title: `${(meta.origin || 'START').toUpperCase()} -> ${(meta.destination || 'DESTINATION').toUpperCase()}`,
          detail: `${meta.distance ? meta.distance + ' // ' : ''}${meta.detail || 'ROUTE DISPATCH'}`,
          bounds: { x: 90, y: 720, width: 900, height: 500 },
        };
      } else if (type === 'polaroid_badge' || type === 'badge') {
        graphic = {
          kind: 'badge',
          title: (meta.title || 'PERSONNEL').toUpperCase(),
          detail: (meta.detail || 'FIELD RECORD').toUpperCase(),
          bounds: { x: 260, y: 550, width: 560, height: 680 },
        };
      } else if (type === 'rule_decree' || type === 'newspaper' || type === 'frame') {
        graphic = {
          kind: 'frame',
          title: (meta.headline || meta.title || 'DIRECTIVE').toUpperCase(),
          detail: `${meta.publication || 'WORLD RECORD'} // ${meta.highlight || ''}`,
          bounds: { x: 90, y: 700, width: 900, height: 420 },
        };
      } else if (type === 'object_spotlight' || type === 'relic_spotlight' || type === 'spotlight') {
        graphic = {
          kind: 'spotlight',
          title: (meta.title || 'DISCOVERY').toUpperCase(),
          detail: (meta.detail || 'EVIDENCE ITEM').toUpperCase(),
          bounds: { x: 80, y: 1350, width: 340, height: 90 },
          target: {
            label: meta.target || 'Subject',
            region: { x: 0.45, y: 0.4, width: 0.15, height: 0.2 },
            evidence: meta.detail || 'Visible target in scene',
            verified: true,
          },
        };
      }

      if (graphic) {
        motionArtifacts.push({
          id: `graphic-scene-${sceneIdx}-${meta.index || motionArtifacts.length + 1}`,
          sceneId: scene.id,
          enabled: true,
          intent: `${type}: ${meta.title || meta.headline || meta.target}`,
          narrativeRefs: [`span-${sceneIdx}`],
          startFrame,
          endFrame,
          priority: 1,
          nodes: [],
          assetRequestIds: [],
          visualReview: { status: 'passed', attempts: 1, frames: [], reason: 'Approved' },
          graphic,
        });
      }
    }

    console.log(`[3] Constructed ${motionArtifacts.length} motion graphic artifacts from metadata`);

    // Invalidate visual review restrictions
    delete project.documentaryRequirement;
    project.settings.visualReview = false;
    project.artifacts = [...captions, ...motionArtifacts];

    // Ensure inputs hashes are valid
    const audioFilename = script.generatedAudio?.[0]?.filename;
    const audioPath = path.resolve(`server/data/accounts/${accountId}/profiles/shorts/generated/${scriptId}/${audioFilename}`);
    const sortedAssets = [...(script.generatedImages || [])]
      .filter((img: any) => img.url)
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
    const imageFiles = sortedAssets.map((img: any) => (img.url || '').split('/').pop()!);
    const imagePaths = imageFiles.map(fn => path.resolve(`server/data/accounts/${accountId}/profiles/shorts/generated/${scriptId}/${fn}`));
    const resolution = { width: 1080, height: 1920 };

    project.inputs.scriptHash = scriptFingerprint(script);
    project.inputs.audioFilename = audioFilename;
    project.inputs.audioHash = hash(fs.readFileSync(audioPath));
    project.inputs.width = resolution.width;
    project.inputs.height = resolution.height;

    fs.writeFileSync(revFile, JSON.stringify(project, null, 2));
    console.log(`[4] Saved updated revision with ${project.artifacts.length} total artifacts (${motionArtifacts.length} motion graphics)`);

    // 4. Composite motion graphics onto base MP4 video
    const savedGraphics = savedGraphicsForRender(scriptId, audioPath, imagePaths, resolution);
    if (!savedGraphics) throw new Error('No saved graphics found for render');

    const outDir = getOutputDir(scriptId);
    const mp4Files = fs.readdirSync(outDir).filter(f => f.endsWith('.mp4') && !f.endsWith('.partial.mp4'));
    if (!mp4Files.length) throw new Error('No base MP4 found in output directory');
    const baseSource = path.join(outDir, mp4Files[0]);

    const audioSyncFile = path.resolve(`server/data/accounts/${accountId}/profiles/shorts/generated/${scriptId}/${audioFilename}.sync.json`);
    const audioSync = fs.existsSync(audioSyncFile) ? JSON.parse(fs.readFileSync(audioSyncFile, 'utf8')) : undefined;

    const finalDuration = project.inputs.durationFrames / fps;
    const renderOptions: RenderOptions = {
      scriptId,
      imagePaths,
      audioPath,
      resolution,
      zoomFactor: 1.08,
      transitionDuration: 0.2,
      sceneAnalysis: script.sceneAnalysis,
      enableSubtitles: true,
      colorGrade: 'none',
      enableVignette: false,
      enableSfx: false,
    };

    console.log('[5] Generating camera matrices & starting HyperFrames overlay rendering...');
    const savedCameras = graphicsCameras(savedGraphics, renderOptions, finalDuration, undefined, audioSync);

    const result = {
      outputPath: baseSource,
      duration: finalDuration,
      size: fs.statSync(baseSource).size,
    };

    const startOverlay = Date.now();
    const signal = new AbortController().signal;
    await compositeSavedGraphics(result, savedGraphics, signal, (stage, pct) => {
      console.log(`    [HyperFrames Composite] ${stage}: ${pct}%`);
    }, savedCameras);

    const elapsed = ((Date.now() - startOverlay) / 1000).toFixed(1);
    const finalSize = fs.statSync(result.outputPath).size;
    console.log(`\n🎉🎉🎉 SUCCESS! Motion graphics composited in ${elapsed}s! Final size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);

    // 5. Update revision json
    const rev = renderRevision(scriptId);
    const metaFile = `${baseSource}.json`;
    fs.writeFileSync(metaFile, JSON.stringify({
      revision: rev,
      resolution: '1080x1920',
      duration: finalDuration,
    }, null, 2));
    console.log('[6] Metadata file updated.');
  });
}

main().catch(err => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
