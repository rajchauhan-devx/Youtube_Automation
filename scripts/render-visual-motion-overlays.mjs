import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'against_the_odds_overlays');
fs.mkdirSync(outDir, { recursive: true });

// Import Playwright Chromium
const { chromium } = await import(path.join(root, 'server', 'node_modules', 'playwright', 'index.mjs'));

console.log('=== RENDERING PURE VISUAL MOTION GRAPHICS OVERLAYS (NO TEXT BOXES) ===\n');

// 7 Pure Visual Motion Graphics (HUD, Reticle, Soundwave, Route Map, Circular Gauge, Verified Seal, Victory Crest)
const visualOverlays = [
  {
    filename: 'overlay_01_title_intro.png',
    title: 'Scene 1: Tactical Expedition Radar HUD & Framing Optics',
    html: `
      <!-- Viewport Framing Brackets -->
      <svg style="position: absolute; top: 0; left: 0; width: 1080px; height: 1920px;" viewBox="0 0 1080 1920">
        <!-- Top Left Corner Bracket -->
        <path d="M 60 140 L 60 80 L 120 80" fill="none" stroke="#00E5FF" stroke-width="3" opacity="0.8" />
        <!-- Top Right Corner Bracket -->
        <path d="M 1020 140 L 1020 80 L 960 80" fill="none" stroke="#00E5FF" stroke-width="3" opacity="0.8" />
        <!-- Bottom Left Corner Bracket -->
        <path d="M 60 1780 L 60 1840 L 120 1840" fill="none" stroke="#00E5FF" stroke-width="3" opacity="0.8" />
        <!-- Bottom Right Corner Bracket -->
        <path d="M 1020 1780 L 1020 1840 L 960 1840" fill="none" stroke="#00E5FF" stroke-width="3" opacity="0.8" />
        
        <!-- Subtle Horizontal Axis Grid Line -->
        <line x1="80" y1="960" x2="160" y2="960" stroke="#00E5FF" stroke-width="2" opacity="0.6" />
        <line x1="920" y1="960" x2="1000" y2="960" stroke="#00E5FF" stroke-width="2" opacity="0.6" />
      </svg>

      <!-- Large Glowing Naval Expedition Radar / Compass HUD -->
      <div style="position: absolute; top: 120px; left: 50%; transform: translateX(-50%); width: 440px; height: 440px;">
        <svg viewBox="0 0 400 400" style="width: 100%; height: 100%; filter: drop-shadow(0 0 16px rgba(0, 229, 255, 0.6));">
          <defs>
            <!-- Radar Sweep Gradient Cone -->
            <radialGradient id="radarSweep" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#00E5FF" stop-opacity="0.45" />
              <stop offset="70%" stop-color="#00E5FF" stop-opacity="0.1" />
              <stop offset="100%" stop-color="#00E5FF" stop-opacity="0" />
            </radialGradient>
            <linearGradient id="glowCyan" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#00E5FF" />
              <stop offset="100%" stop-color="#0077FF" />
            </linearGradient>
          </defs>

          <!-- Outer Azimuth Ring with Degrees -->
          <circle cx="200" cy="200" r="180" fill="none" stroke="#00E5FF" stroke-width="2" stroke-dasharray="4,8" opacity="0.7" />
          <circle cx="200" cy="200" r="160" fill="none" stroke="#00E5FF" stroke-width="1.5" opacity="0.4" />
          <circle cx="200" cy="200" r="110" fill="none" stroke="#00E5FF" stroke-width="1.5" stroke-dasharray="8,6" opacity="0.5" />
          <circle cx="200" cy="200" r="60" fill="none" stroke="#00E5FF" stroke-width="1" opacity="0.3" />

          <!-- Crosshairs -->
          <line x1="20" y1="200" x2="380" y2="200" stroke="#00E5FF" stroke-width="1.5" stroke-dasharray="10,6" opacity="0.5" />
          <line x1="200" y1="20" x2="200" y2="380" stroke="#00E5FF" stroke-width="1.5" stroke-dasharray="10,6" opacity="0.5" />

          <!-- Degree Tick Marks around circumference -->
          ${Array.from({ length: 24 }).map((_, i) => {
            const angle = (i * 15 * Math.PI) / 180;
            const r1 = i % 2 === 0 ? 172 : 176;
            const r2 = 180;
            const x1 = 200 + r1 * Math.cos(angle);
            const y1 = 200 + r1 * Math.sin(angle);
            const x2 = 200 + r2 * Math.cos(angle);
            const y2 = 200 + r2 * Math.sin(angle);
            return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#00E5FF" stroke-width="${i % 2 === 0 ? 2 : 1}" opacity="0.8" />`;
          }).join('')}

          <!-- Radar Sweep Beam (Pie sector) -->
          <path d="M 200 200 L 327 73 A 180 180 0 0 1 376 160 Z" fill="url(#radarSweep)" />
          <line x1="200" y1="200" x2="376" y2="160" stroke="#00E5FF" stroke-width="3" opacity="0.95" />

          <!-- Blips / Sonar Targets -->
          <circle cx="290" cy="140" r="6" fill="#FACC15" filter="drop-shadow(0 0 8px #FACC15)" />
          <circle cx="290" cy="140" r="14" fill="none" stroke="#FACC15" stroke-width="1.5" opacity="0.7" />
          <circle cx="140" cy="260" r="4" fill="#00E5FF" filter="drop-shadow(0 0 6px #00E5FF)" />

          <!-- Center Crosshair & Compass Pip -->
          <circle cx="200" cy="200" r="5" fill="#00E5FF" />
          <text x="200" y="35" text-anchor="middle" fill="#00E5FF" font-family="monospace" font-size="12" font-weight="bold" letter-spacing="2">000° N</text>
          <text x="365" y="204" text-anchor="middle" fill="#00E5FF" font-family="monospace" font-size="12" font-weight="bold">090°</text>
          <text x="200" y="375" text-anchor="middle" fill="#00E5FF" font-family="monospace" font-size="12" font-weight="bold">180° S</text>
          <text x="35" y="204" text-anchor="middle" fill="#00E5FF" font-family="monospace" font-size="12" font-weight="bold">270°</text>
        </svg>

        <!-- Minimal High-Tech Floating Label Below Radar -->
        <div style="text-align: center; margin-top: 10px; font-family: monospace; color: #00E5FF; font-size: 15px; letter-spacing: 0.25em; text-transform: uppercase; text-shadow: 0 0 8px #00E5FF;">
          ● NAVAL RADAR // 68°S 52°W
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_02_target_reticle.png',
    title: 'Scene 2: Precision Target Lock Reticle & Rangefinder Scale',
    html: `
      <!-- Tactical Targeting Reticle Over Boat / Shore -->
      <div style="position: absolute; top: 680px; left: 50%; transform: translateX(-50%); width: 500px; height: 500px;">
        <svg viewBox="0 0 400 400" style="width: 100%; height: 100%; filter: drop-shadow(0 0 18px #00E5FF);">
          <!-- Outer Segmented Ring -->
          <circle cx="200" cy="200" r="160" fill="none" stroke="#00E5FF" stroke-width="2.5" stroke-dasharray="60,24" opacity="0.9" />
          
          <!-- Inner Rotating Reticle with Chevron Ticks -->
          <circle cx="200" cy="200" r="110" fill="none" stroke="#00E5FF" stroke-width="2" stroke-dasharray="14,14" opacity="0.75" />
          <circle cx="200" cy="200" r="50" fill="none" stroke="#00E5FF" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.6" />
          
          <!-- 4 Extended Tactical Crosshair Lines -->
          <line x1="20" y1="200" x2="140" y2="200" stroke="#00E5FF" stroke-width="2.5" />
          <line x1="260" y1="200" x2="380" y2="200" stroke="#00E5FF" stroke-width="2.5" />
          <line x1="200" y1="20" x2="200" y2="140" stroke="#00E5FF" stroke-width="2.5" />
          <line x1="200" y1="260" x2="200" y2="380" stroke="#00E5FF" stroke-width="2.5" />

          <!-- 4 Corner Target Brackets [  ] Snapping Inward -->
          <path d="M 160 140 L 140 140 L 140 160" fill="none" stroke="#00E5FF" stroke-width="3" />
          <path d="M 240 140 L 260 140 L 260 160" fill="none" stroke="#00E5FF" stroke-width="3" />
          <path d="M 160 260 L 140 260 L 140 240" fill="none" stroke="#00E5FF" stroke-width="3" />
          <path d="M 240 260 L 260 260 L 260 240" fill="none" stroke="#00E5FF" stroke-width="3" />

          <!-- Center Bullseye -->
          <circle cx="200" cy="200" r="8" fill="#00E5FF" filter="drop-shadow(0 0 10px #00E5FF)" />
          <circle cx="200" cy="200" r="2" fill="#FFFFFF" />

          <!-- Vertical Rangefinder Scale on the Right -->
          <line x1="330" y1="120" x2="330" y2="280" stroke="#00E5FF" stroke-width="2" opacity="0.8" />
          ${[120, 140, 160, 180, 200, 220, 240, 260, 280].map((y, i) => `
            <line x1="330" y1="${y}" x2="${i % 2 === 0 ? 342 : 336}" y2="${y}" stroke="#00E5FF" stroke-width="2" opacity="0.8" />
          `).join('')}
          <text x="350" y="205" fill="#00E5FF" font-family="monospace" font-size="12" font-weight="bold">1.4 KM</text>
        </svg>

        <!-- Floating Tactical Tag Directly Attached to Reticle (No big box) -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: -20px; padding: 0 40px; font-family: monospace; color: #00E5FF; text-shadow: 0 0 10px #00E5FF;">
          <span style="font-size: 14px; font-weight: bold; letter-spacing: 0.15em;">🎯 TARGET LOCK: 61°08'S</span>
          <span style="font-size: 14px; font-weight: bold; background: rgba(0, 229, 255, 0.2); border: 1px solid #00E5FF; padding: 3px 10px; border-radius: 4px;">ELEPHANT ISL.</span>
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_03_alert_quote.png',
    title: 'Scene 3: Distress Radio Audio Waveform & Warning Beacon',
    html: `
      <!-- Pulsing Warning Beacon in Top Center -->
      <div style="position: absolute; top: 180px; left: 50%; transform: translateX(-50%); text-align: center;">
        <svg width="120" height="120" viewBox="0 0 100 100" style="filter: drop-shadow(0 0 20px #FF3366);">
          <!-- Radiating Pulsing Warning Rings -->
          <circle cx="50" cy="50" r="42" fill="none" stroke="#FF3366" stroke-width="2" stroke-dasharray="6,6" opacity="0.5" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#FF3366" stroke-width="2" opacity="0.7" />
          <!-- Warning Triangle -->
          <polygon points="50,18 82,78 18,78" fill="rgba(255, 51, 102, 0.25)" stroke="#FF3366" stroke-width="3" />
          <line x1="50" y1="36" x2="50" y2="58" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" />
          <circle cx="50" cy="68" r="2.5" fill="#FFFFFF" />
        </svg>
        <div style="font-family: monospace; color: #FF3366; font-size: 14px; font-weight: 800; letter-spacing: 0.25em; text-transform: uppercase; margin-top: 6px; text-shadow: 0 0 10px #FF3366;">
          ⚠️ DISTRESS BEACON ACTIVE
        </div>
      </div>

      <!-- Glowing Audio Equalizer Waveform Across Bottom (Remotion sound-wave.tsx) -->
      <div style="position: absolute; bottom: 220px; left: 60px; right: 60px; height: 180px;">
        <svg viewBox="0 0 960 160" style="width: 100%; height: 100%; filter: drop-shadow(0 0 14px #FF9900);">
          <defs>
            <linearGradient id="eqGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stop-color="#FF3366" />
              <stop offset="60%" stop-color="#FF9900" />
              <stop offset="100%" stop-color="#FFCC00" />
            </linearGradient>
          </defs>

          <!-- 32 Dynamic Waveform Equalizer Bars -->
          ${[
            25, 45, 70, 95, 130, 85, 60, 110, 145, 120, 90, 65, 100, 140, 155, 125,
            80, 115, 150, 135, 95, 50, 85, 120, 140, 105, 75, 110, 130, 90, 55, 30
          ].map((h, i) => {
            const x = 20 + i * 29;
            const y = 140 - h;
            return `
              <rect x="${x}" y="${y}" width="16" height="${h}" rx="6" fill="url(#eqGradient)" opacity="0.95" />
              <!-- Peak Pip dot -->
              <circle cx="${x + 8}" cy="${y - 8}" r="3" fill="#FFCC00" filter="drop-shadow(0 0 4px #FFCC00)" />
            `;
          }).join('')}

          <!-- Base Frequency Reference Line -->
          <line x1="10" y1="145" x2="950" y2="145" stroke="rgba(255, 204, 0, 0.5)" stroke-width="2" stroke-dasharray="10,6" />
        </svg>

        <!-- Technical Audio Telemetry Readout -->
        <div style="display: flex; justify-content: space-between; font-family: monospace; color: #FFCC00; font-size: 14px; letter-spacing: 0.15em; margin-top: 10px; text-shadow: 0 0 8px #FFCC00;">
          <span>RADIO FREQ: 500 kHz (INTERNATIONAL DISTRESS)</span>
          <span>SIGNAL GAIN: +24 dB</span>
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_04_voyage_telemetry.png',
    title: 'Scene 4: Nautical Journey Route Tracker & Trajectory Arc',
    html: `
      <!-- Animated Map Route Trajectory Vector -->
      <div style="position: absolute; bottom: 260px; left: 50px; right: 50px; height: 380px;">
        <svg viewBox="0 0 980 340" style="width: 100%; height: 100%; filter: drop-shadow(0 0 16px #FACC15);">
          <defs>
            <linearGradient id="routeGradient" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stop-color="#00E5FF" />
              <stop offset="50%" stop-color="#FACC15" />
              <stop offset="100%" stop-color="#FF3366" />
            </linearGradient>
            <filter id="glowYellow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <!-- Ocean Grid Coordinates -->
          <line x1="60" y1="40" x2="60" y2="300" stroke="rgba(250, 204, 21, 0.2)" stroke-width="1.5" stroke-dasharray="6,6" />
          <line x1="920" y1="40" x2="920" y2="300" stroke="rgba(250, 204, 21, 0.2)" stroke-width="1.5" stroke-dasharray="6,6" />
          <line x1="60" y1="280" x2="920" y2="280" stroke="rgba(250, 204, 21, 0.3)" stroke-width="2" />

          <!-- Parabolic Open-Ocean Trajectory Curve (800 Nautical Miles) -->
          <path d="M 100 240 Q 500 40 880 180" fill="none" stroke="url(#routeGradient)" stroke-width="6" stroke-dasharray="14,10" stroke-linecap="round" />

          <!-- Sea Wave Spikes Underneath Trajectory -->
          <path d="M 120 270 Q 150 250 180 270 Q 210 250 240 270 Q 270 250 300 270 Q 330 250 360 270 Q 390 250 420 270 Q 450 250 480 270 Q 510 250 540 270 Q 570 250 600 270 Q 630 250 660 270 Q 690 250 720 270 Q 750 250 780 270 Q 810 250 840 270 Q 870 250 900 270" fill="none" stroke="rgba(0, 229, 255, 0.35)" stroke-width="2" />

          <!-- Origin Waypoint 1: Elephant Island -->
          <circle cx="100" cy="240" r="18" fill="none" stroke="#00E5FF" stroke-width="2.5" />
          <circle cx="100" cy="240" r="8" fill="#00E5FF" />
          <text x="100" y="285" text-anchor="middle" fill="#00E5FF" font-family="monospace" font-size="14" font-weight="bold">START: ELEPHANT ISL.</text>

          <!-- Mid-Point Trajectory Compass Heading Arrow (Lottie Bouncing Arrow Style) -->
          <g transform="translate(500, 115) rotate(15)">
            <polygon points="0,-16 28,0 0,16 6,0" fill="#FACC15" filter="url(#glowYellow)" />
            <circle cx="0" cy="0" r="4" fill="#FFFFFF" />
          </g>

          <!-- Destination Waypoint 2: South Georgia -->
          <circle cx="880" cy="180" r="26" fill="none" stroke="#FF3366" stroke-width="2" stroke-dasharray="6,4" />
          <circle cx="880" cy="180" r="14" fill="none" stroke="#FF3366" stroke-width="3" />
          <circle cx="880" cy="180" r="6" fill="#FF3366" />
          <text x="880" y="235" text-anchor="middle" fill="#FF3366" font-family="monospace" font-size="14" font-weight="bold">DEST: S. GEORGIA</text>

          <!-- Large Bold Telemetry Scale Vector -->
          <g transform="translate(490, 240)">
            <rect x="-160" y="-30" width="320" height="50" rx="25" fill="rgba(15, 23, 42, 0.7)" stroke="#FACC15" stroke-width="2" />
            <text x="0" y="4" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="24" font-weight="900" letter-spacing="1">
              800 <tspan fill="#FACC15">NAUTICAL MILES</tspan>
            </text>
          </g>
        </svg>
      </div>
    `,
  },
  {
    filename: 'overlay_05_shackleton_lower_third.png',
    title: 'Scene 5: High-Tech Circular Survival Gauge (Remotion circular-progress.tsx)',
    html: `
      <!-- Large Glowing Radial Circular Progress Gauge (94% Survival Meter) -->
      <div style="position: absolute; bottom: 240px; left: 50%; transform: translateX(-50%); width: 440px; height: 440px;">
        <svg viewBox="0 0 360 360" style="width: 100%; height: 100%; filter: drop-shadow(0 0 20px rgba(0, 229, 255, 0.7));">
          <defs>
            <linearGradient id="gaugeGradient" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stop-color="#00E5FF" />
              <stop offset="60%" stop-color="#3B82F6" />
              <stop offset="100%" stop-color="#FACC15" />
            </linearGradient>
          </defs>

          <!-- Outer 60-Tick Tachometer Ring -->
          ${Array.from({ length: 48 }).map((_, i) => {
            const angle = (i * 7.5 * Math.PI) / 180 - Math.PI / 2;
            const r1 = 154;
            const r2 = i % 4 === 0 ? 168 : 160;
            const x1 = 180 + r1 * Math.cos(angle);
            const y1 = 180 + r1 * Math.sin(angle);
            const x2 = 180 + r2 * Math.cos(angle);
            const y2 = 180 + r2 * Math.sin(angle);
            return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#00E5FF" stroke-width="${i % 4 === 0 ? 2.5 : 1}" opacity="${i < 42 ? 0.9 : 0.25}" />`;
          }).join('')}

          <!-- Background Track Arc -->
          <circle cx="180" cy="180" r="130" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="18" />

          <!-- Glowing Active Arc (94% Fill = ~765 out of 816 circumference) -->
          <circle cx="180" cy="180" r="130" fill="none" stroke="url(#gaugeGradient)" stroke-width="18" stroke-dasharray="816.8" stroke-dashoffset="65" stroke-linecap="round" transform="rotate(-90 180 180)" />

          <!-- Center Numeric Telemetry -->
          <text x="180" y="170" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="64" font-weight="900" letter-spacing="-1">
            94<tspan fill="#FACC15" font-size="38">%</tspan>
          </text>
          <text x="180" y="206" text-anchor="middle" fill="#00E5FF" font-family="monospace" font-size="14" font-weight="bold" letter-spacing="3">
            SURVIVAL PROBABILITY
          </text>
          <text x="180" y="228" text-anchor="middle" fill="#94A3B8" font-family="monospace" font-size="11">
            EXPEDITION BIO-INDEX
          </text>

          <!-- Orbiting Indicator Dot -->
          <circle cx="140" cy="54" r="8" fill="#FACC15" filter="drop-shadow(0 0 8px #FACC15)" />
        </svg>

        <!-- Horizontal Telemetry Readout Bars Below Gauge -->
        <div style="display: flex; justify-content: space-around; font-family: monospace; margin-top: 10px;">
          <div style="background: rgba(0, 229, 255, 0.15); border: 1px solid #00E5FF; padding: 6px 14px; border-radius: 6px; color: #00E5FF; font-size: 13px;">
            ❄️ AMBIENT: -28°C
          </div>
          <div style="background: rgba(250, 204, 21, 0.15); border: 1px solid #FACC15; padding: 6px 14px; border-radius: 6px; color: #FACC15; font-size: 13px;">
            ⏱ NONSTOP: 36 HRS
          </div>
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_06_verified_rescue.png',
    title: 'Scene 6: Emerald Verified Stamp Emblem & Shockwave Burst',
    html: `
      <!-- Large Glowing Verified Stamp Seal (Lottie verified_badge.json style) -->
      <div style="position: absolute; bottom: 260px; left: 50%; transform: translateX(-50%); width: 480px; height: 480px;">
        <svg viewBox="0 0 400 400" style="width: 100%; height: 100%; filter: drop-shadow(0 0 24px rgba(16, 185, 129, 0.8));">
          <defs>
            <linearGradient id="emeraldGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#34D399" />
              <stop offset="100%" stop-color="#059669" />
            </linearGradient>
            <!-- 12 Starburst Rays Filter -->
            <filter id="glowGreen">
              <feGaussianBlur stdDeviation="6" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <!-- Outer Shockwave Ripple Ring -->
          <circle cx="200" cy="200" r="185" fill="none" stroke="#34D399" stroke-width="2" stroke-dasharray="8,8" opacity="0.6" />
          <circle cx="200" cy="200" r="170" fill="none" stroke="#10B981" stroke-width="3" opacity="0.4" />

          <!-- 12 Starburst Gear Notches -->
          ${Array.from({ length: 16 }).map((_, i) => {
            const angle = (i * 22.5 * Math.PI) / 180;
            const x = 200 + 155 * Math.cos(angle);
            const y = 200 + 155 * Math.sin(angle);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#34D399" filter="url(#glowGreen)" />`;
          }).join('')}

          <!-- Main Seal Disc -->
          <circle cx="200" cy="200" r="145" fill="rgba(6, 78, 59, 0.65)" stroke="url(#emeraldGrad)" stroke-width="6" />
          <circle cx="200" cy="200" r="130" fill="none" stroke="#34D399" stroke-width="2" stroke-dasharray="10,6" opacity="0.8" />

          <!-- Bold Vector Animated Checkmark -->
          <path d="M 140 200 L 180 240 L 265 155" fill="none" stroke="#FFFFFF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" filter="drop-shadow(0 0 12px #34D399)" />

          <!-- Arching Circular Badge Banner Text -->
          <text x="200" y="300" text-anchor="middle" fill="#34D399" font-family="system-ui, sans-serif" font-size="20" font-weight="900" letter-spacing="4">
            MISSION VERIFIED
          </text>
        </svg>

        <!-- Bold Bottom Seal Tag -->
        <div style="text-align: center; margin-top: -10px; font-family: system-ui, sans-serif;">
          <div style="display: inline-block; background: rgba(16, 185, 129, 0.25); border: 2px solid #34D399; padding: 8px 24px; border-radius: 999px; color: #FFFFFF; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; text-shadow: 0 0 10px #10B981;">
            ALL 28 CREW RESCUED // 0 CASUALTIES
          </div>
        </div>
      </div>
    `,
  },
  {
    filename: 'overlay_07_climax_underline.png',
    title: 'Scene 7: Golden Victory Laurel Crest & Cinematic Underline Flare',
    html: `
      <!-- Top Cinematic Widescreen Letterbox Matte Lines (2.35:1 Anamorphic styling) -->
      <svg style="position: absolute; top: 0; left: 0; width: 1080px; height: 1920px;" viewBox="0 0 1080 1920">
        <!-- Cinematic Gold Corner Reticles -->
        <path d="M 40 80 L 40 40 L 80 40" fill="none" stroke="#FACC15" stroke-width="3" opacity="0.9" />
        <path d="M 1040 80 L 1040 40 L 1000 40" fill="none" stroke="#FACC15" stroke-width="3" opacity="0.9" />
        <path d="M 40 1840 L 40 1880 L 80 1880" fill="none" stroke="#FACC15" stroke-width="3" opacity="0.9" />
        <path d="M 1040 1840 L 1040 1880 L 1000 1880" fill="none" stroke="#FACC15" stroke-width="3" opacity="0.9" />
      </svg>

      <!-- Center-Bottom Golden Victory Laurel Crest & Trophy (Pure Vector) -->
      <div style="position: absolute; bottom: 260px; left: 50%; transform: translateX(-50%); width: 600px; text-align: center;">
        <svg viewBox="0 0 500 240" style="width: 100%; height: 100%; filter: drop-shadow(0 0 20px rgba(250, 204, 21, 0.7));">
          <defs>
            <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#FFFBEB" />
              <stop offset="40%" stop-color="#FACC15" />
              <stop offset="100%" stop-color="#B45309" />
            </linearGradient>
            <!-- Light Flare Beam -->
            <linearGradient id="beamGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#FACC15" stop-opacity="0" />
              <stop offset="50%" stop-color="#FFFFFF" stop-opacity="1" />
              <stop offset="100%" stop-color="#FACC15" stop-opacity="0" />
            </linearGradient>
          </defs>

          <!-- Golden Laurel Wreath Leaves (Left) -->
          <g stroke="url(#goldGradient)" stroke-width="3" fill="none">
            <path d="M 220 180 C 140 170 110 110 130 50" />
            <!-- Laurel Leaves Left -->
            <ellipse cx="140" cy="140" rx="14" ry="6" transform="rotate(-30 140 140)" fill="url(#goldGradient)" />
            <ellipse cx="125" cy="105" rx="14" ry="6" transform="rotate(-50 125 105)" fill="url(#goldGradient)" />
            <ellipse cx="135" cy="70" rx="14" ry="6" transform="rotate(-70 135 70)" fill="url(#goldGradient)" />
          </g>

          <!-- Golden Laurel Wreath Leaves (Right) -->
          <g stroke="url(#goldGradient)" stroke-width="3" fill="none">
            <path d="M 280 180 C 360 170 390 110 370 50" />
            <!-- Laurel Leaves Right -->
            <ellipse cx="360" cy="140" rx="14" ry="6" transform="rotate(30 360 140)" fill="url(#goldGradient)" />
            <ellipse cx="375" cy="105" rx="14" ry="6" transform="rotate(50 375 105)" fill="url(#goldGradient)" />
            <ellipse cx="365" cy="70" rx="14" ry="6" transform="rotate(70 365 70)" fill="url(#goldGradient)" />
          </g>

          <!-- Center Victory Trophy Icon -->
          <g transform="translate(250, 95)" filter="drop-shadow(0 0 10px #FACC15)">
            <path d="M -24 -36 L 24 -36 L 20 0 C 18 18 0 24 0 24 C 0 24 -18 18 -20 0 Z" fill="url(#goldGradient)" />
            <path d="M -24 -30 C -38 -30 -38 -10 -22 -10" fill="none" stroke="url(#goldGradient)" stroke-width="4" stroke-linecap="round" />
            <path d="M 24 -30 C 38 -30 38 -10 22 -10" fill="none" stroke="url(#goldGradient)" stroke-width="4" stroke-linecap="round" />
            <rect x="-6" y="24" width="12" height="16" fill="url(#goldGradient)" />
            <rect x="-18" y="40" width="36" height="8" rx="2" fill="url(#goldGradient)" />
          </g>

          <!-- Expanding Cinematic Underline Flare Line -->
          <line x1="20" y1="210" x2="480" y2="210" stroke="url(#beamGrad)" stroke-width="4" />
          <circle cx="250" cy="210" r="5" fill="#FFFFFF" filter="drop-shadow(0 0 8px #FFFFFF)" />
        </svg>

        <!-- Bold High-Impact Golden Metric (No Box!) -->
        <div style="font-family: system-ui, sans-serif; margin-top: -15px;">
          <div style="font-size: 44px; font-weight: 900; color: #FFFFFF; text-shadow: 0 0 20px #FACC15; letter-spacing: -0.02em;">
            NOT A SINGLE LIFE LOST
          </div>
          <div style="font-family: monospace; color: #FACC15; font-size: 16px; font-weight: 800; letter-spacing: 0.3em; margin-top: 6px;">
            ✦ 20 MONTHS STRANDED // 100% SURVIVAL ✦
          </div>
        </div>
      </div>
    `,
  },
];

console.log('Launching Playwright Chromium...');
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
});

for (let i = 0; i < visualOverlays.length; i++) {
  const item = visualOverlays[i];
  const outPath = path.join(outDir, item.filename);

  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            width: 1080px;
            height: 1920px;
            overflow: hidden;
            background: transparent;
          }
        </style>
      </head>
      <body>
        ${item.html}
      </body>
    </html>
  `;

  await page.setContent(fullHtml, { waitUntil: 'load' });
  await page.screenshot({
    path: outPath,
    omitBackground: true,
  });

  console.log(`[${i + 1}/7] Rendered: ${item.filename} - ${item.title}`);
}

await browser.close();
console.log('\nAll 7 Pure Visual Motion Overlays rendered successfully to:', outDir);
