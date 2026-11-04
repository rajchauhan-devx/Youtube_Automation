import {
  type DynamicMotionGraphicData,
  type DynamicMotionPlacementData,
  type DynamicMotionRenderData,
  type DynamicMotionThemeData,
  type DynamicMotionSfxData,
  type DynamicMotionVfxData,
  type FixedMotionTemplate,
  styleKitFor,
  getProfileFixedTemplates,
  getProfileHookTemplate,
  type ChannelMotionPolicyKey,
  type StyleKit,
} from '@tubeflow/editing-contracts';

export interface SceneMotionInput {
  sceneIndex: number;
  narration: string;
  visualPrompt: string;
  durationSec?: number;
}

export interface DynamicMotionDecisionRequest {
  channelName?: string;
  channelProfile?: string;
  scenes: SceneMotionInput[];
  scriptText?: string;
  customInstructions?: string;
  model?: string;
  apiKey?: string;
}

export interface ProfileTemplateParams {
  templateId: string;
  sceneIndex: number;
  title: string;
  detail?: string;
  badge?: string;
  statValue?: string;
  statUnit?: string;
  size?: 'compact' | 'standard' | 'hero' | number;
  placement?: 'center' | 'top' | 'top-right' | 'top-left' | 'center-right' | 'center-left' | 'bottom';
  startSec?: number;
  durationSec?: number;
  cuePhrase?: string;
  fps?: number;
  width?: number;
  height?: number;
}

export interface DynamicMotionPlan extends ProfileTemplateParams {
  shouldInclude: boolean;
  type: string;
  placementData?: DynamicMotionPlacementData;
  visualConcept?: string;
  theme?: DynamicMotionThemeData;
  ornament?: 'chakra' | 'mandala' | 'trishula' | 'lotus' | 'om' | 'sacred_border' | 'sun_burst' | 'none';
  sfx?: DynamicMotionSfxData;
  vfx?: DynamicMotionVfxData;
  customHtml?: string;
  customCss?: string;
  customJs?: string;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Calculates responsive CSS placement respecting mobile vertical 9:16 safe zones:
 * - Protects top 15% (header/avatar zone)
 * - Protects bottom 25% (subtitle band)
 */
function computePlacementStyles(placement = 'center', scale = 1.0): string {
  switch (placement) {
    case 'top':
      return `top: 18%; left: 50%; transform: translateX(-50%) scale(${scale}); width: 88%;`;
    case 'top-left':
      return `top: 18%; left: 6%; transform: scale(${scale}); transform-origin: top left; width: 62%;`;
    case 'top-right':
      return `top: 18%; right: 6%; transform: scale(${scale}); transform-origin: top right; width: 62%;`;
    case 'bottom':
      return `top: 56%; left: 50%; transform: translateX(-50%) scale(${scale}); width: 88%;`;
    case 'center-left':
      return `top: 22%; left: 6%; transform: scale(${scale}); transform-origin: center left; width: 62%;`;
    case 'center-right':
      return `top: 22%; right: 6%; transform: scale(${scale}); transform-origin: center right; width: 62%;`;
    case 'center':
    default:
      return `top: 19%; left: 50%; transform: translateX(-50%) scale(${scale}); width: 88%;`;
  }
}

function resolveScale(size?: 'compact' | 'standard' | 'hero' | number): number {
  if (typeof size === 'number' && Number.isFinite(size)) return Math.max(0.6, Math.min(1.5, size));
  if (size === 'hero') return 1.25;
  if (size === 'compact') return 0.85;
  return 1.0;
}

function mapToDynamicPosition(p?: string): "custom" | "auto" | "top" | "bottom" | "left" | "right" | "center" | "top-right" | "top-left" | "bottom-right" | "bottom-left" {
  if (p === 'center-right') return 'right';
  if (p === 'center-left') return 'left';
  if (['top', 'bottom', 'left', 'right', 'center', 'top-right', 'top-left', 'bottom-right', 'bottom-left'].includes(p as any)) {
    return p as any;
  }
  return 'center';
}

export function robustJsonArrayParse(raw: string): any[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.items)) return parsed.items;
  } catch (_) {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const p = JSON.parse(match[0]);
        if (Array.isArray(p)) return p;
      } catch (_) {}
    }
  }
  return [];
}

/**
 * Uniquifies SVG IDs (filters, gradients, clipPaths) so multiple templates in the same video
 * never suffer from ID collisions or cancelled SVG filters.
 */
export function uniquifySvgIds(
  html: string,
  css: string,
  js: string,
  prefix: string
): { html: string; css: string; js: string } {
  const defIdRegex = /<(?:filter|linearGradient|radialGradient|clipPath|mask|pattern)\s+[^>]*id=["']([^"']+)["']/gi;
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = defIdRegex.exec(html)) !== null) {
    if (!match[1].startsWith(`${prefix}-`)) {
      ids.add(match[1]);
    }
  }

  let newHtml = html;
  let newCss = css;
  let newJs = js;

  for (const oldId of ids) {
    const newId = `${prefix}-${oldId}`;
    newHtml = newHtml.split(`id="${oldId}"`).join(`id="${newId}"`);
    newHtml = newHtml.split(`url(#${oldId})`).join(`url(#${newId})`);
    newHtml = newHtml.split(`href="#${oldId}"`).join(`href="#${newId}"`);

    newCss = newCss.split(`url(#${oldId})`).join(`url(#${newId})`);
    newCss = newCss.split(`#${oldId}`).join(`#${newId}`);

    newJs = newJs.split(`"#${oldId}"`).join(`"#${newId}"`);
    newJs = newJs.split(`'#${oldId}'`).join(`'#${newId}'`);
  }

  return { html: newHtml, css: newCss, js: newJs };
}

// ============================================================================
// CREATOR-GRADE UTILITY MOTION GRAPHICS (Highlighter, Arrow, Thunder Lightning, etc.)
// ============================================================================

/**
 * Utility Motion Graphic 1: Thunder & Lightning Strike (ATTENTION EXTRACTOR #1)
 * High-voltage electric lightning bolt striking the scene with flash, sparks, and impact label.
 */
function renderThunderLightning(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const boltColor = kit.theme.primary || '#FFD700';
  const accentColor = kit.popup.accent || '#FFFFFF';
  const badgeText = params.badge || (kit.key === 'ancient_dharma' ? 'वज्र प्रहार' : 'CRITICAL HOOK');

  const html = `
    <div id="${containerId}" class="profile-motion-template thunder-lightning dm-3d-scene">
      <div class="dm-3d-card">
        <svg viewBox="0 0 280 420" width="220" height="330" class="dm-lightning-svg">
          <defs>
            <linearGradient id="${containerId}-boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FFFFFF" />
              <stop offset="35%" stop-color="${boltColor}" />
              <stop offset="100%" stop-color="${accentColor}" />
            </linearGradient>
            <filter id="${containerId}-lightningGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="sharpGlow"/>
              <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="ambientGlow"/>
              <feMerge>
                <feMergeNode in="ambientGlow"/>
                <feMergeNode in="sharpGlow"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <!-- Origin Flash Cloudburst -->
          <circle cx="140" cy="18" r="24" fill="${boltColor}" opacity="0.9" filter="url(#${containerId}-lightningGlow)" class="dm-strike-burst"/>
          <circle cx="140" cy="18" r="10" fill="#FFFFFF" class="dm-strike-core"/>
          <!-- Main Jagged Lightning Bolt -->
          <path d="M 140,18 L 115,95 L 155,108 L 98,205 L 145,218 L 82,315 L 122,322 L 72,405" fill="none" stroke="url(#${containerId}-boltGrad)" stroke-width="6" stroke-linecap="round" stroke-linejoin="miter" filter="url(#${containerId}-lightningGlow)" class="dm-lightning-main"/>
          <path d="M 140,18 L 115,95 L 155,108 L 98,205 L 145,218 L 82,315 L 122,322 L 72,405" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="miter" class="dm-lightning-core"/>
          <!-- Branching Arc Filaments -->
          <path d="M 115,95 L 60,138 L 75,148 L 42,192" fill="none" stroke="${accentColor}" stroke-width="2.8" stroke-linecap="round" opacity="0.9" filter="url(#${containerId}-lightningGlow)" class="dm-branch-1"/>
          <path d="M 145,218 L 195,250 L 178,262 L 222,305" fill="none" stroke="${accentColor}" stroke-width="2.8" stroke-linecap="round" opacity="0.9" filter="url(#${containerId}-lightningGlow)" class="dm-branch-2"/>
          <path d="M 98,205 L 62,235 L 72,242 L 52,275" fill="none" stroke="${boltColor}" stroke-width="2" stroke-linecap="round" opacity="0.75" class="dm-branch-3"/>
          <!-- Ground Impact Shockwave Burst -->
          <ellipse cx="72" cy="405" rx="55" ry="16" fill="none" stroke="${boltColor}" stroke-width="3" filter="url(#${containerId}-lightningGlow)" class="dm-ground-shockwave"/>
          <circle cx="72" cy="405" r="18" fill="#FFFFFF" filter="url(#${containerId}-lightningGlow)" class="dm-ground-impact"/>
          <!-- Spark particles -->
          <line x1="72" y1="405" x2="42" y2="375" stroke="${boltColor}" stroke-width="2.5" stroke-linecap="round" class="dm-spark-1"/>
          <line x1="72" y1="405" x2="105" y2="380" stroke="${boltColor}" stroke-width="2.5" stroke-linecap="round" class="dm-spark-2"/>
          <line x1="72" y1="405" x2="60" y2="425" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" class="dm-spark-3"/>
        </svg>
        <div class="dm-lightning-label">
          <div class="dm-impact-badge">
            <span class="dm-pulse-dot"></span>
            <span>⚡ ${escapeHtml(badgeText)}</span>
          </div>
          <div class="dm-impact-title">${escapeHtml(params.title)}</div>
          ${params.detail ? `<div class="dm-impact-detail">${escapeHtml(params.detail)}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; background: transparent !important; }
    #${containerId} .dm-lightning-svg { filter: drop-shadow(0 0 28px ${boltColor}); overflow: visible; }
    #${containerId} .dm-lightning-label { margin-top: -14px; display: flex; flex-direction: column; align-items: center; text-align: center; background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; }
    #${containerId} .dm-impact-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #FFFFFF; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(8px); border: 1.2px solid ${boltColor}; padding: 3px 14px; border-radius: 999px; margin-bottom: 6px; box-shadow: 0 0 14px ${boltColor}66; }
    #${containerId} .dm-pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: #FFFFFF; box-shadow: 0 0 8px #FFFFFF; display: inline-block; }
    #${containerId} .dm-impact-title { font-size: 34px; font-weight: 900; color: #FFFFFF; letter-spacing: 0.03em; line-height: 1.2; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 24px ${boltColor}, 0 4px 14px rgba(0,0,0,0.9); font-family: ${kit.theme.fontFamily}; }
    #${containerId} .dm-impact-detail { font-size: 14px; font-weight: 700; color: ${accentColor}; margin-top: 5px; text-shadow: 0 2px 8px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.8); font-family: ${kit.theme.fontFamily}; letter-spacing: 0.04em; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.05 });
    const mainBolt = el.querySelector(".dm-lightning-main");
    const coreBolt = el.querySelector(".dm-lightning-core");
    if (mainBolt) {
      tl.fromTo([mainBolt, coreBolt], { strokeDasharray: 700, strokeDashoffset: 700 }, { strokeDashoffset: 0, duration: 0.14, ease: "power4.out" }, 0);
    }
    const branches = el.querySelectorAll(".dm-branch-1, .dm-branch-2, .dm-branch-3");
    if (branches.length) {
      tl.fromTo(branches, { strokeDasharray: 220, strokeDashoffset: 220 }, { strokeDashoffset: 0, duration: 0.12, ease: "power3.out" }, 0.04);
    }
    const groundShock = el.querySelector(".dm-ground-shockwave");
    if (groundShock) {
      tl.fromTo(groundShock, { scale: 0.1, opacity: 1, transformOrigin: "72px 405px" }, { scale: 2.2, opacity: 0, duration: 0.5, ease: "power2.out" }, 0.08);
    }
    const sparks = el.querySelectorAll(".dm-spark-1, .dm-spark-2, .dm-spark-3");
    if (sparks.length) {
      tl.fromTo(sparks, { scale: 0.2, opacity: 1, transformOrigin: "72px 405px" }, { scale: 1.6, opacity: 0, duration: 0.35, ease: "power2.out" }, 0.06);
    }
    // Controlled after-flash dip that settles (no harsh strobe, no endless flicker)
    const boltSvg = el.querySelector(".dm-lightning-svg");
    if (boltSvg) {
      tl.to(boltSvg, { opacity: 0.55, duration: 0.05, yoyo: true, repeat: 3, ease: "power1.inOut" }, 0.1);
    }
    // Label pop with elastic punch
    const lbl = el.querySelector(".dm-lightning-label");
    if (lbl) {
      tl.fromTo(lbl, { scale: 0.6, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: "back.out(2.2)" }, 0.14);
    }
    // Deterministic residual crackle that fades to a steady glow before the exit
    if (mainBolt) {
      tl.to(mainBolt, { opacity: 0.82, duration: 0.14, yoyo: true, repeat: 5, ease: "sine.inOut" }, 0.55);
    }
  `;

  return { html, css, js };
}

/**
 * Utility Motion Graphic 2: Marker Highlighter Pen (ESSENTIAL VIDEO EDITOR TOOL)
 * Chisel-tip marker pen stroke sweeping across text with gliding nib cursor, ink soak & glint sheen.
 */
function renderHighlighter(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'top', scale);
  const markerColor = kit.popup.accent || kit.theme.primary || '#FFD700';
  const badgeText = params.badge || (kit.key === 'ancient_dharma' ? 'मुख्य सूत्र' : 'KEY INTEL');

  const html = `
    <div id="${containerId}" class="profile-motion-template highlighter-tool dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-highlighter-wrapper">
          <div class="dm-hl-badge">
            <span class="dm-pulse-dot"></span>
            <span>🖊️ ${escapeHtml(badgeText)}</span>
          </div>
          <div class="dm-hl-line-container">
            <div class="dm-hl-fill">
              <!-- Animated glint reflection sweep -->
              <span class="dm-hl-sheen"></span>
            </div>
            <!-- Chisel nib travels with the stroke leading edge (outside the scaling fill so it never squashes) -->
            <div class="dm-hl-nib">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="${markerColor}">
                <path d="M 3,18 L 8,23 L 21,10 L 14,3 Z" filter="drop-shadow(0 0 6px ${markerColor})"/>
                <polygon points="3,18 1,23 6,21" fill="#FFFFFF"/>
              </svg>
            </div>
            <div class="dm-hl-text">${escapeHtml(params.title)}</div>
          </div>
          ${params.detail ? `<div class="dm-hl-detail">${escapeHtml(params.detail)}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-highlighter-wrapper { display: flex; flex-direction: column; align-items: center; text-align: center; }
    #${containerId} .dm-hl-badge { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #FFFFFF; background: rgba(12, 14, 20, 0.88); backdrop-filter: blur(14px); border: 1.2px solid ${markerColor}; border-top: 1.2px solid rgba(255,255,255,0.4); padding: 3px 12px; border-radius: 999px; margin-bottom: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.85), 0 0 14px ${markerColor}44; }
    #${containerId} .dm-pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: ${markerColor}; box-shadow: 0 0 8px ${markerColor}; display: inline-block; }
    #${containerId} .dm-hl-line-container { position: relative; display: inline-block; padding: 6px 22px; margin: 4px 0; }
    #${containerId} .dm-hl-fill { position: absolute; inset: 0; background: linear-gradient(90deg, ${markerColor}55 0%, ${markerColor}88 70%, ${markerColor}bb 100%); border-radius: 4px 14px 16px 4px; transform-origin: left center; z-index: 1; box-shadow: 0 0 25px ${markerColor}77, inset 0 1px 1px rgba(255,255,255,0.4); border-top: 2px solid ${markerColor}; border-bottom: 2px solid ${markerColor}; overflow: visible; }
    #${containerId} .dm-hl-sheen { position: absolute; top: 0; bottom: 0; left: -100%; width: 50%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent); transform: skewX(-20deg); pointer-events: none; }
    #${containerId} .dm-hl-nib { position: absolute; left: 0; margin-left: -5px; top: -14px; pointer-events: none; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.8)); will-change: left, opacity, transform; }
    #${containerId} .dm-hl-text { position: relative; z-index: 2; font-size: 34px; font-weight: 900; color: #FFFFFF; letter-spacing: 0.02em; line-height: 1.25; text-shadow: 0 2px 14px rgba(0,0,0,0.98), 0 0 12px ${markerColor}44; font-family: ${kit.theme.fontFamily}; }
    #${containerId} .dm-hl-detail { font-size: 15px; font-weight: 600; color: #FFFFFF; background: transparent !important; border: none !important; padding: 0; margin-top: 6px; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.9); font-family: ${kit.theme.fontFamily}; letter-spacing: 0.03em; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
    const fill = el.querySelector(".dm-hl-fill");
    const nib = el.querySelector(".dm-hl-nib");
    if (fill) {
      tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: "power2.out" }, 0.1);
    }
    if (nib) {
      // Nib leads the stroke: appears as ink starts, glides to the right edge with the
      // exact same timing/ease as the fill sweep, then lifts away.
      tl.fromTo(nib, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.12, ease: "power2.out" }, 0.1);
      tl.to(nib, { left: "100%", duration: 0.55, ease: "power2.out" }, 0.1);
      tl.to(nib, { opacity: 0, y: -10, scale: 0.7, duration: 0.24, ease: "power2.in" }, 0.66);
    }
    const sheen = el.querySelector(".dm-hl-sheen");
    if (sheen) {
      tl.fromTo(sheen, { left: "-50%" }, { left: "150%", duration: 0.7, ease: "power2.inOut" }, 0.35);
    }
  `;

  return { html, css, js };
}

