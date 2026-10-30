import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';

console.log('=== Generating Real Cinematic Motion Graphic (Zero Cards / Zero Boxes) ===');

const width = 1080;
const height = 1920;
const fps = 30;
const durationSec = 4.0;
const durationFrames = Math.round(durationSec * fps);

const artifactsDir = path.resolve(import.meta.dirname, '../artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

const compDir = path.join(os.tmpdir(), `hf-real-motion-${Date.now()}`);
fs.mkdirSync(compDir, { recursive: true });

// 1. Write hyperframes.json
const hyperframesConfig = {
  $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
  registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
  paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' },
  media: { autoProxy: true },
};
fs.writeFileSync(path.join(compDir, 'hyperframes.json'), JSON.stringify(hyperframesConfig, null, 2));

// Copy GSAP
fs.copyFileSync(path.resolve('node_modules/gsap/dist/gsap.min.js'), path.join(compDir, 'gsap.min.js'));

// 2. Real Motion Graphics Markup:
// NO CARDS. NO BOXES. NO RECTANGLES.
// Pure kinetic visuals:
// - Dynamic celestial bow vector that bends
// - Expanding radial shockwave rings on bow break
// - Golden particle embers radiating outward
// - Explosive floating Devanagari typography "पिनाक भंजन" with radiant gold light burst
const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}, height=${height}" />
  <script src="./gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Rozha+One&family=Yatra+One&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      width: ${width}px; height: ${height}px;
      overflow: hidden;
      background: transparent !important;
    }
    #root {
      position: relative;
      width: 100%; height: 100%;
      overflow: hidden;
      background: transparent !important;
      pointer-events: none;
    }

    /* Motion Graphic Elements (Zero Card / Zero Box) */
    .motion-stage {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    /* Celestial Bow SVG */
    .bow-container {
      position: absolute;
      top: 38%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 440px;
      height: 440px;
      opacity: 0;
    }
    .bow-path {
      fill: none;
      stroke: url(#goldGradient);
      stroke-width: 5;
      stroke-linecap: round;
      filter: drop-shadow(0 0 16px rgba(255, 215, 0, 0.9));
    }
    .string-path {
      fill: none;
      stroke: #FFF6D6;
      stroke-width: 2.5;
      stroke-linecap: round;
      filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.8));
    }

    /* Celestial Shockwaves */
    .shockwave-ring {
      position: absolute;
      top: 38%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.1);
      width: 500px;
      height: 500px;
      border-radius: 50%;
      border: 3px solid #FFD700;
      box-shadow: 0 0 40px #FFA000, inset 0 0 30px #FFD700;
      opacity: 0;
      pointer-events: none;
    }
    .shockwave-ring-secondary {
      position: absolute;
      top: 38%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.1);
      width: 600px;
      height: 600px;
      border-radius: 50%;
      border: 1.5px dashed rgba(255, 235, 150, 0.9);
      box-shadow: 0 0 50px rgba(255, 215, 0, 0.6);
      opacity: 0;
      pointer-events: none;
    }

    /* Golden Energy Sparks / Particle Rays */
    .particle-field {
      position: absolute;
      top: 38%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      height: 600px;
      pointer-events: none;
    }
    .spark {
      position: absolute;
      width: 6px;
      height: 24px;
      background: linear-gradient(180deg, #FFFFFF, #FFD700, transparent);
      border-radius: 999px;
      filter: drop-shadow(0 0 8px #FFD700);
      opacity: 0;
    }

    /* Kinetic Floating Typography (Direct in footage space, NO BOX) */
    .kinetic-title-wrap {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      z-index: 30;
      width: 90%;
    }
    .kinetic-subtitle {
      font-family: 'Cinzel', serif;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.35em;
      color: #FFE082;
      text-transform: uppercase;
      opacity: 0;
      transform: translateY(-20px);
      text-shadow: 0 0 20px rgba(255, 215, 0, 0.8), 0 2px 8px rgba(0,0,0,0.9);
      margin-bottom: 12px;
    }
    .kinetic-main-text {
      font-family: 'Rozha One', 'Yatra One', serif;
      font-size: 74px;
      font-weight: 800;
      line-height: 1.15;
      color: #FFFDF0;
      background: linear-gradient(180deg, #FFFFFF 0%, #FFE082 40%, #FFD700 70%, #FF8F00 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 35px rgba(255, 215, 0, 0.85));
      opacity: 0;
      transform: scale(0.6);
      white-space: nowrap;
    }
    .kinetic-verse {
      font-family: 'Yatra One', serif;
      font-size: 24px;
      color: #FFF4D0;
      opacity: 0;
      transform: translateY(20px);
      margin-top: 16px;
      letter-spacing: 0.05em;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.95), 0 0 25px rgba(255, 215, 0, 0.7);
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${durationSec}" data-width="${width}" data-height="${height}" data-fps="${fps}">
    <div class="motion-stage">
      
      <!-- Celestial Shockwaves -->
      <div id="shockwave1" class="shockwave-ring"></div>
      <div id="shockwave2" class="shockwave-ring-secondary"></div>

      <!-- Particle / Spark Rays -->
      <div id="particleField" class="particle-field">
        <div class="spark s1" style="top:50%;left:50%;transform:rotate(0deg) translateY(-80px);"></div>
        <div class="spark s2" style="top:50%;left:50%;transform:rotate(45deg) translateY(-80px);"></div>
        <div class="spark s3" style="top:50%;left:50%;transform:rotate(90deg) translateY(-80px);"></div>
        <div class="spark s4" style="top:50%;left:50%;transform:rotate(135deg) translateY(-80px);"></div>
        <div class="spark s5" style="top:50%;left:50%;transform:rotate(180deg) translateY(-80px);"></div>
        <div class="spark s6" style="top:50%;left:50%;transform:rotate(225deg) translateY(-80px);"></div>
        <div class="spark s7" style="top:50%;left:50%;transform:rotate(270deg) translateY(-80px);"></div>
        <div class="spark s8" style="top:50%;left:50%;transform:rotate(315deg) translateY(-80px);"></div>
      </div>

      <!-- Celestial Pinaka Bow Vector (Draws, Bends under tension, Snaps) -->
      <div id="bowWrap" class="bow-container">
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <defs>
            <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FFFFFF"/>
              <stop offset="50%" stop-color="#FFD700"/>
              <stop offset="100%" stop-color="#FFA000"/>
            </linearGradient>
          </defs>
          <!-- Bow Limb Upper & Lower Arc -->
          <path id="bowUpper" class="bow-path" d="M100 20 C140 40 160 80 160 100" />
          <path id="bowLower" class="bow-path" d="M160 100 C160 120 140 160 100 180" />
          <!-- Bowstring Under Tension -->
          <path id="bowString" class="string-path" d="M100 20 L55 100 L100 180" />
          <!-- Divine Ornament Knots -->
          <circle cx="100" cy="20" r="5" fill="#FFE082"/>
          <circle cx="100" cy="180" r="5" fill="#FFE082"/>
          <circle cx="160" cy="100" r="6" fill="#FFD700"/>
        </svg>
      </div>

      <!-- Pure Floating Kinetic Typography (NO BOX, NO CARD) -->
      <div class="kinetic-title-wrap">
        <div id="subtitle" class="kinetic-subtitle">TRETA YUGA • CELESTIAL PINAKA</div>
        <div id="mainTitle" class="kinetic-main-text">पिनाक भंजन</div>
        <div id="verse" class="kinetic-verse">प्रचंड टंकार से तीनों लोक गुंजायमान हुए</div>
      </div>

    </div>
  </div>

  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });

    // GSAP Kinetic Master Timeline (Frame-deterministic)
    // 0.2s: Celestial Bow manifests and draws on screen with glowing light
    tl.fromTo("#bowWrap", 
      { opacity: 0, scale: 0.7, rotation: -20 }, 
      { opacity: 1, scale: 1, rotation: 0, duration: 0.8, ease: "power3.out" }, 
      0.2
    );

    // 0.4s: Bowstring tensions backwards (Lord Rama pulls the divine bow)
    tl.to("#bowString", {
      attr: { d: "M100 20 L30 100 L100 180" },
      duration: 0.6,
      ease: "power2.in",
    }, 0.5);

    // 1.1s: THE SNAP! Bowstring releases / bow fractures with blinding shockwave
    tl.to("#bowWrap", {
      scale: 1.4,
      opacity: 0,
      filter: "blur(12px)",
      duration: 0.35,
      ease: "power4.out"
    }, 1.1);

    // 1.1s: Radial Shockwave 1 expanding outward into footage
    tl.fromTo("#shockwave1",
      { scale: 0.1, opacity: 1, borderWidth: 8 },
      { scale: 2.8, opacity: 0, borderWidth: 1, duration: 0.85, ease: "power2.out" },
      1.1
    );

    // 1.15s: Radial Shockwave 2
    tl.fromTo("#shockwave2",
      { scale: 0.1, opacity: 0.9 },
      { scale: 3.4, opacity: 0, duration: 1.1, ease: "power3.out" },
      1.15
    );

    // 1.1s: Particle Sparks blasting radially
    const sparks = document.querySelectorAll(".spark");
    sparks.forEach((s, idx) => {
      const angle = idx * 45;
      tl.fromTo(s,
        { opacity: 1, scaleY: 0.5, transform: "rotate(" + angle + "deg) translateY(-20px)" },
        { opacity: 0, scaleY: 2.5, transform: "rotate(" + angle + "deg) translateY(-260px)", duration: 0.75, ease: "power3.out" },
        1.1
      );
    });

    // 1.15s: KINETIC TYPOGRAPHY PUNCH (No box, bursts directly out of the shockwave)
    tl.fromTo("#subtitle",
      { opacity: 0, y: -25, letterSpacing: "0.1em" },
      { opacity: 1, y: 0, letterSpacing: "0.35em", duration: 0.7, ease: "power3.out" },
      1.2
    );

    tl.fromTo("#mainTitle",
      { opacity: 0, scale: 0.35, filter: "blur(20px)" },
      { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.6, ease: "back.out(2)" },
      1.25
    );

    tl.fromTo("#verse",
      { opacity: 0, y: 25 },
      { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" },
      1.45
    );

    // 3.2s: Graceful exit (Floating text dissipates into golden dust)
    tl.to(["#mainTitle", "#subtitle", "#verse"], {
      opacity: 0,
      scale: 1.08,
      filter: "blur(10px)",
      duration: 0.7,
      ease: "power2.in"
    }, 3.3);

    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(compDir, 'index.html'), indexHtml, 'utf8');
console.log(`✔ Written real motion graphic composition HTML to: ${compDir}`);

// Render transparent overlay video via HyperFrames
const nodeBin = '/Users/laheri/.nvm/versions/node/v22.23.3/bin/node';
const cliBin = path.resolve('node_modules/hyperframes/bin/hyperframes.mjs');
const transparentWebmPath = path.join(artifactsDir, 'real-motion-overlay.webm');

console.log(`\nRendering transparent overlay with HyperFrames...`);
const args = [
  cliBin,
  'render',
  '--format', 'webm',
  '-o', transparentWebmPath,
  '--fps', String(fps),
  '--workers', '1',
  compDir,
];

await new Promise((resolve, reject) => {
  const child = spawn(nodeBin, args, {
    env: {
      ...process.env,
      CI: 'true',
      HYPERFRAMES_TELEMETRY: 'off',
      PATH: [path.dirname(nodeBin), process.env.PATH || ''].join(path.delimiter),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(d.toString()));
  child.stderr.on('data', (d) => process.stderr.write(d.toString()));
  child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`HyperFrames failed with code ${code}`));
  });
});
console.log(`\n✔ HyperFrames rendered overlay to: ${transparentWebmPath}`);

