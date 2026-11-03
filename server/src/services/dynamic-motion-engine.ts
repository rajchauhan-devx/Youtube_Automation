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
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-lightning-svg { filter: drop-shadow(0 0 28px ${boltColor}); overflow: visible; }
    #${containerId} .dm-lightning-label { margin-top: -18px; display: flex; flex-direction: column; align-items: center; text-align: center; background: rgba(10, 12, 18, 0.88); backdrop-filter: blur(20px) saturate(180%); border: 1.5px solid ${boltColor}aa; border-top: 1.5px solid rgba(255, 255, 255, 0.45); border-radius: 18px; padding: 12px 26px; box-shadow: 0 18px 45px rgba(0,0,0,0.92), 0 0 35px ${boltColor}44, inset 0 1px 1px rgba(255,255,255,0.3); max-width: 520px; }
    #${containerId} .dm-impact-badge { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #FFFFFF; background: ${boltColor}33; border: 1.2px solid ${boltColor}; padding: 3px 12px; border-radius: 999px; margin-bottom: 6px; box-shadow: 0 0 14px ${boltColor}66; }
    #${containerId} .dm-pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: #FFFFFF; box-shadow: 0 0 8px #FFFFFF; display: inline-block; }
    #${containerId} .dm-impact-title { font-size: 32px; font-weight: 900; color: #FFFFFF; letter-spacing: 0.03em; line-height: 1.2; text-shadow: 0 0 20px ${boltColor}, 0 3px 12px rgba(0,0,0,0.95); font-family: ${kit.theme.fontFamily}; }
    #${containerId} .dm-impact-detail { font-size: 14px; font-weight: 600; color: ${accentColor}; margin-top: 5px; text-shadow: 0 0 8px rgba(0,0,0,0.8); font-family: ${kit.theme.fontFamily}; letter-spacing: 0.04em; }
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
    // High-energy strobe flicker bursts
    tl.to(el.querySelectorAll(".dm-lightning-svg"), { opacity: 0.2, duration: 0.03, yoyo: true, repeat: 5 }, 0.08);
    // Label pop with elastic punch
    const lbl = el.querySelector(".dm-lightning-label");
    if (lbl) {
      tl.fromTo(lbl, { scale: 0.6, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: "back.out(2.2)" }, 0.14);
    }
    // Living idle electric crackle jitter
    tl.to(mainBolt, { opacity: "random(0.75, 1)", duration: 0.08, repeat: -1, ease: "none" }, 0.4);
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
              <!-- Authentic Chisel Nib Cursor following the stroke -->
              <div class="dm-hl-nib">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="${markerColor}">
                  <path d="M 3,18 L 8,23 L 21,10 L 14,3 Z" filter="drop-shadow(0 0 6px ${markerColor})"/>
                  <polygon points="3,18 1,23 6,21" fill="#FFFFFF"/>
                </svg>
              </div>
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
    #${containerId} .dm-hl-nib { position: absolute; right: -12px; top: -14px; pointer-events: none; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.8)); }
    #${containerId} .dm-hl-text { position: relative; z-index: 2; font-size: 34px; font-weight: 900; color: #FFFFFF; letter-spacing: 0.02em; line-height: 1.25; text-shadow: 0 2px 14px rgba(0,0,0,0.98), 0 0 12px ${markerColor}44; font-family: ${kit.theme.fontFamily}; }
    #${containerId} .dm-hl-detail { font-size: 15px; font-weight: 600; color: #FFFFFF; background: rgba(12, 14, 20, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.2); padding: 3px 14px; border-radius: 8px; margin-top: 8px; text-shadow: 0 2px 6px rgba(0,0,0,0.9); font-family: ${kit.theme.fontFamily}; letter-spacing: 0.03em; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
    const fill = el.querySelector(".dm-hl-fill");
    const nib = el.querySelector(".dm-hl-nib");
    if (fill) {
      tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: "power2.out" }, 0.1);
    }
    if (nib) {
      tl.fromTo(nib, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.15 }, 0.05);
      tl.to(nib, { opacity: 0, scale: 0.7, y: -8, duration: 0.25, ease: "power2.in" }, 0.65);
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
    #${containerId} .dm-arrow-detail { font-size: 13px; font-weight: 600; color: #FFFFFF; background: rgba(10,12,16,0.85); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.18); padding: 3px 12px; border-radius: 8px; margin-top: -12px; box-shadow: 0 4px 14px rgba(0,0,0,0.8); }
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
    // Target ping pulse loop
    const ping = el.querySelector(".dm-ping-ring");
    if (ping) {
      tl.fromTo(ping, { scale: 0.4, opacity: 1, transformOrigin: "165px 120px" }, { scale: 2.6, opacity: 0, duration: 0.8, repeat: -1, ease: "power2.out" }, 0.45);
    }
    // Creator-style floating spring bob toward target
    tl.to(el.querySelector(".dm-3d-card"), { y: "+=7", duration: 0.75, ease: "sine.inOut", yoyo: true, repeat: -1 }, 0.5);
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
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-circle-svg { filter: drop-shadow(0 0 20px ${circleColor}88); overflow: visible; }
    #${containerId} .dm-circle-label { margin-top: 10px; background: rgba(12, 14, 20, 0.88); backdrop-filter: blur(16px); border: 1.5px solid ${circleColor}; border-top: 1.5px solid rgba(255,255,255,0.4); border-radius: 14px; padding: 8px 20px; text-align: center; box-shadow: 0 12px 32px rgba(0,0,0,0.92), 0 0 24px ${circleColor}44, inset 0 1px 1px rgba(255,255,255,0.3); max-width: 460px; }
    #${containerId} .dm-circ-badge { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 10px; font-weight: 800; color: ${circleColor}; text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 2px; }
    #${containerId} .dm-pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: ${circleColor}; box-shadow: 0 0 8px ${circleColor}; display: inline-block; }
    #${containerId} .dm-circ-title { font-size: 22px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 0 12px ${circleColor}, 0 2px 8px rgba(0,0,0,0.9); }
    #${containerId} .dm-circ-detail { font-size: 13px; font-weight: 600; color: #E4E4E7; margin-top: 4px; }
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
    // Living focus breathing pulse
    tl.to(el.querySelector(".dm-circle-svg"), { scale: 1.04, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut" }, 0.7);
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
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-hud-svg { filter: drop-shadow(0 0 22px ${lockColor}); overflow: visible; }
    #${containerId} .dm-hud-label { margin-top: 6px; background: rgba(8, 10, 16, 0.9); backdrop-filter: blur(16px); border: 1.5px solid ${lockColor}; border-top: 1.5px solid rgba(255,255,255,0.45); border-radius: 12px; padding: 8px 20px; text-align: center; box-shadow: 0 12px 36px rgba(0,0,0,0.95), 0 0 25px ${lockColor}44, inset 0 1px 1px rgba(255,255,255,0.3); max-width: 480px; }
    #${containerId} .dm-hud-badge { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; font-weight: 800; color: ${lockColor}; text-transform: uppercase; letter-spacing: 0.16em; margin-bottom: 2px; }
    #${containerId} .dm-blink-dot { width: 6px; height: 6px; border-radius: 999px; background: ${lockColor}; box-shadow: 0 0 8px ${lockColor}; display: inline-block; animation: dmBlink 0.6s infinite alternate; }
    @keyframes dmBlink { from { opacity: 0.2; } to { opacity: 1; } }
    #${containerId} .dm-hud-title { font-size: 24px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 0 14px ${lockColor}; letter-spacing: 0.04em; }
    #${containerId} .dm-hud-detail { font-size: 13px; font-weight: 600; color: #E4E4E7; margin-top: 3px; font-family: ${kit.theme.fontFamily}; }
  `;

  const js = `
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.1 });
    // Tactical brackets snap inward violently
    const brackets = el.querySelectorAll(".dm-bracket-tl, .dm-bracket-tr, .dm-bracket-bl, .dm-bracket-br");
    tl.fromTo(brackets, { scale: 1.7, opacity: 0, transformOrigin: "130px 130px" }, { scale: 1, opacity: 1, duration: 0.35, ease: "expo.out" }, 0.05);
    // Rotating compass dial
    const dial = el.querySelector(".dm-hud-dial");
    if (dial) {
      tl.to(dial, { rotation: 360, transformOrigin: "130px 130px", duration: 10, repeat: -1, ease: "none" }, 0);
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
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-glass-svg { filter: drop-shadow(0 0 24px ${rimColor}77); overflow: visible; }
    #${containerId} .dm-glass-label { margin-top: -12px; background: rgba(10, 12, 18, 0.88); backdrop-filter: blur(18px); border: 1.5px solid ${rimColor}; border-top: 1.5px solid rgba(255,255,255,0.45); border-radius: 14px; padding: 8px 22px; text-align: center; box-shadow: 0 14px 38px rgba(0,0,0,0.92), 0 0 25px ${rimColor}44, inset 0 1px 1px rgba(255,255,255,0.3); max-width: 480px; }
    #${containerId} .dm-glass-badge { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; font-weight: 800; color: ${rimColor}; text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 2px; }
    #${containerId} .dm-pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: ${rimColor}; box-shadow: 0 0 8px ${rimColor}; display: inline-block; }
    #${containerId} .dm-glass-title { font-size: 24px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 0 12px ${rimColor}, 0 2px 8px rgba(0,0,0,0.9); }
    #${containerId} .dm-glass-detail { font-size: 13px; font-weight: 600; color: #E4E4E7; margin-top: 3px; font-family: ${kit.theme.fontFamily}; }
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
    // Living inspection hover pan
    tl.to(svg, { x: "+=8", y: "+=5", duration: 1.1, yoyo: true, repeat: -1, ease: "sine.inOut" }, 0.6);
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
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-stamp-dust-ring { position: absolute; top: 50%; left: 50%; width: 340px; height: 180px; margin-left: -170px; margin-top: -90px; border: 3px solid ${stampColor}; border-radius: 999px; opacity: 0; filter: blur(4px); pointer-events: none; }
    #${containerId} .dm-stamp-box { transform: rotate(-11deg); background: rgba(14, 10, 10, 0.92); backdrop-filter: blur(14px); border: 4px solid ${stampColor}; border-radius: 8px; padding: 6px; box-shadow: 0 16px 45px rgba(0,0,0,0.95), 0 0 35px ${stampColor}55; max-width: 480px; }
    #${containerId} .dm-stamp-inner-border { border: 2px dashed ${stampColor}; border-radius: 4px; padding: 12px 28px; text-align: center; }
    #${containerId} .dm-stamp-badge { font-size: 13px; font-weight: 900; letter-spacing: 0.22em; text-transform: uppercase; color: ${stampColor}; text-shadow: 0 0 12px ${stampColor}; margin-bottom: 4px; }
    #${containerId} .dm-stamp-title { font-size: 30px; font-weight: 900; color: #FFFFFF; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.2; text-shadow: 0 0 16px ${stampColor}, 0 2px 8px rgba(0,0,0,0.9); font-family: ${kit.theme.fontFamily}; }
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
    // Screen shake impact impulse
    tl.to(el.querySelector(".dm-3d-card"), { x: "random(-5, 5)", y: "random(-5, 5)", duration: 0.04, repeat: 3, yoyo: true }, 0.26);
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
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-ticker-wrapper { display: flex; flex-direction: column; align-items: center; text-align: center; background: rgba(10, 14, 20, 0.88); backdrop-filter: blur(18px); border: 1.5px solid ${tickerColor}; border-top: 1.5px solid rgba(255,255,255,0.45); border-radius: 16px; padding: 10px 26px; box-shadow: 0 16px 42px rgba(0,0,0,0.92), 0 0 30px ${tickerColor}44, inset 0 1px 1px rgba(255,255,255,0.3); min-width: 320px; }
    #${containerId} .dm-ticker-badge { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #FFFFFF; background: ${tickerColor}33; border: 1.2px solid ${tickerColor}; padding: 3px 12px; border-radius: 999px; margin-bottom: 6px; box-shadow: 0 0 12px ${tickerColor}66; }
    #${containerId} .dm-pulse-dot { width: 6px; height: 6px; border-radius: 999px; background: ${tickerColor}; box-shadow: 0 0 8px ${tickerColor}; display: inline-block; }
    #${containerId} .dm-ticker-number-box { display: flex; align-items: center; gap: 10px; margin: 2px 0; }
    #${containerId} .dm-ticker-delta { font-size: 11px; font-weight: 900; color: #000000; background: ${tickerColor}; padding: 2px 8px; border-radius: 6px; letter-spacing: 0.08em; box-shadow: 0 0 10px ${tickerColor}88; }
    #${containerId} .dm-ticker-value { font-size: 34px; font-weight: 900; color: #FFFFFF; letter-spacing: 0.04em; text-shadow: 0 0 16px ${tickerColor}, 0 2px 8px rgba(0,0,0,0.9); font-family: ${kit.theme.fontFamily}; }
    #${containerId} .dm-ticker-bar-track { width: 100%; height: 6px; background: rgba(255,255,255,0.12); border-radius: 999px; overflow: visible; margin-top: 6px; position: relative; }
    #${containerId} .dm-ticker-bar-fill { height: 100%; background: linear-gradient(90deg, ${tickerColor}88, ${tickerColor}); border-radius: 999px; transform-origin: left center; position: relative; box-shadow: 0 0 12px ${tickerColor}; }
    #${containerId} .dm-ticker-bar-spark { position: absolute; right: -4px; top: -3px; width: 12px; height: 12px; border-radius: 999px; background: #FFFFFF; box-shadow: 0 0 10px #FFFFFF, 0 0 16px ${tickerColor}; }
    #${containerId} .dm-ticker-detail { font-size: 13px; font-weight: 600; color: #E4E4E7; margin-top: 6px; font-family: ${kit.theme.fontFamily}; }
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
    #${containerId} .dm-3d-card { position: relative; }
    #${containerId} .dm-underline-wrapper { display: flex; flex-direction: column; align-items: center; text-align: center; }
    #${containerId} .dm-ul-badge { font-size: 11px; font-weight: 800; color: ${lineColor}; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 4px; text-shadow: 0 0 10px ${lineColor}88; }
    #${containerId} .dm-ul-title { font-size: 34px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; letter-spacing: 0.03em; text-shadow: 0 2px 12px rgba(0,0,0,0.95), 0 0 18px ${lineColor}66; }
    #${containerId} .dm-underline-svg { filter: drop-shadow(0 0 12px ${lineColor}88); margin-top: 2px; overflow: visible; }
    #${containerId} .dm-ul-detail { font-size: 14px; font-weight: 600; color: #FFFFFF; background: rgba(12, 14, 20, 0.82); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.18); padding: 3px 14px; border-radius: 8px; margin-top: 6px; text-shadow: 0 1px 4px rgba(0,0,0,0.9); }
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
      tl.fromTo(spark, { opacity: 1, scale: 1 }, { opacity: 0, scale: 1.8, duration: 0.45, ease: "power2.out" }, 0.45);
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
    #${containerId} .dm-3d-card { position: relative; display: flex; flex-direction: column; align-items: center; }
    #${containerId} .dm-shock-svg { filter: drop-shadow(0 0 20px ${pulseColor}); overflow: visible; }
    #${containerId} .dm-shock-label { margin-top: -12px; background: rgba(12, 14, 20, 0.88); backdrop-filter: blur(16px); border: 1.5px solid ${pulseColor}; border-top: 1.5px solid rgba(255,255,255,0.45); border-radius: 999px; padding: 6px 22px; text-align: center; box-shadow: 0 12px 34px rgba(0,0,0,0.92), 0 0 22px ${pulseColor}44, inset 0 1px 1px rgba(255,255,255,0.3); }
    #${containerId} .dm-shock-title { font-size: 24px; font-weight: 900; color: #FFFFFF; font-family: ${kit.theme.fontFamily}; text-shadow: 0 0 12px ${pulseColor}; }
    #${containerId} .dm-shock-detail { font-size: 13px; font-weight: 600; color: #E4E4E7; }
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
      if (profileKey === 'rule_zero') {
        hookTitle = 'CRITICAL SYSTEM';
        hookDetail = 'ANOMALY DETECTED // PROTOCOL 0';
      } else if (profileKey === 'against_the_odds') {
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

    if (profileKey === 'rule_zero') {
      title = 'QUANTUM CORE';
      detail = 'PROCESSING TELEMETRY';
      badge = 'SYSTEM';
    } else if (profileKey === 'against_the_odds') {
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
