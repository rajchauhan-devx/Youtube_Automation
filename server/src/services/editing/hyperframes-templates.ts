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
      bottom: 12%;
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
  const theme = opts.theme || DEFAULT_THEME;
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
      left: 0;
      right: 0;
      bottom: 24%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      pointer-events: none;
      z-index: 40;
      opacity: 0;
    }
    #${id} .newspaper-card {
      width: 92%;
      max-width: 940px;
      background: rgba(18, 14, 10, 0.88);
      backdrop-filter: blur(12px);
      border: 2px solid ${theme.primary};
      color: #FFFFFF;
      padding: 22px 30px;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.95);
      box-sizing: border-box;
      transform-origin: center bottom;
    }
    #${id} .news-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: ${theme.secondaryFont};
      font-size: 15px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: ${theme.primary};
      padding-bottom: 6px;
    }
    #${id} .news-divider-thick {
      height: 3px;
      background: ${theme.primary};
      margin-bottom: 12px;
      border-radius: 2px;
    }
    #${id} .news-headline {
      font-family: ${theme.fontFamily};
      font-size: 34px;
      font-weight: 900;
      line-height: 1.25;
      letter-spacing: -0.01em;
      color: #FFF3D7;
      margin: 8px 0 12px 0;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
    }
    #${id} .news-divider-thin {
      height: 1px;
      background: rgba(255, 255, 255, 0.15);
      margin-bottom: 8px;
    }
    #${id} .news-sub-stripes .stripe {
      display: none;
      height: 4px;
      background: rgba(255, 255, 255, 0.15);
      margin-bottom: 4px;
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
      background: ${theme.primary};
      opacity: 0.45;
      transform-origin: left center;
      transform: scaleX(0);
      border-radius: 3px;
    }
    #${id} .hl-text {
      position: relative;
      z-index: 1;
      color: #FFE600;
      text-shadow: 0 0 16px rgba(255, 230, 0, 0.6);
    }
  `;

  const js = `
    // Sleek lower-third entrance
    tl.fromTo("#${id}",
      { opacity: 0 },
      { opacity: 1, duration: 0.08 },
      ${opts.startSec}
    );
    tl.fromTo("#${id} .newspaper-card",
      { y: 50, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" },
      ${opts.startSec}
    );

    // Marker wipe across highlightText
    tl.fromTo("#${id} .hl-marker",
      { scaleX: 0 },
      { scaleX: 1, duration: 0.4, ease: "power2.inOut" },
      ${opts.startSec + 0.25}
    );

    // Clean exit: vanish quickly so background video & character are 100% visible
    tl.to("#${id} .newspaper-card",
      { y: 35, opacity: 0, duration: 0.3, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.3}
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
          <span class="hud-tag">QUANTITY</span>
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
      left: 5%;
      bottom: 24%;
      display: flex;
      align-items: flex-end;
      justify-content: flex-start;
      pointer-events: none;
      z-index: 40;
      opacity: 0;
    }
    #${id} .telemetry-hud-card {
      width: auto;
      max-width: 640px;
      background: rgba(10, 15, 29, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-left: 5px solid ${theme.primary};
      padding: 20px 28px;
      border-radius: 12px;
      color: #FFFFFF;
      font-family: ${theme.fontFamily};
      box-sizing: border-box;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.9);
    }
    #${id} .hud-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: ${theme.secondaryFont};
      font-size: 14px;
      letter-spacing: 0.14em;
      color: ${theme.primary};
      font-weight: 800;
      margin-bottom: 8px;
    }
    #${id} .hud-pulse-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #00FF66;
      box-shadow: 0 0 12px #00FF66;
    }
    #${id} .hud-label {
      font-size: 22px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 6px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
    }
    #${id} .hud-counter-row {
      display: flex;
      align-items: baseline;
      gap: 14px;
      margin: 6px 0 10px 0;
    }
    #${id} .hud-odometer {
      font-size: 68px;
      font-weight: 900;
      line-height: 1.0;
      letter-spacing: -0.02em;
      color: #FFFFFF;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.95);
    }
    #${id} .hud-unit {
      font-size: 30px;
      font-weight: 800;
      color: ${theme.primary};
      letter-spacing: 0.05em;
    }
    #${id} .hud-sub {
      font-size: 16px;
      color: #CBD5E1;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    #${id} .hud-graph-bar {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 99px;
      overflow: hidden;
    }
    #${id} .hud-bar-fill {
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, ${theme.primary}, #FFE600);
      border-radius: 99px;
    }
  `;

  const js = `
    // Sleek lower-third HUD entry
    tl.fromTo("#${id}",
      { opacity: 0 },
      { opacity: 1, duration: 0.08 },
      ${opts.startSec}
    );
    tl.fromTo("#${id} .telemetry-hud-card",
      { x: -40, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      ${opts.startSec}
    );

    // Number ticker
    {
      const counterTarget = { val: 0 };
      const numEl = document.getElementById("${id}-num");
      tl.to(counterTarget, {
        val: ${opts.targetValue},
        duration: Math.min(1.2, ${opts.durationSec * 0.65}),
        ease: "power2.out",
        onUpdate: () => {
          if (numEl) numEl.innerText = Math.round(counterTarget.val).toLocaleString();
        }
      }, ${opts.startSec + 0.1});
    }

    // Bar fill
    tl.fromTo("#${id}-bar",
      { width: "0%" },
      { width: "100%", duration: Math.min(1.2, ${opts.durationSec * 0.65}), ease: "power2.out" },
      ${opts.startSec + 0.1}
    );

    // Clean exit: vanish so background video & scene are 100% visible
    tl.to("#${id} .telemetry-hud-card",
      { x: -30, opacity: 0, duration: 0.3, ease: "power2.in" },
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
          <span class="route-tag">SCHEMATIC ROUTE</span>
          <span class="route-coords">Illustrative · not to scale</span>
        </div>
        <svg class="route-svg" viewBox="0 0 800 360" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="${id}-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <!-- Grid Background lines -->
          <line x1="0" y1="90" x2="800" y2="90" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 4" />
          <line x1="0" y1="180" x2="800" y2="180" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 4" />
          <line x1="0" y1="270" x2="800" y2="270" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 4" />
          <line x1="200" y1="0" x2="200" y2="360" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 4" />
          <line x1="400" y1="0" x2="400" y2="360" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 4" />
          <line x1="600" y1="0" x2="600" y2="360" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 4" />

          <!-- Dynamic Flight Path -->
          <path id="${id}-flight-path" d="M 80 260 C 260 80, 520 80, 720 180" stroke="${theme.primary}" stroke-width="6" stroke-linecap="round" stroke-dasharray="12 8" filter="url(#${id}-glow)" />

          <!-- Origin Waypoint -->
          <circle cx="80" cy="260" r="10" fill="${theme.primary}" />
          <circle cx="80" cy="260" r="20" stroke="${theme.primary}" stroke-width="2.5" opacity="0.6" />
          <text x="80" y="308" fill="#FFFFFF" font-family="${theme.fontFamily}" font-size="22" font-weight="900" text-anchor="middle" filter="drop-shadow(0 2px 4px #000)">${opts.origin}</text>

          <!-- Destination / Target Waypoint -->
          <circle id="${id}-dest-dot" cx="720" cy="180" r="12" fill="#FF3B30" />
          <circle id="${id}-dest-ping" cx="720" cy="180" r="28" stroke="#FF3B30" stroke-width="3.5" opacity="0" />
          <text x="720" y="228" fill="#FFFFFF" font-family="${theme.fontFamily}" font-size="22" font-weight="900" text-anchor="middle" filter="drop-shadow(0 2px 4px #000)">${opts.destination}</text>
        </svg>
        <div class="route-footer">
          <span class="route-stat-box"><strong>${opts.distanceOrAlt}</strong></span>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${id}.route-map-container {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 24%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      pointer-events: none;
      z-index: 40;
      opacity: 0;
    }
    #${id} .route-overlay-card {
      width: 92%;
      max-width: 920px;
      background: rgba(10, 15, 29, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-left: 5px solid ${theme.primary};
      border-radius: 12px;
      padding: 18px 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.9);
      box-sizing: border-box;
    }
    #${id} .route-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: ${theme.secondaryFont};
      font-size: 14px;
      color: ${theme.primary};
      font-weight: 800;
      letter-spacing: 0.12em;
      margin-bottom: 8px;
    }
    #${id} .route-coords {
      font-size: 12px;
      color: #94A3B8;
      font-weight: 500;
    }
    #${id} .route-svg {
      width: 100%;
      height: 190px;
      display: block;
    }
    #${id} .route-footer {
      display: flex;
      justify-content: space-between;
      font-family: ${theme.fontFamily};
      font-size: 16px;
      color: #CBD5E1;
      margin-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
      padding-top: 8px;
    }
    #${id} .route-stat-box strong {
      color: ${theme.primary};
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
  bounds?: { x: number; y: number; width: number; height: number };
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
      left: ${opts.bounds ? opts.bounds.x + 'px' : '5%'};
      ${opts.bounds ? `top:${opts.bounds.y}px;width:${opts.bounds.width}px;height:${opts.bounds.height}px;` : 'bottom:12%;'}
      display: flex;
      align-items: flex-end;
      justify-content: flex-start;
      pointer-events: none;
      z-index: 45;
      opacity: 0;
    }
    #${id} .polaroid-wrapper {
      text-shadow: 0 2px 4px #000000, 0 0 2px #000000;
      position: relative;
      display: flex;
      align-items: center;
      gap: 16px;
      width: ${opts.bounds ? '100%' : 'auto'};
      height: ${opts.bounds ? '100%' : 'auto'};
      max-width: ${opts.bounds ? 'none' : '560px'};
      background: transparent;
      padding: ${opts.bounds && opts.bounds.height < 100 ? '6px 12px' : '12px 20px 12px 14px'};
      border-radius: 8px;
      border: none;
      box-shadow: none;
      box-sizing: border-box;
    }
    #${id} .tape-corner { display: none; }
    #${id} .polaroid-photo-frame {
      display: none;
      ${opts.bounds && opts.bounds.height < 100 ? 'display:none;' : ''}
      width: 74px;
      height: 74px;
      min-width: 74px;
      background: #000;
      overflow: hidden;
      border-radius: 6px;
      border: none;
    }
    #${id} .polaroid-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    #${id} .polaroid-caption {
      text-align: left;
      font-family: ${theme.fontFamily};
    }
    #${id} .polaroid-title {
      font-size: ${opts.bounds ? Math.max(12, Math.min(24, opts.bounds.height * 0.32)) + 'px' : '22px'};
      font-weight: 800;
      color: #FFFFFF;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1.2;
    }
    #${id} .polaroid-sub {
      font-size: 14px;
      font-weight: 600;
      color: ${theme.primary};
      letter-spacing: 0.08em;
      margin-top: 4px;
      text-transform: uppercase;
      font-family: ${theme.secondaryFont};
    }
  `;

  const js = `
    // Sleek lower-third badge entrance
    tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: 0.05 }, ${opts.startSec});
    tl.fromTo("#${id} .polaroid-wrapper",
      { x: -50, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      ${opts.startSec}
    );

    // Clean exit: slide out quickly so character & scene are 100% visible
    tl.to("#${id} .polaroid-wrapper",
      { x: -35, opacity: 0, duration: 0.3, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.3}
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
      left: 5%;
      right: 5%;
      bottom: 12%;
      display: flex;
      align-items: flex-end;
      justify-content: flex-start;
      pointer-events: none;
      z-index: 45;
      opacity: 0;
    }
    #${id} .teletype-terminal-card {
      text-shadow: 0 2px 4px #000000, 0 0 2px #000000;
      width: 92%;
      max-width: 860px;
      background: transparent;
      border: none;
      border-radius: 8px;
      padding: 14px 20px;
      box-shadow: none;
      font-family: ${theme.secondaryFont};
      color: #00FF66;
      box-sizing: border-box;
    }
    #${id} .term-header {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      letter-spacing: 0.12em;
      margin-bottom: 10px;
      border-bottom: 1px solid rgba(0, 255, 102, 0.25);
      padding-bottom: 6px;
    }
    #${id} .term-rec-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #FF3B30;
      box-shadow: 0 0 10px #FF3B30;
      animation: blink 1s infinite;
    }
    #${id} .term-waveform-row {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 18px;
      margin-bottom: 10px;
    }
    #${id} .term-waveform-row .bar {
      width: 4px;
      height: 10px;
      background: #00FF66;
      border-radius: 2px;
      opacity: 0.7;
    }
    #${id} .term-body {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.3;
      letter-spacing: 0.04em;
      color: #FFFFFF;
      min-height: 48px;
      text-shadow: 0 0 10px rgba(0, 255, 102, 0.4);
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
    tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: 0.08 }, ${opts.startSec});
    tl.fromTo("#${id} .teletype-terminal-card",
      { y: 35, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      ${opts.startSec}
    );

    // Waveform dance
    tl.to("#${id} .term-waveform-row .bar", {
      scaleY: 1.8,
      duration: 0.15,
      stagger: 0.04,
      yoyo: true,
      repeat: 5,
      ease: "sine.inOut"
    }, ${opts.startSec + 0.05});

    // Teletype character typewriter (fast, punchy)
    {
      const fullText = ${cleanText};
      const textEl = document.getElementById("${id}-text");
      const typeDuration = Math.min(1.2, fullText.length * 0.025);
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
      }, ${opts.startSec + 0.1});
    }

    // Clean exit: vanish so background video & scene are 100% visible
    tl.to("#${id} .teletype-terminal-card",
      { y: 25, opacity: 0, duration: 0.3, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.3}
    );
  `;

  return { html, css, js };
}

/**
 * 7. Studio Cinematic Title
 * Free-floating title typography with glyph shadows for contrast over footage.
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
    x: 60,
    y: (opts.height || 1920) * 0.22,
    width: (opts.width || 1080) * 0.88,
    height: 160,
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
        <div id="${id}-sweep" class="title-accent-sweep"></div>
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
      background: rgba(10, 15, 29, 0.85);
      backdrop-filter: blur(12px);
      border-left: 5px solid ${theme.primary};
      border-radius: 8px;
      padding: 20px 28px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.9);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    #${id} .title-tag-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    #${id} .title-accent-bar {
      display: inline-block;
      width: 20px;
      height: 3px;
      background: ${theme.primary};
      border-radius: 2px;
    }
    #${id} .title-tag {
      font-family: ${theme.secondaryFont};
      font-size: 14px;
      font-weight: 800;
      color: ${theme.primary};
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    #${id} .title-headline {
      font-family: ${theme.fontFamily};
      font-size: 38px;
      font-weight: 900;
      color: #FFFFFF;
      line-height: 1.25;
      letter-spacing: 0.02em;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.95);
    }
    #${id} .title-detail {
      font-family: ${theme.fontFamily};
      font-size: 18px;
      font-weight: 600;
      color: #CBD5E1;
      margin-top: 6px;
      line-height: 1.35;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    }
    #${id} .title-accent-sweep {
      width: 0%;
      height: 3px;
      background: linear-gradient(90deg, ${theme.primary}, #FFFFFF);
      margin-top: 12px;
      border-radius: 2px;
      box-shadow: 0 0 8px ${theme.primary};
    }
  `;

  const js = `
    // Title entrance
    tl.fromTo("#${id}",
      { opacity: 0, y: 30, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.5)" },
      ${opts.startSec}
    );

    // Accent underline sweep
    tl.to("#${id}-sweep",
      { width: "100%", duration: 0.8, ease: "power2.out" },
      ${opts.startSec + 0.15}
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
    const rx = Math.max(28, t.width / 2 + 6);
    const ry = Math.max(28, t.height / 2 + 6);

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
          <filter id="${id}-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <!-- Outer contrast ring -->
        <ellipse cx="${cx}" cy="${cy}" rx="${rx + 18}" ry="${ry + 18}" fill="none" stroke="#07111D" stroke-width="6" opacity="0.8" />
        <!-- Rotating outer dashed reticle ring -->
        <ellipse id="${id}-dashed" cx="${cx}" cy="${cy}" rx="${rx + 18}" ry="${ry + 18}" fill="none" stroke="${theme.primary}" stroke-width="2.5" stroke-dasharray="10 8" opacity="0.85" />
        <!-- Inner glowing targeting ring -->
        <ellipse id="${id}-ring" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${theme.primary}" stroke-width="3.5" filter="url(#${id}-glow)" />
        <!-- Crosshairs N, S, E, W -->
        <line x1="${cx - rx - 14}" y1="${cy}" x2="${cx - rx + 4}" y2="${cy}" stroke="${theme.primary}" stroke-width="3" stroke-linecap="round" />
        <line x1="${cx + rx - 4}" y1="${cy}" x2="${cx + rx + 14}" y2="${cy}" stroke="${theme.primary}" stroke-width="3" stroke-linecap="round" />
        <line x1="${cx}" y1="${cy - ry - 14}" x2="${cx}" y2="${cy - ry + 4}" stroke="${theme.primary}" stroke-width="3" stroke-linecap="round" />
        <line x1="${cx}" y1="${cy + ry - 4}" x2="${cx}" y2="${cy + ry + 14}" stroke="${theme.primary}" stroke-width="3" stroke-linecap="round" />
        <!-- Center anchor dot -->
        <circle cx="${cx}" cy="${cy}" r="4" fill="${theme.primary}" />
        <!-- Leader path from card to target -->
        <path id="${id}-leader" d="M${fromX},${fromY} Q${fromX},${toY} ${toX},${toY}" fill="none" stroke="${theme.primary}" stroke-width="3" stroke-linecap="round" />
        <circle cx="${fromX}" cy="${fromY}" r="4.5" fill="${theme.primary}" />
        <circle cx="${toX}" cy="${toY}" r="4.5" fill="${theme.primary}" />
      </svg>
    `;
  }

  const html = `
    <div id="${id}" class="spotlight-container" data-start="${opts.startSec}" data-duration="${opts.durationSec}">
      ${svgContent}
      <div class="spotlight-label-card" style="left: ${b.x}px; top: ${b.y}px; width: ${b.width}px; min-height: ${b.height}px;">
        <div class="spotlight-tag">TARGET LOCKED // IDENTIFIED</div>
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
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(12px);
      border-left: 5px solid ${theme.primary};
      border-radius: 8px;
      padding: 14px 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.9);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    #${id} .spotlight-tag {
      font-family: ${theme.secondaryFont};
      font-size: 12px;
      font-weight: 800;
      color: ${theme.primary};
      letter-spacing: 0.14em;
      margin-bottom: 4px;
    }
    #${id} .spotlight-title {
      font-family: ${theme.fontFamily};
      font-size: 26px;
      font-weight: 900;
      color: #FFFFFF;
      letter-spacing: 0.02em;
      line-height: 1.25;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.95);
    }
    #${id} .spotlight-detail {
      font-family: ${theme.fontFamily};
      font-size: 16px;
      font-weight: 600;
      color: #CBD5E1;
      margin-top: 4px;
      line-height: 1.35;
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
    // Leader line draw
    {
      const leader = document.getElementById("${id}-leader");
      if (leader) {
        const len = leader.getTotalLength ? leader.getTotalLength() : 400;
        tl.fromTo("#${id}-leader",
          { strokeDasharray: len, strokeDashoffset: len },
          { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" },
          ${opts.startSec + 0.1}
        );
      }
    }

    // Pulse opacity and scale on the inner reticle ring
    tl.fromTo("#${id}-ring",
      { strokeOpacity: 0.6, scale: 0.95, transformOrigin: "${t.x + t.width / 2}px ${t.y + t.height / 2}px" },
      { strokeOpacity: 1.0, scale: 1.05, duration: 0.6, yoyo: true, repeat: ${Math.max(1, Math.floor(opts.durationSec * 1.5))}, ease: "sine.inOut" },
      ${opts.startSec + 0.1}
    );

    // Continuous slow rotation on the outer dashed reticle ring
    tl.to("#${id}-dashed",
      { rotation: 360, transformOrigin: "${t.x + t.width / 2}px ${t.y + t.height / 2}px", duration: 16, repeat: -1, ease: "none" },
      ${opts.startSec}
    );
    ` : ''}

    // Spotlight exit
    tl.to("#${id}",
      { opacity: 0, duration: 0.3, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.3}
    );
  `;

  return { html, css, js };
}
