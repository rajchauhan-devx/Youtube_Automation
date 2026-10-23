/**
 * HyperFrames GSAP Motion Graphics Templates
 * High-retention cinematic motion graphic archetypes (Vox / Johnny Harris / Magnates Media style)
 */

export interface GraphicTheme {
  primary: string;       // Highlight / Accent color (e.g. #F07835 brand orange, #FFE600 neon yellow)
  background?: string;   // Container background if any (mostly transparent)
  fontFamily: string;    // Display font
  secondaryFont?: string;// Monospace / Body font
}

export const DEFAULT_THEME: GraphicTheme = {
  primary: '#F07835',
  fontFamily: "'Montserrat', 'Inter', -apple-system, sans-serif",
  secondaryFont: "'JetBrains Mono', 'Courier New', monospace",
};

/**
 * 1. Kinetic Punch Subtitles (Zero Dark Bounding Boxes)
 * Clean, bold typography with word-level highlight punch and multi-layer drop shadows.
 */
export function renderKineticCaption(opts: {
  id: string;
  words: { text: string; start: number; end: number; isPower?: boolean }[];
  startSec: number;
  endSec: number;
  width?: number;
  height?: number;
  theme?: GraphicTheme;
}): { html: string; css: string; js: string } {
  const theme = opts.theme || DEFAULT_THEME;
  const id = `caption-${opts.id}`;

  const wordsHtml = opts.words.map((w, i) => {
    const isPower = w.isPower || /^\d+|record|survived|freefall|impossible|danger|guinness/i.test(w.text);
    const cls = isPower ? 'cap-word power-word' : 'cap-word';
    return `<span id="${id}-w-${i}" class="${cls}">${w.text}</span>`;
  }).join(' ');

  const html = `
    <div id="${id}" class="kinetic-caption-wrap" data-start="${opts.startSec}" data-duration="${opts.endSec - opts.startSec}">
      <div class="kinetic-caption-phrase">
        ${wordsHtml}
      </div>
    </div>
  `;

  const css = `
    #${id}.kinetic-caption-wrap {
      position: absolute;
      left: 0;
      bottom: 20%;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
      pointer-events: none;
      z-index: 50;
      opacity: 0;
    }
    #${id} .kinetic-caption-phrase {
      max-width: 90%;
      font-family: ${theme.fontFamily};
      font-weight: 900;
      font-size: 54px;
      line-height: 1.35;
      color: #FFFFFF;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      text-shadow: 
        0 4px 16px rgba(0, 0, 0, 0.95),
        0 0 8px rgba(0, 0, 0, 0.9),
        -3px -3px 0 #000,
        3px -3px 0 #000,
        -3px 3px 0 #000,
        3px 3px 0 #000;
      text-align: center;
    }
    #${id} .cap-word {
      display: inline-block;
      margin: 0 0.38em;
      transform-origin: center bottom;
      will-change: transform, color;
    }
    #${id} .cap-word.power-word {
      color: #FFE600;
      text-shadow: 
        0 0 20px rgba(255, 230, 0, 0.6),
        0 4px 14px rgba(0, 0, 0, 0.95),
        -2px -2px 0 #000,
        2px -2px 0 #000,
        -2px 2px 0 #000,
        2px 2px 0 #000;
    }
  `;

  let js = `
    // Entrance
    tl.fromTo("#${id}", 
      { opacity: 0, y: 20, scale: 0.94 }, 
      { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "back.out(2)" }, 
      ${opts.startSec}
    );
  `;

  opts.words.forEach((w, i) => {
    const isPower = w.isPower || /^\d+|record|survived|freefall|impossible|danger|guinness/i.test(w.text);
    js += `
      tl.fromTo("#${id}-w-${i}",
        { scale: 1.10, color: "${isPower ? '#FF3B30' : '#FFE600'}" },
        { scale: 1.0, color: "${isPower ? '#FFE600' : '#FFFFFF'}", duration: 0.22, ease: "power2.out" },
        ${w.start}
      );
    `;
  });

  js += `
    // Exit
    tl.to("#${id}", 
      { opacity: 0, y: -12, duration: 0.14, ease: "power2.in" }, 
      ${Math.max(opts.startSec + 0.1, opts.endSec - 0.14)}
    );
  `;

  return { html, css, js };
}