// Composite over Lord Rama background image
const bgImage = path.resolve('server/data/generated/shorts_images_videos/image-01-1793011530100.png');
const finalMp4Path = path.join(artifactsDir, 'real-motion-graphic-test.mp4');

console.log(`\nCompositing overlay over Rama background into: ${finalMp4Path}`);
const ffmpegCmd = [
  '-y',
  '-loop', '1', '-t', String(durationSec), '-i', bgImage,
  '-c:v', 'libvpx-vp9', '-i', transparentWebmPath,
  '-filter_complex',
  `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[bg];[bg][1:v]overlay=0:0[v]`,
  '-map', '[v]',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-frames:v', String(durationFrames),
  finalMp4Path,
];

execFileSync('ffmpeg', ffmpegCmd, { stdio: 'inherit' });
console.log(`\n✔ Final MP4 rendered: ${finalMp4Path}`);

// Extract preview frames at 0.6s (bow bending), 1.35s (explosive kinetic title punch), 2.2s (holding)
execFileSync('ffmpeg', ['-y', '-ss', '00:00:00.6', '-i', finalMp4Path, '-frames:v', '1', path.join(artifactsDir, 'real-motion-0.6s.png')]);
execFileSync('ffmpeg', ['-y', '-ss', '00:00:01.35', '-i', finalMp4Path, '-frames:v', '1', path.join(artifactsDir, 'real-motion-1.35s.png')]);
execFileSync('ffmpeg', ['-y', '-ss', '00:00:02.2', '-i', finalMp4Path, '-frames:v', '1', path.join(artifactsDir, 'real-motion-2.2s.png')]);
console.log(`✔ Extracted 3 sample preview frames`);

// Clean up temp
fs.rmSync(compDir, { recursive: true, force: true });
