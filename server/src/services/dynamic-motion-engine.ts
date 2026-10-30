import {
  type DynamicMotionGraphicData,
  type DynamicMotionPlacementData,
  type DynamicMotionRenderData,
  type DynamicMotionThemeData,
} from '@tubeflow/editing-contracts';
import { chat, getGeminiApiKey } from './gemini.js';

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

/**
 * Extracts AI-decided motion graphics from <motion_graphicN> or <metadataN> tags in a script.
 */
export function extractMotionPlansFromScript(scriptText: string): DynamicMotionPlan[] {
  const plans: DynamicMotionPlan[] = [];
  const regex = /<(?:motion_graphic|metadata)(\d+)?\b[^>]*>([\s\S]*?)<\/(?:motion_graphic|metadata)(?:\d+)?\s*>/gi;
  let m;
  let idx = 1;
  while ((m = regex.exec(scriptText)) !== null) {
    const raw = m[2].trim();
    const typeMatch = raw.match(/Type:\s*([^\n]+)/i);
    const sceneMatch = raw.match(/(?:Scene|#scene|#image)[:\s]+\s*(\d+)/i);
    const whenMatch = raw.match(/(?:When|Cue|Timing):\s*([^\n]+)/i);
    const whereMatch = raw.match(/(?:Where|Position|Placement):\s*([^\n]+)/i);
    const titleMatch = raw.match(/Title:\s*([^\n]+)/i);
    const detailMatch = raw.match(/Detail:\s*([^\n]+)/i);
    const visualMatch = raw.match(/(?:Visual|Concept|Style):\s*([^\n]+)/i);

    const type = typeMatch ? typeMatch[1].trim() : 'dynamic_motion';
    const sceneNum = sceneMatch ? parseInt(sceneMatch[1], 10) : (m[1] ? parseInt(m[1], 10) : idx++);
    const title = titleMatch ? titleMatch[1].trim().replace(/^\[|\]$/g, '') : '';
    if (!title) continue;

    const detail = detailMatch ? detailMatch[1].trim().replace(/^\[|\]$/g, '') : undefined;
    const cuePhrase = whenMatch ? whenMatch[1].trim().replace(/^\[|\]$/g, '') : undefined;
    const visualConcept = visualMatch ? visualMatch[1].trim().replace(/^\[|\]$/g, '') : `Cinematic motion graphic for ${title}`;

    const whereRaw = whereMatch ? whereMatch[1].trim().toLowerCase() : 'center';
    const validPos = ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'custom'] as const;
    const pos = validPos.find(p => whereRaw.includes(p)) || 'center';

    let ornament: DynamicMotionPlan['ornament'] = 'sacred_border';
    const t = type.toLowerCase();
    if (t.includes('chakra') || t.includes('sudarshana')) ornament = 'chakra';
    else if (t.includes('shloka') || t.includes('mantra')) ornament = 'lotus';
    else if (t.includes('astra') || t.includes('weapon') || t.includes('bow') || t.includes('pinaka')) ornament = 'chakra';
    else if (t.includes('timeline') || t.includes('epoch') || t.includes('mandala')) ornament = 'mandala';
    else if (t.includes('vow') || t.includes('seal') || t.includes('om')) ornament = 'om';

    plans.push({
      sceneIndex: sceneNum,
      shouldInclude: true,
      type,
      title,
      detail,
      cuePhrase: cuePhrase || title,
      startSec: 0.8,
      durationSec: 4.5,
      placement: { position: pos, align: 'center' },
      visualConcept,
      ornament,
    });
  }
  return plans;
}

export interface DynamicMotionPlan {
  id?: string;
  sceneIndex: number;
  shouldInclude: boolean;
  type: string;
  title: string;
  detail?: string;
  cuePhrase: string;
  startSec: number;
  durationSec: number;
  placement: DynamicMotionPlacementData;
  visualConcept: string;
  theme?: DynamicMotionThemeData;
  ornament?: 'chakra' | 'mandala' | 'trishula' | 'lotus' | 'om' | 'sacred_border' | 'sun_burst' | 'none';
  customHtml?: string;
  customCss?: string;
  customJs?: string;
}

/**
 * Uniquifies SVG IDs (filters, gradients, masks, clipPaths) so multiple dynamic graphics
 * in the same video or page never suffer from ID collisions or cancelled filters.
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

  for (const id of ids) {
    const newId = `${prefix}-${id}`;
    newHtml = newHtml.replace(new RegExp(`id=(["'])${id}\\1`, 'g'), `id=$1${newId}$1`);
    newHtml = newHtml.replace(new RegExp(`url\\(#${id}\\)`, 'g'), `url(#${newId})`);
    newCss = newCss.replace(new RegExp(`url\\(#${id}\\)`, 'g'), `url(#${newId})`);
    newHtml = newHtml.replace(new RegExp(`href=(["'])#${id}\\1`, 'g'), `href=$1#${newId}$1`);
    newCss = newCss.replace(new RegExp(`#${id}\\b`, 'g'), `#${newId}`);
    newJs = newJs.replace(new RegExp(`#${id}\\b`, 'g'), `#${newId}`);
  }

  return { html: newHtml, css: newCss, js: newJs };
}

/**
 * 4-tier infallible JSON parser for LLM outputs.
 * Safely parses valid JSON, recovers from Markdown code blocks, escapes raw newlines in string literals,
 * removes trailing commas, and extracts isolated objects if outer brackets broke.
 */
export function robustJsonArrayParse<T>(raw: string): T[] {
  if (!raw || typeof raw !== 'string') return [];
  let cleaned = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```$/im, '').trim();

  // Find opening '[' and matching closing ']'
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }

  // Strategy 1: Standard JSON.parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}

  // Strategy 2: Remove trailing commas before } or ]
  try {
    const withoutTrailing = cleaned.replace(/,\s*([}\]])/g, '$1');
    const parsed = JSON.parse(withoutTrailing);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}

  // Strategy 3: Escape raw newlines inside string literals
  try {
    const sanitized = cleaned
      .replace(/:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (m) =>
        m.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
      )
      .replace(/,\s*([}\]])/g, '$1');
    const parsed = JSON.parse(sanitized);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}

  // Strategy 4: Extract individual JSON objects using regex if outer array broke
  const matches = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
  if (matches) {
    const list: T[] = [];
    for (const m of matches) {
      try {
        const item = JSON.parse(m.replace(/,\s*([}\]])/g, '$1'));
        if (item && typeof item === 'object') list.push(item);
      } catch (_) {}
    }
    if (list.length > 0) return list;
  }

  return [];
}

/**
 * Compiles a DynamicMotionPlan into a fully executable Hyperframes & Remotion bundle (HTML, CSS, GSAP).
 */
export function compileDynamicMotionGraphic(
  plan: DynamicMotionPlan,
  opts: { width?: number; height?: number; fps?: number; startSec?: number; timelineStartSec?: number } = {}
): DynamicMotionGraphicData {
  const width = opts.width || 1080;
  const height = opts.height || 1920;
  const customIdMatch = plan.customHtml?.match(/id="([^"]+)"/)?.[1];
  const id = plan.id || customIdMatch || `dm-${plan.sceneIndex}-${Date.now().toString(36)}`;
  const containerId = customIdMatch || `dm-elem-${id}`;

  // Uniquify SVG IDs (filters, gradients, clipPaths) to prevent collisions across multiple scenes
  const prefix = `dm-s${plan.sceneIndex}`;
  const uniquified = uniquifySvgIds(
    plan.customHtml || '',
    plan.customCss || '',
    plan.customJs || '',
    prefix
  );
  const planHtml = uniquified.html || plan.customHtml;
  let planCss = uniquified.css || plan.customCss;
  const planJs = uniquified.js || plan.customJs;

  const pos = plan.placement.position || 'center';
  const align = plan.placement.align || 'center';

  // Calculate coordinates & positioning CSS
  let positionStyles = '';
  switch (pos) {
    case 'top':
      positionStyles = 'top: 10%; left: 50%; transform: translateX(-50%); width: 88%;';
      break;
    case 'top-left':
      positionStyles = 'top: 10%; left: 6%; width: 50%;';
      break;
    case 'top-right':
      positionStyles = 'top: 10%; right: 6%; width: 50%;';
      break;
    case 'bottom':
      positionStyles = 'bottom: 12%; left: 50%; transform: translateX(-50%); width: 88%;';
      break;
    case 'bottom-left':
      positionStyles = 'bottom: 12%; left: 6%; width: 50%;';
      break;
    case 'bottom-right':
      positionStyles = 'bottom: 12%; right: 6%; width: 50%;';
      break;
    case 'left':
      positionStyles = 'top: 45%; left: 6%; transform: translateY(-50%); width: 45%;';
      break;
    case 'right':
      positionStyles = 'top: 45%; right: 6%; transform: translateY(-50%); width: 45%;';
      break;
    case 'custom':
      positionStyles = `top: ${plan.placement.y ?? 40}%; left: ${plan.placement.x ?? 50}%; transform: translate(-50%, -50%); width: ${plan.placement.width ?? 85}%;`;
      break;
    case 'center':
    case 'auto':
    default:
      positionStyles = 'top: 45%; left: 50%; transform: translate(-50%, -50%); width: 88%;';
      break;
  }

  // Sacred Vedic / Ancient Dharma ornaments (inline SVGs)
  let ornamentSvg = '';
  if (plan.ornament === 'lotus') {
    ornamentSvg = `
      <svg class="dm-ornament dm-lotus" viewBox="0 0 100 60" width="80" height="48">
        <path class="dm-draw-path" d="M50 50 C45 35 30 20 20 28 C15 35 25 50 50 50 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path class="dm-draw-path" d="M50 50 C55 35 70 20 80 28 C85 35 75 50 50 50 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path class="dm-draw-path" d="M50 50 C42 30 40 10 50 5 C60 10 58 30 50 50 Z" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="50" cy="50" r="3" fill="currentColor"/>
      </svg>
    `;
  } else if (plan.ornament === 'trishula') {
    ornamentSvg = `
      <svg class="dm-ornament dm-trishula" viewBox="0 0 60 100" width="48" height="80">
        <path class="dm-draw-path" d="M30 10 L30 90 M20 25 C20 45 30 55 30 55 C30 55 40 45 40 25 M15 15 L20 25 M45 15 L40 25 M30 5 L30 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="30" cy="55" r="3" fill="currentColor"/>
      </svg>
    `;
  } else if (plan.ornament === 'chakra' || plan.type?.includes('chakra') || plan.type?.includes('astra')) {
    ornamentSvg = `
      <svg class="dm-ornament dm-chakra" viewBox="0 0 140 140" width="110" height="110">
        <circle class="dm-draw-path" cx="70" cy="70" r="60" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="6 3"/>
        <circle class="dm-draw-path" cx="70" cy="70" r="46" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle class="dm-draw-path" cx="70" cy="70" r="22" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path class="dm-draw-path" d="M70 10 L70 130 M10 70 L130 70 M28 28 L112 112 M28 112 L112 28 M70 24 L70 116 M24 70 L116 70" stroke="currentColor" stroke-width="1.5" opacity="0.85"/>
        <circle cx="70" cy="70" r="6" fill="currentColor"/>
      </svg>
    `;
  } else if (plan.ornament === 'mandala' || plan.ornament === 'sun_burst') {
    ornamentSvg = `
      <svg class="dm-ornament dm-mandala" viewBox="0 0 120 120" width="90" height="90">
        <circle class="dm-draw-path" cx="60" cy="60" r="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4"/>
        <circle class="dm-draw-path" cx="60" cy="60" r="36" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <circle class="dm-draw-path" cx="60" cy="60" r="16" fill="none" stroke="currentColor" stroke-width="1.2"/>
        <path class="dm-draw-path" d="M60 4 L60 116 M4 60 L116 60 M20 20 L100 100 M20 100 L100 20" stroke="currentColor" stroke-width="1" opacity="0.6"/>
        <circle cx="60" cy="60" r="4" fill="currentColor"/>
      </svg>
    `;
  } else if (plan.ornament === 'om') {
    ornamentSvg = `
      <div class="dm-ornament dm-om-symbol font-serif text-3xl font-bold">🕉</div>
    `;
  } else {
    // Default sacred border flourish line
    ornamentSvg = `
      <div class="dm-ornament dm-flourish-line">
        <span class="dm-flourish-wing"></span>
        <span class="dm-flourish-gem">◆</span>
        <span class="dm-flourish-wing"></span>
      </div>
    `;
  }

  // Format words / characters for kinetic reveal
  const titleWords = plan.title.split(/\s+/).filter(Boolean);
  const titleHtml = titleWords
    .map((w, i) => `<span class="dm-word" data-word-idx="${i}">${escapeHtml(w)}</span>`)
    .join(' ');

  const detailHtml = plan.detail
    ? `<div class="dm-detail">${escapeHtml(plan.detail)}</div>`
    : '';

  const html = planHtml || `
    <div id="${containerId}" class="dynamic-motion-kinetic ${plan.type}">
      ${ornamentSvg}
      <h2 class="dm-title">${titleHtml}</h2>
      ${detailHtml}
    </div>
  `;

  if (planCss && !planCss.includes('pointer-events')) {
    planCss = `#${containerId} { pointer-events: none; z-index: 40; background: transparent !important; }\n` + planCss;
  }

  const css = planCss || `
    #${containerId} {
      position: absolute;
      ${positionStyles}
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: ${align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'};
      text-align: ${align};
      font-family: 'Cinzel', 'Rozha One', 'Yatra One', 'Tiro Devanagari Hindi', 'Montserrat', serif, sans-serif;
      z-index: 40;
      opacity: 0;
      box-sizing: border-box;
      background: transparent !important;
    }
    #${containerId} .dm-ornament {
      color: #FFD700;
      margin-bottom: 8px;
      filter: drop-shadow(0 0 16px rgba(255, 215, 0, 0.95));
    }
    #${containerId} .dm-flourish-line {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 60%;
      margin: 4px auto 10px;
    }
    #${containerId} .dm-flourish-wing {
      flex: 1;
      height: 1.5px;
      background: linear-gradient(90deg, transparent, #FFD700, transparent);
      box-shadow: 0 0 10px #FFD700;
    }
    #${containerId} .dm-flourish-gem {
      color: #FFE082;
      font-size: 11px;
      text-shadow: 0 0 12px #FFD700;
    }
    #${containerId} .dm-title {
      font-size: 46px;
      font-weight: 800;
      line-height: 1.25;
      margin: 6px 0;
      display: flex;
      flex-wrap: wrap;
      justify-content: ${align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'};
      gap: 8px;
      background: transparent !important;
    }
    #${containerId} .dm-word {
      display: inline-block;
      opacity: 0;
      transform: translateY(16px) scale(0.92);
      background: linear-gradient(180deg, #FFFFFF 0%, #FFE082 40%, #FFD700 75%, #FFA000 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 25px rgba(255, 215, 0, 0.75));
    }
    #${containerId} .dm-detail {
      font-size: 18px;
      font-weight: 600;
      line-height: 1.45;
      color: #FFF2C6;
      margin-top: 10px;
      opacity: 0;
      transform: translateY(10px);
      letter-spacing: 0.03em;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.95), 0 0 20px rgba(255, 215, 0, 0.65);
    }
  `;

  const startSec = opts.startSec !== undefined
    ? opts.startSec
    : (opts.timelineStartSec !== undefined ? opts.timelineStartSec + (plan.startSec || 0) : (plan.startSec || 0));
  const durationSec = Math.max(2.0, plan.durationSec || 4.5);
  const exitSec = startSec + durationSec - 0.7;

  let js = '';
  if (planJs) {
    const sanitizedCustomJs = planJs.replace(/repeat:\s*-1/g, 'repeat: 6');
    js = `
    // Dynamic Motion Graphic Animation (AI Generated): ${containerId}
    {
      const subTl = gsap.timeline();
      const el = document.getElementById("${containerId}") || document.querySelector("#${containerId}") || document.querySelector(".dynamic-motion-visual");
      if (el) {
        gsap.set(el, { opacity: 0, pointerEvents: "none" });
        try {
          (function(tl, el) {
            ${sanitizedCustomJs}
          })(subTl, el);
        } catch(err) {
          console.warn("Error running custom motion JS:", err);
        }

        // Normalize start time so subTl always starts at 0 internally
        const children = subTl.getChildren();
        if (children && children.length > 0) {
          const minStart = Math.min(...children.map((c: any) => c.startTime()));
          if (minStart > 0 && Number.isFinite(minStart)) {
            subTl.shiftChildren(-minStart, true);
          }
        }

        const effDur = Math.max(2.0, subTl.duration() || ${durationSec});
        subTl.to(el, { opacity: 0, duration: 0.6, ease: "power2.in" }, Math.max(0.5, effDur - 0.6));
        tl.add(subTl, ${startSec});
      }
    }
    `;
  } else {
    js = `
    // Dynamic Motion Graphic Animation: ${containerId}
    {
      const el = document.getElementById("${containerId}");
      if (el) {
        // Entrance: Soft gold aura bloom & card scale-in
        tl.fromTo(el, 
          { opacity: 0, scale: 0.92, filter: "blur(10px)" }, 
          { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.9, ease: "power3.out" }, 
          ${startSec}
        );

        // Kinetic typography: Word-by-word reveal with punch
        const words = el.querySelectorAll(".dm-word");
        if (words && words.length > 0) {
          tl.to(words, {
            opacity: 1,
            y: 0,
            scale: 1,
            stagger: 0.08,
            duration: 0.6,
            ease: "back.out(1.7)",
          }, ${startSec + 0.2});
        }

        // Rotating celestial chakra animation
        const chakras = el.querySelectorAll(".dm-chakra");
        if (chakras && chakras.length > 0) {
          tl.to(chakras, {
            rotation: 720,
            duration: ${durationSec},
            ease: "none",
            transformOrigin: "center center",
          }, ${startSec});
        }

        // Detail fade-in
        const detail = el.querySelector(".dm-detail");
        if (detail) {
          tl.to(detail, {
            opacity: 0.95,
            y: 0,
            duration: 0.7,
            ease: "power2.out",
          }, ${startSec + 0.5});
        }

        // SVG ornament stroke drawing
        const paths = el.querySelectorAll(".dm-draw-path");
        paths.forEach((p, idx) => {
          try {
            const len = p.getTotalLength ? p.getTotalLength() : 300;
            tl.fromTo(p, 
              { strokeDasharray: len, strokeDashoffset: len }, 
              { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut" }, 
              ${startSec + 0.15}
            );
          } catch(e) {}
        });

        // Graceful exit
        tl.to(el, {
          opacity: 0,
          scale: 1.04,
          filter: "blur(8px)",
          duration: 0.7,
          ease: "power2.in",
        }, ${exitSec});
      }
    }
  `;
  }

  return {
    id,
    sceneIndex: plan.sceneIndex,
    type: plan.type,
    title: plan.title,
    detail: plan.detail,
    cuePhrase: plan.cuePhrase,
    startSec,
    durationSec,
    placement: plan.placement,
    visualConcept: plan.visualConcept,
    theme: plan.theme || {
      palette: ['#FFD700', '#FFE082', '#FFA000', '#FFFFFF'],
      fontFamily: 'Cinzel, Rozha One, serif',
      glowColor: 'rgba(255, 215, 0, 0.6)',
      stylePreset: 'vedic-gold',
    },
    render: {
      html,
      css,
      js,
    },
  };
}