/**
 * 2. Archival Newspaper Headline & Highlighter Wipe
 * Authentic vintage clipping that slides in with paper texture and angled marker wipe.
 */
export function renderNewspaperHeadline(opts: {
  id: string;
  sourceName: string;
  dateText: string;
  headline: string;
  highlightText: string;
  startSec: number;
  durationSec: number;
  position?: 'center' | 'top' | 'bottom';
  theme?: GraphicTheme;
}): { html: string; css: string; js: string } {
  const id = `newspaper-${opts.id}`;
  const highlightedHeadline = opts.headline.replace(
    opts.highlightText,
    `<span class="hl-wrap"><span class="hl-marker"></span><span class="hl-text">${opts.highlightText}</span></span>`
  );

  const html = `
    <div id="${id}" class="newspaper-container" data-start="${opts.startSec}" data-duration="${opts.durationSec}">
      <div class="newspaper-card">
        <div class="news-meta">
          <span class="news-source">${opts.sourceName}</span>
          <span class="news-rule"></span>
          <span class="news-date">${opts.dateText}</span>
        </div>
        <div class="news-divider-thick"></div>
        <h2 class="news-headline">${highlightedHeadline}</h2>
        <div class="news-divider-thin"></div>
        <div class="news-sub-stripes">
          <div class="stripe"></div>
          <div class="stripe"></div>
          <div class="stripe"></div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${id}.newspaper-container {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 40;
      opacity: 0;
    }
    #${id} .newspaper-card {
      width: 880px;
      background: #F4EEDD;
      color: #1A1817;
      padding: 38px 44px;
      border-radius: 4px;
      box-shadow: 
        0 24px 60px rgba(0, 0, 0, 0.75),
        0 4px 16px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(0, 0, 0, 0.15);
      transform-origin: center center;
    }
    #${id} .news-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'Times New Roman', serif;
      font-size: 19px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #3A3530;
      padding-bottom: 8px;
    }
    #${id} .news-divider-thick {
      height: 4px;
      background: #1A1817;
      margin-bottom: 16px;
    }
    #${id} .news-headline {
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 54px;
      font-weight: 900;
      line-height: 1.14;
      letter-spacing: -0.02em;
      text-transform: uppercase;
      color: #1A1817;
      margin: 12px 0 18px 0;
    }
    #${id} .news-divider-thin {
      height: 2px;
      background: #2A2520;
      margin-bottom: 12px;
    }
    #${id} .news-sub-stripes .stripe {
      height: 6px;
      background: #D8CEB8;
      margin-bottom: 5px;
      border-radius: 2px;
    }
    #${id} .news-sub-stripes .stripe:nth-child(2) { width: 92%; }
    #${id} .news-sub-stripes .stripe:nth-child(3) { width: 65%; }

    #${id} .hl-wrap {
      position: relative;
      display: inline-block;
      padding: 0 4px;
    }
    #${id} .hl-marker {
      position: absolute;
      inset: -2px -4px;
      background: #FFE600;
      opacity: 0.65;
      mix-blend-mode: multiply;
      transform-origin: left center;
      transform: scaleX(0);
      border-radius: 3px;
    }
    #${id} .hl-text {
      position: relative;
      z-index: 1;
    }
  `;

  const js = `
    // Newspaper slide & tilt
    tl.fromTo("#${id}", 
      { opacity: 0 }, 
      { opacity: 1, duration: 0.1 }, 
      ${opts.startSec}
    );
    tl.fromTo("#${id} .newspaper-card",
      { y: 180, rotation: -9, scale: 0.88, opacity: 0 },
      { y: 0, rotation: -2.2, scale: 1.0, opacity: 1, duration: 0.55, ease: "back.out(1.5)" },
      ${opts.startSec}
    );

    // Marker wipe across highlightText
    tl.fromTo("#${id} .hl-marker",
      { scaleX: 0 },
      { scaleX: 1, duration: 0.45, ease: "power2.inOut" },
      ${opts.startSec + 0.35}
    );

    // Subtle drift while on screen
    tl.to("#${id} .newspaper-card",
      { rotation: -1.4, y: -8, duration: ${opts.durationSec - 0.7}, ease: "sine.inOut" },
      ${opts.startSec + 0.55}
    );

    // Exit
    tl.to("#${id} .newspaper-card",
      { y: -120, rotation: 3, opacity: 0, duration: 0.35, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.35}
    );
  `;

  return { html, css, js };
}

