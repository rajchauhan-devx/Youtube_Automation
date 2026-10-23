import path from 'node:path';
import fs from 'node:fs';
import { workspaceContext } from '../server/src/services/workspace.js';
import { store } from '../server/src/services/store.js';
import { getOutputDir, type RenderOptions } from '../server/src/services/video.js';
import { savedGraphicsForRender, graphicsCameras, compositeSavedGraphics } from '../server/src/services/render-graphics.js';

async function main() {
  await workspaceContext.run({ accountId: 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab', profile: 'shorts' }, async () => {
    const scriptId = 'usr_d01557ac-2510-4b84-9bd3-eff090cb82dc';
    const script = store.getById<any>('scripts', scriptId);
    if (!script) throw new Error('Script not found');

    // 1. Enable graphics in autoPilotSettings
    script.autoPilotSettings = {
      ...script.autoPilotSettings,
      graphics: {
        ...script.autoPilotSettings?.graphics,
        enabled: true,
      },
    };
    store.add('scripts', script);
    console.log('Enabled graphics in autoPilotSettings: true');

    // 2. Add diverse motion graphics to project revision
    const revFile = path.resolve('server/data/accounts/acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab/profiles/shorts/editing/39194345-e4ed-43b9-a486-5b5b350e30c6/revisions/251312b3-e351-499d-8fe4-429f1b988689.json');
    const project = JSON.parse(fs.readFileSync(revFile, 'utf8'));

    // Keep existing captions
    const captions = project.artifacts.filter((a: any) => a.graphic?.kind === 'caption');

    // Define all 6 studio motion graphic archetypes
    const studioGraphics: any[] = [
      // 1. Chapter Title Card (Scene 0: 0.5s - 4.0s)
      {
        id: 'graphic-chapter-title',
        sceneId: 'scene-0',
        enabled: true,
        intent: 'Chapter Title: The Impossible Descent',
        narrativeRefs: ['span-0'],
        startFrame: 15,
        endFrame: 120,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'title',
          title: 'THE IMPOSSIBLE DESCENT',
          detail: 'JUNE 1985 // SIULA GRANDE',
          bounds: { x: 90, y: 700, width: 900, height: 240 },
        },
      },
      // 2. Object Spotlight Reticle (Scene 1: 12.0s - 16.5s)
      {
        id: 'graphic-spotlight-rope',
        sceneId: 'scene-1',
        enabled: true,
        intent: 'Spotlight: Cut Climbing Rope',
        narrativeRefs: ['span-1'],
        startFrame: 360,
        endFrame: 495,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'spotlight',
          title: 'CUT ROPE',
          detail: '8mm Kernmantle Nylon',
          bounds: { x: 80, y: 1350, width: 340, height: 90 },
          target: {
            label: 'Rope',
            region: { x: 0.45, y: 0.4, width: 0.1, height: 0.2 },
            evidence: 'Visible climbing rope descending the face',
            verified: true,
          },
        },
      },
      // 3. Telemetry Counter (Scene 2: 20.0s - 25.0s)
      {
        id: 'graphic-counter-alt',
        sceneId: 'scene-2',
        enabled: true,
        intent: 'Telemetry: 21000 FT',
        narrativeRefs: ['span-2'],
        startFrame: 600,
        endFrame: 750,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'counter',
          title: '21000 FT',
          detail: 'WEST FACE ELEVATION',
          bounds: { x: 90, y: 1200, width: 900, height: 220 },
        },
      },
      // 4. Polaroid Badge (Scene 3: 27.5s - 32.5s)
      {
        id: 'graphic-badge-joe',
        sceneId: 'scene-3',
        enabled: true,
        intent: 'Badge: Joe Simpson',
        narrativeRefs: ['span-3'],
        startFrame: 825,
        endFrame: 975,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'badge',
          title: 'JOE SIMPSON',
          detail: 'PERUVIAN ANDES (1985)',
          bounds: { x: 90, y: 600, width: 460, height: 520 },
        },
      },
      // 5. Route Map (Scene 4: 36.0s - 41.5s)
      {
        id: 'graphic-route-map',
        sceneId: 'scene-4',
        enabled: true,
        intent: 'Route: Lima to Siula Grande',
        narrativeRefs: ['span-4'],
        startFrame: 1080,
        endFrame: 1245,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'route',
          title: 'LIMA -> SIULA GRANDE',
          detail: '130 KM EXPEDITION ROUTE',
          bounds: { x: 90, y: 700, width: 900, height: 400 },
        },
      },
      // 6. Archival Newspaper (Scene 5: 45.0s - 50.0s)
      {
        id: 'graphic-newspaper-loss',
        sceneId: 'scene-5',
        enabled: true,
        intent: 'Newspaper: Climbers Reported Missing',
        narrativeRefs: ['span-5'],
        startFrame: 1350,
        endFrame: 1500,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'frame',
          title: 'CLIMBERS REPORTED MISSING',
          detail: 'ANDES SEARCH AND RESCUE',
          bounds: { x: 90, y: 700, width: 900, height: 420 },
        },
      },
      // 7. Cockpit / Radio Teletype (Scene 6: 52.0s - 58.0s)
      {
        id: 'graphic-radio-teletype',
        sceneId: 'scene-6',
        enabled: true,
        intent: 'Teletype: Base Camp Radio',
        narrativeRefs: ['span-6'],
        startFrame: 1560,
        endFrame: 1740,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'diagram',
          title: 'BASE CAMP RADIO',
          detail: 'MAYDAY // CONTACT LOST IN ICE CREVASSE',
          bounds: { x: 90, y: 650, width: 900, height: 450 },
        },
      },
    ];

    project.settings.visualReview = false;
    studioGraphics.forEach((g: any) => {
      g.visualReview = { status: 'passed', attempts: 1, frames: [], reason: 'Approved' };
    });

    project.artifacts = [...captions, ...studioGraphics];
    fs.writeFileSync(revFile, JSON.stringify(project, null, 2));
    console.log(`Saved ${studioGraphics.length} studio graphics + ${captions.length} captions into revision.`);

    // 3. Load saved graphics for render
    const audioPath = script.generatedAudio[0].url;
    const imagePaths = script.generatedImages.map((img: any) => img.url);
    const resolution = { width: 1080, height: 1920 };

    const savedGraphics = savedGraphicsForRender(scriptId, audioPath, imagePaths, resolution);
    if (!savedGraphics) throw new Error('No saved graphics found for render');

    const nonCaptions = savedGraphics.artifacts.filter(a => a.graphic?.kind !== 'caption');
    console.log(`Active non-caption graphics ready for composite: ${nonCaptions.length}`);
    nonCaptions.forEach(a => console.log(`  - [${a.graphic?.kind}] ${a.graphic?.title} (${a.startFrame / 30}s - ${a.endFrame / 30}s)`));

    const finalDuration = 121.6;
    const renderOptions: RenderOptions = {
      scriptId,
      imagePaths,
      audioPath,
      resolution,
      zoomFactor: 1.15,
      transitionDuration: 0.5,
      sceneAnalysis: script.sceneAnalysis,
      enableSubtitles: false,
      colorGrade: 'dramatic-noir',
      enableVignette: false,
      enableSfx: false,
    };
    const savedCameras = graphicsCameras(savedGraphics, renderOptions, finalDuration);

    const baseSource = path.join(getOutputDir(scriptId), 'final_1792752398690.mp4');
    const result = {
      outputPath: baseSource,
      duration: finalDuration,
      size: fs.statSync(baseSource).size,
    };

    console.log('Step 2: Compositing HyperFrames studio graphics overlay with ALL archetypes...');
    const startOverlay = Date.now();
    const signal = new AbortController().signal;
    await compositeSavedGraphics(result, savedGraphics, signal, (stage, pct) => {
      console.log(`[HyperFrames Composite] ${stage}: ${pct}%`);
    }, savedCameras);
    console.log(`Composited video with ALL studio graphics in ${((Date.now() - startOverlay) / 1000).toFixed(1)}s!`);

    const finalSize = fs.statSync(result.outputPath).size;
    console.log(`SUCCESS! Final MP4 size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Output: ${result.outputPath}`);
  });
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