/**
 * Intelligent semantic analyzer that decides when, where, and what type of motion graphics are needed.
 * Works either through Gemini LLM or high-fidelity semantic heuristics.
 */
export async function decideDynamicMotionGraphics(
  req: DynamicMotionDecisionRequest
): Promise<DynamicMotionGraphicData[]> {
  const { scenes, channelName, scriptText, customInstructions, model, apiKey } = req;

  // 1. If the script already has explicit AI motion graphic tags, extract and compile them directly
  if (scriptText) {
    const directPlans = extractMotionPlansFromScript(scriptText);
    if (directPlans.length > 0) {
      return directPlans.map((p) => compileDynamicMotionGraphic(p));
    }
  }

  if (!scenes || scenes.length === 0) return [];

  const effectiveKey = apiKey || getGeminiApiKey();

  // If Gemini API is accessible, let the AI generate the dynamic motion graphics specifications
  if (effectiveKey) {
    try {
      // Calculate scene start timestamps on the timeline
      let runningSec = 0;
      const sceneTimingInfo = scenes.map((s, idx) => {
        const start = runningSec;
        const dur = s.durationSec || 6;
        runningSec += dur;
        return {
          sceneIndex: s.sceneIndex ?? idx,
          timelineStart: start,
          duration: dur,
          narration: s.narration,
          visualPrompt: s.visualPrompt,
        };
      });

      const prompt = `
You are the Lead Visual & Motion Graphics Creative Coder for a high-end cinematic documentary channel ("${channelName || 'Ancient Dharma'}").
Your task is to analyze the script scenes below and dynamically code 100% REAL, PRODUCTION-GRADE VISUAL MOTION GRAPHICS.

CRITICAL MANDATORY LAW:
"NO TEMPLATES, NO FALLBACKS, 100% REAL VISUAL MOTION GRAPHICS — NOT JUST TEXT."
Text titles and subtitles alone ARE NOT motion graphics.
Every motion graphic you produce MUST be a REAL visual graphic construct (animated SVG geometry, diagrams, gauges, meters, rotating gears, dials, shockwaves, or technical breakdowns).

ADVANCED VISUAL CATEGORIES (CHOOSE THE BEST FIT PER SCENE):
1. "celestial_astra_geometry": Multi-layer SVG with concentric contra-rotating rings (outer serrated teeth, middle 108 blades, inner spoke lines), central glowing solar bindu, and expanding shockwave circles.
2. "cosmic_telemetry_hud": Circular SVG telemetry gauge with 360° tick marks, sweeping needle arc, real-time metric counter (e.g. 100% SOLAR TEJAS, 108 BLADES ARMED), and lock-on reticle brackets.
3. "weapon_schematic_breakdown": Animated vector schematic with dynamic callout lines (leader lines) pointing to weapon focal components with glowing dimensional badges.
4. "dimensional_energy_wave": Concentric oscillating frequency ripples, radiating gold particle nodes, and expanding shockwaves.
5. "sacred_mandala_geometry": Sacred geometric blooming lotus yantra, rotating star of wisdom, and radiant 24k gold leaf aura.

STRICT CODE REQUIREMENTS:
1. "customHtml": Complete SVG and HTML elements. Must contain real SVG vector geometry (<svg viewBox="0 0 300 300"> with <defs>, <linearGradient>, <filter>, <circle>, <path>, <g>).
   - Root container: <div id="dm-elem-s\${sceneIndex}" class="dynamic-motion-visual \${type}">...</div>
   - NEVER create dark rectangular card boxes or opaque containers. The background must be 100% transparent directly over footage.
2. "customCss": CSS styling. Target #dm-elem-s\${sceneIndex}. Include position: absolute; pointer-events: none; z-index: 40; filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.85));
3. "customJs": Executable GSAP code animating elements on \`tl\`:
   - Start entrance tweens at time 0 (e.g. tl.fromTo('#dm-elem-s\${sceneIndex}', { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.8 }, 0);).
   - Animate the SVG rings/needles/circles (e.g. rotation: 720, strokeDashoffset, scale pulses).
   - CRITICAL: NEVER use repeat: -1. Keep all repeats finite (e.g. repeat: 6) so the timeline duration is finite.
   - Smooth exit fade out before durationSec.

FOR EACH GRAPHIC, DECIDE:
- sceneIndex: number (0-indexed matching the input)
- shouldInclude: boolean (only add where it makes a powerful visual impact, typically 2 to 3 scenes, not every scene)
- type: string (descriptive type from categories above)
- title: string (short title)
- detail: string (short detail)
- cuePhrase: string (spoken trigger phrase)
- startSec: number (seconds into scene when it appears, usually 1.0 to 2.0s)
- durationSec: number (duration, typically 3.5 to 5.0s)
- placement: { position: "center" | "top" | "bottom" | "left" | "right" | "custom", align: "center" | "left" | "right" }
- visualConcept: string (description of the visual construct)
- customHtml: string (COMPLETE HTML & SVG markup)
- customCss: string (COMPLETE CSS styling)
- customJs: string (COMPLETE GSAP code animating the SVG elements using \`tl\`)

${customInstructions ? `USER GUIDANCE: ${customInstructions}` : ''}

SCENES:
${sceneTimingInfo
  .map(
    (s) => `
Scene ${s.sceneIndex}:
Timeline Window: ${s.timelineStart.toFixed(1)}s – ${(s.timelineStart + s.duration).toFixed(1)}s (Duration: ${s.duration.toFixed(1)}s)
Narration: ${s.narration}
Visual: ${s.visualPrompt}
`
  )
  .join('\n---\n')}

Respond ONLY with a JSON array of decided graphics adhering to this JSON schema:
[
  {
    "sceneIndex": 0,
    "shouldInclude": true,
    "type": "celestial_astra_geometry",
    "title": "सुदर्शन चक्र",
    "detail": "१०८ दंत सौर चक्र",
    "cuePhrase": "सुदर्शन चक्र",
    "startSec": 1.5,
    "durationSec": 4.5,
    "placement": { "position": "top", "align": "center" },
    "visualConcept": "Exploded multi-ring contra-rotating Sudarshana Chakra with expanding shockwave arcs",
    "customHtml": "<div id=\\"dm-elem-s0\\" class=\\"dynamic-motion-visual celestial_astra_geometry\\"><svg viewBox=\\"0 0 200 200\\" width=\\"160\\" height=\\"160\\">...</svg><div class=\\"dm-label\\">सुदर्शन चक्र</div></div>",
    "customCss": "#dm-elem-s0 { position: absolute; top: 12%; left: 50%; transform: translateX(-50%); pointer-events: none; ... }",
    "customJs": "tl.fromTo('#dm-elem-s0', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.8 }, 0);"
  }
]
`;

      const modelsToTry = [
        model || 'gemini-2.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.6-flash',
        'gemini-flash-latest',
      ];

      let rawContent = '';
      for (const m of modelsToTry) {
        try {
          const response = await chat(effectiveKey, {
            messages: [{ role: 'user', content: prompt }],
            model: m,
            temperature: 0.2,
            json: true,
            max_tokens: 16384,
            thinkingBudget: 0,
          });
          const text = response.choices?.[0]?.message?.content || '';
          if (text.trim().length > 20) {
            rawContent = text;
            break;
          }
        } catch (mErr) {
          console.warn(`[dynamic-motion] Model ${m} attempt failed, trying next in cascade:`, mErr);
        }
      }

      if (rawContent) {
        const plans = robustJsonArrayParse<DynamicMotionPlan>(rawContent);
        if (Array.isArray(plans) && plans.length > 0) {
          return plans
            .filter((p) => p.shouldInclude && p.title)
            .map((p) => compileDynamicMotionGraphic(p));
        }
      }
    } catch (e) {
      console.warn('Gemini dynamic motion decision failed, using semantic heuristics fallback:', e);
    }
  }

  // Heuristic semantic decision engine (guarantees instantaneous real-time preview without external API latency)
  return decideHeuristicMotionGraphics(scenes, channelName);
}