/**
 * 3. Telemetry & Rapid Mechanical Odometer / Dial
 * High-speed rolling counter from 0 -> target with unit labels and precision tick.
 */
export function renderTelemetryCounter(opts: {
  id: string;
  targetValue: number;
  unit: string;
  label: string;
  subLabel?: string;
  startSec: number;
  durationSec: number;
  theme?: GraphicTheme;
}): { html: string; css: string; js: string } {
  const theme = opts.theme || DEFAULT_THEME;
  const id = `telemetry-${opts.id}`;

  const html = `
    <div id="${id}" class="telemetry-container" data-start="${opts.startSec}" data-duration="${opts.durationSec}">
      <div class="telemetry-hud-card">
        <div class="hud-top-bar">
          <span class="hud-tag">TELEMETRY // VERIFIED RECORD</span>
          <span class="hud-pulse-dot"></span>
        </div>
        <div class="hud-label">${opts.label}</div>
        <div class="hud-counter-row">
          <span id="${id}-num" class="hud-odometer">0</span>
          <span class="hud-unit">${opts.unit}</span>
        </div>
        ${opts.subLabel ? `<div class="hud-sub">${opts.subLabel}</div>` : ''}
        <div class="hud-graph-bar">
          <div id="${id}-bar" class="hud-bar-fill"></div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${id}.telemetry-container {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 40;
      opacity: 0;
    }
    #${id} .telemetry-hud-card {
      width: 780px;
      background: rgba(14, 21, 31, 0.94);
      border: 2px solid ${theme.primary};
      border-radius: 8px;
      padding: 34px 44px;
      box-shadow: 
        0 0 35px rgba(240, 120, 53, 0.25),
        0 24px 60px rgba(0, 0, 0, 0.85);
      color: #FFFFFF;
      font-family: ${theme.fontFamily};
      box-sizing: border-box;
      backdrop-filter: blur(12px);
    }
    #${id} .hud-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: ${theme.secondaryFont};
      font-size: 15px;
      letter-spacing: 0.15em;
      color: ${theme.primary};
      margin-bottom: 12px;
    }
    #${id} .hud-pulse-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #00FF66;
      box-shadow: 0 0 10px #00FF66;
    }
    #${id} .hud-label {
      font-size: 24px;
      font-weight: 700;
      color: #DDE3EA;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    #${id} .hud-counter-row {
      display: flex;
      align-items: baseline;
      gap: 16px;
      margin: 8px 0 14px 0;
    }
    #${id} .hud-odometer {
      font-size: 96px;
      font-weight: 900;
      line-height: 1.0;
      letter-spacing: -0.03em;
      color: #FFFFFF;
      font-variant-numeric: tabular-nums;
    }
    #${id} .hud-unit {
      font-size: 40px;
      font-weight: 800;
      color: ${theme.primary};
      letter-spacing: 0.05em;
    }
    #${id} .hud-sub {
      font-size: 18px;
      color: #9AA8B7;
      letter-spacing: 0.05em;
      margin-bottom: 18px;
      font-weight: 600;
      text-transform: uppercase;
    }
    #${id} .hud-graph-bar {
      width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 99px;
      overflow: hidden;
    }
    #${id} .hud-bar-fill {
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #F07835, #FFE600);
      border-radius: 99px;
    }
  `;

  const js = `
    // Entrance
    tl.fromTo("#${id}", 
      { opacity: 0 }, 
      { opacity: 1, duration: 0.1 }, 
      ${opts.startSec}
    );
    tl.fromTo("#${id} .telemetry-hud-card",
      { scale: 0.82, opacity: 0, y: 40 },
      { scale: 1.0, opacity: 1, y: 0, duration: 0.45, ease: "back.out(1.8)" },
      ${opts.startSec}
    );

    // Number ticker
    {
      const counterTarget = { val: 0 };
      const numEl = document.getElementById("${id}-num");
      tl.to(counterTarget, {
        val: ${opts.targetValue},
        duration: 1.4,
        ease: "power3.out",
        onUpdate: () => {
          if (numEl) numEl.innerText = Math.round(counterTarget.val).toLocaleString();
        }
      }, ${opts.startSec + 0.15});
    }

    // Bar fill
    tl.fromTo("#${id}-bar",
      { width: "0%" },
      { width: "100%", duration: 1.4, ease: "power3.out" },
      ${opts.startSec + 0.15}
    );

    // Exit
    tl.to("#${id} .telemetry-hud-card",
      { scale: 0.88, opacity: 0, y: -30, duration: 0.3, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.3}
    );
  `;

  return { html, css, js };
}

