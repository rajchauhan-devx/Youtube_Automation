import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Real engine + shared StyleKit registry (the thing we just built).
import { compileExtraPopupToMotionGraphic } from '../dist/services/extra-popups-engine.js';
import { STYLE_KITS, styleKitFor } from '@tubeflow/editing-contracts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const artifactsDir = path.join(root, 'artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

const width = 1080, height = 1920, fps = 30, durationSec = 6;
const durationFrames = Math.round(durationSec * fps);

// --- background art (one real image, reused) ---
const bgCandidates = fs.existsSync(path.join(root, 'server/data/generated/usr_1787934167716'))
  ? fs.readdirSync(path.join(root, 'server/data/generated/usr_1787934167716'))
      .filter(f => f.startsWith('scene-img'))
      .map(f => path.join(root, 'server/data/generated/usr_1787934167716', f))
  : [];
const bgImage = bgCandidates[0];

// --- popup art (embed a real generated png as base64) ---
const popupArtDir = path.join(root, 'server/data/generated/usr_1787934167716');
const artFile = fs.readdirSync(popupArtDir).find(f => f.startsWith('popup-') && f.endsWith('.png'));
const popupDataUri = artFile
  ? `data:image/png;base64,${fs.readFileSync(path.join(popupArtDir, artFile)).toString('base64')}`
  : '';

// Three channels to prove variety: same pipeline, three distinct StyleKits.
const DEMOS = [
  {
    channel: 'ancient_dharma',
    kicker: 'प्राचीन भारत',
    title: 'कर्नाटक का रहस्य',
    sub: 'एकल पत्थर से बना मंदिर',
    popup: {
      shape: 'circle_medallion',
      placement: 'top-right',
      title: 'एकल शिला मंदिर',
      subtitle: 'ऊपर से खोदा गया',
      badgeTag: 'प्राचीन धरोहर',
      statValue: '4,00,000',
      statUnit: 'टन',
      archetype: 'heritage_intel',
    },
  },
  {
    channel: 'rule_zero',
    kicker: 'TACTICAL // 03',
    title: 'PROTOCOL ZERO',
    sub: 'No survives the purge',
    popup: {
      shape: 'tactical_hexagon',
      placement: 'top-right',
      title: 'THREAT LOCKED',
      subtitle: 'Zero margin for error',
      badgeTag: 'TELEMETRY',
      archetype: 'blueprint_diagram',
    },
  },
  {
    channel: 'against_the_odds',
    kicker: 'SURVIVAL LOG',
    title: 'AGAINST ALL ODDS',
    sub: '18 years, zero mistakes',
    popup: {
      shape: 'metric_counter',
      placement: 'top-left',
      title: 'One man, one machine',
      subtitle: 'No modern cranes on site',
      badgeTag: 'STATED FIGURE',
      statValue: '18',
      statUnit: 'YEARS',
      archetype: 'metric_counter',
    },
  },
];

function makeGradientBgp(png) {
  const kit = { c: null };
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi',
    '-i', `gradients=s=${width}${height}:c0=#05060a:c1=#0b1220:speed=0.0001`,
    '-frames:v', '1', png], { stdio: 'ignore' });
}

function buildHtml(demo, kit, popupGraphic) {
  const t = kit.theme, p = kit.popup;
  const titleTop = '34%';
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/>
<script src="./gsap.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@600;800&family=JetBrains+Mono:wght@600;800&family=Montserrat:wght@700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${width}px;height:${height}px;overflow:hidden;background:transparent!important}
#root{position:relative;width:100%;height:100%;overflow:hidden;background:transparent!important;pointer-events:none}
.mg-kicker{position:absolute;top:calc(${titleTop} - 66px);left:80px;font-family:${t.fontFamily};font-size:30px;font-weight:800;letter-spacing:.32em;color:${t.primary};text-transform:uppercase;opacity:0;text-shadow:0 0 24px ${p.glow},0 2px 10px rgba(0,0,0,.9)}
.mg-title{position:absolute;top:${titleTop};left:80px;width:820px;font-family:${t.fontFamily};font-size:96px;font-weight:800;line-height:1.04;color:${t.text};opacity:0;text-shadow:0 6px 30px rgba(0,0,0,.95),0 0 44px ${p.glow}}
.mg-rule{position:absolute;top:calc(${titleTop} + 232px);left:80px;height:5px;width:560px;background:linear-gradient(90deg,${t.primary},transparent);transform-origin:left center;transform:scaleX(0);box-shadow:0 0 20px ${p.glow}}
.mg-sub{position:absolute;top:calc(${titleTop} + 256px);left:80px;width:760px;font-family:${t.fontFamily};font-size:34px;font-weight:600;color:${p.muted};opacity:0;text-shadow:0 2px 12px rgba(0,0,0,.9)}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${durationSec}" data-width="${width}" data-height="${height}" data-fps="${fps}">
  <div class="mg-kicker" id="mgKicker">${demo.kicker}</div>
  <div class="mg-title" id="mgTitle">${demo.title}</div>
  <div class="mg-rule" id="mgRule"></div>
  <div class="mg-sub" id="mgSub">${demo.sub}</div>
  ${popupGraphic.render.html}
</div>
<style>${popupGraphic.render.css}</style>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });

// --- Motion graphic beat (kinetic title reveal) ---
tl.fromTo("#mgKicker",{opacity:0,y:-18,letterSpacing:"0.1em"},{opacity:1,y:0,letterSpacing:"0.32em",duration:0.6,ease:"power3.out"},0.15);
tl.fromTo("#mgTitle",{opacity:0,scale:0.72,filter:"blur(16px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.7,ease:"back.out(1.7)"},0.3);
tl.to("#mgRule",{scaleX:1,duration:0.6,ease:"power2.out"},0.5);
tl.fromTo("#mgSub",{opacity:0,y:22},{opacity:1,y:0,duration:0.6,ease:"power2.out"},0.6);

// --- Popup beat (real StyleKit engine output) ---
${popupGraphic.render.js}

// graceful shared exit
tl.to(["#mgKicker","#mgTitle","#mgSub"],{opacity:0,scale:1.06,filter:"blur(8px)",duration:0.6,ease:"power2.in"},${(durationSec - 0.9).toFixed(2)});

window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body></html>`;
}

async function renderChannel(demo) {
  const kit = styleKitFor(demo.channel);
  console.log(`\\n=== ${kit.name} (${kit.key}) — popup ${demo.popup.shape}, sfx ${kit.defaultSfx} ===`);

  // 1. Compile the popup through the REAL engine, passing channelKey so the StyleKit palette applies.
  const popupGraphic = compileExtraPopupToMotionGraphic(
    {
      id: `demo_${kit.key}`,
      sceneIndex: 0,
      cueWord: demo.title,
      cueOffsetSec: 1.1,
      durationSec: 3.4,
      title: demo.popup.title,
      subtitle: demo.popup.subtitle,
      badgeTag: demo.popup.badgeTag,
      statValue: demo.popup.statValue,
      statUnit: demo.popup.statUnit,
      archetype: demo.popup.archetype,
      shape: kit.popupShapes.includes(demo.popup.shape) ? demo.popup.shape : kit.popupShapes[0],
      placement: demo.popup.placement,
      scalePercent: 30,
      sfx: kit.defaultSfx,
      prompt: 'demo',
      imageUrl: popupDataUri,
      status: popupDataUri ? 'ready' : 'pending',
    },
    { width, height, fps, channelKey: kit.key }
  );

  // 2. Assemble composition dir
  const compDir = path.join(os.tmpdir(), `hf-stylekit-${kit.key}-${Date.now()}`);
  fs.mkdirSync(compDir, { recursive: true });
  const cfg = {
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
    registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
    paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' },
    media: { autoProxy: true },
  };
  fs.writeFileSync(path.join(compDir, 'hyperframes.json'), JSON.stringify(cfg, null, 2));
  fs.copyFileSync(path.resolve(root, 'node_modules/gsap/dist/gsap.min.js'), path.join(compDir, 'gsap.min.js'));
  fs.writeFileSync(path.join(compDir, 'index.html'), buildHtml(demo, kit, popupGraphic), 'utf8');

  // 3. Render alpha overlay
  const overlay = path.join(compDir, 'overlay.webm');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.resolve(root, 'node_modules/hyperframes/bin/hyperframes.mjs'),
      'render', '--format', 'webm', '-o', overlay, '--fps', String(fps), '--workers', '1', compDir,
    ], { env: { ...process.env, CI: 'true', HYPERFRAMES_TELEMETRY: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', d => process.stdout.write(d.toString()));
    child.stderr.on('data', d => process.stderr.write(d.toString()));
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`HyperFrames exit ${code}`))));
  });

  // 4. Background
  const bgPng = path.join(compDir, 'bg.png');
  if (bgImage) fs.copyFileSync(bgImage, bgPng);
  else makeGradientBgp(bgPng);

  // 5. Composite
  const outMp4 = path.join(artifactsDir, `stylekit-${kit.key}.mp4`);
  execFileSync('ffmpeg', [
    '-y', '-loop', '1', '-t', String(durationSec), '-i', bgPng,
    '-c:v', 'libvpx-vp9', '-i', overlay,
    '-filter_complex',
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},eq=brightness=-0.12:saturation=0.9[bg];[bg][1:v]overlay=0:0[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-frames:v', String(durationFrames), outMp4,
  ], { stdio: 'ignore' });

  // 6. Frames
  const shots = [0.7, 1.7, 3.0];
  for (const s of shots) {
    execFileSync('ffmpeg', ['-y', '-ss', String(s), '-i', outMp4, '-frames:v', '1',
      path.join(artifactsDir, `stylekit-${kit.key}-${s}s.png`)], { stdio: 'ignore' });
  }
  fs.rmSync(compDir, { recursive: true, force: true });
  console.log(`✔ ${kit.name}: ${outMp4}`);
  return outMp4;
}

const outs = [];
for (const demo of DEMOS) {
  try { outs.push(await renderChannel(demo)); }
  catch (e) { console.error(`✖ ${demo.channel} failed:`, e.message); }
}
console.log('\\nDone. Videos:'); outs.forEach(o => console.log('  ' + o));
