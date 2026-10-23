import fs from 'node:fs';
import path from 'node:path';
import type { EditingProject } from '@tubeflow/editing-contracts';
import {
  renderKineticCaption,
  renderNewspaperHeadline,
  renderTelemetryCounter,
  renderRouteMap,
  renderPolaroidBadge,
  renderCockpitTeletype,
  renderCinematicTitle,
  renderSpotlight,
  type GraphicTheme,
  DEFAULT_THEME,
} from './hyperframes-templates.js';
import {
  targetOnScreen,
  legacySourceMatrix,
  compileSceneGraph,
  type LegacyCamera,
} from '@tubeflow/video-composition';
import { assetRecord, assetFile } from './repository.js';

export interface HyperFramesBuildOptions {
  project: EditingProject;
  outputDir: string;
  theme?: GraphicTheme;
  legacyCameras?: Record<string, LegacyCamera>;
}

/**
 * Builds a complete HyperFrames composition directory (index.html + hyperframes.json)
 * from an EditingProject's artifacts and timeline.
 */
export function buildHyperFramesComposition(opts: HyperFramesBuildOptions): string {
  const { project, outputDir } = opts;
  const theme = opts.theme || DEFAULT_THEME;
  const fps = project.inputs.fps || 30;
  const width = project.inputs.width || 1080;
  const height = project.inputs.height || 1920;
  const durationSec = project.inputs.durationFrames / fps;

  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Write hyperframes.json configuration
  const hyperframesConfig = {
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
    registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
    paths: {
      blocks: 'compositions',
      components: 'compositions/components',
      assets: 'assets',
    },
    media: {
      autoProxy: true,
    },
  };
  fs.writeFileSync(
    path.join(outputDir, 'hyperframes.json'),
    JSON.stringify(hyperframesConfig, null, 2),
    'utf-8'
  );

  // 2. Collect HTML, CSS, and JS from all enabled artifacts
  const htmlParts: string[] = [];
  const cssParts: string[] = [];
  const jsParts: string[] = [];

  const enabledArtifacts = (project.artifacts || [])
    .filter((a) => a.enabled && (a.graphic || a.sceneGraph))
    .sort((a, b) => a.startFrame - b.startFrame);

  for (const artifact of enabledArtifacts) {
    const startSec = artifact.startFrame / fps;
    const endSec = artifact.endFrame / fps;
    const duration = Math.max(0.5, endSec - startSec);

    // Dynamic Generative Scene Graph path (Zero-Shot / No Templates)
    if (artifact.sceneGraph) {
      const res = compileSceneGraph(artifact.sceneGraph, {
        artifactId: artifact.id,
        startSec,
        durationSec: duration,
        fps,
        projectWidth: width,
        projectHeight: height,
      });
      htmlParts.push(res.html);
      cssParts.push(res.css);
      jsParts.push(res.js);
      continue;
    }

    const g = artifact.graphic!;

    if (g.kind === 'caption') {
      // Kinetic Punch Subtitle
      const words = g.title.split(/\s+/).filter(Boolean);
      const timings = g.wordTimings || [];
      const wordItems = words.map((word, idx) => {
        const wt = timings[idx];
        const wStart = wt ? startSec + wt.startFrame / fps : startSec + (idx * duration) / words.length;
        const wEnd = wt ? startSec + wt.endFrame / fps : startSec + ((idx + 1) * duration) / words.length;
        return { text: word, start: wStart, end: wEnd };
      });

      const res = renderKineticCaption({
        id: artifact.id,
        words: wordItems,
        startSec,
        endSec,
        width,
        height,
        theme,
      });
      htmlParts.push(res.html);
      cssParts.push(res.css);
      jsParts.push(res.js);
    } else if (g.kind === 'counter') {
      // Mechanical Odometer / Telemetry Counter
      const numMatch = g.title.match(/[\d,.]+/);
      const targetVal = numMatch ? parseFloat(numMatch[0].replace(/,/g, '')) : 1000;
      const unit = g.title.replace(/[\d,.\s]+/g, '').trim() || 'UNITS';

      const res = renderTelemetryCounter({
        id: artifact.id,
        targetValue: targetVal,
        unit,
        label: g.detail || 'OFFICIAL RECORD',
        subLabel: g.detail ? g.title : undefined,
        startSec,
        durationSec: duration,
        theme,
      });
      htmlParts.push(res.html);
      cssParts.push(res.css);
      jsParts.push(res.js);
    } else if (g.kind === 'route') {
      // Spatial Route Flight Path
      const parts = g.title.split(/(?:to|->|–|-)/i).map((s) => s.trim());
      const origin = parts[0] || 'DEPARTURE';
      const destination = parts[1] || 'DESTINATION';

      const res = renderRouteMap({
        id: artifact.id,
        origin,
        destination,
        distanceOrAlt: g.detail || '33,000 FT',
        startSec,
        durationSec: duration,
        theme,
      });
      htmlParts.push(res.html);
      cssParts.push(res.css);
      jsParts.push(res.js);
    } else if (g.kind === 'badge' || g.kind === 'lower-third') {
      // Polaroid Badge Slap
      let badgeImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="100%" height="100%" fill="%231E293B"/><circle cx="200" cy="160" r="70" fill="%2300E5FF" opacity="0.3"/><path d="M100 340 C100 240, 300 240, 300 340 Z" fill="%2300E5FF" opacity="0.3"/></svg>';
      if ((g as any).assetUrl) {
        badgeImg = (g as any).assetUrl;
      } else if (project.inputs.imageAssets?.length > 0) {
        const sceneNum = artifact.sceneId ? parseInt(artifact.sceneId.replace(/\D/g, ''), 10) : 0;
        const sceneAsset = project.inputs.imageAssets.find((a) => a.promptIndex === sceneNum) || project.inputs.imageAssets[0];
        if (sceneAsset?.assetId) {
          try {
            const src = assetFile(sceneAsset.assetId);
            if (fs.existsSync(src)) {
              const relName = `assets/photo-${artifact.id}.png`;
              fs.mkdirSync(path.join(outputDir, 'assets'), { recursive: true });
              fs.copyFileSync(src, path.join(outputDir, relName));
              badgeImg = relName;
            }
          } catch {}
        }
      }

      const res = renderPolaroidBadge({
        id: artifact.id,
        imageUrl: badgeImg,
        title: g.title,
        subtitle: g.detail || undefined,
        startSec,
        durationSec: duration,
        theme,
      });
      htmlParts.push(res.html);
      cssParts.push(res.css);
      jsParts.push(res.js);
    } else if (g.kind === 'frame' || g.kind === 'diagram') {
      // Check if it's radio / cockpit transcript or newspaper
      if (/radio|recording|voice|air traffic|call/i.test(g.detail || g.title)) {
        const res = renderCockpitTeletype({
          id: artifact.id,
          speaker: g.title,
          transcript: g.detail || g.title,
          startSec,
          durationSec: duration,
          theme,
        });
        htmlParts.push(res.html);
        cssParts.push(res.css);
        jsParts.push(res.js);
      } else {
        // Newspaper / Archival Record Headline
        const sourceName = g.detail && /archive|investigation|record|dispatch|bulletin/i.test(g.detail)
          ? g.detail.split('//')[0].trim().toUpperCase()
          : ((project as any).meta?.title ? `${(project as any).meta.title.toUpperCase()} // ARCHIVE` : 'PRIMARY ARCHIVAL RECORD');
        const dateMatch = (g.detail || g.title || '').match(/\b(\d{1,4}\s*(?:BCE|CE|BC|AD)?|\d{1,2}\s+[A-Za-z]+\s+\d{2,4})\b/i);
        const dateText = dateMatch ? dateMatch[0].toUpperCase() : 'VERIFIED EVIDENCE';

        const res = renderNewspaperHeadline({
          id: artifact.id,
          sourceName,
          dateText,
          headline: g.title,
          highlightText: g.title.split(' ').slice(0, 3).join(' '),
          startSec,
          durationSec: duration,
          theme,
        });
        htmlParts.push(res.html);
        cssParts.push(res.css);
        jsParts.push(res.js);
      }
    } else if (g.kind === 'title') {
      // Cinematic Title Archetype
      const res = renderCinematicTitle({
        id: artifact.id,
        title: g.title,
        detail: g.detail,
        bounds: g.bounds,
        startSec,
        durationSec: duration,
        theme,
        width,
        height,
      });
      htmlParts.push(res.html);
      cssParts.push(res.css);
      jsParts.push(res.js);
    } else if (g.kind === 'spotlight') {
      // Object Spotlight with Reticle & Leader Line
      const scene = project.scenes.find((s) => s.id === artifact.sceneId) || project.scenes[0];
      let sourceDimensions = { width, height };
      try {
        if (scene) {
          const record = assetRecord(scene.assetId);
          if (record?.width && record?.height) {
            sourceDimensions = { width: record.width, height: record.height };
          }
        }
      } catch {
        /* fallback to project dimensions */
      }

      const camera = opts.legacyCameras && scene ? opts.legacyCameras[scene.id] : undefined;
      const midSec = startSec + duration / 2;
      const midFrame = Math.round(midSec * fps);
      const sourceTransform = camera
        ? legacySourceMatrix(camera, midSec, project.inputs, sourceDimensions)
        : undefined;
      const targetBox = targetOnScreen(
        project,
        artifact,
        midFrame,
        sourceDimensions,
        sourceTransform,
      ) || { x: width * 0.5, y: height * 0.45, width: 80, height: 80 };

      const res = renderSpotlight({
        id: artifact.id,
        title: g.title,
        detail: g.detail,
        bounds: g.bounds || { x: 40, y: height - 160, width: 300, height: 80 },
        targetBox,
        startSec,
        durationSec: duration,
        theme,
        width,
        height,
      });
      htmlParts.push(res.html);
      cssParts.push(res.css);
      jsParts.push(res.js);
    } else if (g.kind === 'composition') {
      // Documentary Image Collage
      const res = renderPolaroidBadge({
        id: artifact.id,
        imageUrl: '/api/placeholder/400/400',
        title: g.title,
        subtitle: g.detail,
        startSec,
        durationSec: duration,
        theme,
      });
      htmlParts.push(res.html);
      cssParts.push(res.css);
      jsParts.push(res.js);
    }
  }

  // 3. Assemble master HTML
  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <!-- GSAP for Studio-Grade Deterministic Motion Graphics -->
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&family=JetBrains+Mono:wght@700&family=Montserrat:wght@800;900&display=swap" rel="stylesheet">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: transparent !important;
        -webkit-font-smoothing: antialiased;
      }
      #root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent !important;
      }
      ${cssParts.join('\n')}
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${durationSec}"
      data-width="${width}"
      data-height="${height}"
      data-fps="${fps}"
    >
      ${htmlParts.join('\n')}
    </div>
    <script>
      // Master GSAP Timeline synchronized to HyperFrames frame clock
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${jsParts.join('\n')}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>`;

  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml, 'utf-8');
  return path.join(outputDir, 'index.html');
}