/**
 * 4. Spatial Route Map & Flight Vector Path
 * Animated SVG flight line drawing across coordinate grid with pulsating waypoint.
 */
export function renderRouteMap(opts: {
  id: string;
  origin: string;
  destination: string;
  distanceOrAlt: string;
  startSec: number;
  durationSec: number;
  theme?: GraphicTheme;
}): { html: string; css: string; js: string } {
  const theme = opts.theme || DEFAULT_THEME;
  const id = `route-${opts.id}`;

  const html = `
    <div id="${id}" class="route-map-container" data-start="${opts.startSec}" data-duration="${opts.durationSec}">
      <div class="route-overlay-card">
        <div class="route-header">
          <span class="route-tag">FLIGHT PATH TELEMETRY</span>
          <span class="route-coords">LAT: 50°49' N // LON: 14°20' E</span>
        </div>
        <svg class="route-svg" viewBox="0 0 800 360" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Grid Background lines -->
          <line x1="0" y1="90" x2="800" y2="90" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4" />
          <line x1="0" y1="180" x2="800" y2="180" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4" />
          <line x1="0" y1="270" x2="800" y2="270" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4" />
          <line x1="200" y1="0" x2="200" y2="360" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4" />
          <line x1="400" y1="0" x2="400" y2="360" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4" />
          <line x1="600" y1="0" x2="600" y2="360" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4" />

          <!-- Dynamic Flight Path -->
          <path id="${id}-flight-path" d="M 80 260 C 260 80, 520 80, 720 180" stroke="${theme.primary}" stroke-width="5" stroke-linecap="round" stroke-dasharray="10 6" />

          <!-- Origin Waypoint -->
          <circle cx="80" cy="260" r="9" fill="${theme.primary}" />
          <circle cx="80" cy="260" r="18" stroke="${theme.primary}" stroke-width="2" opacity="0.5" />
          <text x="80" y="305" fill="#FFFFFF" font-family="${theme.fontFamily}" font-size="20" font-weight="800" text-anchor="middle">${opts.origin}</text>

          <!-- Destination / Crash Waypoint -->
          <circle id="${id}-dest-dot" cx="720" cy="180" r="10" fill="#FF3B30" />
          <circle id="${id}-dest-ping" cx="720" cy="180" r="24" stroke="#FF3B30" stroke-width="3" opacity="0" />
          <text x="720" y="225" fill="#FFFFFF" font-family="${theme.fontFamily}" font-size="20" font-weight="800" text-anchor="middle">${opts.destination}</text>
        </svg>
        <div class="route-footer">
          <span class="route-stat-box">CRUISING ALTITUDE: <strong>${opts.distanceOrAlt}</strong></span>
          <span class="route-stat-box">STATUS: <strong style="color: #FF3B30;">DISINTEGRATION</strong></span>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${id}.route-map-container {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 40;
      opacity: 0;
    }
    #${id} .route-overlay-card {
      width: 880px;
      background: rgba(12, 18, 26, 0.95);
      border: 2px solid rgba(240, 120, 53, 0.7);
      border-radius: 12px;
      padding: 32px 38px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(14px);
    }
    #${id} .route-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: ${theme.secondaryFont};
      font-size: 15px;
      color: ${theme.primary};
      letter-spacing: 0.1em;
      margin-bottom: 12px;
    }
    #${id} .route-svg {
      width: 100%;
      height: 320px;
      display: block;
    }
    #${id} .route-footer {
      display: flex;
      justify-content: space-between;
      font-family: ${theme.fontFamily};
      font-size: 16px;
      color: #C0CCD8;
      margin-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      padding-top: 12px;
    }
    #${id} .route-stat-box strong {
      color: #FFFFFF;
      font-weight: 800;
    }
  `;

  const js = `
    // Entrance
    tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: 0.1 }, ${opts.startSec});
    tl.fromTo("#${id} .route-overlay-card",
      { scale: 0.88, opacity: 0, y: 30 },
      { scale: 1.0, opacity: 1, y: 0, duration: 0.5, ease: "power3.out" },
      ${opts.startSec}
    );

    // Draw flight line
    {
      const pathEl = document.getElementById("${id}-flight-path");
      const pathLen = pathEl ? pathEl.getTotalLength() : 800;
      tl.fromTo("#${id}-flight-path",
        { strokeDasharray: pathLen, strokeDashoffset: pathLen },
        { strokeDashoffset: 0, duration: 1.6, ease: "power1.inOut" },
        ${opts.startSec + 0.2}
      );
    }

    // Waypoint radar ping
    tl.fromTo("#${id}-dest-ping",
      { scale: 0.5, opacity: 1, transformOrigin: "720px 180px" },
      { scale: 2.2, opacity: 0, duration: 0.8, repeat: -1, ease: "power2.out" },
      ${opts.startSec + 1.2}
    );

    // Exit
    tl.to("#${id} .route-overlay-card",
      { scale: 0.9, opacity: 0, y: -25, duration: 0.35, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.35}
    );
  `;

  return { html, css, js };
}

