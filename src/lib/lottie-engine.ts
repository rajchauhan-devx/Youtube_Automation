/**
 * Open-Source Lottie Motion Graphics Engine
 * Replaces hardcoded custom templates with modular, theme-able vector templates.
 */

export interface LottieTemplateMeta {
  id: string;
  name: string;
  category: 'callouts' | 'titles' | 'data' | 'reactions';
  path: string;
  description: string;
  defaultDurationSec: number;
  minScale: number;
  maxScale: number;
}

export const OPEN_SOURCE_LOTTIE_CATALOG: readonly LottieTemplateMeta[] = [
  {
    id: 'lottie_bouncing_arrow',
    name: 'Bouncing Directional Arrow',
    category: 'callouts',
    path: '/lottie-templates/callouts/bouncing_arrow.json',
    description: 'Dynamic bouncing pointer highlighting subjects or important details.',
    defaultDurationSec: 3.0,
    minScale: 0.5,
    maxScale: 1.5,
  },
  {
    id: 'lottie_target_reticle',
    name: 'Tactical Target Reticle',
    category: 'callouts',
    path: '/lottie-templates/callouts/target_reticle.json',
    description: 'Expanding rotating reticle ring for evidence and focus details.',
    defaultDurationSec: 3.0,
    minScale: 0.6,
    maxScale: 1.8,
  },
  {
    id: 'lottie_circle_highlight',
    name: 'Hand-Drawn Circle Encircle',
    category: 'callouts',
    path: '/lottie-templates/callouts/circle_highlight.json',
    description: 'Smooth expanding oval encircling subjects for maximum viewer retention.',
    defaultDurationSec: 2.5,
    minScale: 0.7,
    maxScale: 2.0,
  },
  {
    id: 'lottie_cinematic_underline',
    name: 'Cinematic Underline Reveal',
    category: 'titles',
    path: '/lottie-templates/titles/cinematic_underline.json',
    description: 'Center-expanding elegant rule for keyword titles and chapter headings.',
    defaultDurationSec: 3.0,
    minScale: 0.8,
    maxScale: 1.5,
  },
  {
    id: 'lottie_verified_badge',
    name: 'Verified Checkmark Stamp',
    category: 'titles',
    path: '/lottie-templates/titles/verified_badge.json',
    description: 'Stamping circle with animated checkmark for verified historical facts.',
    defaultDurationSec: 2.5,
    minScale: 0.6,
    maxScale: 1.4,
  },
  {
    id: 'lottie_metric_counter',
    name: 'Radial Metric Gauge',
    category: 'data',
    path: '/lottie-templates/data/metric_counter.json',
    description: 'Circular radial gauge displaying progress and percentage statistics.',
    defaultDurationSec: 3.5,
    minScale: 0.7,
    maxScale: 1.6,
  },
  {
    id: 'lottie_alert_exclamation',
    name: 'Alert Warning Triangle',
    category: 'reactions',
    path: '/lottie-templates/reactions/alert_exclamation.json',
    description: 'Pulsing exclamation mark alerting viewer to sudden twists or high stakes.',
    defaultDurationSec: 2.5,
    minScale: 0.6,
    maxScale: 1.4,
  },
];

export function getLottieTemplate(id: string): LottieTemplateMeta | undefined {
  return OPEN_SOURCE_LOTTIE_CATALOG.find((t) => t.id === id);
}

/** Convert #RRGGBB to Lottie normalized [r, g, b, 1] */
export function hexToLottieColor(hex: string): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [Number(r.toFixed(3)), Number(g.toFixed(3)), Number(b.toFixed(3)), 1];
}

/** Deep clone and apply channel theme colors to Lottie shapes */
export function applyThemeToLottie(
  lottieJson: any,
  primaryColor?: string,
  accentColor?: string
): any {
  if (!lottieJson) return lottieJson;
  const cloned = JSON.parse(JSON.stringify(lottieJson));
  const primaryLottie = primaryColor ? hexToLottieColor(primaryColor) : undefined;
  const accentLottie = accentColor ? hexToLottieColor(accentColor) : undefined;

  function traverseShapes(shapes: any[]) {
    if (!Array.isArray(shapes)) return;
    for (const s of shapes) {
      if (s.ty === 'fl' && primaryLottie && s.c?.k) {
        // Swap fill colors if static
        if (Array.isArray(s.c.k) && s.c.k.length >= 3) {
          s.c.k = [...primaryLottie];
        }
      } else if (s.ty === 'st' && accentLottie && s.c?.k) {
        // Swap stroke colors if static
        if (Array.isArray(s.c.k) && s.c.k.length >= 3) {
          s.c.k = [...accentLottie];
        }
      } else if (s.it && Array.isArray(s.it)) {
        traverseShapes(s.it);
      }
    }
  }

  if (Array.isArray(cloned.layers)) {
    for (const layer of cloned.layers) {
      if (layer.shapes) {
        traverseShapes(layer.shapes);
      }
    }
  }

  return cloned;
}
