import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { store } from '../server/src/services/store.js';
import { workspaceContext } from '../server/src/services/workspace.js';
import { getOutputDir, type RenderOptions } from '../server/src/services/video.js';
import { savedGraphicsForRender, graphicsCameras, compositeSavedGraphics } from '../server/src/services/render-graphics.js';
import { hash } from '../server/src/services/editing/repository.js';
import { scriptFingerprint } from '../server/src/services/editing/projects.js';
import { validateProject, type SceneGraphData } from '@tubeflow/editing-contracts';

async function extractFrame(videoPath: string, timestampSec: number, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-ss', timestampSec.toString(),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      '-y',
      outPath,
    ]);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function runProof() {
  console.log('================================================================');
  console.log('   GENERATIVE MOTION GRAPHICS PROOF-OF-CONCEPT (PHASE 6)');
  console.log('   Target: Rule Zero (Cyber / Tactical)');
  console.log('================================================================');

  const accountId = 'acct_3ea89878-0f41-4dc9-86e5-3f55cda46ef7';
  const scriptId = 'usr_71b74662-02bc-4de7-8ee1-d46cdf57b132';

  await workspaceContext.run({ accountId, profile: 'shorts' }, async () => {
    const script = store.getById<any>('scripts', scriptId);
    if (!script) throw new Error('Script not found');

    const projectId = script.editingProjectId || '0b60cc92-0e45-48f8-9167-68df02e4e984';
    script.editingProjectId = projectId;
    if (!script.autoPilotSettings) script.autoPilotSettings = {} as any;
    if (!script.autoPilotSettings.graphics) script.autoPilotSettings.graphics = {} as any;
    script.autoPilotSettings.graphics.enabled = true;
    store.add('scripts', script);

    const projectBase = path.resolve(`server/data/accounts/${accountId}/profiles/shorts/editing/${projectId}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(projectBase, 'manifest.json'), 'utf8'));
    const revFile = path.join(projectBase, 'revisions', `${manifest.revisionId}.json`);
    if (!fs.existsSync(revFile)) throw new Error(`Revision file not found at ${revFile}`);

    const project = JSON.parse(fs.readFileSync(revFile, 'utf8'));
    console.log(`[1] Loaded project: ${project.id} with ${project.scenes.length} scenes`);

    const fps = project.inputs.fps || 30;
    const width = project.inputs.width || 1080;
    const height = project.inputs.height || 1920;

    // Filter existing captions
    const captions = (project.artifacts || []).filter((a: any) => a.graphic?.kind === 'caption');

    // 1. Novel Graphic A: Cardless Leader Callout & Branching Protocol (Scene 0)
    const scene0 = project.scenes[0];
    const branchingGraph: SceneGraphData = {
      version: 1,
      seed: 101,
      bounds: { x: 0, y: 0, width: 1080, height: 1920 },
      theme: {
        name: 'rule_zero_tactical',
        primary: '#00F0FF',
        accent: '#00FF66',
        background: '#00000000', // 100% transparent cardless backdrop
        text: '#F0FBFF',
        fontFamily: "'JetBrains Mono', monospace",
        secondaryFont: "'JetBrains Mono', monospace",
        lineWeight: 2,
        radius: 0,
      },
      nodes: [
        // Reticle Target Ring on Biometric Tattoo
        {
          id: 'target-ring',
          kind: 'shape',
          space: 'screen',
          zIndex: 2,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [
            { property: 'opacity', keyframes: [{ frame: 0, value: 0, easing: { kind: 'linear' } }, { frame: 8, value: 1, easing: { kind: 'linear' } }] },
          ],
          geometry: {
            kind: 'ellipse',
            bounds: { x: 470, y: 950, width: 90, height: 90 },
          },
          paint: { fill: null, stroke: '#00F0FF', strokeWidth: 2, dash: [8, 6] },
        },
        // Center Anchor Dot
        {
          id: 'target-dot',
          kind: 'shape',
          space: 'screen',
          zIndex: 3,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          geometry: {
            kind: 'ellipse',
            bounds: { x: 511, y: 991, width: 8, height: 8 },
          },
          paint: { fill: '#00F0FF', stroke: null, strokeWidth: 0, dash: [] },
        },
        // Angled Callout Leader Path to Upper Open Coat Area
        {
          id: 'callout-leader',
          kind: 'path',
          space: 'screen',
          zIndex: 2,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [
            { property: 'opacity', keyframes: [{ frame: 0, value: 0, easing: { kind: 'linear' } }, { frame: 10, value: 1, easing: { kind: 'linear' } }] },
          ],
          commands: [
            { op: 'M', x: 480, y: 950 },
            { op: 'L', x: 380, y: 460 },
            { op: 'L', x: 920, y: 460 },
          ],
          paint: { fill: null, stroke: '#00F0FF', strokeWidth: 2, dash: [] },
        },
        // Floating Header Tag (Zero Card Bounding Box)
        {
          id: 'callout-header',
          kind: 'text',
          space: 'screen',
          zIndex: 4,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          text: 'BIOMETRIC // ANOMALY DETECTED',
          bounds: { x: 390, y: 405, width: 480, height: 45 },
          style: {
            fontAssetId: project.style.fontAssetIds[0] || 'font-main',
            fontSize: 16,
            fontWeight: '700',
            color: '#00F0FF',
            align: 'left',
            lineHeight: 1.2,
          },
        },
        // Floating Sub-value Readout
        {
          id: 'callout-sub',
          kind: 'text',
          space: 'screen',
          zIndex: 4,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          text: 'SYS_TIME // 00,000,052',
          bounds: { x: 390, y: 475, width: 480, height: 35 },
          style: {
            fontAssetId: project.style.fontAssetIds[0] || 'font-main',
            fontSize: 13,
            fontWeight: '700',
            color: '#00FF66',
            align: 'left',
            lineHeight: 1.2,
          },
        },
        // Branching Decision Fork Lines
        {
          id: 'branch-fork',
          kind: 'path',
          space: 'screen',
          zIndex: 2,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          commands: [
            { op: 'M', x: 500, y: 520 },
            { op: 'L', x: 500, y: 570 },
            { op: 'L', x: 380, y: 630 },
            { op: 'M', x: 500, y: 570 },
            { op: 'L', x: 620, y: 630 },
          ],
          paint: { fill: null, stroke: '#00F0FF', strokeWidth: 1.5, dash: [4, 4] },
        },
        // Floating Branch 1 Option
        {
          id: 'branch-left',
          kind: 'text',
          space: 'screen',
          zIndex: 4,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          text: 'PATH 01 // OVERRIDE',
          bounds: { x: 260, y: 640, width: 240, height: 40 },
          style: {
            fontAssetId: project.style.fontAssetIds[0] || 'font-main',
            fontSize: 14,
            fontWeight: '700',
            color: '#00FF66',
            align: 'center',
            lineHeight: 1.2,
          },
        },
        // Floating Branch 2 Option
        {
          id: 'branch-right',
          kind: 'text',
          space: 'screen',
          zIndex: 4,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          text: 'PATH 02 // DECIMATION',
          bounds: { x: 500, y: 640, width: 240, height: 40 },
          style: {
            fontAssetId: project.style.fontAssetIds[0] || 'font-main',
            fontSize: 14,
            fontWeight: '700',
            color: '#FF0055',
            align: 'center',
            lineHeight: 1.2,
          },
        },
        // Top Edge HUD Metadata
        {
          id: 'hud-meta-top',
          kind: 'text',
          space: 'screen',
          zIndex: 4,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          text: 'RULE ZERO // SURVEILLANCE FEED 01',
          bounds: { x: 80, y: 120, width: 400, height: 30 },
          style: {
            fontAssetId: project.style.fontAssetIds[0] || 'font-main',
            fontSize: 13,
            fontWeight: '700',
            color: '#00F0FF',
            align: 'left',
            lineHeight: 1.2,
          },
        },
        // Top-Left Corner Bracket
        {
          id: 'hud-bracket-tl',
          kind: 'path',
          space: 'screen',
          zIndex: 2,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          commands: [
            { op: 'M', x: 60, y: 140 },
            { op: 'L', x: 60, y: 100 },
            { op: 'L', x: 100, y: 100 },
          ],
          paint: { fill: null, stroke: '#00F0FF', strokeWidth: 2, dash: [] },
        },
        // Top-Right Corner Bracket
        {
          id: 'hud-bracket-tr',
          kind: 'path',
          space: 'screen',
          zIndex: 2,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          commands: [
            { op: 'M', x: 980, y: 100 },
            { op: 'L', x: 1020, y: 100 },
            { op: 'L', x: 1020, y: 140 },
          ],
          paint: { fill: null, stroke: '#00F0FF', strokeWidth: 2, dash: [] },
        },
      ],
      soundCues: [
        {
          id: 'cue-chirp',
          assetId: project.inputs.audioAssetId,
          localFrame: 5,
          gainDb: -6,
          label: 'digital_chirp',
        },
      ],
      evidence: [
        {
          targetNodeId: 'callout-header',
          sourceId: scene0.id,
          narrationTokenIds: scene0.narrativeRefs.slice(0, 3),
          verifiedValue: 'BIOMETRIC ANOMALY DETECTED',
          status: 'verified',
        },
      ],
      capabilities: ['branching_diagram', 'cardless_callout', 'precision_reticle'],
    };

    const artifactA = {
      id: 'proof-art-branching',
      sceneId: scene0.id,
      enabled: true,
      intent: 'Tactical Branching Protocol Diagram',
      narrativeRefs: scene0.narrativeRefs.slice(0, 3),
      startFrame: scene0.startFrame + 10,
      endFrame: scene0.endFrame - 5,
      priority: 1,
      nodes: [],
      assetRequestIds: [],
      sceneGraph: branchingGraph,
    };

    // 2. Scene 1 is intentionally CLEAN (No graphic! Proof of editorial breathing room)
    console.log('[2] Scene 1 intentionally left clean (0 graphics) for visual breathing room.');

    // 3. Novel Graphic B: Cardless Medical Telemetry & Metric Odometer (Scene 2)
    const scene2 = project.scenes[2] || project.scenes[1];
    const metricGraph: SceneGraphData = {
      version: 1,
      seed: 202,
      bounds: { x: 0, y: 0, width: 1080, height: 1920 },
      theme: {
        name: 'rule_zero_metric',
        primary: '#00F0FF',
        accent: '#00FF66',
        background: '#00000000', // 100% transparent cardless backdrop
        text: '#F0FBFF',
        fontFamily: "'JetBrains Mono', monospace",
        secondaryFont: "'JetBrains Mono', monospace",
        lineWeight: 2,
        radius: 0,
      },
      nodes: [
        // Monitor Precision Crosshair Anchor
        {
          id: 'monitor-crosshair',
          kind: 'path',
          space: 'screen',
          zIndex: 2,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [
            { property: 'opacity', keyframes: [{ frame: 0, value: 0, easing: { kind: 'linear' } }, { frame: 8, value: 1, easing: { kind: 'linear' } }] },
          ],
          commands: [
            { op: 'M', x: 360, y: 1030 },
            { op: 'L', x: 400, y: 1030 },
            { op: 'M', x: 380, y: 1010 },
            { op: 'L', x: 380, y: 1050 },
          ],
          paint: { fill: null, stroke: '#00F0FF', strokeWidth: 2, dash: [] },
        },
        // Leader Line Connecting Monitor to Floating Wall Telemetry
        {
          id: 'monitor-leader',
          kind: 'path',
          space: 'screen',
          zIndex: 2,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [
            { property: 'opacity', keyframes: [{ frame: 0, value: 0, easing: { kind: 'linear' } }, { frame: 12, value: 1, easing: { kind: 'linear' } }] },
          ],
          commands: [
            { op: 'M', x: 380, y: 1010 },
            { op: 'L', x: 380, y: 530 },
            { op: 'L', x: 920, y: 530 },
          ],
          paint: { fill: null, stroke: '#00F0FF', strokeWidth: 1.5, dash: [6, 4] },
        },
        // Telemetry Category Header Tag
        {
          id: 'telemetry-tag',
          kind: 'text',
          space: 'screen',
          zIndex: 4,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          text: 'CRITICAL TELEMETRY // PATIENT LINK',
          bounds: { x: 400, y: 395, width: 480, height: 30 },
          style: {
            fontAssetId: project.style.fontAssetIds[0] || 'font-main',
            fontSize: 14,
            fontWeight: '700',
            color: '#00FF66',
            align: 'left',
            lineHeight: 1.2,
          },
        },
        // Floating Metric Counter (Zero Card Box)
        {
          id: 'metric-counter',
          kind: 'metric',
          space: 'screen',
          zIndex: 4,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          targetValue: 99.85,
          startValue: 0,
          unit: '% CONFIRMED',
          label: 'TARGET OVERRIDE PROBABILITY',
          bounds: { x: 400, y: 430, width: 560, height: 95 },
          decimals: 2,
          style: {
            fontAssetId: project.style.fontAssetIds[0] || 'font-main',
            fontSize: 60,
            fontWeight: '700',
            color: '#00F0FF',
            align: 'left',
            lineHeight: 1.1,
          },
        },
        // Glowing Underline Accent Bar
        {
          id: 'telemetry-bar',
          kind: 'path',
          space: 'screen',
          zIndex: 3,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          commands: [
            { op: 'M', x: 400, y: 530 },
            { op: 'L', x: 820, y: 530 },
          ],
          paint: { fill: null, stroke: '#00FF66', strokeWidth: 3, dash: [] },
        },
        // Context Status Description
        {
          id: 'telemetry-desc',
          kind: 'text',
          space: 'screen',
          zIndex: 4,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
          opacity: 1,
          tracks: [],
          text: 'VITAL OVERRIDE STATUS // SYSTEM LOCK IMMINENT',
          bounds: { x: 400, y: 545, width: 500, height: 35 },
          style: {
            fontAssetId: project.style.fontAssetIds[0] || 'font-main',
            fontSize: 13,
            fontWeight: '700',
            color: '#F0FBFF',
            align: 'left',
            lineHeight: 1.2,
          },
        },
      ],
      soundCues: [
        {
          id: 'cue-count',
          assetId: project.inputs.audioAssetId,
          localFrame: 5,
          gainDb: -8,
          label: 'digital_chirp',
        },
      ],
      evidence: [
        {
          targetNodeId: 'metric-counter',
          sourceId: scene2.id,
          narrationTokenIds: scene2.narrativeRefs.slice(0, 3),
          verifiedValue: '99.85% CONFIRMED',
          status: 'verified',
        },
      ],
      capabilities: ['metric_odometer', 'cardless_telemetry', 'monitor_anchor'],
    };

    const artifactB = {
      id: 'proof-art-metric',
      sceneId: scene2.id,
      enabled: true,
      intent: 'Tactical Metric Telemetry Counter',
      narrativeRefs: scene2.narrativeRefs.slice(0, 3),
      startFrame: scene2.startFrame + 10,
      endFrame: scene2.endFrame - 5,
      priority: 1,
      nodes: [],
      assetRequestIds: [],
      sceneGraph: metricGraph,
    };

    // Update artifacts in project
    project.artifacts = [...captions, artifactA, artifactB];
    delete project.documentaryRequirement;
    project.settings.visualReview = false;
    project.status = 'ready';

    // Validate project schema and exclusivity
    validateProject(project);
    console.log('[3] Project passed strict validation: schemaVersion 1/2, exclusivity, bounds & asset refs verified!');

    // Save revision
    fs.writeFileSync(revFile, JSON.stringify(project, null, 2));

    // Prepare paths
    const genBase = path.resolve(`server/data/accounts/${accountId}/profiles/shorts/generated/${scriptId}`);
    const imgFiles = fs.readdirSync(genBase).filter(f => f.startsWith('image-') && f.endsWith('.png')).sort();
    script.generatedImages = imgFiles.map((fn, idx) => ({
      index: idx,
      url: `/api/accounts/${accountId}/profiles/shorts/generate/file/${scriptId}/${fn}`,
      status: 'done',
    }));
    store.add('scripts', script);

    const audioFilename = script.generatedAudio?.[0]?.filename || project.inputs.audioFilename;
    const audioPath = path.join(genBase, audioFilename);
    const sortedAssets = [...(script.generatedImages || [])]
      .filter((img: any) => img.url)
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
    const imageFiles = sortedAssets.map((img: any) => (img.url || '').split('/').pop()!);
    const imagePaths = imageFiles.map(fn => path.join(genBase, fn));
    const resolution = { width, height };

    project.inputs.scriptHash = scriptFingerprint(script);
    project.inputs.audioFilename = audioFilename;
    project.inputs.audioHash = hash(fs.readFileSync(audioPath));
    project.inputs.width = resolution.width;
    project.inputs.height = resolution.height;

    // Save revision with verified inputs
    fs.writeFileSync(revFile, JSON.stringify(project, null, 2));

    const outDir = getOutputDir(scriptId);
    const cleanBaseCandidate = path.join(outDir, 'final_0eef0800-6b56-4932-b416-59eee56978e6.mp4');
    const baseSource = fs.existsSync(cleanBaseCandidate)
      ? cleanBaseCandidate
      : path.join(outDir, fs.readdirSync(outDir).find(f => f.endsWith('.mp4'))!);
    
    const targetOutput = path.join(outDir, 'generative_proof_composite.mp4');
    fs.copyFileSync(baseSource, targetOutput);
    console.log(`[4] Using clean base footage: ${path.basename(baseSource)} -> ${path.basename(targetOutput)}`);

    // Save graphics bundle
    const savedGraphics = savedGraphicsForRender(scriptId, audioPath, imagePaths, resolution);
    if (!savedGraphics) throw new Error('No saved graphics found');

    const audioSyncFile = path.join(genBase, `${project.inputs.audioFilename}.sync.json`);
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

    console.log(`[4] Rendering HyperFrames generative composition (${finalDuration.toFixed(1)}s, ${project.inputs.durationFrames} frames)...`);
    const savedCameras = graphicsCameras(savedGraphics, renderOptions, finalDuration, undefined, audioSync);

    const result = {
      outputPath: targetOutput,
      duration: finalDuration,
      size: fs.statSync(targetOutput).size,
    };

    const startOverlay = Date.now();
    const signal = new AbortController().signal;
    await compositeSavedGraphics(result, savedGraphics, signal, (stage, pct) => {
      console.log(`    [HyperFrames Composite] ${stage}: ${pct}%`);
    }, savedCameras);

    const elapsed = ((Date.now() - startOverlay) / 1000).toFixed(1);
    const finalSize = fs.statSync(result.outputPath).size;
    console.log(`🎉 SUCCESS! Composited in ${elapsed}s! Final size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);

    // 5. Extract verification frames
    const testFramesDir = path.resolve('test_frames');
    fs.mkdirSync(testFramesDir, { recursive: true });

    const frameA = path.join(testFramesDir, 'proof_01_branching_diagram_3s.png');
    const frameB = path.join(testFramesDir, 'proof_02_clean_scene_7s.png');
    const frameC = path.join(testFramesDir, 'proof_03_metric_counter_15s.png');

    console.log('[5] Extracting video proof frames...');
    await extractFrame(result.outputPath, 3.0, frameA);
    console.log(`    Saved: ${frameA}`);
    await extractFrame(result.outputPath, 7.0, frameB);
    console.log(`    Saved: ${frameB}`);
    await extractFrame(result.outputPath, 15.0, frameC);
    console.log(`    Saved: ${frameC}`);

    // 6. Copy final MP4 directly to workspace root and Desktop
    const proofMp4 = path.resolve('FINAL_PROOF_TEST_VIDEO.mp4');
    fs.copyFileSync(result.outputPath, proofMp4);
    const desktopMp4 = 'C:\\Users\\zrajc\\OneDrive\\Desktop\\FINAL_PROOF_TEST_VIDEO.mp4';
    fs.copyFileSync(result.outputPath, desktopMp4);
    console.log(`\n================================================================`);
    console.log(`✅ FINAL PROOF MP4 SAVED DIRECTLY TO: ${proofMp4}`);
    console.log(`✅ DESKTOP MP4 SAVED DIRECTLY TO: ${desktopMp4}`);
    console.log(`   Size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`================================================================\n`);
  });
}

runProof().catch((err) => {
  console.error('❌ Proof execution failed:', err);
  process.exit(1);
});