/**
 * 5. Floating 2.5D Badge / Polaroid Evidence Slap
 * Slaps photo cutout with 3D perspective tilt, contact drop shadow, and floating drift.
 */
export function renderPolaroidBadge(opts: {
  id: string;
  imageUrl: string;
  title: string;
  subtitle?: string;
  startSec: number;
  durationSec: number;
  rotation?: number;
  theme?: GraphicTheme;
}): { html: string; css: string; js: string } {
  const theme = opts.theme || DEFAULT_THEME;
  const id = `badge-${opts.id}`;
  const rot = opts.rotation ?? -3.5;

  const html = `
    <div id="${id}" class="polaroid-container" data-start="${opts.startSec}" data-duration="${opts.durationSec}">
      <div class="polaroid-wrapper">
        <div class="tape-corner"></div>
        <div class="polaroid-photo-frame">
          <img src="${opts.imageUrl}" class="polaroid-img" alt="${opts.title}" />
        </div>
        <div class="polaroid-caption">
          <div class="polaroid-title">${opts.title}</div>
          ${opts.subtitle ? `<div class="polaroid-sub">${opts.subtitle}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  const css = `
    #${id}.polaroid-container {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 45;
      opacity: 0;
      perspective: 1200px;
    }
    #${id} .polaroid-wrapper {
      position: relative;
      width: 460px;
      background: #F8F5EE;
      padding: 16px 16px 24px 16px;
      border-radius: 4px;
      box-shadow: 
        0 28px 65px rgba(0, 0, 0, 0.75),
        0 4px 15px rgba(0, 0, 0, 0.4);
      transform-origin: center center;
    }
    #${id} .tape-corner {
      position: absolute;
      top: -12px;
      right: 32px;
      width: 90px;
      height: 28px;
      background: rgba(235, 230, 215, 0.75);
      border: 1px solid rgba(0,0,0,0.08);
      transform: rotate(4deg);
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      z-index: 10;
    }
    #${id} .polaroid-photo-frame {
      width: 100%;
      height: 480px;
      background: #000;
      overflow: hidden;
      border-radius: 2px;
    }
    #${id} .polaroid-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    #${id} .polaroid-caption {
      margin-top: 16px;
      text-align: center;
      font-family: ${theme.fontFamily};
    }
    #${id} .polaroid-title {
      font-size: 26px;
      font-weight: 800;
      color: #1A1817;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    #${id} .polaroid-sub {
      font-size: 16px;
      font-weight: 600;
      color: ${theme.primary};
      letter-spacing: 0.08em;
      margin-top: 4px;
      text-transform: uppercase;
    }
  `;

  const js = `
    // Slap entrance with 3D tilt
    tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: 0.05 }, ${opts.startSec});
    tl.fromTo("#${id} .polaroid-wrapper",
      { scale: 1.4, rotation: ${rot + 12}, rotateX: 18, opacity: 0, y: -60 },
      { scale: 1.0, rotation: ${rot}, rotateX: 0, opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.8)" },
      ${opts.startSec}
    );

    // Floating breathing drift
    tl.to("#${id} .polaroid-wrapper",
      { y: "+=14", rotation: ${rot - 1.5}, duration: ${opts.durationSec - 0.7}, ease: "sine.inOut" },
      ${opts.startSec + 0.5}
    );

    // Exit
    tl.to("#${id} .polaroid-wrapper",
      { scale: 0.8, opacity: 0, y: 80, duration: 0.35, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.35}
    );
  `;

  return { html, css, js };
}