/**
 * Utility Motion Graphic 3: Curved Pointer Arrow Callout (ESSENTIAL VIDEO EDITOR TOOL)
 * Dynamic curved bezier pointer with tangent arrowhead, pulsing target radar ping & glass tag.
 */
function renderArrowCallout(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const arrowColor = kit.theme.primary || '#FFD700';
  const badgeText = params.badge || (kit.key === 'ancient_dharma' ? 'विशेष ध्यान' : 'LOOK HERE');

  const html = `
    <div id="${containerId}" class="profile-motion-template arrow-callout dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-arrow-wrapper">
          <div class="dm-arrow-tag">
            <span class="dm-tag-badge">${escapeHtml(badgeText)}</span>
            <span class="dm-tag-title">${escapeHtml(params.title)}</span>
          </div>
          <svg viewBox="0 0 240 200" width="195" height="160" class="dm-arrow-svg">
            <defs>
              <filter id="${containerId}-arrowGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <!-- Origin locator anchor dot -->
            <circle cx="35" cy="25" r="7" fill="${arrowColor}" filter="url(#${containerId}-arrowGlow)"/>
            <circle cx="35" cy="25" r="3" fill="#FFFFFF"/>
            <!-- Elegant Curved Bezier Arc -->
            <path d="M 35,25 C 80,10 145,45 165,120" fill="none" stroke="${arrowColor}" stroke-width="5.5" stroke-linecap="round" filter="url(#${containerId}-arrowGlow)" class="dm-arrow-arc"/>
            <path d="M 35,25 C 80,10 145,45 165,120" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" class="dm-arrow-core"/>
            <!-- Tangent-Aligned Arrowhead pointing to target -->
            <polygon points="165,120 142,108 152,94" fill="${arrowColor}" filter="url(#${containerId}-arrowGlow)" class="dm-arrow-head"/>
            <polygon points="165,120 142,108 152,94" fill="#FFFFFF" class="dm-arrow-head-core"/>
            <!-- Target Radar Ping Pulse expanding at the tip -->
            <circle cx="165" cy="120" r="14" fill="none" stroke="${arrowColor}" stroke-width="2.5" class="dm-ping-ring"/>
            <circle cx="165" cy="120" r="5" fill="#FFFFFF" class="dm-ping-dot"/>
          </svg>
          ${params.detail ? `<div class="dm-arrow-detail">${escapeHtml(params.detail)}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; }
    #${containerId} .dm-arrow-wrapper { display: flex; flex-direction: column; align-items: flex-start; }
    #${containerId} .dm-arrow-tag { background: rgba(12, 14, 20, 0.88); backdrop-filter: blur(16px); border: 1.5px solid ${arrowColor}; border-top: 1.5px solid rgba(255,255,255,0.4); border-radius: 999px; padding: 5px 16px; display: flex; align-items: center; gap: 10px; box-shadow: 0 10px 28px rgba(0,0,0,0.88), 0 0 20px ${arrowColor}44, inset 0 1px 1px rgba(255,255,255,0.3); }
    #${containerId} .dm-tag-badge { font-size: 10px; font-weight: 800; color: #000000; background: ${arrowColor}; padding: 2px 9px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.12em; box-shadow: 0 0 8px ${arrowColor}88; }
    #${containerId} .dm-tag-title { font-size: 19px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 0 12px ${arrowColor}, 0 2px 8px rgba(0,0,0,0.9); }
    #${containerId} .dm-arrow-svg { margin-top: 4px; filter: drop-shadow(0 0 16px ${arrowColor}88); overflow: visible; }
    #${containerId} .dm-arrow-detail { font-size: 13px; font-weight: 600; color: #FFFFFF; background: transparent !important; border: none !important; box-shadow: none !important; padding: 0; margin-top: -8px; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.9); }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    const arc = el.querySelector(".dm-arrow-arc");
    const core = el.querySelector(".dm-arrow-core");
    if (arc) {
      tl.fromTo([arc, core], { strokeDasharray: 320, strokeDashoffset: 320 }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.out" }, 0.05);
    }
    const head = el.querySelectorAll(".dm-arrow-head, .dm-arrow-head-core");
    if (head.length) {
      tl.fromTo(head, { scale: 0, transformOrigin: "165px 120px" }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0.38);
    }
    const tag = el.querySelector(".dm-arrow-tag");
    if (tag) {
      tl.fromTo(tag, { scale: 0.7, opacity: 0, x: -18 }, { scale: 1, opacity: 1, x: 0, duration: 0.4, ease: "back.out(2)" }, 0.08);
    }
    // Target ping pulse (finite cycles so the timeline completes with the exit)
    const ping = el.querySelector(".dm-ping-ring");
    if (ping) {
      tl.fromTo(ping, { scale: 0.4, opacity: 1, transformOrigin: "165px 120px" }, { scale: 2.6, opacity: 0, duration: 0.8, repeat: 3, ease: "power2.out" }, 0.45);
    }
    // Gentle floating spring bob that settles before the exit
    const bobCard = el.querySelector(".dm-3d-card");
    if (bobCard) {
      tl.to(bobCard, { y: "+=7", duration: 0.75, ease: "sine.inOut", yoyo: true, repeat: 3 }, 0.5);
    }
  `;

  return { html, css, js };
}

/**
 * Utility Motion Graphic 4: Target & Circle Callout (ESSENTIAL VIDEO EDITOR TOOL)
 * Authentic double-loop hand-drawn marker sketch circle with target reticle & living focus.
 */
function renderCircleCallout(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const circleColor = kit.popup.accent || kit.theme.primary || '#FFD700';
  const badgeText = params.badge || (kit.key === 'ancient_dharma' ? 'दृष्टि बिंदु' : 'TARGET');

  const html = `
    <div id="${containerId}" class="profile-motion-template circle-callout dm-3d-scene">
      <div class="dm-3d-card">
        <svg viewBox="0 0 240 240" width="185" height="185" class="dm-circle-svg">
          <defs>
            <filter id="${containerId}-circGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <!-- Authentic Organic Double-Loop Sketch Circle (Two Overlapping Human Sketched Loops) -->
          <path d="M 120,24 C 175,20 215,62 215,120 C 215,178 172,216 120,216 C 62,216 25,175 25,120 C 25,64 68,26 124,24 C 172,22 210,55 212,116 C 214,172 176,212 126,214 C 82,216 38,184 34,134" fill="none" stroke="${circleColor}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#${containerId}-circGlow)" class="dm-circle-loop"/>
          <path d="M 120,24 C 175,20 215,62 215,120 C 215,178 172,216 120,216 C 62,216 25,175 25,120 C 25,64 68,26 124,24 C 172,22 210,55 212,116 C 214,172 176,212 126,214 C 82,216 38,184 34,134" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="dm-circle-core"/>
          <!-- Reticle crosshair precision marks -->
          <circle cx="120" cy="120" r="8" fill="none" stroke="${circleColor}" stroke-width="2"/>
          <circle cx="120" cy="120" r="3" fill="#FFFFFF"/>
          <line x1="120" y1="102" x2="120" y2="108" stroke="${circleColor}" stroke-width="2"/>
          <line x1="120" y1="132" x2="120" y2="138" stroke="${circleColor}" stroke-width="2"/>
          <line x1="102" y1="120" x2="108" y2="120" stroke="${circleColor}" stroke-width="2"/>
          <line x1="132" y1="120" x2="138" y2="120" stroke="${circleColor}" stroke-width="2"/>
        </svg>
        <div class="dm-circle-label">
          <div class="dm-circ-badge">
            <span class="dm-pulse-dot"></span>
            <span>⭕ ${escapeHtml(badgeText)}</span>
          </div>
          <div class="dm-circ-title">${escapeHtml(params.title)}</div>
          ${params.detail ? `<div class="dm-circ-detail">${escapeHtml(params.detail)}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; background: transparent !important; }
    #${containerId} .dm-circle-svg { filter: drop-shadow(0 0 20px ${circleColor}88); overflow: visible; }
    #${containerId} .dm-circle-label { margin-top: 10px; background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; text-align: center; }
    #${containerId} .dm-circ-badge { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 10px; font-weight: 800; color: #FFFFFF; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(8px); border: 1px solid ${circleColor}; border-radius: 999px; padding: 2px 14px; text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 4px; box-shadow: 0 0 10px ${circleColor}55; }
    #${containerId} .dm-pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: ${circleColor}; box-shadow: 0 0 8px ${circleColor}; display: inline-block; }
    #${containerId} .dm-circ-title { font-size: 24px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 14px ${circleColor}, 0 2px 8px rgba(0,0,0,0.9); }
    #${containerId} .dm-circ-detail { font-size: 13px; font-weight: 700; color: #E4E4E7; margin-top: 3px; text-shadow: 0 2px 6px rgba(0,0,0,0.9); }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" });
    const loop = el.querySelector(".dm-circle-loop");
    const core = el.querySelector(".dm-circle-core");
    if (loop) {
      tl.fromTo([loop, core], { strokeDasharray: 980, strokeDashoffset: 980 }, { strokeDashoffset: 0, duration: 0.65, ease: "power2.inOut" }, 0.05);
    }
    const lbl = el.querySelector(".dm-circle-label");
    if (lbl) {
      tl.fromTo(lbl, { scale: 0.7, opacity: 0, y: 14 }, { scale: 1, opacity: 1, y: 0, duration: 0.38, ease: "back.out(2)" }, 0.35);
    }
    // Living focus breathing pulse (finite, settles before the exit)
    const breathSvg = el.querySelector(".dm-circle-svg");
    if (breathSvg) {
      tl.to(breathSvg, { scale: 1.04, duration: 0.9, yoyo: true, repeat: 3, ease: "sine.inOut" }, 0.7);
    }
  `;

  return { html, css, js };
}

/**
 * Utility Motion Graphic 5: Tactical HUD Reticle / Sniper Lock-On (ESSENTIAL VIDEO EDITOR TOOL)
 * 4 snapping corner brackets, rotating compass degree dial, crosshairs & TARGET LOCKED telemetry.
 */
function renderSniperLock(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const lockColor = kit.theme.primary || '#00F0FF';
  const badgeText = params.badge || (kit.key === 'ancient_dharma' ? 'सुदर्शन चक्र' : 'TARGET LOCKED');

  const html = `
    <div id="${containerId}" class="profile-motion-template sniper-lock dm-3d-scene">
      <div class="dm-3d-card">
        <svg viewBox="0 0 260 260" width="200" height="200" class="dm-hud-svg">
          <defs>
            <filter id="${containerId}-hudGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <!-- 4 Inward Snapping Tactical Corner Brackets -->
          <path d="M 40,75 L 40,40 L 75,40" fill="none" stroke="${lockColor}" stroke-width="4" stroke-linecap="round" filter="url(#${containerId}-hudGlow)" class="dm-bracket-tl"/>
          <path d="M 220,75 L 220,40 L 185,40" fill="none" stroke="${lockColor}" stroke-width="4" stroke-linecap="round" filter="url(#${containerId}-hudGlow)" class="dm-bracket-tr"/>
          <path d="M 40,185 L 40,220 L 75,220" fill="none" stroke="${lockColor}" stroke-width="4" stroke-linecap="round" filter="url(#${containerId}-hudGlow)" class="dm-bracket-bl"/>
          <path d="M 220,185 L 220,220 L 185,220" fill="none" stroke="${lockColor}" stroke-width="4" stroke-linecap="round" filter="url(#${containerId}-hudGlow)" class="dm-bracket-br"/>
          <!-- Rotating Compass Degree Dial Ring -->
          <circle cx="130" cy="130" r="68" fill="none" stroke="${lockColor}" stroke-width="1.8" stroke-dasharray="6 8" opacity="0.8" class="dm-hud-dial"/>
          <!-- Inner Lock Crosshairs -->
          <circle cx="130" cy="130" r="32" fill="none" stroke="${lockColor}" stroke-width="2" class="dm-hud-inner-ring"/>
          <circle cx="130" cy="130" r="5" fill="#FFFFFF" class="dm-hud-center-dot"/>
          <line x1="130" y1="85" x2="130" y2="110" stroke="#FFFFFF" stroke-width="2"/>
          <line x1="130" y1="150" x2="130" y2="175" stroke="#FFFFFF" stroke-width="2"/>
          <line x1="85" y1="130" x2="110" y2="130" stroke="#FFFFFF" stroke-width="2"/>
          <line x1="150" y1="130" x2="175" y2="130" stroke="#FFFFFF" stroke-width="2"/>
        </svg>
        <div class="dm-hud-label">
          <div class="dm-hud-badge">
            <span class="dm-blink-dot"></span>
            <span>🎯 ${escapeHtml(badgeText)}</span>
          </div>
          <div class="dm-hud-title">${escapeHtml(params.title)}</div>
          ${params.detail ? `<div class="dm-hud-detail">${escapeHtml(params.detail)}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; background: transparent !important; }
    #${containerId} .dm-hud-svg { filter: drop-shadow(0 0 22px ${lockColor}); overflow: visible; }
    #${containerId} .dm-hud-label { margin-top: 6px; background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; text-align: center; }
    #${containerId} .dm-hud-badge { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; font-weight: 800; color: ${lockColor}; background: rgba(0,0,0,0.45); backdrop-filter: blur(8px); border: 1px solid ${lockColor}; border-radius: 999px; padding: 2px 14px; text-transform: uppercase; letter-spacing: 0.16em; margin-bottom: 2px; }
    #${containerId} .dm-blink-dot { width: 6px; height: 6px; border-radius: 999px; background: ${lockColor}; box-shadow: 0 0 8px ${lockColor}; display: inline-block; animation: dmBlink 0.6s infinite alternate; }
    @keyframes dmBlink { from { opacity: 0.2; } to { opacity: 1; } }
    #${containerId} .dm-hud-title { font-size: 26px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 16px ${lockColor}; letter-spacing: 0.04em; }
    #${containerId} .dm-hud-detail { font-size: 13px; font-weight: 700; color: #E4E4E7; margin-top: 3px; text-shadow: 0 2px 6px rgba(0,0,0,0.9); font-family: ${kit.theme.fontFamily}; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.1 });
    // Tactical brackets snap inward violently
    const brackets = el.querySelectorAll(".dm-bracket-tl, .dm-bracket-tr, .dm-bracket-bl, .dm-bracket-br");
    tl.fromTo(brackets, { scale: 1.7, opacity: 0, transformOrigin: "130px 130px" }, { scale: 1, opacity: 1, duration: 0.35, ease: "expo.out" }, 0.05);
    // Rotating compass dial (single slow sweep sized to the hold, so the timeline completes)
    const dial = el.querySelector(".dm-hud-dial");
    if (dial) {
      tl.to(dial, { rotation: 160, transformOrigin: "130px 130px", duration: 4.4, ease: "none" }, 0);
    }
    // Label pop
    const lbl = el.querySelector(".dm-hud-label");
    if (lbl) {
      tl.fromTo(lbl, { scale: 0.65, opacity: 0, y: 15 }, { scale: 1, opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" }, 0.25);
    }
  `;

  return { html, css, js };
}

/**
 * Utility Motion Graphic 6: Magnifying Glass Loupe Zoom (ESSENTIAL VIDEO EDITOR TOOL)
 * High-precision inspection loupe with realistic optical reflection glare & evidence tag.
 */
function renderMagnifyingGlass(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const rimColor = kit.theme.primary || '#FFD700';
  const badgeText = params.badge || (kit.key === 'ancient_dharma' ? 'प्राचीन ग्रंथ' : 'INSPECT EVIDENCE');

  const html = `
    <div id="${containerId}" class="profile-motion-template magnifying-glass dm-3d-scene">
      <div class="dm-3d-card">
        <svg viewBox="0 0 280 280" width="210" height="210" class="dm-glass-svg">
          <defs>
            <linearGradient id="${containerId}-rimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FFFFFF" />
              <stop offset="30%" stop-color="${rimColor}" />
              <stop offset="100%" stop-color="#222226" />
            </linearGradient>
            <linearGradient id="${containerId}-handleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${rimColor}" />
              <stop offset="100%" stop-color="#141418" />
            </linearGradient>
            <filter id="${containerId}-glassGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <!-- 45-degree Angled Heavy Handle -->
          <line x1="168" y1="168" x2="242" y2="242" stroke="url(#${containerId}-handleGrad)" stroke-width="16" stroke-linecap="round" class="dm-glass-handle"/>
          <line x1="168" y1="168" x2="242" y2="242" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
          <!-- Lens Bezel Outer Metallic Ring -->
          <circle cx="115" cy="115" r="74" fill="none" stroke="url(#${containerId}-rimGrad)" stroke-width="9" filter="url(#${containerId}-glassGlow)" class="dm-glass-bezel"/>
          <!-- Glass Lens Core with Tint & Grid -->
          <circle cx="115" cy="115" r="68" fill="rgba(255,255,255,0.06)" stroke="${rimColor}" stroke-width="1.5" class="dm-glass-lens"/>
          <!-- Etched Crosshair Grid inside lens -->
          <line x1="115" y1="65" x2="115" y2="165" stroke="${rimColor}" stroke-width="1.2" opacity="0.5" stroke-dasharray="3 3"/>
          <line x1="65" y1="115" x2="165" y2="115" stroke="${rimColor}" stroke-width="1.2" opacity="0.5" stroke-dasharray="3 3"/>
          <circle cx="115" cy="115" r="4" fill="#FFFFFF"/>
          <!-- Diagonal Specular Glare Reflection Sheen -->
          <path d="M 65,85 C 80,65 145,65 160,85 C 150,75 90,75 65,85 Z" fill="#FFFFFF" opacity="0.65" class="dm-glass-glare"/>
        </svg>
        <div class="dm-glass-label">
          <div class="dm-glass-badge">
            <span class="dm-pulse-dot"></span>
            <span>🔎 ${escapeHtml(badgeText)}</span>
          </div>
          <div class="dm-glass-title">${escapeHtml(params.title)}</div>
          ${params.detail ? `<div class="dm-glass-detail">${escapeHtml(params.detail)}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; background: transparent !important; }
    #${containerId} .dm-glass-svg { filter: drop-shadow(0 0 24px ${rimColor}77); overflow: visible; }
    #${containerId} .dm-glass-label { margin-top: -12px; background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; text-align: center; }
    #${containerId} .dm-glass-badge { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; font-weight: 800; color: ${rimColor}; background: rgba(0,0,0,0.45); backdrop-filter: blur(8px); border: 1px solid ${rimColor}; border-radius: 999px; padding: 2px 14px; text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 2px; }
    #${containerId} .dm-pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: ${rimColor}; box-shadow: 0 0 8px ${rimColor}; display: inline-block; }
    #${containerId} .dm-glass-title { font-size: 26px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 14px ${rimColor}, 0 2px 8px rgba(0,0,0,0.9); }
    #${containerId} .dm-glass-detail { font-size: 13px; font-weight: 700; color: #E4E4E7; margin-top: 3px; text-shadow: 0 2px 6px rgba(0,0,0,0.9); font-family: ${kit.theme.fontFamily}; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.1 });
    // Loupe swoops in smoothly from top-right
    const svg = el.querySelector(".dm-glass-svg");
    tl.fromTo(svg, { x: 50, y: -40, scale: 0.7 }, { x: 0, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, 0.05);
    // Lens glare sweep
    const glare = el.querySelector(".dm-glass-glare");
    if (glare) {
      tl.fromTo(glare, { opacity: 0, scale: 0.5, transformOrigin: "115px 115px" }, { opacity: 0.85, scale: 1, duration: 0.4, ease: "power2.out" }, 0.35);
    }
    // Label pop
    const lbl = el.querySelector(".dm-glass-label");
    if (lbl) {
      tl.fromTo(lbl, { scale: 0.7, opacity: 0, y: 15 }, { scale: 1, opacity: 1, y: 0, duration: 0.38, ease: "back.out(2)" }, 0.28);
    }
    // Living inspection hover pan (finite round trips that settle at rest before the exit)
    tl.to(svg, { keyframes: [
      { x: 8, y: 5, duration: 1.0, ease: "sine.inOut" },
      { x: 0, y: 0, duration: 1.0, ease: "sine.inOut" },
      { x: 6, y: 4, duration: 0.9, ease: "sine.inOut" },
      { x: 0, y: 0, duration: 0.9, ease: "sine.inOut" },
    ] }, 0.6);
  `;

  return { html, css, js };
}

/**
 * Utility Motion Graphic 7: Classified / Rubber Stamp Slam (ESSENTIAL VIDEO EDITOR TOOL)
 * 3D perspective slam onto screen with ground impact dust ring & authentic stamp box.
 */
function renderRedactedStamp(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const stampColor = kit.popup.accent || kit.theme.primary || '#EF4444';
  const badgeText = params.badge || (kit.key === 'ancient_dharma' ? 'सत्यमेव जयते' : 'CLASSIFIED');

  const html = `
    <div id="${containerId}" class="profile-motion-template redacted-stamp dm-3d-scene">
      <div class="dm-3d-card">
        <!-- Expanding Radial Dust/Impact Ring -->
        <div class="dm-stamp-dust-ring"></div>
        <div class="dm-stamp-box">
          <div class="dm-stamp-inner-border">
            <div class="dm-stamp-badge">★ ${escapeHtml(badgeText)} ★</div>
            <div class="dm-stamp-title">${escapeHtml(params.title)}</div>
            ${params.detail ? `<div class="dm-stamp-detail">${escapeHtml(params.detail)}</div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; background: transparent !important; }
    #${containerId} .dm-stamp-dust-ring { position: absolute; top: 50%; left: 50%; width: 340px; height: 180px; margin-left: -170px; margin-top: -90px; border: 3px solid ${stampColor}; border-radius: 999px; opacity: 0; filter: blur(4px); pointer-events: none; }
    #${containerId} .dm-stamp-box { transform: rotate(-11deg); background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(8px); border: 3.5px solid ${stampColor}; border-radius: 8px; padding: 4px; box-shadow: 0 10px 30px rgba(0,0,0,0.85), 0 0 25px ${stampColor}55; max-width: 480px; }
    #${containerId} .dm-stamp-inner-border { border: 2px dashed ${stampColor}; border-radius: 4px; padding: 10px 24px; text-align: center; }
    #${containerId} .dm-stamp-badge { font-size: 13px; font-weight: 900; letter-spacing: 0.22em; text-transform: uppercase; color: ${stampColor}; text-shadow: 0 0 12px ${stampColor}; margin-bottom: 4px; }
    #${containerId} .dm-stamp-title { font-size: 30px; font-weight: 900; color: #FFFFFF; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.2; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 16px ${stampColor}, 0 2px 8px rgba(0,0,0,0.9); font-family: ${kit.theme.fontFamily}; }
    #${containerId} .dm-stamp-detail { font-size: 13px; font-weight: 700; color: #E4E4E7; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 6px; border-top: 1px solid ${stampColor}66; padding-top: 6px; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.05 });
    const box = el.querySelector(".dm-stamp-box");
    // Violent 3D Perspective Slam
    tl.fromTo(box, { scale: 3.2, opacity: 0, rotate: -28 }, { scale: 1, opacity: 1, rotate: -11, duration: 0.22, ease: "power4.in" }, 0.05);
    // Elastic rubber bounce
    tl.to(box, { scale: 1.08, duration: 0.08, ease: "power2.out" }, 0.27);
    tl.to(box, { scale: 1, duration: 0.12, ease: "bounce.out" }, 0.35);
    // Ground dust ring expands
    const dust = el.querySelector(".dm-stamp-dust-ring");
    if (dust) {
      tl.fromTo(dust, { scale: 0.2, opacity: 0.9 }, { scale: 1.6, opacity: 0, duration: 0.5, ease: "power2.out" }, 0.26);
    }
    // Deterministic decaying impact shake (no random jitter; always settles at rest)
    const shakeCard = el.querySelector(".dm-3d-card");
    if (shakeCard) {
      tl.to(shakeCard, { keyframes: [
        { x: -5, y: 3, duration: 0.04, ease: "none" },
        { x: 5, y: -3, duration: 0.04, ease: "none" },
        { x: -3, y: 2, duration: 0.04, ease: "none" },
        { x: 2, y: -1, duration: 0.04, ease: "none" },
        { x: 0, y: 0, duration: 0.06, ease: "power1.out" },
      ] }, 0.26);
    }
  `;

  return { html, css, js };
}

/**
 * Utility Motion Graphic 8: Live Metric Ticker & Surge Bar (ESSENTIAL VIDEO EDITOR TOOL)
 * High-speed rolling numeric odometer, upward progress spark bar & radiant delta pill.
 */
function renderMetricTicker(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'top', scale);
  const tickerColor = kit.popup.accent || kit.theme.primary || '#10B981';
  const badgeText = params.badge || (kit.key === 'ancient_dharma' ? 'कर्म चक्र' : 'CRITICAL METRIC');

  const html = `
    <div id="${containerId}" class="profile-motion-template metric-ticker dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-ticker-wrapper">
          <div class="dm-ticker-badge">
            <span class="dm-pulse-dot"></span>
            <span>📊 ${escapeHtml(badgeText)}</span>
          </div>
          <div class="dm-ticker-number-box">
            <span class="dm-ticker-delta">▲ SURGE</span>
            <div class="dm-ticker-value">${escapeHtml(params.title)}</div>
          </div>
          <!-- Upward Progress Surge Bar -->
          <div class="dm-ticker-bar-track">
            <div class="dm-ticker-bar-fill">
              <span class="dm-ticker-bar-spark"></span>
            </div>
          </div>
          ${params.detail ? `<div class="dm-ticker-detail">${escapeHtml(params.detail)}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; background: transparent !important; }
    #${containerId} .dm-ticker-wrapper { display: flex; flex-direction: column; align-items: center; text-align: center; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(12px); border: 1.5px solid ${tickerColor}88; border-radius: 16px; padding: 8px 22px; box-shadow: 0 8px 28px rgba(0,0,0,0.8), 0 0 22px ${tickerColor}44; min-width: 290px; }
    #${containerId} .dm-ticker-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #FFFFFF; background: ${tickerColor}44; border: 1px solid ${tickerColor}; padding: 2px 12px; border-radius: 999px; margin-bottom: 4px; box-shadow: 0 0 10px ${tickerColor}66; }
    #${containerId} .dm-pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: ${tickerColor}; box-shadow: 0 0 8px ${tickerColor}; display: inline-block; }
    #${containerId} .dm-ticker-number-box { display: flex; align-items: center; gap: 10px; margin: 2px 0; }
    #${containerId} .dm-ticker-delta { font-size: 11px; font-weight: 900; color: #000000; background: ${tickerColor}; padding: 2px 8px; border-radius: 6px; letter-spacing: 0.08em; box-shadow: 0 0 10px ${tickerColor}88; }
    #${containerId} .dm-ticker-value { font-size: 34px; font-weight: 900; color: #FFFFFF; letter-spacing: 0.04em; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 18px ${tickerColor}; font-family: ${kit.theme.fontFamily}; }
    #${containerId} .dm-ticker-bar-track { width: 100%; height: 5px; background: rgba(255,255,255,0.18); border-radius: 999px; overflow: visible; margin-top: 6px; position: relative; }
    #${containerId} .dm-ticker-bar-fill { height: 100%; background: linear-gradient(90deg, ${tickerColor}88, ${tickerColor}); border-radius: 999px; transform-origin: left center; position: relative; box-shadow: 0 0 12px ${tickerColor}; }
    #${containerId} .dm-ticker-bar-spark { position: absolute; right: -4px; top: -3px; width: 11px; height: 11px; border-radius: 999px; background: #FFFFFF; box-shadow: 0 0 10px #FFFFFF, 0 0 16px ${tickerColor}; }
    #${containerId} .dm-ticker-detail { font-size: 13px; font-weight: 600; color: #E4E4E7; margin-top: 4px; font-family: ${kit.theme.fontFamily}; text-shadow: 0 1px 4px rgba(0,0,0,0.9); }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
    const fill = el.querySelector(".dm-ticker-bar-fill");
    if (fill) {
      tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 0.75, ease: "power3.out" }, 0.1);
    }
    const val = el.querySelector(".dm-ticker-value");
    if (val) {
      tl.fromTo(val, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" }, 0.1);
    }
  `;

  return { html, css, js };
}

/**
 * Utility Motion Graphic 9: Kinetic Brush Underline (ESSENTIAL VIDEO EDITOR TOOL)
 * High-energy animated wave / brush underline drawing beneath text with trailing comet spark.
 */
function renderKineticUnderline(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'top', scale);
  const lineColor = kit.theme.primary || '#FFD700';

  const html = `
    <div id="${containerId}" class="profile-motion-template kinetic-underline dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-underline-wrapper">
          ${params.badge ? `<div class="dm-ul-badge">${escapeHtml(params.badge)}</div>` : ''}
          <div class="dm-ul-title">${escapeHtml(params.title)}</div>
          <svg viewBox="0 0 340 32" width="295" height="26" class="dm-underline-svg">
            <defs>
              <filter id="${containerId}-ulGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <path d="M 8,16 Q 90,26 170,16 T 332,16" fill="none" stroke="${lineColor}" stroke-width="5" stroke-linecap="round" filter="url(#${containerId}-ulGlow)" class="dm-ul-path"/>
            <path d="M 8,16 Q 90,26 170,16 T 332,16" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" class="dm-ul-core"/>
            <!-- Comet Spark Leading Head -->
            <circle cx="8" cy="16" r="6" fill="#FFFFFF" filter="url(#${containerId}-ulGlow)" class="dm-ul-spark"/>
          </svg>
          ${params.detail ? `<div class="dm-ul-detail">${escapeHtml(params.detail)}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; }
    #${containerId} .dm-underline-wrapper { display: flex; flex-direction: column; align-items: center; text-align: center; }
    #${containerId} .dm-ul-badge { font-size: 11px; font-weight: 800; color: ${lineColor}; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 4px; text-shadow: 0 0 10px ${lineColor}88; }
    #${containerId} .dm-ul-title { font-size: 36px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; letter-spacing: 0.03em; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 20px ${lineColor}77; }
    #${containerId} .dm-underline-svg { filter: drop-shadow(0 0 12px ${lineColor}88); margin-top: 2px; overflow: visible; }
    #${containerId} .dm-ul-detail { font-size: 14px; font-weight: 700; color: #FFFFFF; text-shadow: 0 2px 6px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.8); margin-top: 6px; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
    const p = el.querySelector(".dm-ul-path");
    const core = el.querySelector(".dm-ul-core");
    if (p) {
      tl.fromTo([p, core], { strokeDasharray: 400, strokeDashoffset: 400 }, { strokeDashoffset: 0, duration: 0.48, ease: "power3.out" }, 0.1);
    }
    const spark = el.querySelector(".dm-ul-spark");
    if (spark) {
      // Comet head travels with the leading edge of the stroke draw, arcs with the
      // wave, then flares out exactly as the line completes.
      tl.fromTo(spark, { opacity: 1, scale: 1 }, { x: 324, duration: 0.48, ease: "power3.out" }, 0.1);
      tl.to(spark, { keyframes: [
        { y: 5, duration: 0.24, ease: "sine.out" },
        { y: 0, duration: 0.24, ease: "sine.in" },
      ] }, 0.1);
      tl.to(spark, { opacity: 0, scale: 1.8, duration: 0.3, ease: "power2.out" }, 0.58);
    }
  `;

  return { html, css, js };
}

/**
 * Utility Motion Graphic 10: Shockwave Impact Pulse
 * Concentric expanding radial sonic impact waves with central diamond starburst.
 */
function renderShockwavePulse(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const pulseColor = kit.theme.primary || '#FFD700';

  const html = `
    <div id="${containerId}" class="profile-motion-template shockwave-pulse dm-3d-scene">
      <div class="dm-3d-card">
        <svg viewBox="0 0 220 220" width="180" height="180" class="dm-shock-svg">
          <defs>
            <filter id="${containerId}-shockGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <!-- Expanding Concentric Shockwave Rings -->
          <circle cx="110" cy="110" r="30" fill="none" stroke="${pulseColor}" stroke-width="4" filter="url(#${containerId}-shockGlow)" class="dm-wave-1"/>
          <circle cx="110" cy="110" r="22" fill="none" stroke="#FFFFFF" stroke-width="2.5" class="dm-wave-2"/>
          <circle cx="110" cy="110" r="12" fill="none" stroke="${pulseColor}" stroke-width="2" class="dm-wave-3"/>
          <!-- Central Diamond Starburst -->
          <polygon points="110,95 114,106 125,110 114,114 110,125 106,114 95,110 106,106" fill="#FFFFFF" filter="url(#${containerId}-shockGlow)" class="dm-starburst"/>
        </svg>
        <div class="dm-shock-label">
          <div class="dm-shock-title">${escapeHtml(params.title)}</div>
          ${params.detail ? `<div class="dm-shock-detail">${escapeHtml(params.detail)}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; background: transparent !important; }
    #${containerId} .dm-shock-svg { filter: drop-shadow(0 0 20px ${pulseColor}); overflow: visible; }
    #${containerId} .dm-shock-label { margin-top: 4px; background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; text-align: center; }
    #${containerId} .dm-shock-title { font-size: 28px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 16px ${pulseColor}; }
    #${containerId} .dm-shock-detail { font-size: 13px; font-weight: 700; color: #E4E4E7; margin-top: 2px; text-shadow: 0 1px 4px rgba(0,0,0,0.9); }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.1 });
    // Starburst flash
    const star = el.querySelector(".dm-starburst");
    if (star) {
      tl.fromTo(star, { scale: 0.2, opacity: 1, transformOrigin: "110px 110px" }, { scale: 1.8, opacity: 0, duration: 0.35, ease: "power2.out" }, 0.05);
    }
    // Shockwaves ripple outward
    tl.fromTo(el.querySelector(".dm-wave-1"), { scale: 0.3, opacity: 1, transformOrigin: "110px 110px" }, { scale: 3.2, opacity: 0, duration: 0.85, ease: "power2.out" }, 0.05);
    tl.fromTo(el.querySelector(".dm-wave-2"), { scale: 0.25, opacity: 1, transformOrigin: "110px 110px" }, { scale: 2.6, opacity: 0, duration: 0.75, ease: "power2.out" }, 0.12);
    tl.fromTo(el.querySelector(".dm-wave-3"), { scale: 0.2, opacity: 1, transformOrigin: "110px 110px" }, { scale: 2.0, opacity: 0, duration: 0.65, ease: "power2.out" }, 0.18);
    // Label arrives on the shockwave tail instead of popping with frame one
    const shockLbl = el.querySelector(".dm-shock-label");
    if (shockLbl) {
      tl.fromTo(shockLbl, { scale: 0.7, opacity: 0, y: 12 }, { scale: 1, opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" }, 0.22);
    }
  `;

  return { html, css, js };
}

// ============================================================================
// ANCIENT DHARMA DOCUMENTARY MOTION GRAPHICS LIBRARY
// (Epic Indian Mythology, Ancient Manuscripts, Sacred Maps & Temple Architecture)
// ============================================================================

/**
 * Documentary Template 01: Cinematic Episode Title Reveal
 * Large sculpted golden title emerging from darkness, temple silhouette, light rays & incense embers.
 * 100% CARDLESS & FLOATING: video footage behind is fully visible.
 */
function renderVedicTitleReveal(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';
  const badgeText = params.badge || 'वैदिक गाथा';

  const html = `
    <div id="${containerId}" class="profile-motion-template vedic-title-reveal dm-3d-scene">
      <div class="dm-3d-card">
        <!-- Divine Golden Sunburst Rays & Temple Pinnacle -->
        <svg viewBox="0 0 340 180" width="300" height="150" class="dm-title-rays-svg">
          <defs>
            <radialGradient id="${containerId}-rayGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#FFE7A0" stop-opacity="0.85" />
              <stop offset="45%" stop-color="${gold}" stop-opacity="0.35" />
              <stop offset="100%" stop-color="#000000" stop-opacity="0" />
            </radialGradient>
            <filter id="${containerId}-goldGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <!-- Sunburst Halo Core -->
          <circle cx="170" cy="90" r="85" fill="url(#${containerId}-rayGrad)" class="dm-sunburst-core"/>
          <!-- Radiating Golden Rays -->
          <g stroke="${gold}" stroke-width="1.4" opacity="0.5" class="dm-sunburst-rays">
            <line x1="170" y1="5" x2="170" y2="175"/>
            <line x1="85" y1="90" x2="255" y2="90"/>
            <line x1="110" y1="30" x2="230" y2="150"/>
            <line x1="110" y1="150" x2="230" y2="30"/>
            <line x1="130" y1="12" x2="210" y2="168"/>
            <line x1="130" y1="168" x2="210" y2="12"/>
          </g>
          <!-- Sacred Kalasha / Shikhara Pinnacle Finial Crest -->
          <path d="M 170,18 C 160,35 148,45 142,58 C 156,54 165,62 170,72 C 175,62 184,54 198,58 C 192,45 180,35 170,18 Z" fill="${gold}" filter="url(#${containerId}-goldGlow)" class="dm-temple-crest"/>
          <circle cx="170" cy="18" r="4" fill="#FFFFFF" filter="url(#${containerId}-goldGlow)"/>
          <!-- Floating Incense Embers -->
          <circle cx="130" cy="100" r="2.5" fill="#FFE7A0" class="dm-ember dm-ember-1"/>
          <circle cx="215" cy="75" r="2" fill="#FFE7A0" class="dm-ember dm-ember-2"/>
          <circle cx="155" cy="135" r="1.8" fill="${gold}" class="dm-ember dm-ember-3"/>
          <circle cx="190" cy="120" r="2.2" fill="#FFE7A0" class="dm-ember dm-ember-4"/>
        </svg>

        <!-- Pure Floating Grand Title (NO CARD / ZERO BOX) -->
        <div class="dm-vedic-title-box">
          <div class="dm-vedic-badge">
            <span class="dm-flourish">꧁</span>
            <span>${escapeHtml(badgeText)}</span>
            <span class="dm-flourish">꧂</span>
          </div>
          <div class="dm-vedic-headline">${escapeHtml(params.title || 'रहस्यमयी कैलाश मन्दिर')}</div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; background: transparent !important; }
    #${containerId} .dm-title-rays-svg { position: absolute; top: -50px; z-index: 1; filter: drop-shadow(0 0 25px ${gold}88); pointer-events: none; }
    #${containerId} .dm-vedic-title-box { position: relative; z-index: 2; margin-top: 45px; display: flex; flex-direction: column; align-items: center; background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; }
    #${containerId} .dm-vedic-badge { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: #FFE7A0; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(8px); border: 1px solid ${gold}; padding: 3px 18px; border-radius: 999px; margin-bottom: 8px; text-shadow: 0 0 10px ${gold}; box-shadow: 0 0 16px ${gold}44; }
    #${containerId} .dm-flourish { color: ${gold}; font-size: 14px; }
    #${containerId} .dm-vedic-headline { font-size: 40px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; letter-spacing: 0.05em; line-height: 1.25; background: linear-gradient(180deg, #FFFFFF 0%, #FFE7A0 55%, ${gold} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.95)) drop-shadow(0 4px 16px rgba(0,0,0,0.9)) drop-shadow(0 0 24px ${gold}77); }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    const titleBox = el.querySelector(".dm-vedic-title-box");
    tl.fromTo(titleBox, { scale: 1.15, opacity: 0, y: 15 }, { scale: 1, opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.05);
    const rays = el.querySelector(".dm-sunburst-rays");
    if (rays) {
      tl.to(rays, { rotation: 45, transformOrigin: "170px 90px", duration: 4.4, ease: "none" }, 0);
    }
    const embers = el.querySelectorAll(".dm-ember");
    if (embers.length) {
      tl.to(embers, { y: "-=25", opacity: 0.2, stagger: 0.1, duration: 2.2, repeat: 1, yoyo: true, ease: "sine.inOut" }, 0.1);
    }
  `;

  return { html, css, js };
}

/**
 * Documentary Template 02: Ancient Manuscript & Bhurjapatra Scroll Unfurl
 * Sleek floating parchment ribbon unrolling horizontally with turned wooden rollers and royal lacquer seal.
 * Compact height leaves 85% of screen free.
 */
function renderAncientScrollUnfurl(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';
  const sealText = params.badge || 'वेद प्रमाण';

  const html = `
    <div id="${containerId}" class="profile-motion-template ancient-scroll-unfurl dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-scroll-container">
          <!-- Left Scroll Roller -->
          <div class="dm-scroll-roller dm-roller-left">
            <span class="dm-roller-cap-top"></span>
            <span class="dm-roller-body"></span>
            <span class="dm-roller-cap-bottom"></span>
          </div>

          <!-- Sleek Parchment Ribbon -->
          <div class="dm-parchment-sheet">
            <!-- Royal Vermillion Lacquer Seal -->
            <div class="dm-parchment-seal">
              <span class="dm-seal-rim">★ ${escapeHtml(sealText)} ★</span>
            </div>
            <div class="dm-parchment-content">
              <div class="dm-parchment-ornament">卐 ॐ 卐</div>
              <div class="dm-parchment-title">${escapeHtml(params.title || 'वाल्मीकि रामायण पाण्डुलिपि')}</div>
              <div class="dm-parchment-tag">५०० BCE · भोजपत्र मूल संहिता</div>
            </div>
          </div>

          <!-- Right Scroll Roller -->
          <div class="dm-scroll-roller dm-roller-right">
            <span class="dm-roller-cap-top"></span>
            <span class="dm-roller-body"></span>
            <span class="dm-roller-cap-bottom"></span>
          </div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; }
    #${containerId} .dm-scroll-container { display: flex; align-items: center; position: relative; max-width: 480px; }
    #${containerId} .dm-scroll-roller { width: 12px; height: 130px; display: flex; flex-direction: column; align-items: center; z-index: 5; flex-shrink: 0; }
    #${containerId} .dm-roller-body { width: 100%; flex: 1; background: linear-gradient(90deg, #3A200B 0%, #8C5A28 50%, #201004 100%); border-radius: 2px; box-shadow: 0 4px 10px rgba(0,0,0,0.8); }
    #${containerId} .dm-roller-cap-top, #${containerId} .dm-roller-cap-bottom { width: 18px; height: 10px; background: linear-gradient(180deg, #FFE7A0 0%, ${gold} 50%, #5E3508 100%); border-radius: 3px; box-shadow: 0 0 8px ${gold}88; }
    #${containerId} .dm-parchment-sheet { position: relative; width: 380px; min-height: 100px; background: rgba(232, 217, 189, 0.82); backdrop-filter: blur(4px); border-top: 2.5px solid #7A5328; border-bottom: 2.5px solid #7A5328; box-shadow: inset 0 0 25px rgba(90,55,20,0.5), 0 10px 30px rgba(0,0,0,0.85); padding: 10px 22px; transform-origin: center center; overflow: hidden; border-radius: 2px; }
    #${containerId} .dm-parchment-seal { position: absolute; top: 8px; right: 10px; width: 44px; height: 44px; background: radial-gradient(circle, #B91C1C 0%, #7F1D1D 80%, #450A0A 100%); border: 1.5px dashed #FDE047; border-radius: 999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(0,0,0,0.8), 0 0 10px rgba(185,28,28,0.5); transform: rotate(-12deg); z-index: 3; }
    #${containerId} .dm-seal-rim { font-size: 7px; font-weight: 900; color: #FEF08A; text-transform: uppercase; text-align: center; line-height: 1.1; letter-spacing: 0.08em; }
    #${containerId} .dm-parchment-content { position: relative; z-index: 2; text-align: center; }
    #${containerId} .dm-parchment-ornament { font-size: 12px; color: #8C5A28; margin-bottom: 2px; letter-spacing: 0.2em; }
    #${containerId} .dm-parchment-title { font-size: 24px; font-weight: 900; color: #2A1708; font-family: ${kit.theme.fontFamily}; line-height: 1.25; text-shadow: 0 1px 1px rgba(255,255,255,0.4); }
    #${containerId} .dm-parchment-tag { font-size: 11px; font-weight: 800; color: #6E4515; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 3px; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.1 });
    const sheet = el.querySelector(".dm-parchment-sheet");
    const rLeft = el.querySelector(".dm-roller-left");
    const rRight = el.querySelector(".dm-roller-right");
    tl.fromTo(sheet, { scaleX: 0.05 }, { scaleX: 1, duration: 0.65, ease: "power3.inOut" }, 0.05);
    tl.fromTo(rLeft, { x: 190 }, { x: 0, duration: 0.65, ease: "power3.inOut" }, 0.05);
    tl.fromTo(rRight, { x: -190 }, { x: 0, duration: 0.65, ease: "power3.inOut" }, 0.05);
    const seal = el.querySelector(".dm-parchment-seal");
    if (seal) {
      tl.fromTo(seal, { scale: 2.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" }, 0.55);
    }
  `;

  return { html, css, js };
}

/**
 * Documentary Template 03: Divine Character & Sacred Mandala Halo
 * Rotating 16-petal Sri Yantra lotus halo with floating sculpted gold typography and attribute tags.
 * 100% CARDLESS & FLOATING.
 */
function renderDivineCharacterIntro(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';
  const badgeText = params.badge || 'चिरंजीवी · ६वां अवतार';

  const html = `
    <div id="${containerId}" class="profile-motion-template divine-character-intro dm-3d-scene">
      <div class="dm-3d-card">
        <!-- Rotating Sacred 16-Petal Lotus Mandala Halo -->
        <svg viewBox="0 0 280 280" width="240" height="240" class="dm-mandala-halo-svg">
          <defs>
            <filter id="${containerId}-divineGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <circle cx="140" cy="140" r="115" fill="none" stroke="${gold}" stroke-width="1.8" stroke-dasharray="4 6" opacity="0.65" class="dm-halo-ring-outer"/>
          <circle cx="140" cy="140" r="85" fill="none" stroke="${gold}" stroke-width="2.2" opacity="0.85"/>
          <g stroke="${gold}" stroke-width="2" class="dm-mandala-spokes" filter="url(#${containerId}-divineGlow)">
            <line x1="140" y1="35" x2="140" y2="245"/>
            <line x1="35" y1="140" x2="245" y2="140"/>
            <line x1="65" y1="65" x2="215" y2="215"/>
            <line x1="65" y1="215" x2="215" y2="65"/>
          </g>
          <circle cx="140" cy="140" r="18" fill="rgba(255,231,160,0.25)" stroke="${gold}" stroke-width="2"/>
          <circle cx="140" cy="140" r="6" fill="#FFFFFF" filter="url(#${containerId}-divineGlow)"/>
        </svg>

        <!-- Pure Floating Character Info (CARD-FREE) -->
        <div class="dm-character-card">
          <div class="dm-char-badge">
            <span class="dm-pulse-dot"></span>
            <span>⚡ ${escapeHtml(badgeText)}</span>
          </div>
          <div class="dm-char-title">${escapeHtml(params.title || 'भगवान परशुराम')}</div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; background: transparent !important; }
    #${containerId} .dm-mandala-halo-svg { position: absolute; top: -65px; z-index: 1; filter: drop-shadow(0 0 30px ${gold}99); pointer-events: none; }
    #${containerId} .dm-character-card { position: relative; z-index: 2; margin-top: 60px; background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-char-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #FFFFFF; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(8px); border: 1.2px solid ${gold}; padding: 3px 14px; border-radius: 999px; margin-bottom: 6px; box-shadow: 0 0 14px ${gold}66; }
    #${containerId} .dm-pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: #FFFFFF; box-shadow: 0 0 8px #FFFFFF; }
    #${containerId} .dm-char-title { font-size: 38px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; letter-spacing: 0.04em; line-height: 1.2; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 22px ${gold}, 0 4px 14px rgba(0,0,0,0.9); }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15 });
    const card = el.querySelector(".dm-character-card");
    tl.fromTo(card, { scale: 0.85, opacity: 0, y: 15 }, { scale: 1, opacity: 1, y: 0, duration: 0.45, ease: "back.out(2)" }, 0.05);
    const halo = el.querySelector(".dm-mandala-spokes");
    if (halo) {
      tl.to(halo, { rotation: 120, transformOrigin: "140px 140px", duration: 4.4, ease: "none" }, 0);
    }
  `;

  return { html, css, js };
}

/**
 * Documentary Template 04: Sacred Bharat Geography & Pilgrimage Map
 * High-precision vector silhouette of the Indian subcontinent (Kashmir to Kanyakumari, Gujarat to Bengal & Sri Lanka),
 * sacred rivers, antique graticule coordinates, vintage 8-point compass rose, and glowing pilgrimage route trail.
 * 100% CARDLESS & FLOATING.
 */
function renderAncientIndiaMap(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template ancient-india-map dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-map-viewport">
          <!-- Authentic Indian Subcontinent Sacred Map -->
          <svg viewBox="0 0 360 300" width="320" height="260" class="dm-bharat-map-svg">
            <defs>
              <filter id="${containerId}-mapGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Coordinate Graticules (Antique Navigation Latitude/Longitude Arcs) -->
            <g stroke="${gold}" stroke-width="0.8" stroke-dasharray="3 4" opacity="0.25">
              <line x1="60" y1="90" x2="330" y2="90"/>
              <line x1="60" y1="160" x2="330" y2="160"/>
              <line x1="60" y1="230" x2="330" y2="230"/>
              <line x1="120" y1="30" x2="120" y2="280"/>
              <line x1="190" y1="30" x2="190" y2="280"/>
              <line x1="260" y1="30" x2="260" y2="280"/>
            </g>

            <!-- Authentic Silhouette of Indian Subcontinent -->
            <path d="M 175,20 C 190,24 202,30 205,42 C 208,55 230,68 255,75 C 265,78 275,76 282,78 C 298,82 312,82 310,95 C 302,108 288,104 275,110 C 262,116 250,118 245,130 C 238,145 230,158 222,172 C 212,190 200,210 190,228 C 182,240 178,252 170,258 C 164,250 158,235 152,220 C 144,198 138,175 132,155 C 128,140 122,132 112,126 C 98,128 88,124 88,114 C 88,104 100,102 105,96 C 98,90 92,84 96,75 C 102,64 116,56 128,48 C 142,40 158,30 175,20 Z" fill="rgba(197,155,82,0.08)" stroke="${gold}" stroke-width="2.2" filter="url(#${containerId}-mapGlow)" class="dm-map-contour"/>

            <!-- Sri Lanka (Teardrop Island) -->
            <path d="M 188,262 C 196,265 198,274 194,280 C 190,286 184,286 180,280 C 176,274 180,265 188,262 Z" fill="rgba(197,155,82,0.12)" stroke="${gold}" stroke-width="1.8"/>

            <!-- Sacred Rivers (Ganga & Yamuna & Godavari) -->
            <path d="M 195,50 Q 220,78 255,108" fill="none" stroke="#60A5FA" stroke-width="1.6" stroke-dasharray="2 3" opacity="0.75"/>
            <path d="M 142,152 Q 185,162 225,168" fill="none" stroke="#60A5FA" stroke-width="1.6" stroke-dasharray="2 3" opacity="0.75"/>

            <!-- Destination Sonar Wave Pulse -->
            <circle cx="188" cy="266" r="14" fill="none" stroke="#EF4444" stroke-width="1.8" class="dm-sonar-ring" opacity="0.8"/>
            <circle cx="188" cy="266" r="24" fill="none" stroke="#EF4444" stroke-width="1.2" class="dm-sonar-ring-2" opacity="0.4"/>

            <!-- Pilgrimage Route Trail (Ayodhya -> Mithila -> Dandakaranya -> Kishkindha -> Rameshwaram -> Lanka) -->
            <path d="M 218,78 L 246,76 L 220,95 L 152,148 L 162,192 L 178,246 L 188,266" fill="none" stroke="#FDE047" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#${containerId}-mapGlow)" class="dm-pilgrim-route"/>

            <!-- Destination Pins -->
            <g class="dm-pin dm-pin-1" transform="translate(218, 78)">
              <circle cx="0" cy="0" r="5" fill="#F59E0B" filter="url(#${containerId}-mapGlow)"/>
              <circle cx="0" cy="0" r="2" fill="#FFFFFF"/>
              <text x="7" y="4" font-size="9" font-weight="900" fill="#FFFFFF" font-family="${kit.theme.fontFamily}">अयोध्या</text>
            </g>
            <g class="dm-pin dm-pin-2" transform="translate(246, 76)">
              <circle cx="0" cy="0" r="4.5" fill="#F59E0B" filter="url(#${containerId}-mapGlow)"/>
              <circle cx="0" cy="0" r="1.8" fill="#FFFFFF"/>
              <text x="6" y="4" font-size="8.5" font-weight="900" fill="#FFE7A0" font-family="${kit.theme.fontFamily}">मिथिला</text>
            </g>
            <g class="dm-pin dm-pin-3" transform="translate(152, 148)">
              <circle cx="0" cy="0" r="4.5" fill="#F59E0B" filter="url(#${containerId}-mapGlow)"/>
              <circle cx="0" cy="0" r="1.8" fill="#FFFFFF"/>
              <text x="-52" y="4" font-size="8.5" font-weight="900" fill="#FFE7A0" font-family="${kit.theme.fontFamily}">दण्डकारण्य</text>
            </g>
            <g class="dm-pin dm-pin-4" transform="translate(162, 192)">
              <circle cx="0" cy="0" r="4.5" fill="#F59E0B" filter="url(#${containerId}-mapGlow)"/>
              <circle cx="0" cy="0" r="1.8" fill="#FFFFFF"/>
              <text x="-44" y="4" font-size="8.5" font-weight="900" fill="#FFE7A0" font-family="${kit.theme.fontFamily}">किष्किन्धा</text>
            </g>
            <g class="dm-pin dm-pin-5" transform="translate(188, 266)">
              <circle cx="0" cy="0" r="6.5" fill="#EF4444" filter="url(#${containerId}-mapGlow)"/>
              <circle cx="0" cy="0" r="2.5" fill="#FFFFFF"/>
              <text x="8" y="4" font-size="9.5" font-weight="900" fill="#FFFFFF" font-family="${kit.theme.fontFamily}">लंका</text>
            </g>

            <!-- Vintage 8-Point Compass Rose -->
            <g class="dm-compass-rose" transform="translate(310, 42)">
              <circle cx="0" cy="0" r="18" fill="none" stroke="${gold}" stroke-width="1.2" opacity="0.6"/>
              <g class="dm-compass-needle">
                <polygon points="0,-16 4,-4 0,0 -4,-4" fill="${gold}"/>
                <polygon points="0,16 4,4 0,0 -4,4" fill="rgba(197,155,82,0.4)"/>
                <polygon points="16,0 4,4 0,0 4,-4" fill="rgba(197,155,82,0.4)"/>
                <polygon points="-16,0 -4,4 0,0 -4,-4" fill="rgba(197,155,82,0.4)"/>
              </g>
              <text x="-3.5" y="-19" font-size="8" font-weight="900" fill="${gold}">N</text>
            </g>
          </svg>

          <!-- Pure Visual-First Route Pill (ZERO BORING PARAGRAPHS) -->
          <div class="dm-map-label">
            <div class="dm-map-route-pill">
              <span class="dm-rp-dot"></span>
              <span class="dm-rp-text">${escapeHtml(params.title || 'श्री राम वनवास तीर्थ')}</span>
              <span class="dm-rp-badge">२,४०० KM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; }
    #${containerId} .dm-map-viewport { background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-bharat-map-svg { filter: drop-shadow(0 0 20px ${gold}88); }
    #${containerId} .dm-map-label { text-align: center; margin-top: 6px; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-map-route-pill { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800; color: #FFFFFF; background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); border: 1.2px solid ${gold}; padding: 4px 16px; border-radius: 999px; box-shadow: 0 4px 16px rgba(0,0,0,0.8), 0 0 14px ${gold}44; font-family: ${kit.theme.fontFamily}; }
    #${containerId} .dm-rp-dot { width: 7px; height: 7px; border-radius: 999px; background: #FDE047; box-shadow: 0 0 8px #FDE047; }
    #${containerId} .dm-rp-badge { font-size: 11px; font-weight: 900; color: #FFE7A0; background: rgba(197,155,82,0.3); border: 1px solid ${gold}; border-radius: 999px; padding: 1px 8px; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" });
    const route = el.querySelector(".dm-pilgrim-route");
    if (route) {
      tl.fromTo(route, { strokeDasharray: 520, strokeDashoffset: 520 }, { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut" }, 0.15);
    }
    const pins = el.querySelectorAll(".dm-pin");
    tl.fromTo(pins, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, stagger: 0.2, duration: 0.3, ease: "back.out(2)" }, 0.3);
    const needle = el.querySelector(".dm-compass-needle");
    if (needle) {
      tl.fromTo(needle, { rotation: -45, transformOrigin: "center center" }, { rotation: 0, duration: 1.0, ease: "elastic.out(1, 0.5)" }, 0.2);
    }
    const sonars = el.querySelectorAll(".dm-sonar-ring, .dm-sonar-ring-2");
    if (sonars.length) {
      tl.to(sonars, { scale: 1.4, opacity: 0, transformOrigin: "188px 266px", repeat: -1, duration: 1.2, ease: "power1.out" }, 0.8);
    }
  `;

  return { html, css, js };
}

/**
 * Documentary Template 05: Temple Architecture & Carving Breakdown
 * Authentic Nagara elevation blueprint with:
 * - Animated Top-Down Rock-Cut Chisel Laser slicing the mountain
 * - Human scale comparison silhouette (🧍 1.8m) vs 32m Shikhara
 * - Metric tonnage callout: ▲ 400,000 TONS CARVED
 * 100% CARDLESS & VISUAL-FIRST.
 */
function renderTempleArchitecture(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template temple-architecture dm-3d-scene">
      <div class="dm-3d-card">
        <svg viewBox="0 0 340 240" width="300" height="210" class="dm-temple-svg">
          <defs>
            <filter id="${containerId}-archGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          <!-- Blueprint Grid Lines -->
          <g stroke="${gold}" stroke-width="0.8" stroke-dasharray="3 4" opacity="0.2">
            <line x1="20" y1="60" x2="320" y2="60"/>
            <line x1="20" y1="120" x2="320" y2="120"/>
            <line x1="20" y1="180" x2="320" y2="180"/>
            <line x1="90" y1="20" x2="90" y2="230"/>
            <line x1="225" y1="20" x2="225" y2="230"/>
          </g>

          <!-- Molded Stone Base Platform (Adhisthana) -->
          <path d="M 40,205 L 300,205 L 290,225 L 50,225 Z" fill="rgba(197,155,82,0.12)" stroke="${gold}" stroke-width="2"/>

          <!-- Maha-Mandapa Pillared Assembly Hall (Left) -->
          <line x1="65" y1="165" x2="65" y2="205" stroke="${gold}" stroke-width="2.5"/>
          <line x1="95" y1="165" x2="95" y2="205" stroke="${gold}" stroke-width="2.5"/>
          <line x1="125" y1="165" x2="125" y2="205" stroke="${gold}" stroke-width="2.5"/>
          <!-- Mandapa Tiered Pyramidal Roof (Phamsana) -->
          <path d="M 50,165 L 140,165 L 130,145 L 60,145 L 120,130 L 70,130 L 95,115 Z" fill="rgba(197,155,82,0.15)" stroke="${gold}" stroke-width="2"/>

          <!-- Antarala (Vestibule Roof) -->
          <path d="M 140,165 L 175,165 L 175,120 L 140,145 Z" fill="rgba(197,155,82,0.1)" stroke="${gold}" stroke-width="1.8"/>

          <!-- Shikhara Curvilinear Spire Profile (Right) -->
          <path d="M 175,205 C 175,160 190,110 215,48 L 235,48 C 260,110 275,160 275,205 Z" fill="rgba(197,155,82,0.16)" stroke="${gold}" stroke-width="2.5" filter="url(#${containerId}-archGlow)" class="dm-temple-wireframe"/>

          <!-- Ribbed Horizontal Bhumi Tiers -->
          <path d="M 180,160 Q 225,154 270,160" fill="none" stroke="${gold}" stroke-width="1.6"/>
          <path d="M 190,125 Q 225,120 260,125" fill="none" stroke="${gold}" stroke-width="1.6"/>
          <path d="M 200,90 Q 225,86 250,90" fill="none" stroke="${gold}" stroke-width="1.6"/>
          <path d="M 208,68 Q 225,65 242,68" fill="none" stroke="${gold}" stroke-width="1.6"/>

          <!-- Crowning Amalaka & Kalasha Finial -->
          <ellipse cx="225" cy="42" rx="16" ry="6" fill="${gold}" stroke="#FFE7A0" stroke-width="1.8"/>
          <path d="M 225,22 C 220,28 218,32 225,36 C 232,32 230,28 225,22 Z" fill="#FFE7A0" filter="url(#${containerId}-archGlow)"/>
          <circle cx="225" cy="20" r="3" fill="#FFFFFF"/>

          <!-- Inner Sanctum (Garbhagriha) Diya Glow -->
          <rect x="210" y="172" width="30" height="33" fill="rgba(0,0,0,0.6)" stroke="${gold}" stroke-width="1.5"/>
          <circle cx="225" cy="186" r="6" fill="#FDE047" filter="url(#${containerId}-archGlow)"/>

          <!-- TOP-DOWN ROCK-CUT CHISEL LASER BEAM (Iconic Kailasa Action) -->
          <g class="dm-chisel-group">
            <line x1="165" y1="20" x2="285" y2="20" stroke="#FFE7A0" stroke-width="3" filter="url(#${containerId}-archGlow)" class="dm-chisel-beam"/>
            <circle cx="225" cy="20" r="4" fill="#FFFFFF" class="dm-chisel-head"/>
            <circle cx="210" cy="20" r="2.5" fill="#FDE047" class="dm-chisel-spark-1"/>
            <circle cx="240" cy="20" r="2.5" fill="#FDE047" class="dm-chisel-spark-2"/>
          </g>

          <!-- Human Scale Silhouette (🧍 1.8m vs 32m Monolith) -->
          <g class="dm-human-scale" transform="translate(48, 205)">
            <circle cx="0" cy="-14" r="2.5" fill="#FFE7A0"/>
            <line x1="0" y1="-12" x2="0" y2="-4" stroke="#FFE7A0" stroke-width="2"/>
            <line x1="0" y1="-4" x2="-3" y2="4" stroke="#FFE7A0" stroke-width="1.6"/>
            <line x1="0" y1="-4" x2="3" y2="4" stroke="#FFE7A0" stroke-width="1.6"/>
            <text x="6" y="-3" font-size="8.5" font-weight="900" fill="#FFE7A0">1.8m</text>
          </g>

          <!-- Spire Height Dimension Callout (32m) -->
          <line x1="285" y1="22" x2="320" y2="22" stroke="#FFE7A0" stroke-width="1.2" stroke-dasharray="3 3"/>
          <line x1="285" y1="205" x2="320" y2="205" stroke="#FFE7A0" stroke-width="1.2" stroke-dasharray="3 3"/>
          <line x1="315" y1="22" x2="315" y2="205" stroke="#FFE7A0" stroke-width="1.4"/>
          <text x="290" y="118" font-size="9" font-weight="900" fill="#FFE7A0" font-family="${kit.theme.fontFamily}" transform="rotate(90, 290, 118)">32 METERS</text>
        </svg>

        <!-- Metric Tonnage & Title Pill (ZERO BORING PARAGRAPHS) -->
        <div class="dm-temple-label">
          <div class="dm-temple-metric-pill">
            <span class="dm-tmp-icon">▲</span>
            <span class="dm-tmp-val">४००,००० TONS</span>
            <span class="dm-tmp-sub">TOP-DOWN CARVED</span>
          </div>
          <div class="dm-temple-title">${escapeHtml(params.title || 'कैलाश मन्दिर एकाश्म')}</div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-temple-svg { filter: drop-shadow(0 0 20px ${gold}77); }
    #${containerId} .dm-temple-label { text-align: center; margin-top: 6px; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-temple-metric-pill { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; color: #FFFFFF; background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); border: 1.2px solid ${gold}; padding: 3px 14px; border-radius: 999px; box-shadow: 0 4px 16px rgba(0,0,0,0.8), 0 0 12px ${gold}44; }
    #${containerId} .dm-tmp-icon { color: #FDE047; font-size: 10px; }
    #${containerId} .dm-tmp-val { color: #FFE7A0; font-weight: 900; letter-spacing: 0.06em; }
    #${containerId} .dm-tmp-sub { font-size: 10px; color: #E8D9BD; letter-spacing: 0.12em; text-transform: uppercase; border-left: 1px solid rgba(255,255,255,0.3); padding-left: 8px; }
    #${containerId} .dm-temple-title { font-size: 26px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 16px ${gold}; margin-top: 4px; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" });
    const wire = el.querySelector(".dm-temple-wireframe");
    if (wire) {
      tl.fromTo(wire, { strokeDasharray: 700, strokeDashoffset: 700 }, { strokeDashoffset: 0, duration: 1.0, ease: "power2.out" }, 0.1);
    }
    const chisel = el.querySelector(".dm-chisel-group");
    if (chisel) {
      tl.fromTo(chisel, { y: 0, opacity: 1 }, { y: 185, duration: 2.2, ease: "power1.inOut" }, 0.2);
    }
    const sparks = el.querySelectorAll(".dm-chisel-spark-1, .dm-chisel-spark-2");
    if (sparks.length) {
      tl.to(sparks, { x: "+=12", y: "-=8", opacity: 0, repeat: -1, yoyo: true, duration: 0.25 }, 0.2);
    }
  `;

  return { html, css, js };
}

/**
 * Documentary Template 06: Historical Dynasty & Yuga Epoch Timeline
 * Vertical timeline with glowing Sushumna energy cord and pulsing cosmic era milestone nodes.
 * 100% CARDLESS & FLOATING.
 */
function renderHistoricalTimeline(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template historical-timeline dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-timeline-wrapper">
          <div class="dm-time-metric-pill">
            <span class="dm-tmp-icon">⏳</span>
            <span class="dm-tmp-val">४,३२०,००० YRS</span>
            <span class="dm-tmp-sub">MAHAYUGA CYCLE</span>
          </div>
          <div class="dm-time-headline">${escapeHtml(params.title || 'सनातन कालक्रम चक्र')}</div>

          <div class="dm-time-spine-container">
            <div class="dm-time-spine"></div>
            <!-- Node 1 -->
            <div class="dm-time-node dm-node-1">
              <span class="dm-node-dot"></span>
              <div class="dm-node-info">
                <span class="dm-node-epoch">सत्य युग</span>
                <span class="dm-node-tag">१,७२८,००० वर्ष</span>
              </div>
            </div>
            <!-- Node 2 (Active Milestone) -->
            <div class="dm-time-node dm-node-2 dm-node-active">
              <span class="dm-node-dot"></span>
              <div class="dm-node-info">
                <span class="dm-node-epoch">त्रेता युग</span>
                <span class="dm-node-tag">श्री राम अवतार · १,२९६,००० वर्ष</span>
              </div>
            </div>
            <!-- Node 3 -->
            <div class="dm-time-node dm-node-3">
              <span class="dm-node-dot"></span>
              <div class="dm-node-info">
                <span class="dm-node-epoch">द्वापर युग</span>
                <span class="dm-node-tag">८६४,००० वर्ष · श्री कृष्ण</span>
              </div>
            </div>
            <!-- Node 4 -->
            <div class="dm-time-node dm-node-4">
              <span class="dm-node-dot"></span>
              <div class="dm-node-info">
                <span class="dm-node-epoch">कलि युग</span>
                <span class="dm-node-tag">३१०२ BCE आरम्भ · ४३२,००० वर्ष</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; }
    #${containerId} .dm-timeline-wrapper { background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; display: flex; flex-direction: column; align-items: center; max-width: 440px; }
    #${containerId} .dm-time-metric-pill { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; color: #FFFFFF; background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); border: 1.2px solid ${gold}; padding: 3px 14px; border-radius: 999px; margin-bottom: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.8), 0 0 12px ${gold}44; }
    #${containerId} .dm-time-headline { font-size: 26px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 16px ${gold}; margin-bottom: 12px; }
    #${containerId} .dm-time-spine-container { position: relative; display: flex; flex-direction: column; gap: 10px; width: 100%; padding-left: 24px; }
    #${containerId} .dm-time-spine { position: absolute; left: 8px; top: 8px; bottom: 8px; width: 3px; background: linear-gradient(180deg, #FFE7A0, ${gold}, rgba(197,155,82,0.2)); border-radius: 999px; box-shadow: 0 0 14px ${gold}; }
    #${containerId} .dm-time-node { position: relative; display: flex; align-items: center; gap: 12px; }
    #${containerId} .dm-node-dot { width: 14px; height: 14px; border-radius: 999px; background: #0A0A0E; border: 2.5px solid ${gold}; margin-left: -22px; box-shadow: 0 0 10px ${gold}; flex-shrink: 0; }
    #${containerId} .dm-node-active .dm-node-dot { background: #FFFFFF; border-color: #FDE047; box-shadow: 0 0 18px #FDE047; }
    #${containerId} .dm-node-info { display: flex; align-items: center; gap: 8px; text-align: left; }
    #${containerId} .dm-node-epoch { font-size: 14px; font-weight: 800; color: #FFE7A0; font-family: ${kit.theme.fontFamily}; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
    #${containerId} .dm-node-tag { font-size: 11px; font-weight: 700; color: #E8D9BD; background: rgba(0,0,0,0.4); border: 1px solid rgba(197,155,82,0.4); border-radius: 6px; padding: 2px 8px; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
    const spine = el.querySelector(".dm-time-spine");
    tl.fromTo(spine, { scaleY: 0, transformOrigin: "top center" }, { scaleY: 1, duration: 0.7, ease: "power2.out" }, 0.1);
    const nodes = el.querySelectorAll(".dm-time-node");
    tl.fromTo(nodes, { opacity: 0, x: -10 }, { opacity: 1, x: 0, stagger: 0.15, duration: 0.35, ease: "power2.out" }, 0.2);
  `;

  return { html, css, js };
}

/**
 * Documentary Template 07: Sacred Sanskrit Shloka & Meaning Reveal
 * Two-tier scripture verse: authentic Sanskrit shloka with temple filigree and Hindi translation expanding underneath.
 * 100% CARDLESS & FLOATING.
 */
function renderSanskritShlokaReveal(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'top', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template sanskrit-shloka-reveal dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-shloka-box">
          <!-- Om Radiant Emblem -->
          <div class="dm-shloka-om">
            <span class="dm-om-symbol">ॐ</span>
          </div>

          <!-- Sanskrit Verse (Hero Visual) -->
          <div class="dm-shloka-verse">
            <span class="dm-verse-bracket">॥</span>
            <span class="dm-verse-text">${escapeHtml(params.title || 'यदा यदा हि धर्मस्य ग्लानिर्भवति भारत')}</span>
            <span class="dm-verse-bracket">॥</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; }
    #${containerId} .dm-shloka-box { background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 480px; }
    #${containerId} .dm-shloka-om { width: 44px; height: 44px; border-radius: 999px; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); border: 1.5px solid ${gold}; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; box-shadow: 0 0 20px ${gold}88; }
    #${containerId} .dm-om-symbol { font-size: 24px; font-weight: 900; color: #FFE7A0; text-shadow: 0 0 12px ${gold}; }
    #${containerId} .dm-shloka-verse { font-size: 28px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; line-height: 1.35; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 20px ${gold}, 0 4px 12px rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; gap: 8px; }
    #${containerId} .dm-verse-bracket { color: ${gold}; font-size: 26px; text-shadow: 0 0 12px ${gold}; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
    const om = el.querySelector(".dm-shloka-om");
    if (om) {
      tl.fromTo(om, { scale: 0.5 }, { scale: 1, duration: 0.4, ease: "back.out(2.5)" }, 0.05);
    }
    const verse = el.querySelector(".dm-shloka-verse");
    tl.fromTo(verse, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out" }, 0.1);
  `;

  return { html, css, js };
}

/**
 * Documentary Template 08: Sri Yantra Sacred Geometry Pulse
 * Intricate vector Sri Yantra drawing on with 9 interlocking triangles, counter-rotating lotus petals, and bindu shockwave.
 * 100% CARDLESS & FLOATING.
 */
function renderSacredGeometryYantra(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template sacred-geometry-yantra dm-3d-scene">
      <div class="dm-3d-card">
        <svg viewBox="0 0 280 280" width="240" height="240" class="dm-yantra-svg">
          <defs>
            <filter id="${containerId}-yantraGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <!-- Outer Bhupura (Square Earth Portal Frame) -->
          <rect x="25" y="25" width="230" height="230" fill="none" stroke="${gold}" stroke-width="2.5" filter="url(#${containerId}-yantraGlow)"/>
          <circle cx="140" cy="140" r="100" fill="none" stroke="${gold}" stroke-width="1.8"/>
          <!-- 16-Petal Concentric Lotus Petal Rings -->
          <circle cx="140" cy="140" r="82" fill="none" stroke="${gold}" stroke-width="1.5" stroke-dasharray="6 6" class="dm-yantra-petals"/>
          <!-- 9 Interlocking Golden Triangles -->
          <polygon points="140,48 75,175 205,175" fill="none" stroke="${gold}" stroke-width="2.2" class="dm-tri-1"/>
          <polygon points="140,232 75,105 205,105" fill="none" stroke="${gold}" stroke-width="2.2" class="dm-tri-2"/>
          <polygon points="140,70 95,190 185,190" fill="none" stroke="#FFE7A0" stroke-width="1.8" class="dm-tri-3"/>
          <polygon points="140,210 95,90 185,90" fill="none" stroke="#FFE7A0" stroke-width="1.8" class="dm-tri-4"/>
          <!-- Sacred Center Bindu Shockwave Ripple -->
          <circle cx="140" cy="140" r="15" fill="none" stroke="#FFFFFF" stroke-width="1.5" class="dm-bindu-wave" opacity="0.8"/>
          <circle cx="140" cy="140" r="5" fill="#FFFFFF" filter="url(#${containerId}-yantraGlow)" class="dm-bindu"/>
        </svg>

        <!-- Pure Floating Yantra Title (ZERO PARAGRAPHS) -->
        <div class="dm-yantra-label">
          <div class="dm-yantra-title">${escapeHtml(params.title || 'श्री यन्त्र · दिव्य ज्यामिति')}</div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-yantra-svg { filter: drop-shadow(0 0 24px ${gold}88); }
    #${containerId} .dm-yantra-label { text-align: center; margin-top: 6px; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-yantra-title { font-size: 24px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 16px ${gold}; letter-spacing: 0.04em; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" });
    const petals = el.querySelector(".dm-yantra-petals");
    if (petals) {
      tl.to(petals, { rotation: 180, transformOrigin: "140px 140px", duration: 4.4, ease: "none" }, 0);
    }
    const wave = el.querySelector(".dm-bindu-wave");
    if (wave) {
      tl.to(wave, { scale: 3.5, opacity: 0, transformOrigin: "140px 140px", repeat: -1, duration: 1.4, ease: "power1.out" }, 0.4);
    }
  `;

  return { html, css, js };
}

/**
 * Documentary Template 09: Mythological Lineage & Dynasty Tree
 * Vertical cascading ancestral tree connecting royal avatar medallions with glowing golden Surya lineage branches.
 * 100% CARDLESS & VISUAL-FIRST.
 */
function renderDynastyFamilyTree(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template dynasty-family-tree dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-tree-wrapper">
          <div class="dm-tree-title">${escapeHtml(params.title || 'सूर्यवंश दिव्य वंशावली')}</div>

          <div class="dm-tree-nodes-chain">
            <!-- Node 1 -->
            <div class="dm-tree-node dm-tn-1">
              <span class="dm-tree-avatar">सूर्य</span>
              <span class="dm-tree-name">विवस्वान (सूर्य देव)</span>
            </div>
            <div class="dm-tree-connector">↓</div>
            <!-- Node 2 -->
            <div class="dm-tree-node dm-tn-2">
              <span class="dm-tree-avatar">इक्ष्वा</span>
              <span class="dm-tree-name">इक्ष्वाकु (वंश संस्थापक)</span>
            </div>
            <div class="dm-tree-connector">↓</div>
            <!-- Node 3 (Active Avatar) -->
            <div class="dm-tree-node dm-tn-3 dm-tn-active">
              <span class="dm-tree-avatar">राम</span>
              <span class="dm-tree-name">श्री राम (मर्यादा पुरुषोत्तम)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; }
    #${containerId} .dm-tree-wrapper { background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; display: flex; flex-direction: column; align-items: center; max-width: 440px; }
    #${containerId} .dm-tree-title { font-size: 26px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 16px ${gold}; margin-bottom: 10px; }
    #${containerId} .dm-tree-nodes-chain { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; }
    #${containerId} .dm-tree-node { display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); border: 1.2px solid rgba(197,155,82,0.5); border-radius: 999px; padding: 4px 16px 4px 5px; }
    #${containerId} .dm-tn-active { background: rgba(197,155,82,0.25); border-color: ${gold}; box-shadow: 0 0 18px ${gold}66; }
    #${containerId} .dm-tree-avatar { width: 32px; height: 32px; border-radius: 999px; background: ${gold}; color: #000; font-weight: 900; font-size: 11px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px ${gold}; }
    #${containerId} .dm-tree-name { font-size: 14px; font-weight: 800; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
    #${containerId} .dm-tree-connector { font-size: 12px; color: ${gold}; text-shadow: 0 0 6px ${gold}; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
    const nodes = el.querySelectorAll(".dm-tree-node");
    tl.fromTo(nodes, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, stagger: 0.15, duration: 0.35, ease: "back.out(2)" }, 0.15);
  `;

  return { html, css, js };
}

/**
 * Documentary Template 18: Divine Astra & Celestial Weapon Showcase
 * Sacred weapon (Pinaka, Sudarshana, Trishul) hovering in celestial flames with potency stats and mantra inscription.
 * 100% CARDLESS & FLOATING.
 */
function renderDivineWeaponShowcase(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template divine-weapon-showcase dm-3d-scene">
      <div class="dm-3d-card">
        <svg viewBox="0 0 280 220" width="240" height="190" class="dm-weapon-svg">
          <defs>
            <filter id="${containerId}-weaponGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <!-- Celestial Solar Flare Orbit Ring -->
          <circle cx="140" cy="110" r="88" fill="none" stroke="${gold}" stroke-width="1.5" stroke-dasharray="6 4" class="dm-weapon-flare" opacity="0.75"/>
          
          <!-- 16-Serrated Sudarshana Chakra Wheel -->
          <g class="dm-chakra-wheel" filter="url(#${containerId}-weaponGlow)">
            <circle cx="140" cy="110" r="64" fill="none" stroke="${gold}" stroke-width="4"/>
            <!-- 16 Serrated Triangular Blades -->
            <polygon points="140,42 144,52 136,52" fill="#FFE7A0"/>
            <polygon points="140,178 144,168 136,168" fill="#FFE7A0"/>
            <polygon points="72,110 82,114 82,106" fill="#FFE7A0"/>
            <polygon points="208,110 198,114 198,106" fill="#FFE7A0"/>
            <polygon points="92,62 101,69 95,75" fill="#FFE7A0"/>
            <polygon points="188,158 179,151 185,145" fill="#FFE7A0"/>
            <polygon points="92,158 95,145 101,151" fill="#FFE7A0"/>
            <polygon points="188,62 185,75 179,69" fill="#FFE7A0"/>
          </g>

          <!-- White-Hot Central Bindu Energy Core -->
          <circle cx="140" cy="110" r="14" fill="#FFE7A0" stroke="${gold}" stroke-width="2"/>
          <circle cx="140" cy="110" r="6" fill="#FFFFFF" filter="url(#${containerId}-weaponGlow)"/>

          <!-- Flying Celestial Sparks -->
          <circle cx="105" cy="80" r="2" fill="#FDE047" class="dm-chakra-spark dm-spark-a"/>
          <circle cx="175" cy="140" r="2" fill="#FDE047" class="dm-chakra-spark dm-spark-b"/>
        </svg>

        <!-- Metric Potency Pill & Title (ZERO BORING PARAGRAPHS) -->
        <div class="dm-weapon-label">
          <div class="dm-weapon-metric-pill">
            <span class="dm-wmp-icon">⚡</span>
            <span class="dm-wmp-val">संहार क्षमता · १००% POTENCY</span>
          </div>
          <div class="dm-weapon-title">${escapeHtml(params.title || 'सुदर्शन चक्र')}</div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-weapon-svg { filter: drop-shadow(0 0 24px ${gold}88); }
    #${containerId} .dm-weapon-label { text-align: center; margin-top: 4px; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-weapon-metric-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; color: #FFFFFF; background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); border: 1.2px solid ${gold}; padding: 3px 14px; border-radius: 999px; margin-bottom: 4px; box-shadow: 0 4px 16px rgba(0,0,0,0.8), 0 0 12px ${gold}44; }
    #${containerId} .dm-wmp-icon { color: #FDE047; }
    #${containerId} .dm-wmp-val { color: #FFE7A0; letter-spacing: 0.08em; }
    #${containerId} .dm-weapon-title { font-size: 28px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 16px ${gold}; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" });
    const wheel = el.querySelector(".dm-chakra-wheel");
    if (wheel) {
      tl.to(wheel, { rotation: 360, transformOrigin: "140px 110px", duration: 2.2, repeat: -1, ease: "none" }, 0);
    }
    const flare = el.querySelector(".dm-weapon-flare");
    if (flare) {
      tl.to(flare, { rotation: -360, transformOrigin: "140px 110px", duration: 4.4, repeat: -1, ease: "none" }, 0);
    }
    const sparks = el.querySelectorAll(".dm-chakra-spark");
    if (sparks.length) {
      tl.to(sparks, { scale: 1.8, opacity: 0, repeat: -1, yoyo: true, duration: 0.3 }, 0);
    }
  `;

  return { html, css, js };
}

/**
 * Documentary Template 11: Temple & Scripture Documentary Lower Third
 * Slender architectural stone nameplate with gold filigree trim and sacred Om medallion.
 */
function renderDocumentaryLowerThird(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'top', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template documentary-lower-third dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-dlt-container">
          <div class="dm-dlt-medallion">ॐ</div>
          <div class="dm-dlt-body">
            <div class="dm-dlt-title">${escapeHtml(params.title)}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; }
    #${containerId} .dm-dlt-container { display: flex; align-items: center; gap: 12px; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(10px); border: 1.2px solid ${gold}; border-left: 4px solid ${gold}; border-radius: 10px; padding: 6px 18px; box-shadow: 0 8px 25px rgba(0,0,0,0.8), 0 0 16px ${gold}33; }
    #${containerId} .dm-dlt-medallion { width: 32px; height: 32px; border-radius: 999px; background: ${gold}33; border: 1.2px solid ${gold}; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; color: #FFE7A0; flex-shrink: 0; box-shadow: 0 0 8px ${gold}; }
    #${containerId} .dm-dlt-body { display: flex; flex-direction: column; text-align: left; }
    #${containerId} .dm-dlt-title { font-size: 20px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 10px ${gold}; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, x: -25 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" });
  `;

  return { html, css, js };
}

/**
 * Documentary Template 15: Ancient Stone Inscription Deciphering
 * Ancient Brahmi rock-edict glyphs with golden deciphering laser scanline.
 */
function renderStoneInscriptionReveal(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template stone-inscription-reveal dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-tablet-body">
          <div class="dm-tablet-ancient">𑀥𑀫𑁆𑀫 𑀮𑀺𑀧𑀺 · 𑀅𑀲𑁄𑀓 𑀲𑀺𑀮𑀸𑀮𑁂𑀔</div>
          <div class="dm-tablet-scanner"></div>
          <div class="dm-tablet-translated">${escapeHtml(params.title)}</div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; }
    #${containerId} .dm-tablet-body { position: relative; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(10px); border: 2px solid ${gold}88; border-radius: 14px; padding: 10px 22px; box-shadow: 0 10px 30px rgba(0,0,0,0.85); max-width: 460px; text-align: center; overflow: hidden; }
    #${containerId} .dm-tablet-ancient { font-size: 15px; color: #D4AF37; font-family: monospace; letter-spacing: 0.16em; opacity: 0.75; margin-bottom: 6px; }
    #${containerId} .dm-tablet-scanner { position: absolute; top: 0; bottom: 0; left: 0; width: 3px; background: #FFE7A0; box-shadow: 0 0 14px ${gold}; opacity: 0.85; }
    #${containerId} .dm-tablet-translated { font-size: 26px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 14px ${gold}; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    const scan = el.querySelector(".dm-tablet-scanner");
    if (scan) {
      tl.fromTo(scan, { left: "0%" }, { left: "100%", duration: 1.2, ease: "power2.inOut" }, 0.1);
    }
  `;

  return { html, css, js };
}

/**
 * Documentary Template 16: Vedic Cosmology & Brahmanda Universe
 * Concentric 14 Lokas cosmic sphere model with Mount Meru axis and cyclic Yuga time caliper.
 */
function renderCosmicUniverseExplainer(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template cosmic-universe-explainer dm-3d-scene">
      <div class="dm-3d-card">
        <svg viewBox="0 0 280 180" width="240" height="150" class="dm-cosmic-svg">
          <defs>
            <filter id="${containerId}-cosmicGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <!-- Concentric 14 Lokas Spheres -->
          <ellipse cx="140" cy="90" rx="110" ry="38" fill="none" stroke="${gold}" stroke-width="1.5" stroke-dasharray="4 6" class="dm-loka-outer"/>
          <ellipse cx="140" cy="90" rx="80" ry="26" fill="none" stroke="#FFE7A0" stroke-width="1.8" class="dm-loka-mid"/>
          <ellipse cx="140" cy="90" rx="45" ry="15" fill="none" stroke="${gold}" stroke-width="2"/>
          <!-- Mount Meru Cosmic Axis -->
          <line x1="140" y1="15" x2="140" y2="165" stroke="#FFFFFF" stroke-width="2" filter="url(#${containerId}-cosmicGlow)" class="dm-meru-axis"/>
          <circle cx="140" cy="90" r="8" fill="${gold}" filter="url(#${containerId}-cosmicGlow)"/>
        </svg>

        <!-- Metric & Title (ZERO PARAGRAPHS) -->
        <div class="dm-cosmic-label">
          <div class="dm-cosmic-metric-pill">
            <span class="dm-cmp-icon">🌌</span>
            <span class="dm-cmp-val">१४ भुवन लोक · BRAHMANDA</span>
          </div>
          <div class="dm-cosmic-title">${escapeHtml(params.title || 'वैदिक ब्रह्माण्ड चक्र')}</div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-cosmic-svg { filter: drop-shadow(0 0 20px ${gold}66); }
    #${containerId} .dm-cosmic-label { text-align: center; margin-top: 4px; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-cosmic-metric-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; color: #FFFFFF; background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); border: 1.2px solid ${gold}; padding: 3px 14px; border-radius: 999px; margin-bottom: 4px; box-shadow: 0 4px 16px rgba(0,0,0,0.8), 0 0 12px ${gold}44; }
    #${containerId} .dm-cmp-icon { color: #FFE7A0; }
    #${containerId} .dm-cmp-val { color: #FFE7A0; letter-spacing: 0.08em; }
    #${containerId} .dm-cosmic-title { font-size: 26px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 14px ${gold}; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" });
    const outer = el.querySelector(".dm-loka-outer");
    if (outer) {
      tl.to(outer, { rotation: 360, transformOrigin: "140px 90px", duration: 8.0, repeat: -1, ease: "none" }, 0);
    }
  `;

  return { html, css, js };
}