/**
 * Robust visual-first heuristic decision engine for Ancient Dharma & Vedic storytelling.
 * Generates 100% REAL animated visual SVG constructs (multi-ring contra-rotating chakras, telemetry dials, sacred mandalas)
 * with ZERO rectangular card wrappers.
 */
function decideHeuristicMotionGraphics(
  scenes: SceneMotionInput[],
  _channelName?: string
): DynamicMotionGraphicData[] {
  const graphics: DynamicMotionGraphicData[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const narration = s.narration || '';
    const visual = s.visualPrompt || '';
    const combined = `${narration} ${visual}`.toLowerCase();
    const sIdx = s.sceneIndex ?? i;
    const elemId = `dm-elem-s${sIdx}`;

    let plan: DynamicMotionPlan | null = null;

    // Detection 1: Climax bow break / Pinaka / Weapon / Astra / Sudarshana Chakra
    if (combined.includes('धनुष') || combined.includes('पिनाक') || combined.includes('अस्त्र') || combined.includes('बाण') || combined.includes('चक्र') || combined.includes('chakra') || combined.includes('bow')) {
      plan = {
        sceneIndex: sIdx,
        shouldInclude: true,
        type: 'celestial_astra_geometry',
        title: combined.includes('चक्र') || combined.includes('chakra') ? 'सुदर्शन चक्र' : 'दिव्यास्त्र तेज',
        detail: '१०८ दंत सौर चक्र — The Inviolable Celestial Wheel',
        cuePhrase: narration.includes('चक्र') ? 'सुदर्शन चक्र' : narration.slice(0, 30),
        startSec: 1.2,
        durationSec: 4.5,
        placement: { position: 'center', y: 40, width: 85, align: 'center' },
        visualConcept: 'Multi-layer contra-rotating golden Sudarshana Chakra SVG with serrated blade ring, inner cosmic solar bindu, and expanding shockwave arcs',
        customHtml: `
          <div id="${elemId}" class="dynamic-motion-visual celestial_astra_geometry">
            <svg viewBox="0 0 240 240" width="220" height="220" class="dm-astra-svg">
              <defs>
                <filter id="goldGlow-${sIdx}">
                  <feGaussianBlur stdDeviation="4" result="blur"/>
                  <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <!-- Outer pulse shockwave ring -->
              <circle class="dm-pulse-ring" cx="120" cy="120" r="105" fill="none" stroke="#FFD700" stroke-width="1.5" opacity="0.6" stroke-dasharray="8 6"/>
              <!-- Clockwise serrated blade ring -->
              <g class="dm-ring-cw" filter="url(#goldGlow-${sIdx})">
                <circle cx="120" cy="120" r="88" fill="none" stroke="#FFA000" stroke-width="2.5"/>
                <path d="M120 28 L126 40 L120 44 L114 40 Z M185 55 L183 68 L175 66 L173 53 Z M212 120 L200 126 L196 120 L200 114 Z M185 185 L173 183 L175 175 L183 173 Z M120 212 L114 200 L120 196 L126 200 Z M55 185 L57 173 L65 175 L67 183 Z M28 120 L40 114 L44 120 L40 126 Z M55 55 L67 57 L65 65 L57 67 Z" fill="#FFE082"/>
                <circle cx="120" cy="120" r="76" fill="none" stroke="#FFD700" stroke-width="1.8" stroke-dasharray="4 4"/>
              </g>
              <!-- Counter-clockwise inner 108-blade ring -->
              <g class="dm-ring-ccw" filter="url(#goldGlow-${sIdx})">
                <circle cx="120" cy="120" r="54" fill="none" stroke="#FFD700" stroke-width="2"/>
                <circle cx="120" cy="120" r="38" fill="none" stroke="#FFE082" stroke-width="1.5" stroke-dasharray="6 3"/>
                <line x1="120" y1="68" x2="120" y2="172" stroke="#FFD700" stroke-width="1.5" opacity="0.7"/>
                <line x1="68" y1="120" x2="172" y2="120" stroke="#FFD700" stroke-width="1.5" opacity="0.7"/>
                <line x1="83" y1="83" x2="157" y2="157" stroke="#FFA000" stroke-width="1.2" opacity="0.7"/>
                <line x1="83" y1="157" x2="157" y2="83" stroke="#FFA000" stroke-width="1.2" opacity="0.7"/>
              </g>
              <!-- Central Luminous Solar Bindu -->
              <circle class="dm-core-glow" cx="120" cy="120" r="14" fill="#FFFFFF" filter="url(#goldGlow-${sIdx})"/>
              <circle cx="120" cy="120" r="8" fill="#FFD700"/>
            </svg>
            <div class="dm-astra-label">
              <span class="dm-astra-title">${combined.includes('चक्र') || combined.includes('chakra') ? 'सुदर्शन चक्र' : 'दिव्यास्त्र तेज'}</span>
              <span class="dm-astra-sub">१०८ दंत सौर तेज</span>
            </div>
          </div>
        `,
        customCss: `
          #${elemId} {
            position: absolute;
            top: 36%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            pointer-events: none;
            z-index: 40;
            background: transparent !important;
          }
          #${elemId} .dm-astra-svg {
            filter: drop-shadow(0 0 25px rgba(255, 215, 0, 0.85));
          }
          #${elemId} .dm-astra-label {
            margin-top: 14px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
          #${elemId} .dm-astra-title {
            font-size: 26px;
            font-weight: 800;
            color: #FFE082;
            letter-spacing: 0.08em;
            text-shadow: 0 0 16px rgba(255, 215, 0, 0.9), 0 2px 8px rgba(0, 0, 0, 0.9);
          }
          #${elemId} .dm-astra-sub {
            font-size: 13px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.8);
            letter-spacing: 0.12em;
            text-transform: uppercase;
            text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
          }
        `,
        customJs: `
          tl.fromTo(el, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.9, ease: "back.out(1.7)" });
          tl.to(el.querySelectorAll(".dm-ring-cw"), { rotation: 360, duration: 8, ease: "none", repeat: 5, transformOrigin: "center center" }, "<");
          tl.to(el.querySelectorAll(".dm-ring-ccw"), { rotation: -360, duration: 6, ease: "none", repeat: 6, transformOrigin: "center center" }, "<");
          tl.to(el.querySelectorAll(".dm-pulse-ring"), { scale: 1.35, opacity: 0, duration: 1.8, repeat: 4, ease: "power1.out", transformOrigin: "center center" }, "<");
          tl.to(el.querySelectorAll(".dm-core-glow"), { scale: 1.3, repeat: 8, yoyo: true, duration: 0.8, ease: "sine.inOut", transformOrigin: "center center" }, "<");
        `,
      };
    }
    // Detection 2: Cosmic duration / Years / Metric telemetry / Timeline
    else if (combined.includes('वर्ष') || combined.includes('काल') || combined.includes('तपस्या') || combined.includes('year') || combined.includes('speed') || combined.includes('strike') || i === 1) {
      plan = {
        sceneIndex: sIdx,
        shouldInclude: true,
        type: 'cosmic_telemetry_gauge',
        title: 'काल गणना',
        detail: 'सौर ऊर्जा मापक — Cosmic Solar Telemetry',
        cuePhrase: narration.slice(0, 30),
        startSec: 1.0,
        durationSec: 4.5,
        placement: { position: 'center', y: 42, width: 85, align: 'center' },
        visualConcept: 'Circular telemetry gauge with sweeping golden progress arc, luminous tick marks, rotating speed needle, and digital metric readout',
        customHtml: `
          <div id="${elemId}" class="dynamic-motion-visual cosmic_telemetry_gauge">
            <svg viewBox="0 0 220 220" width="200" height="200" class="dm-gauge-svg">
              <defs>
                <filter id="gaugeGlow-${sIdx}">
                  <feGaussianBlur stdDeviation="3" result="blur"/>
                  <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <!-- Outer tick ring -->
              <circle cx="110" cy="110" r="95" fill="none" stroke="#FFE082" stroke-width="1.2" stroke-dasharray="3 6" opacity="0.6"/>
              <!-- Background track arc -->
              <path d="M 40 160 A 85 85 0 1 1 180 160" fill="none" stroke="rgba(255, 215, 0, 0.2)" stroke-width="6" stroke-linecap="round"/>
              <!-- Animated sweep arc -->
              <path class="dm-gauge-arc" d="M 40 160 A 85 85 0 1 1 180 160" fill="none" stroke="#FFD700" stroke-width="6" stroke-linecap="round" stroke-dasharray="380" stroke-dashoffset="380" filter="url(#gaugeGlow-${sIdx})"/>
              <!-- Needle indicator -->
              <g class="dm-needle-group" filter="url(#gaugeGlow-${sIdx})">
                <line class="dm-needle" x1="110" y1="110" x2="110" y2="40" stroke="#FFE082" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="110" cy="110" r="8" fill="#FFA000"/>
                <circle cx="110" cy="110" r="4" fill="#FFFFFF"/>
              </g>
            </svg>
            <div class="dm-gauge-label">
              <span class="dm-gauge-val">१००% सौर तेज</span>
              <span class="dm-gauge-sub">१६वां भाग संकलित</span>
            </div>
          </div>
        `,
        customCss: `
          #${elemId} {
            position: absolute;
            top: 38%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            pointer-events: none;
            z-index: 40;
            background: transparent !important;
          }
          #${elemId} .dm-gauge-svg {
            filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.75));
          }
          #${elemId} .dm-gauge-label {
            margin-top: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          #${elemId} .dm-gauge-val {
            font-size: 24px;
            font-weight: 800;
            color: #FFD700;
            letter-spacing: 0.06em;
            text-shadow: 0 0 14px rgba(255, 215, 0, 0.8), 0 2px 6px rgba(0, 0, 0, 0.9);
          }
          #${elemId} .dm-gauge-sub {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.85);
            letter-spacing: 0.1em;
            text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
          }
        `,
        customJs: `
          tl.fromTo(el, { opacity: 0, scale: 0.75 }, { opacity: 1, scale: 1, duration: 0.8, ease: "power2.out" });
          tl.fromTo(el.querySelectorAll(".dm-gauge-arc"), { strokeDashoffset: 380 }, { strokeDashoffset: 80, duration: 2.2, ease: "power2.inOut" }, "<");
          tl.fromTo(el.querySelectorAll(".dm-needle-group"), { rotation: -60, transformOrigin: "110px 110px" }, { rotation: 120, duration: 2.4, ease: "power2.out", transformOrigin: "110px 110px" }, "<");
        `,
      };
    }
    // Detection 3: Sacred Dharma / Truth / Transcendence
    else if (combined.includes('धर्म') || combined.includes('सत्य') || combined.includes('संहार') || i === 2 || i === scenes.length - 1) {
      plan = {
        sceneIndex: sIdx,
        shouldInclude: true,
        type: 'sacred_mandala_geometry',
        title: 'धर्मरक्षणाय',
        detail: 'यतो धर्मस्ततो जयः — Righteous Cosmic Order',
        cuePhrase: narration.slice(0, 30),
        startSec: 1.0,
        durationSec: 4.5,
        placement: { position: 'center', y: 40, width: 85, align: 'center' },
        visualConcept: 'Sacred geometric lotus mandala SVG with concentric contra-rotating gold petal rings and blossoming light aura',
        customHtml: `
          <div id="${elemId}" class="dynamic-motion-visual sacred_mandala_geometry">
            <svg viewBox="0 0 220 220" width="200" height="200" class="dm-mandala-svg">
              <defs>
                <filter id="mandalaGlow-${sIdx}">
                  <feGaussianBlur stdDeviation="3.5" result="blur"/>
                  <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <!-- Outer mandala ring -->
              <g class="dm-mandala-outer" filter="url(#mandalaGlow-${sIdx})">
                <circle cx="110" cy="110" r="92" fill="none" stroke="#FFA000" stroke-width="1.8" stroke-dasharray="6 4"/>
                <polygon points="110,22 172,48 198,110 172,172 110,198 48,172 22,110 48,48" fill="none" stroke="#FFE082" stroke-width="1.2" opacity="0.7"/>
              </g>
              <!-- Inner rotating petals ring -->
              <g class="dm-mandala-inner" filter="url(#mandalaGlow-${sIdx})">
                <circle cx="110" cy="110" r="60" fill="none" stroke="#FFD700" stroke-width="2"/>
                <circle cx="110" cy="110" r="42" fill="none" stroke="#FFE082" stroke-width="1.5" stroke-dasharray="4 4"/>
                <path d="M110 70 C100 85 100 95 110 110 C120 95 120 85 110 70 Z M110 150 C100 135 100 125 110 110 C120 125 120 135 110 150 Z M70 110 C85 100 95 100 110 110 C95 120 85 120 70 110 Z M150 110 C135 100 125 100 110 110 C125 120 135 120 150 110 Z" fill="#FFE082" opacity="0.8"/>
              </g>
              <!-- Central sacred Bindu -->
              <circle cx="110" cy="110" r="7" fill="#FFFFFF" filter="url(#mandalaGlow-${sIdx})"/>
            </svg>
            <div class="dm-mandala-label">
              <span class="dm-mandala-title">धर्मरक्षणाय</span>
              <span class="dm-mandala-sub">यतो धर्मस्ततो जयः</span>
            </div>
          </div>
        `,
        customCss: `
          #${elemId} {
            position: absolute;
            top: 38%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            pointer-events: none;
            z-index: 40;
            background: transparent !important;
          }
          #${elemId} .dm-mandala-svg {
            filter: drop-shadow(0 0 22px rgba(255, 215, 0, 0.8));
          }
          #${elemId} .dm-mandala-label {
            margin-top: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          #${elemId} .dm-mandala-title {
            font-size: 24px;
            font-weight: 800;
            color: #FFD700;
            letter-spacing: 0.08em;
            text-shadow: 0 0 16px rgba(255, 215, 0, 0.9), 0 2px 6px rgba(0, 0, 0, 0.9);
          }
          #${elemId} .dm-mandala-sub {
            font-size: 13px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.85);
            letter-spacing: 0.1em;
            text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
          }
        `,
        customJs: `
          tl.fromTo(el, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.9, ease: "back.out(1.5)" });
          tl.to(el.querySelectorAll(".dm-mandala-outer"), { rotation: 180, duration: 8, ease: "none", repeat: 4, transformOrigin: "110px 110px" }, "<");
          tl.to(el.querySelectorAll(".dm-mandala-inner"), { rotation: -180, duration: 6, ease: "none", repeat: 5, transformOrigin: "110px 110px" }, "<");
        `,
      };
    }

    if (plan && plan.shouldInclude) {
      graphics.push(compileDynamicMotionGraphic(plan));
      if (graphics.length >= 3) break;
    }
  }

  return graphics;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