/**
 * 6. Cockpit Audio Teletype & Radio Waveform
 * Types out black box transcript with glowing phosphor CRT letters and audio waveform.
 */
export function renderCockpitTeletype(opts: {
  id: string;
  speaker: string;
  transcript: string;
  startSec: number;
  durationSec: number;
  theme?: GraphicTheme;
}): { html: string; css: string; js: string } {
  const theme = opts.theme || DEFAULT_THEME;
  const id = `teletype-${opts.id}`;

  const html = `
    <div id="${id}" class="teletype-container" data-start="${opts.startSec}" data-duration="${opts.durationSec}">
      <div class="teletype-terminal-card">
        <div class="term-header">
          <span class="term-rec-dot"></span>
          <span class="term-channel">CVR // COCKPIT VOICE RECORDER</span>
          <span class="term-speaker">[SPEAKER: ${opts.speaker}]</span>
        </div>
        <div class="term-waveform-row">
          <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
          <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
          <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
        </div>
        <div id="${id}-text" class="term-body"></div>
      </div>
    </div>
  `;

  const css = `
    #${id}.teletype-container {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 45;
      opacity: 0;
    }
    #${id} .teletype-terminal-card {
      width: 820px;
      background: rgba(10, 15, 12, 0.95);
      border: 2px solid #00FF66;
      border-radius: 6px;
      padding: 30px 36px;
      box-shadow: 
        0 0 40px rgba(0, 255, 102, 0.25),
        0 24px 60px rgba(0, 0, 0, 0.85);
      font-family: ${theme.secondaryFont};
      color: #00FF66;
      box-sizing: border-box;
    }
    #${id} .term-header {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 15px;
      letter-spacing: 0.12em;
      margin-bottom: 16px;
      border-bottom: 1px solid rgba(0, 255, 102, 0.3);
      padding-bottom: 10px;
    }
    #${id} .term-rec-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #FF3B30;
      box-shadow: 0 0 10px #FF3B30;
      animation: blink 1s infinite;
    }
    #${id} .term-waveform-row {
      display: flex;
      align-items: center;
      gap: 5px;
      height: 28px;
      margin-bottom: 16px;
    }
    #${id} .term-waveform-row .bar {
      width: 5px;
      height: 14px;
      background: #00FF66;
      border-radius: 2px;
      opacity: 0.7;
    }
    #${id} .term-body {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.35;
      letter-spacing: 0.05em;
      color: #FFFFFF;
      min-height: 80px;
      text-shadow: 0 0 12px rgba(0, 255, 102, 0.5);
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.2; }
    }
  `;

  // Escape text for JS string
  const cleanText = JSON.stringify(opts.transcript);

  const js = `
    // Entrance
    tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: 0.1 }, ${opts.startSec});
    tl.fromTo("#${id} .teletype-terminal-card",
      { scale: 0.9, opacity: 0 },
      { scale: 1.0, opacity: 1, duration: 0.35, ease: "power2.out" },
      ${opts.startSec}
    );

    // Waveform dance
    tl.to("#${id} .term-waveform-row .bar", {
      scaleY: 2.2,
      duration: 0.2,
      stagger: 0.05,
      yoyo: true,
      repeat: 6,
      ease: "sine.inOut"
    }, ${opts.startSec + 0.1});

    // Teletype character typewriter
    {
      const fullText = ${cleanText};
      const textEl = document.getElementById("${id}-text");
      const typeDuration = Math.min(2.5, fullText.length * 0.04);
      const textProgress = { charCount: 0 };
      tl.to(textProgress, {
        charCount: fullText.length,
        duration: typeDuration,
        ease: "none",
        onUpdate: () => {
          if (textEl) {
            const count = Math.round(textProgress.charCount);
            textEl.innerHTML = fullText.slice(0, count) + '<span style="opacity:0.8;color:#00FF66;">█</span>';
          }
        }
      }, ${opts.startSec + 0.2});
    }

    // Exit
    tl.to("#${id} .teletype-terminal-card",
      { opacity: 0, scale: 0.95, duration: 0.3 },
      ${opts.startSec + opts.durationSec - 0.3}
    );
  `;

  return { html, css, js };
}