/**
 * Documentary Template 20: Cinematic Outro & Shanti Mantra Seal
 * Royal golden seal medallion with 3D embossed Om and Shanti mantra floating over footage.
 * 100% CARDLESS & FLOATING.
 */
function renderCinematicOutroSeal(params: ProfileTemplateParams, kit: StyleKit, containerId: string) {
  const scale = resolveScale(params.size);
  const posCss = computePlacementStyles(params.placement || 'center', scale);
  const gold = kit.theme.primary || '#C59B52';

  const html = `
    <div id="${containerId}" class="profile-motion-template cinematic-outro-seal dm-3d-scene">
      <div class="dm-3d-card">
        <div class="dm-outro-box">
          <div class="dm-outro-seal-emblem">
            <span class="dm-outro-om">ॐ</span>
          </div>
          <div class="dm-outro-title">${escapeHtml(params.title || 'सत्य सनातन धर्म')}</div>
          <div class="dm-outro-shanti">ॐ शान्तिः शान्तिः शान्तिः</div>
        </div>
      </div>
    </div>
  `;

  const css = `
    #${containerId} { position: absolute; ${posCss} display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 40; perspective: 1200px; background: transparent !important; }
    #${containerId} .dm-3d-card { position: relative; background: transparent !important; }
    #${containerId} .dm-outro-box { background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0; display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 480px; }
    #${containerId} .dm-outro-seal-emblem { width: 56px; height: 56px; border-radius: 999px; background: radial-gradient(circle, #FFE7A0 0%, ${gold} 70%, #6E4515 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 28px ${gold}; margin-bottom: 8px; border: 2px solid #FFFFFF; }
    #${containerId} .dm-outro-om { font-size: 30px; font-weight: 900; color: #1C150C; }
    #${containerId} .dm-outro-title { font-size: 30px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 18px ${gold}; }
    #${containerId} .dm-outro-shanti { font-size: 16px; font-weight: 800; color: #FFE7A0; font-family: ${kit.theme.fontFamily}; margin-top: 8px; letter-spacing: 0.08em; text-shadow: 0 0 12px ${gold}; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out" });
    const emblem = el.querySelector(".dm-outro-seal-emblem");
    if (emblem) {
      tl.fromTo(emblem, { scale: 0.5 }, { scale: 1, duration: 0.45, ease: "back.out(2.5)" }, 0.1);
    }
  `;

  return { html, css, js };
}

