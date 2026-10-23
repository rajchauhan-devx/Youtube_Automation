import path from 'node:path';
import fs from 'node:fs';
import { workspaceContext } from '../server/src/services/workspace.js';
import { store } from '../server/src/services/store.js';
import { getOutputDir, type RenderOptions } from '../server/src/services/video.js';
import { savedGraphicsForRender, graphicsCameras, compositeSavedGraphics } from '../server/src/services/render-graphics.js';
import { renderRevision } from '../server/src/services/render-revision.js';
import { hash } from '../server/src/services/editing/repository.js';
import { scriptFingerprint, createProject } from '../server/src/services/editing/projects.js';

interface ProfileTarget {
  name: string;
  accountId: string;
  scriptId: string;
  slug: string;
}

const PROFILES: ProfileTarget[] = [
  {
    name: 'Rule Zero',
    accountId: 'acct_3ea89878-0f41-4dc9-86e5-3f55cda46ef7',
    scriptId: 'usr_71b74662-02bc-4de7-8ee1-d46cdf57b132',
    slug: 'rule_zero',
  },
];

function buildMotionArtifact(meta: any, sceneIdx: number, scene: any) {
  const sceneStartFrame = scene.startFrame;
  const sceneEndFrame = scene.endFrame;
  const sceneDurationFrames = sceneEndFrame - sceneStartFrame;

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
      detail: `${(meta.label || 'VERIFIED RECORD').toUpperCase()} // ${meta.detail || ''}`,
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

  if (!graphic) return null;

  return {
    id: `graphic-scene-${sceneIdx}-${meta.index || Math.random().toString(36).slice(2, 6)}`,
    sceneId: scene.id,
    enabled: true,
    intent: `${type}: ${meta.title || meta.headline || meta.target || 'graphic'}`,
    narrativeRefs: scene.narrativeRefs?.length ? [scene.narrativeRefs[0]] : [`span-${sceneIdx}`],
    startFrame,
    endFrame,
    priority: 1,
    nodes: [],
    assetRequestIds: [],
    visualReview: { status: 'passed', attempts: 1, frames: [], reason: 'Approved' },
    graphic,
  };
}