/**
 * 7. Studio Cinematic Title
 * High-retention title card with bold typography and opaque dark backing for pristine clarity over footage.
 */
export function renderCinematicTitle(opts: {
  id: string;
  title: string;
  detail?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  startSec: number;
  durationSec: number;
  theme?: GraphicTheme;
  width?: number;
  height?: number;
}): { html: string; css: string; js: string } {
  const theme = opts.theme || DEFAULT_THEME;
  const id = `title-${opts.id}`;
  const bounds = opts.bounds || {
    x: 40,
    y: (opts.height || 1080) * 0.7,
    width: (opts.width || 1920) * 0.45,
    height: 120,
  };

  const html = `
    <div id="${id}" class="cinematic-title-container" data-start="${opts.startSec}" data-duration="${opts.durationSec}">
      <div class="title-card">
        <div class="title-tag-row">
          <span class="title-accent-bar"></span>
          <span class="title-tag">ARCHIVAL // CHAPTER RECORD</span>
        </div>
        <div class="title-headline">${opts.title}</div>
        ${opts.detail ? `<div class="title-detail">${opts.detail}</div>` : ''}
      </div>
    </div>
  `;

  const css = `
    #${id}.cinematic-title-container {
      position: absolute;
      left: ${bounds.x}px;
      top: ${bounds.y}px;
      width: ${bounds.width}px;
      min-height: ${bounds.height}px;
      pointer-events: none;
      z-index: 30;
      opacity: 0;
    }
    #${id} .title-card {
      width: 100%;
      height: 100%;
      background: #080d16;
      border: 2px solid #FFA834;
      border-left: 6px solid #FFA834;
      border-radius: 8px;
      padding: 16px 22px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.9);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    #${id} .title-tag-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    #${id} .title-accent-bar {
      display: inline-block;
      width: 16px;
      height: 2px;
      background: #FFA834;
    }
    #${id} .title-tag {
      font-family: ${theme.secondaryFont};
      font-size: 11px;
      font-weight: 700;
      color: #FFA834;
      letter-spacing: 0.12em;
    }
    #${id} .title-headline {
      font-family: ${theme.fontFamily};
      font-size: 24px;
      font-weight: 900;
      color: #FFFFFF;
      line-height: 1.25;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      text-shadow: 0 2px 4px rgba(0,0,0,0.8);
    }
    #${id} .title-detail {
      font-family: ${theme.fontFamily};
      font-size: 13px;
      font-weight: 500;
      color: #94A3B8;
      margin-top: 4px;
      line-height: 1.35;
    }
  `;

  const js = `
    // Title entrance
    tl.fromTo("#${id}",
      { opacity: 0, y: 30, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.5)" },
      ${opts.startSec}
    );

    // Subtle breathing hold
    tl.to("#${id}",
      { y: -4, duration: ${opts.durationSec - 0.75}, ease: "sine.inOut" },
      ${opts.startSec + 0.45}
    );

    // Title exit
    tl.to("#${id}",
      { opacity: 0, y: -20, duration: 0.3, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.3}
    );
  `;

  return { html, css, js };
}