// ============================================================================
// MASTER COMPILER & TEMPLATE DECIDER
// ============================================================================

/**
 * Compiles a fixed template into a production DynamicMotionGraphicData object.
 */
export function compileMotionTemplate(
  params: ProfileTemplateParams,
  channelIdentity?: string | null,
  opts: { width?: number; height?: number; fps?: number; startSec?: number; timelineStartSec?: number } = {}
): DynamicMotionGraphicData {
  const kit = styleKitFor(channelIdentity);
  const containerId = `dm-t-${params.sceneIndex}-${Date.now().toString(36).slice(-4)}`;
  const templateId = params.templateId || (params as any).type || 'thunder_lightning';

  let rendered: { html: string; css: string; js: string };

  switch (templateId) {
    // --- Ancient Dharma Documentary Templates ---
    case 'vedic_title_reveal':
    case 'title_reveal':
    case 'cinematic_title':
      rendered = renderVedicTitleReveal(params, kit, containerId);
      break;

    case 'ancient_scroll_unfurl':
    case 'scroll_unfurl':
    case 'manuscript':
      rendered = renderAncientScrollUnfurl(params, kit, containerId);
      break;

    case 'divine_character_intro':
    case 'character_intro':
    case 'deity_reveal':
      rendered = renderDivineCharacterIntro(params, kit, containerId);
      break;

    case 'ancient_india_map':
    case 'map_route':
    case 'sacred_map':
      rendered = renderAncientIndiaMap(params, kit, containerId);
      break;

    case 'temple_architecture':
    case 'temple_blueprint':
    case 'architecture':
      rendered = renderTempleArchitecture(params, kit, containerId);
      break;

    case 'historical_timeline':
    case 'yuga_timeline':
    case 'timeline':
      rendered = renderHistoricalTimeline(params, kit, containerId);
      break;

    case 'sanskrit_shloka_reveal':
    case 'shloka_reveal':
    case 'shloka':
    case 'verse':
      rendered = renderSanskritShlokaReveal(params, kit, containerId);
      break;

    case 'sacred_geometry_yantra':
    case 'sri_yantra':
    case 'mandala_geometry':
      rendered = renderSacredGeometryYantra(params, kit, containerId);
      break;

    case 'dynasty_family_tree':
    case 'family_tree':
    case 'lineage':
      rendered = renderDynastyFamilyTree(params, kit, containerId);
      break;

    case 'divine_weapon_showcase':
    case 'weapon_showcase':
    case 'celestial_astra':
      rendered = renderDivineWeaponShowcase(params, kit, containerId);
      break;

    case 'documentary_lower_third':
    case 'lower_third':
    case 'nameplate':
      rendered = renderDocumentaryLowerThird(params, kit, containerId);
      break;

    case 'stone_inscription_reveal':
    case 'stone_inscription':
    case 'inscription':
      rendered = renderStoneInscriptionReveal(params, kit, containerId);
      break;

    case 'cosmic_universe_explainer':
    case 'cosmology':
    case 'brahmanda':
      rendered = renderCosmicUniverseExplainer(params, kit, containerId);
      break;

    case 'cinematic_outro_seal':
    case 'outro_seal':
    case 'shanti_outro':
      rendered = renderCinematicOutroSeal(params, kit, containerId);
      break;

    // --- Creator Attention Extractor Tools ---
    // 1. Thunder & Lightning Strike (Scene 0 Hook Attention Extractor)
    case 'thunder_lightning':
    case 'lightning':
    case 'dharma_hook_seal':
    case 'cyber_hook_breakout':
    case 'survival_impact_stamp':
    case 'editorial_hero_reveal':
      rendered = renderThunderLightning(params, kit, containerId);
      break;

    // 2. Marker Highlighter Pen
    case 'highlighter':
    case 'marker_highlight':
    case 'archival_intel_card':
    case 'sacred_mandala_card':
      rendered = renderHighlighter(params, kit, containerId);
      break;

    // 3. Curved Pointer Arrow Callout
    case 'arrow_callout':
    case 'arrow':
    case 'flow_vector':
    case 'end_prompt':
      rendered = renderArrowCallout(params, kit, containerId);
      break;

    // 4. Target / Focus Circle Callout
    case 'circle_callout':
    case 'highlight_reticle':
    case 'divine_astra_focus':
    case 'quantum_telemetry_dial':
    case 'tactical_waypoint_radar':
      rendered = renderCircleCallout(params, kit, containerId);
      break;

    // 5. Tactical HUD Reticle / Sniper Lock-On
    case 'sniper_lock':
    case 'hud_lock':
    case 'reticle':
    case 'tactical_lock':
      rendered = renderSniperLock(params, kit, containerId);
      break;

    // 6. Magnifying Glass Loupe Zoom
    case 'magnifying_glass':
    case 'loupe':
    case 'lens_zoom':
    case 'inspect_lens':
      rendered = renderMagnifyingGlass(params, kit, containerId);
      break;

    // 7. Classified / Rubber Stamp Slam
    case 'redacted_stamp':
    case 'stamp':
    case 'classified_stamp':
    case 'seal_stamp':
      rendered = renderRedactedStamp(params, kit, containerId);
      break;

    // 8. Live Metric Ticker & Surge Bar
    case 'metric_ticker':
    case 'ticker':
    case 'counter_bar':
    case 'stat_counter':
      rendered = renderMetricTicker(params, kit, containerId);
      break;

    // 9. Kinetic Brush Underline
    case 'kinetic_underline':
    case 'underline':
    case 'keyword_underline':
    case 'laser_dimension_caliper':
    case 'vedic_chronicle_pillar':
      rendered = renderKineticUnderline(params, kit, containerId);
      break;

    // 10. Shockwave Impact Pulse
    case 'shockwave_pulse':
    case 'hazard_gauge_meter':
    case 'vital_stat_odometer':
    case 'split_metric_odometer':
    case 'cyber_matrix_dossier':
    default:
      rendered = renderShockwavePulse(params, kit, containerId);
      break;
  }

  const prefix = `dm-s${params.sceneIndex}`;
  const uniquified = uniquifySvgIds(rendered.html, rendered.css, rendered.js, prefix);

  const startSec = typeof opts.startSec === 'number'
    ? opts.startSec
    : (typeof params.startSec === 'number' ? params.startSec : 0.05);
  const durationSec = typeof params.durationSec === 'number' ? params.durationSec : 4.5;
  const exitSec = startSec + durationSec - 0.45;

  const tmCode = uniquified.js.replace(/\btl\b/g, 'tmTl');

  const wrappedJs = `
    // Fixed Profile Motion Template: ${templateId} on ${containerId}
    {
      const el = document.getElementById("${containerId}");
      if (el) {
        gsap.set(el, { autoAlpha: 0, pointerEvents: "none" });
        tl.set(el, { autoAlpha: 1 }, ${startSec.toFixed(3)});
        const tmTl = gsap.timeline();
        ${tmCode}
        tl.add(tmTl, ${startSec.toFixed(3)});
        tl.to(el, { autoAlpha: 0, scale: 0.92, filter: "blur(4px)", duration: 0.45, ease: "power2.in" }, ${exitSec.toFixed(3)});
        tl.set(el, { autoAlpha: 0 }, ${(startSec + durationSec).toFixed(3)});
      }
    }
  `;

  return {
    id: `dmg-${containerId}`,
    sceneIndex: params.sceneIndex,
    type: templateId,
    title: params.title,
    detail: params.detail,
    cuePhrase: params.cuePhrase || params.title,
    startSec,
    durationSec,
    placement: { position: mapToDynamicPosition(params.placement), align: 'center' },
    visualConcept: `${templateId} template`,
    theme: {
      palette: [kit.theme.primary, kit.theme.accent, kit.popup.glow, kit.theme.text],
      fontFamily: kit.theme.fontFamily,
      glowColor: kit.popup.glow,
      stylePreset: kit.key,
    },
    sfx: {
      kind: kit.defaultSfx,
      startSec,
      volume: 0.8,
    },
    render: {
      html: uniquified.html,
      css: uniquified.css,
      js: wrappedJs,
    },
  };
}