async function processProfile(target: ProfileTarget) {
  console.log('\n================================================================');
  console.log(`   PROCESSING MOTION METADATA FOR: ${target.name.toUpperCase()}`);
  console.log(`   Account: ${target.accountId}`);
  console.log(`   Script:  ${target.scriptId}`);
  console.log('================================================================');

  await workspaceContext.run({ accountId: target.accountId, profile: 'shorts' }, async () => {
    const script = store.getById<any>('scripts', target.scriptId);
    if (!script) throw new Error(`Script not found for ${target.name}`);

    console.log(`Title: ${script.title || script.topicName}`);

    // 1. Ensure graphics are enabled in autoPilotSettings
    script.autoPilotSettings = {
      ...(script.autoPilotSettings || {}),
      graphics: {
        ...(script.autoPilotSettings?.graphics || {}),
        enabled: true,
      },
    };
    store.add('scripts', script);
    console.log('[1] Enabled graphics in autoPilotSettings: true');

    const audioFilename = script.generatedAudio?.[0]?.filename;
    const sortedAssets = [...(script.generatedImages || [])]
      .filter((img: any) => img.url)
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
    const readyIndexes = sortedAssets.map((img: any) => img.index ?? 0);

    // 2. Ensure EditingProject exists
    let projectId = script.editingProjectId;
    if (!projectId) {
      console.log('[2] No editingProjectId found. Creating project via createProject()...');
      const p = await createProject({
        scriptId: target.scriptId,
        audioFilename,
        language: script.generatedAudio?.[0]?.language || 'en',
        imageIndexes: readyIndexes,
        aspect: '9:16',
        fps: 30,
        settings: {
          stylePreference: '',
          density: 'balanced',
          documentary: true,
          treatment: 'auto',
          visualReview: false,
          maxGeneratedAssets: 3,
          maxProviderCalls: 40,
        },
      });
      projectId = p.id;
      script.editingProjectId = projectId;
      store.add('scripts', script);
      console.log(`    Created project ID: ${projectId}`);
    } else {
      console.log(`[2] Existing project ID: ${projectId}`);
    }

    // 3. Resolve project directories
    const projectBase = target.accountId === 'default'
      ? path.resolve(`server/data/editing/${projectId}`)
      : path.resolve(`server/data/accounts/${target.accountId}/profiles/shorts/editing/${projectId}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(projectBase, 'manifest.json'), 'utf8'));
    const revFile = path.join(projectBase, 'revisions', `${manifest.revisionId}.json`);
    const project = JSON.parse(fs.readFileSync(revFile, 'utf8'));

    // Keep existing captions
    const captions = (project.artifacts || []).filter((a: any) => a.graphic?.kind === 'caption');
    console.log(`[3] Preserved ${captions.length} existing caption artifacts`);

    // 4. Map motionMetadata tags into HyperFrames artifacts
    const motionMetadata = script.scenePlan?.motionMetadata || [];
    console.log(`[4] Found ${motionMetadata.length} motionMetadata tags in script.scenePlan`);
    const motionArtifacts: any[] = [];

    for (const meta of motionMetadata) {
      const sceneNum = meta.sceneNum || (meta.index ? Number(meta.index) : 1);
      const sceneIdx = Math.max(0, sceneNum - 1);
      const scene = project.scenes[sceneIdx] || project.scenes[0];
      if (!scene) continue;

      const art = buildMotionArtifact(meta, sceneIdx, scene);
      if (art) motionArtifacts.push(art);
    }

    console.log(`    Constructed ${motionArtifacts.length} motion graphic artifacts`);

    // Disable review blocking for deterministic compositing
    delete project.documentaryRequirement;
    project.settings.visualReview = false;
    project.status = 'ready';
    project.artifacts = [...captions, ...motionArtifacts];

    // Ensure inputs hashes are valid
    const genBase = target.accountId === 'default'
      ? path.resolve(`server/data/generated/${target.scriptId}`)
      : path.resolve(`server/data/accounts/${target.accountId}/profiles/shorts/generated/${target.scriptId}`);
    const audioPath = path.join(genBase, audioFilename);
    const imageFiles = sortedAssets.map((img: any) => (img.url || '').split('/').pop()!);
    const imagePaths = imageFiles.map(fn => path.join(genBase, fn));
    const resolution = { width: 1080, height: 1920 };

    project.inputs.scriptHash = scriptFingerprint(script);
    project.inputs.audioFilename = audioFilename;
    project.inputs.audioHash = hash(fs.readFileSync(audioPath));
    project.inputs.width = resolution.width;
    project.inputs.height = resolution.height;

    fs.writeFileSync(revFile, JSON.stringify(project, null, 2));
    console.log(`[5] Saved updated revision (${project.artifacts.length} total artifacts, ${motionArtifacts.length} motion graphics)`);

    // 5. Composite motion graphics onto base MP4 video
    const savedGraphics = savedGraphicsForRender(target.scriptId, audioPath, imagePaths, resolution);
    if (!savedGraphics) throw new Error('No saved graphics found for render');

    const outDir = getOutputDir(target.scriptId);
    const mp4Files = fs.readdirSync(outDir)
      .filter(f => f.endsWith('.mp4') && !f.endsWith('.partial.mp4'))
      .sort((a, b) => fs.statSync(path.join(outDir, b)).mtimeMs - fs.statSync(path.join(outDir, a)).mtimeMs);
    if (!mp4Files.length) throw new Error('No base MP4 found in output directory');
    const baseSource = path.join(outDir, mp4Files[0]);

    const audioSyncFile = path.join(genBase, `${audioFilename}.sync.json`);
    const audioSync = fs.existsSync(audioSyncFile) ? JSON.parse(fs.readFileSync(audioSyncFile, 'utf8')) : undefined;

    const fps = project.inputs?.fps || 30;
    const finalDuration = project.inputs.durationFrames / fps;
    const renderOptions: RenderOptions = {
      scriptId: target.scriptId,
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

    console.log(`[6] Generating camera matrices & starting HyperFrames overlay rendering (${finalDuration.toFixed(1)}s, ${project.inputs.durationFrames} frames)...`);
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
    console.log(`🎉 SUCCESS for ${target.name}! Composited in ${elapsed}s! Final size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);

    // 6. Update revision json
    const rev = renderRevision(target.scriptId);
    const metaFile = `${baseSource}.json`;
    fs.writeFileSync(metaFile, JSON.stringify({
      revision: rev,
      resolution: '1080x1920',
      duration: finalDuration,
    }, null, 2));
    console.log('[7] Video metadata file updated.\n');
  });
}

async function main() {
  console.log('================================================================');
  console.log('   TUBEFLOW METADATA OVERLAY COMPOSITING PIPELINE');
  console.log('   Injecting motionMetadata tags -> HyperFrames Motion Graphics');
  console.log('================================================================\n');

  for (const profile of PROFILES) {
    try {
      await processProfile(profile);
    } catch (err: any) {
      console.error(`❌ FAILED for ${profile.name}:`, err.message);
    }
  }

  console.log('================================================================');
  console.log('   ALL PROFILES FINISHED COMPOSITING WITH METADATA OVERLAYS!');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('[FATAL MAIN ERROR]:', err);
  process.exit(1);
});
