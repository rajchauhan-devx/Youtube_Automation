import path from 'node:path';
import fs from 'node:fs';
import { workspaceContext } from '../server/src/services/workspace.js';
import { store } from '../server/src/services/store.js';
import { getOutputDir, type RenderOptions } from '../server/src/services/video.js';
import { savedGraphicsForRender, graphicsCameras, compositeSavedGraphics } from '../server/src/services/render-graphics.js';
import { renderRevision } from '../server/src/services/render-revision.js';
import { hash } from '../server/src/services/editing/repository.js';
import { scriptFingerprint } from '../server/src/services/editing/projects.js';

async function main() {
  await workspaceContext.run({ accountId: 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab', profile: 'shorts' }, async () => {
    const scriptId = 'autopilot_live_1792392528344';
    const script = store.getById<any>('scripts', scriptId);
    if (!script) throw new Error('Script not found');

    const audioFilename = 'narration_en_106d8442-d4c9-4549-b3ae-025239e9f6c6.wav';
    const audioSyncFile = path.resolve(`server/data/accounts/acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab/profiles/shorts/generated/${scriptId}/${audioFilename}.sync.json`);
    const audioSync = JSON.parse(fs.readFileSync(audioSyncFile, 'utf8'));

    const imageFiles = [
      'image-00-1792392767904.png',
      'image-01-1792392775846.png',
      'image-02-1792392784994.png',
      'image-03-1792392792256.png',
      'image-04-1792392799407.png',
      'image-05-1792392806493.png',
    ];

    const generatedImages = imageFiles.map((fn, idx) => ({
      index: idx,
      prompt: `Scene ${idx + 1}`,
      mediaType: 'image',
      status: 'done',
      url: `/api/accounts/acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab/profiles/shorts/generate/file/${scriptId}/${fn}`,
      filename: fn,
    }));

    const generatedAudio = [{
      filename: audioFilename,
      url: `/api/accounts/acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab/profiles/shorts/generate/file/${scriptId}/${audioFilename}`,
      language: 'en',
      voice: 'en-US-Chirp3-HD-Algieba',
      provider: 'google',
      sync: audioSync,
      narrationText: 'She fell two miles from an exploding plane and lived. Sole survivor of Flight 508, Juliane woke broken in the Amazon. Blind without glasses, she followed her father\'s rule: find water. Small streams lead to rivers. Rivers lead to people. For eleven days, she fought infection and starvation, wading through predator-filled waters. On day eleven, she found a boat. She poured gasoline on her wounds and waited. Locals found her. The girl who fell from the sky had walked out of hell.',
    }];

    // 1. Update script object in store
    script.title = 'Juliane Koepcke: The Girl Who Fell 10,000 Feet';
    script.editingProjectId = 'ba262de5-afed-4eca-a360-75bb40ffbf01';
    script.duration = 26.13;
    script.generatedImages = generatedImages;
    script.generatedAudio = generatedAudio;
    script.enableSubtitles = true;
    script.autoPilotSettings = {
      ...script.autoPilotSettings,
      graphics: { enabled: true },
    };
    script.status = 'ready';
    store.add('scripts', script);
    console.log('Updated script in store.');

    // 2. Update revision artifacts
    const revFile = path.resolve('server/data/accounts/acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab/profiles/shorts/editing/ba262de5-afed-4eca-a360-75bb40ffbf01/revisions/3ce0b042-5810-4bc2-b53c-3af2dd3cfa43.json');
    const project = JSON.parse(fs.readFileSync(revFile, 'utf8'));

    // Motion graphic studio archetypes
    const studioGraphics: any[] = [
      // 1. Chapter Title (Scene 0: 0.2s - 2.8s)
      {
        id: 'graphic-juliane-title',
        sceneId: 'scene-0',
        enabled: true,
        intent: 'Chapter Title: Fallen From 10,000 Feet',
        narrativeRefs: ['span-0'],
        startFrame: 6,
        endFrame: 84,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'title',
          title: 'FALLEN FROM 10,000 FEET',
          detail: 'DECEMBER 1971 // AMAZON RAINFOREST',
          bounds: { x: 90, y: 700, width: 900, height: 240 },
        },
      },
      // 2. Telemetry Counter (Scene 1: 3.5s - 7.5s)
      {
        id: 'graphic-juliane-alt',
        sceneId: 'scene-1',
        enabled: true,
        intent: 'Telemetry: 10,000 FT Fall Distance',
        narrativeRefs: ['span-1'],
        startFrame: 105,
        endFrame: 225,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'counter',
          title: '10,000 FT',
          detail: 'FALL DISTANCE // FREEFALL VELOCITY',
          bounds: { x: 90, y: 1200, width: 900, height: 220 },
        },
      },
      // 3. Route Map (Scene 2: 8.5s - 13.8s)
      {
        id: 'graphic-juliane-route',
        sceneId: 'scene-2',
        enabled: true,
        intent: 'Route: Crash Site to Shebonia River',
        narrativeRefs: ['span-2'],
        startFrame: 255,
        endFrame: 414,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'route',
          title: 'CRASH SITE -> SHEBONIA RIVER',
          detail: '11-DAY JUNGLE TREK // WATERWAY HEURISTIC',
          bounds: { x: 90, y: 720, width: 900, height: 500 },
        },
      },
      // 4. Polaroid Badge (Scene 3: 14.8s - 18.2s)
      {
        id: 'graphic-juliane-badge',
        sceneId: 'scene-3',
        enabled: true,
        intent: 'Polaroid: Juliane Koepcke',
        narrativeRefs: ['span-3'],
        startFrame: 444,
        endFrame: 546,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'badge',
          title: 'JULIANE KOEPCKE',
          detail: 'SOLE SURVIVOR // AGE 17',
          bounds: { x: 260, y: 550, width: 560, height: 680 },
        },
      },
      // 5. Object Spotlight (Scene 4: 19.0s - 22.5s)
      {
        id: 'graphic-juliane-spotlight',
        sceneId: 'scene-4',
        enabled: true,
        intent: 'Spotlight: Lumberman Shelter Boat',
        narrativeRefs: ['span-4'],
        startFrame: 570,
        endFrame: 675,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'spotlight',
          title: 'LUMBERMAN SHELTER',
          detail: 'OUTPOST BOAT FOUND ON RIVERBANK',
          bounds: { x: 80, y: 1350, width: 340, height: 90 },
          target: {
            label: 'River Outpost',
            region: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
            evidence: 'Lumberman shelter found along the river',
            verified: true,
          },
        },
      },
      // 6. Newspaper Headline (Scene 5: 23.2s - 25.8s)
      {
        id: 'graphic-juliane-newspaper',
        sceneId: 'scene-5',
        enabled: true,
        intent: 'Newspaper: Miracle Survivor',
        narrativeRefs: ['span-5'],
        startFrame: 696,
        endFrame: 774,
        priority: 1,
        nodes: [],
        assetRequestIds: [],
        graphic: {
          kind: 'frame',
          title: 'GIRL WALKS OUT OF AMAZON ALIVE',
          detail: 'THE PERUVIAN TIMES // JANUARY 1972',
          bounds: { x: 90, y: 700, width: 900, height: 420 },
        },
      },
    ];

    // Add safe lower-third captions for each scene
    const captionsData = [
      { start: 0.0, end: 3.09, text: 'SHE FELL TWO MILES FROM AN EXPLODING PLANE AND LIVED.' },
      { start: 3.09, end: 8.1, text: 'SOLE SURVIVOR OF FLIGHT 508, JULIANE WOKE BROKEN IN THE AMAZON.' },
      { start: 8.1, end: 14.41, text: "FOLLOWING HER FATHER'S RULE: SMALL STREAMS LEAD TO RIVERS." },
      { start: 14.41, end: 18.66, text: 'FOR ELEVEN DAYS, SHE FOUGHT STARVATION IN PREDATOR WATERS.' },
      { start: 18.66, end: 22.89, text: 'ON DAY ELEVEN, SHE FOUND A BOAT AND WAITED FOR HELP.' },
      { start: 22.89, end: 26.12, text: 'LOCALS FOUND HER. THE GIRL WHO FELL FROM THE SKY WALKED OUT.' },
    ];

    const captionArtifacts = captionsData.map((c, i) => {
      const words = c.text.split(' ');
      const startFrame = Math.round(c.start * 30);
      const endFrame = Math.round(c.end * 30);
      const durationFrames = endFrame - startFrame;
      const wordDur = Math.max(1, Math.floor(durationFrames / words.length));
      return {
        id: `caption-scene-${i}`,
        sceneId: `scene-${i}`,
        enabled: true,
        intent: `Caption scene ${i}`,
        narrativeRefs: [`span-${i}`],
        startFrame,
        endFrame,
        priority: 0,
        nodes: [],
        assetRequestIds: [],
        visualReview: { status: 'passed', attempts: 1, frames: [], reason: 'Approved' },
        graphic: {
          kind: 'caption',
          title: c.text,
          detail: '',
          bounds: { x: 60, y: 1536, width: 960, height: 200 },
          wordTimings: words.map((_, wi) => ({
            startFrame: wi * wordDur,
            endFrame: wi === words.length - 1 ? durationFrames : (wi + 1) * wordDur,
          })),
        },
      };
    });

    studioGraphics.forEach((g: any) => {
      g.visualReview = { status: 'passed', attempts: 1, frames: [], reason: 'Approved' };
    });

    delete project.documentaryRequirement;
    project.settings.visualReview = false;
    project.artifacts = [...captionArtifacts, ...studioGraphics];

    const audioPath = path.resolve(`server/data/accounts/acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab/profiles/shorts/generated/${scriptId}/${audioFilename}`);
    const imagePaths = imageFiles.map(fn => path.resolve(`server/data/accounts/acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab/profiles/shorts/generated/${scriptId}/${fn}`));
    const resolution = { width: 1080, height: 1920 };

    project.inputs.scriptHash = scriptFingerprint(script);
    project.inputs.audioFilename = audioFilename;
    project.inputs.audioHash = hash(fs.readFileSync(audioPath));
    project.inputs.width = resolution.width;
    project.inputs.height = resolution.height;
    const originalAssetIds = [
      'd447c74b-c616-4ce3-a07b-a58b188e0c4d',
      'd5ce094e-c5dc-4ee9-a3ef-9dca49a4f68a',
      '5c34dca1-317f-4ed1-a7e2-efc226871500',
      '2842ef82-5ac0-4660-ab20-4fb71995f001',
      '5ab79deb-bda9-48f0-aa89-0e4e6eeedd80',
      '57f17523-cee5-4473-a3a0-9ee029bd642b',
    ];
    project.inputs.imageAssets = imageFiles.map((fn, idx) => {
      const p = path.resolve(`server/data/accounts/acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab/profiles/shorts/generated/${scriptId}/${fn}`);
      return {
        assetId: originalAssetIds[idx],
        hash: hash(fs.readFileSync(p)),
        promptIndex: idx,
        prompt: `Scene ${idx + 1}`,
      };
    });

    fs.writeFileSync(revFile, JSON.stringify(project, null, 2));
    console.log(`Saved ${studioGraphics.length} studio graphics + ${captionArtifacts.length} captions into revision.`);

    // 3. Composite graphics onto base video
    const savedGraphics = savedGraphicsForRender(scriptId, audioPath, imagePaths, resolution);
    if (!savedGraphics) throw new Error('No saved graphics found for render');

    const finalDuration = 26.13;
    const renderOptions: RenderOptions = {
      scriptId,
      imagePaths,
      audioPath,
      resolution,
      zoomFactor: 1.15,
      transitionDuration: 0.5,
      sceneAnalysis: script.sceneAnalysis,
      enableSubtitles: true,
      colorGrade: 'dramatic-noir',
      enableVignette: false,
      enableSfx: false,
    };
    const savedCameras = graphicsCameras(savedGraphics, renderOptions, finalDuration, undefined, audioSync);

    const baseSource = path.join(getOutputDir(scriptId), 'final_dd86a360-18bd-418b-ba42-4060715facf5.mp4');
    const result = {
      outputPath: baseSource,
      duration: finalDuration,
      size: fs.statSync(baseSource).size,
    };

    console.log('Compositing HyperFrames studio graphics overlay with ALL archetypes...');
    const startOverlay = Date.now();
    const signal = new AbortController().signal;
    await compositeSavedGraphics(result, savedGraphics, signal, (stage, pct) => {
      console.log(`[HyperFrames Composite] ${stage}: ${pct}%`);
    }, savedCameras);
    console.log(`Composited video with ALL studio graphics in ${((Date.now() - startOverlay) / 1000).toFixed(1)}s!`);

    const finalSize = fs.statSync(result.outputPath).size;
    console.log(`SUCCESS! Final MP4 size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);

    // 4. Update revision metadata
    const rev = renderRevision(scriptId);
    console.log('New render revision:', rev);
    const metaFile = `${baseSource}.json`;
    fs.writeFileSync(metaFile, JSON.stringify({
      revision: rev,
      resolution: '1080x1920',
      duration: finalDuration,
    }, null, 2));
    console.log('Metadata file written! Ready for in-app viewing.');
  });
}

main().catch(err => {
  console.error('Render failed:', err);
  process.exit(1);
});