/**
 * Flexible & Fixed Profile Motion Graphics Decider.
 *
 * LAW 1: Scene 0 (Hook) ALWAYS receives the profile's #1 Hook Attention Extractor template.
 * LAW 2: Subsequent scenes cycle through the profile's remaining fixed templates.
 * LAW 3: Content and sizing are flexible (custom titles, subtitles, badges, and scaling).
 */
export function decideTemplateMotionGraphics(
  scenes: SceneMotionInput[],
  channelIdentity?: string | null
): DynamicMotionGraphicData[] {
  const kit = styleKitFor(channelIdentity);
  const profileKey = kit.key;
  const templates = getProfileFixedTemplates(profileKey);
  const hookTemplate = getProfileHookTemplate(profileKey);

  const graphics: DynamicMotionGraphicData[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sIdx = scene.sceneIndex ?? i;
    const narration = scene.narration || '';
    const combined = `${narration} ${scene.visualPrompt || ''}`.toLowerCase();

    const isHindi = scenes.some((s) => /[\u0900-\u097F]/.test(s.narration));

    // Scene 0: ALWAYS use the Profile Hook Attention Extractor!
    if (i === 0) {
      let hookTitle = isHindi ? 'दिव्य रहस्य' : 'DIVINE MYSTERY';
      let hookDetail = isHindi ? 'सीता स्वयंवर प्रतिज्ञा — आदि रामायण' : 'The Sacred Ancient Chronicle';
      if (profileKey === 'against_the_odds') {
        hookTitle = 'SURVIVAL HOOK';
        hookDetail = 'AGAINST ALL ODDS // ZERO MARGIN';
      } else if (profileKey === 'documentary_standard') {
        hookTitle = 'THE UNTOLD STORY';
        hookDetail = 'DECLASSIFIED ARCHIVES';
      }

      if (combined.includes('पिनाक') || combined.includes('धनुष')) {
        hookTitle = isHindi ? 'पिनाक धनुष चुनौती' : 'PINAKA BOW CHALLENGE';
      } else if (combined.includes('सुदर्शन')) {
        hookTitle = isHindi ? 'सुदर्शन चक्र तेज' : 'SUDARSHANA CHAKRA';
      } else if (combined.includes('युद्ध') || combined.includes('रण')) {
        hookTitle = isHindi ? 'महासंग्राम निर्णय' : 'THE TURNING POINT';
      }

      graphics.push(
        compileMotionTemplate(
          {
            templateId: hookTemplate.id,
            sceneIndex: sIdx,
            title: hookTitle,
            detail: hookDetail,
            badge: 'HOOK // RETENTION',
            size: 'hero',
            placement: 'center',
            cuePhrase: narration.includes('पिनाक') ? 'पिनाक' : narration.slice(0, 20),
            startSec: 1.0,
            durationSec: 4.8,
          },
          profileKey
        )
      );
      continue;
    }

    // Subsequent Scenes (Scene 1, 2, 3...): Select from remaining profile templates
    const remainingTemplates = templates.filter((t) => !t.isHookTemplate);
    const selectedTemplate = remainingTemplates[(i - 1) % Math.max(1, remainingTemplates.length)] || templates[0];

    let title = isHindi ? 'सत्यमेव जयते' : 'CORE EVIDENCE';
    let detail = isHindi ? 'मर्यादा और धर्म' : 'VERIFIED DOCUMENTATION';
    let badge = isHindi ? 'दिव्य ज्ञान' : 'KEY INTEL';

    if (profileKey === 'against_the_odds') {
      title = 'TACTICAL FACTOR';
      detail = 'SURVIVAL PROTOCOL';
      badge = 'ALERT';
    } else if (profileKey === 'documentary_standard') {
      title = 'ARCHIVAL RECORD';
      detail = 'HISTORICAL SOURCE';
      badge = 'DOCUMENTARY';
    }

    const hasWord = (pattern: RegExp) => pattern.test(narration);
    let chosenTemplateId = selectedTemplate.id;

    if (hasWord(/(?:टूट|भंग|गर्जना|तोड़|ध्वनि|१०८)/)) {
      title = isHindi ? 'अमोघ धनुष भंग' : 'THE SACRED BREAKING';
      detail = isHindi ? '१०८ दिशाओं में प्रचंड गर्जना' : 'Echoing in 108 Directions';
      badge = isHindi ? 'अलौकिक ध्वनि' : 'CLIMAX';
      chosenTemplateId = 'thunder_lightning';
    } else if (hasWord(/(?:सीता|वरमाला|विवाह|जयते|धर्म)/)) {
      title = isHindi ? 'सत्य और धर्म विजय' : 'VICTORY OF DHARMA';
      detail = isHindi ? 'माता सीता वरमाला — अमर प्रतिज्ञा' : 'Sacred Union of Dharma';
      badge = isHindi ? 'धर्म विजय' : 'PAYOFF';
      chosenTemplateId = 'kinetic_underline';
    } else if (hasWord(/(?:उठा|बाएं|हाथ|भार|स्तब्ध|विस्मय)/)) {
      title = isHindi ? 'अलौकिक पराक्रम' : 'UNMATCHED STRENGTH';
      detail = isHindi ? 'एकाएक शिव धनुष उत्थापन' : 'Lifting Pinaka With One Hand';
      badge = isHindi ? 'अतुल्य शक्ति' : 'FEAT';
      chosenTemplateId = 'highlighter';
    } else if (hasWord(/(?:विश्वामित्र|आगे|मुस्कान|संकेत|पुरुषोत्तम)/) || /\b(?:rama|shri ram)\b/i.test(narration)) {
      title = isHindi ? 'श्री राम आगमन' : 'LORD RAMA';
      detail = isHindi ? 'मर्यादा पुरुषोत्तम — इक्ष्वाकु वंश' : 'Embodiment of Dharma';
      badge = isHindi ? 'चरित्र परिचय' : 'HERO';
      chosenTemplateId = 'circle_callout';
    } else if (hasWord(/(?:श्लोक|मन्त्र|गीता|वेद|उपनिषद|shloka|verse|mantra|gita)/i)) {
      title = isHindi ? 'यदा यदा हि धर्मस्य ग्लानिर्भवति भारत' : 'SACRED SANSKRIT SHLOKA';
      detail = isHindi ? 'अभ्युत्थानमधर्मस्य तदात्मानं सृजाम्यहम्' : 'Divine Scripture Inscription';
      badge = isHindi ? 'श्रीमद्भगवद्गीता' : 'SCRIPTURE';
      chosenTemplateId = 'sanskrit_shloka_reveal';
    } else if (hasWord(/(?:पाण्डुलिपि|भोजपत्र|पुराण|ताड़पत्र|scroll|manuscript|parchment)/i)) {
      title = isHindi ? 'प्राचीन ताड़पत्र साक्ष्य' : 'ANCIENT BHURJAPATRA';
      detail = isHindi ? 'ऋषि वाल्मीकि मूल हस्तलिखित लिपि' : 'Sacred Manuscript Unfurl';
      badge = isHindi ? 'वेद प्रमाण' : 'MANUSCRIPT';
      chosenTemplateId = 'ancient_scroll_unfurl';
    } else if (hasWord(/(?:तीर्थ|यात्रा|मार्ग|भूगोल|अयोध्या|लंका|जनकपुर|map|route|journey|geography)/i)) {
      title = isHindi ? 'पवित्र तीर्थ यात्रा पथ' : 'SACRED BHARAT MAP';
      detail = isHindi ? 'अयोध्या से मिथिला एवं लंका तक दिव्य पथ' : 'Ancient Pilgrimage Geography';
      badge = isHindi ? 'भौगोलिक पथ' : 'SACRED MAP';
      chosenTemplateId = 'ancient_india_map';
    } else if (hasWord(/(?:मन्दिर|शिल्प|वास्तु|शिखर|गर्भगृह|temple|architecture|blueprint|sanctum)/i)) {
      title = isHindi ? 'नागर वास्तु शिल्प विज्ञान' : 'TEMPLE ARCHITECTURE';
      detail = isHindi ? 'विमान शिखर एवं गर्भगृह ज्यामिति' : 'Sacred Vastu Architectural Blueprint';
      badge = isHindi ? 'शिल्प शास्त्र' : 'ARCHITECTURE';
      chosenTemplateId = 'temple_architecture';
    } else if (hasWord(/(?:कालक्रम|युग|सत्ययुग|त्रेता|द्वापर|कलियुग|timeline|epoch|yuga)/i)) {
      title = isHindi ? 'सनातन युग कालक्रम' : 'COSMIC EPOCH TIMELINE';
      detail = isHindi ? 'त्रेता युग · श्री राम अवतरण काल' : 'Cosmic Chronology & Dynasties';
      badge = isHindi ? 'काल गणना' : 'TIMELINE';
      chosenTemplateId = 'historical_timeline';
    } else if (hasWord(/(?:यन्त्र|मण्डल|ज्यामिति|yantra|mandala|sacred geometry)/i)) {
      title = isHindi ? 'श्री यन्त्र दिव्य ज्यामिति' : 'SRI YANTRA GEOMETRY';
      detail = isHindi ? '९ अन्तर्ग्रथित त्रिकोण एवं १६ दल कमल' : 'Sacred Geometric Resonance';
      badge = isHindi ? 'महा मन्त्र' : 'YANTRA';
      chosenTemplateId = 'sacred_geometry_yantra';
    } else if (hasWord(/(?:अस्त्र|पिनाक|सुदर्शन|त्रिशूल|धनुष|brahmastra|astra|weapon)/i)) {
      title = isHindi ? 'अलौकिक दिव्यास्त्र' : 'DIVINE CELESTIAL ASTRA';
      detail = isHindi ? 'भगवान शिव का अमोघ पिनाक धनुष' : 'Inviolable Divine Energy';
      badge = isHindi ? 'संहारक तेज' : 'DIVINE ASTRA';
      chosenTemplateId = 'divine_weapon_showcase';
    } else if (hasWord(/(?:शिलालेख|अभिलेख|stone|inscription|edict)/i)) {
      title = isHindi ? 'अशोक शिलालेख प्रमाण' : 'ANCIENT INSCRIPTION';
      detail = isHindi ? 'ब्राह्मी लिपि से आधुनिक देवनागरी अनुवाद' : 'Deciphered Archaeological Tablet';
      badge = isHindi ? 'शिलालेख' : 'INSCRIPTION';
      chosenTemplateId = 'stone_inscription_reveal';
    } else if (hasWord(/(?:ब्रह्माण्ड|लोक|सृष्टि|cosmology|universe|lokas)/i)) {
      title = isHindi ? 'वैदिक ब्रह्माण्ड रचना' : 'VEDIC COSMOLOGY';
      detail = isHindi ? '१४ भुवन एवं मेरु पर्वत ब्रह्माण्डीय अक्ष' : 'Cosmic Spheres of Creation';
      badge = isHindi ? 'सृष्टि चक्र' : 'COSMOLOGY';
      chosenTemplateId = 'cosmic_universe_explainer';
    } else if (hasWord(/(?:धनुष|पिनाक|शिव)/)) {
      title = isHindi ? 'अलौकिक तेज' : 'CELESTIAL WEAPON';
      detail = isHindi ? 'दिव्य भार संहारक ऊर्जा' : 'Inviolable Divine Energy';
      badge = isHindi ? 'दिव्यास्त्र' : 'WEAPON';
      chosenTemplateId = 'arrow_callout';
    } else if (hasWord(/(?:\$|\%|\d{2,}|प्रतिशत|करोड़|लाख|हजार|rate|odds|percent|trillion|million)/i)) {
      title = isHindi ? 'कर्म फल गणना' : 'METRIC SURGE';
      detail = isHindi ? 'तीव्र वृद्धि और प्रभाव' : 'Live Data Verification';
      badge = isHindi ? 'संख्या प्रभाव' : 'SURGE';
      chosenTemplateId = 'metric_ticker';
    } else if (hasWord(/(?:सील|मुहर|सत्य|गुप्त|secret|classified|forbidden|truth|unsealed)/i)) {
      title = isHindi ? 'सत्यमेव जयते' : 'TOP SECRET';
      detail = isHindi ? 'अमिट सत्य की मुहर' : 'Verified Evidence Seal';
      badge = isHindi ? 'प्रमाण मुहर' : 'VERIFIED';
      chosenTemplateId = 'redacted_stamp';
    } else if (hasWord(/(?:दस्तावेज|ग्रंथ|पुस्तिका|साक्ष्य|archive|document|evidence|record|inspect)/i)) {
      title = isHindi ? 'प्राचीन साक्ष्य' : 'INSPECT RECORD';
      detail = isHindi ? 'विस्तारपूर्वक अनुसंधान' : 'Deep Archival Investigation';
      badge = isHindi ? 'सूक्ष्म दृष्टि' : 'INSPECTION';
      chosenTemplateId = 'magnifying_glass';
    } else if (hasWord(/(?:निशाना|लक्ष्य|वेध|शत्रु|target|lock|threat|hostile)/i)) {
      title = isHindi ? 'लक्ष्य निर्धारण' : 'TARGET LOCKED';
      detail = isHindi ? 'अचूक संधान स्थिति' : 'Telemetry Acquired';
      badge = isHindi ? 'अचूक लक्ष्य' : 'LOCK-ON';
      chosenTemplateId = 'sniper_lock';
    }

    graphics.push(
      compileMotionTemplate(
        {
          templateId: chosenTemplateId,
          sceneIndex: sIdx,
          title,
          detail,
          badge,
          size: 'standard',
          placement: i % 2 === 1 ? 'top' : 'center',
          cuePhrase: narration.slice(0, 24),
          startSec: 1.0,
          durationSec: 4.5,
        },
        profileKey
      )
    );
  }

  return graphics;
}

// Backwards compatibility aliases
export async function decideDynamicMotionGraphics(
  req: DynamicMotionDecisionRequest
): Promise<DynamicMotionGraphicData[]> {
  return decideTemplateMotionGraphics(req.scenes, req.channelName || req.channelProfile);
}

export function decideHeuristicMotionGraphics(
  scenes: SceneMotionInput[],
  channelName?: string
): DynamicMotionGraphicData[] {
  return decideTemplateMotionGraphics(scenes, channelName);
}

export function compileDynamicMotionGraphic(
  plan: any,
  opts: { width?: number; height?: number; fps?: number; startSec?: number; timelineStartSec?: number } = {}
): DynamicMotionGraphicData {
  const profileKey = plan?.profileKey || plan?.channelIdentity || plan?.channelProfile || plan?.theme?.stylePreset;
  return compileMotionTemplate(plan, profileKey, opts);
}