/**
 * 8. Object Spotlight Reticle & Callout
 * Pulsing reticle anchor ring with dynamic leader line to target coordinates.
 */
export function renderSpotlight(opts: {
  id: string;
  title: string;
  detail?: string;
  bounds: { x: number; y: number; width: number; height: number };
  targetBox?: { x: number; y: number; width: number; height: number };
  startSec: number;
  durationSec: number;
  theme?: GraphicTheme;
  width?: number;
  height?: number;
}): { html: string; css: string; js: string } {
  const theme = opts.theme || DEFAULT_THEME;
  const id = `spotlight-${opts.id}`;
  const width = opts.width || 1080;
  const height = opts.height || 1920;
  const b = opts.bounds;
  const t = opts.targetBox;

  let svgContent = '';
  if (t) {
    const cx = t.x + t.width / 2;
    const cy = t.y + t.height / 2;
    const rx = t.width / 2 + 4;
    const ry = t.height / 2 + 4;

    const fromX = Math.max(b.x, Math.min(cx, b.x + b.width));
    const fromY = Math.max(b.y, Math.min(cy, b.y + b.height));
    const dx = fromX - cx;
    const dy = fromY - cy;
    const factor = 1 / (Math.sqrt(dx * dx / (rx * rx) + dy * dy / (ry * ry)) || 1);
    const toX = cx + dx * factor;
    const toY = cy + dy * factor;

    svgContent = `
      <svg width="${width}" height="${height}" style="position: absolute; inset: 0; pointer-events: none; overflow: visible;">
        <defs>
          <filter id="${id}-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <!-- Outer shadow ring for contrast -->
        <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#07111D" stroke-width="7" opacity="0.85" />
        <!-- Amber spotlight anchor ellipse (passes through west = t.x - 4, centerY) -->
        <ellipse id="${id}-ring" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#FFA834" stroke-width="3" filter="url(#${id}-glow)" />
        <!-- Leader path from card to target -->
        <path id="${id}-leader" d="M${fromX},${fromY} Q${fromX},${toY} ${toX},${toY}" fill="none" stroke="#FFA834" stroke-width="2.5" />
      </svg>
    `;
  }

  const html = `
    <div id="${id}" class="spotlight-container" data-start="${opts.startSec}" data-duration="${opts.durationSec}">
      ${svgContent}
      <div class="spotlight-label-card" style="left: ${b.x}px; top: ${b.y}px; width: ${b.width}px; height: ${b.height}px;">
        <div class="spotlight-title">${opts.title}</div>
        ${opts.detail ? `<div class="spotlight-detail">${opts.detail}</div>` : ''}
      </div>
    </div>
  `;

  const css = `
    #${id}.spotlight-container {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 35;
      opacity: 0;
    }
    #${id} .spotlight-label-card {
      position: absolute;
      background: #080d16;
      border: 1px solid rgba(255, 168, 52, 0.5);
      border-left: 4px solid #FFA834;
      border-radius: 6px;
      padding: 10px 14px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    #${id} .spotlight-title {
      font-family: ${theme.fontFamily};
      font-size: 16px;
      font-weight: 800;
      color: #FFFFFF;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    #${id} .spotlight-detail {
      font-family: ${theme.fontFamily};
      font-size: 12px;
      color: #94A3B8;
      margin-top: 2px;
    }
  `;

  const js = `
    // Spotlight entrance
    tl.fromTo("#${id}",
      { opacity: 0 },
      { opacity: 1, duration: 0.35, ease: "power2.out" },
      ${opts.startSec}
    );

    ${t ? `
    // Pulse opacity on the ring
    tl.fromTo("#${id}-ring",
      { strokeOpacity: 0.8 },
      { strokeOpacity: 1.0, duration: 0.5, yoyo: true, repeat: ${Math.max(1, Math.floor(opts.durationSec))}, ease: "sine.inOut" },
      ${opts.startSec + 0.1}
    );
    ` : ''}

    // Spotlight exit
    tl.to("#${id}",
      { opacity: 0, duration: 0.25, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.25}
    );
  `;

  return { html, css, js };
}
