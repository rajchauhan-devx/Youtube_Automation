/**
 * STYLE KITS — single source of truth for channel visual identity.
 *
 * A StyleKit is the "brand kit" a human editor would keep per show: palette, fonts,
 * the menu of templates they are allowed to pull from, and the sound palette that
 * matches. Variety comes from permuting templates inside the kit, never from
 * inventing new styles per video.
 *
 * Everything (motion library, popup renderer, SFX, prompts, client preview) reads
 * from here. Nothing else may define channel colors, shapes or sounds.
 */
import {
  detectChannelMotionKey,
  type ChannelMotionPolicyKey,
} from './motion-policy.js';

/** Canonical SFX names. The server SFX registry must implement exactly these. */
export const SFX_NAMES = [
  'whoosh',
  'sub_impact',
  'impact',
  'paper_slide',
  'shutter_click',
  'hud_ping',
  'telemetry_ticker',
  'sacred_bell',
  'crystal_ting',
  'camera_click',
  'bubble_pop',
  'telemetry_chirp',
  'energy_hum',
  'teletype_chatter',
  'none',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/** Historical names that never had a generated file. Resolved to a real sound. */
export const SFX_ALIASES: Record<string, SfxName> = {
  impact_boom: 'impact',
  glitch_static: 'teletype_chatter',
};

export function canonicalSfx(name?: string | null): SfxName {
  if (!name || name === 'none') return 'none';
  const aliased = SFX_ALIASES[name];
  if (aliased) return aliased;
  return (SFX_NAMES as readonly string[]).includes(name) ? (name as SfxName) : 'whoosh';
}

/** Canonical popup frame shapes. Every entry must have a renderer branch. */
export const POPUP_SHAPES = [
  'circle_medallion',
  'tactical_hexagon',
  'museum_glass_card',
  'magnifying_loupe',
  'cutout_relic',
  'metric_counter',
  'mystery_hook',
  'heritage_intel',
  'blueprint_diagram',
] as const;
export type PopupShapeName = (typeof POPUP_SHAPES)[number];

export const POPUP_PLACEMENTS = [
  'top-right',
  'top-left',
  'center-right',
  'center-left',
  'bottom-right',
  'bottom-left',
] as const;
export type PopupPlacementName = (typeof POPUP_PLACEMENTS)[number];

/** Placements safe on mobile: bottom corners sit under the subtitle band. */
export const MOBILE_SAFE_PLACEMENTS: readonly PopupPlacementName[] = [
  'top-right',
  'top-left',
  'center-right',
  'center-left',
];

export function mobileSafePlacement(p?: string | null): PopupPlacementName {
  const value = (p || 'top-right') as PopupPlacementName;
  if ((MOBILE_SAFE_PLACEMENTS as readonly string[]).includes(value)) return value;
  return value.includes('left') ? 'top-left' : 'top-right';
}

export type StyleKitEnergy = 'subtle' | 'balanced' | 'expressive';

/** 'none' = free-floating type + framed image only, no card box (Ancient Dharma policy). */
export type PopupCardStyle = 'none' | 'glass';

export interface StyleKitTheme {
  name: string;
  primary: string;
  accent: string;
  background: string;
  text: string;
  fontFamily: string;
  secondaryFont: string;
  lineWeight: number;
  radius: number;
}

export interface StyleKit {
  key: ChannelMotionPolicyKey;
  name: string;
  /** Scene-graph + motion library theme. */
  theme: StyleKitTheme;
  /** Popup chrome. Colors here replace every hardcoded amber/cyan/orange. */
  popup: {
    primary: string;
    accent: string;
    glow: string;
    surface: string;
    surfaceBorder: string;
    text: string;
    muted: string;
    badge: string;
    cardStyle: PopupCardStyle;
  };
  /** The menu of motion templates this channel may use. */
  motionTemplates: string[];
  /** The popup shapes this channel may use. */
  popupShapes: PopupShapeName[];
  /** The only sounds this channel may play. */
  sfxPalette: SfxName[];
  energy: StyleKitEnergy;
  /** Default SFX when a template does not name one. */
  defaultSfx: SfxName;
}

const AD_TEMPLATES = [
  'ad_floating_shloka', 'ad_timeline', 'ad_lineage', 'ad_comparison', 'ad_process',
  'ad_metric_odometer', 'ad_etymology', 'ad_recap', 'ad_chapter', 'ad_leader_pointer',
  'ad_river_route', 'ad_yantra_wireframe', 'ad_stratigraphy', 'ad_reconstruction',
  'ad_evidence', 'ad_vyuha_tactics', 'ad_contour_trace', 'ad_equinox_ray', 'ad_bell_shockwave',
  'ad_laser_scanline', 'pull_quote', 'lower_third', 'title_reveal', 'keyword_underline',
  'marker_highlight', 'bullet_recap', 'numbered_steps', 'chapter_marker', 'source_credit',
  'location_pin', 'date_stamp', 'number_counter', 'donut_chart', 'bar_chart', 'branch_diagram',
];

const RZ_TEMPLATES = [
  'ad_highlight_reticle', 'ad_comparison_split', 'ad_flow_vector', 'ad_lower_third',
  'ad_title_reveal', 'ad_progress_bar', 'ad_bar_chart', 'ad_line_chart', 'ad_cycle_loop',
  'ad_branch_diagram', 'ad_numbered_steps', 'ad_bullet_recap', 'ad_chapter_marker',
  'ad_distance_caliper', 'ad_scale_scanner', 'ad_radial_metric', 'ad_timeline_scrubber',
  'ad_map_route', 'ad_number_counter', 'ad_keyword_underline', 'ad_end_prompt',
];

const ATO_TEMPLATES = [
  'ad_distance_caliper', 'ad_scale_scanner', 'ad_timeline_scrubber', 'ad_number_counter',
  'ad_progress_bar', 'ad_bar_chart', 'ad_line_chart', 'ad_comparison_split', 'ad_map_route',
  'ad_flow_vector', 'ad_metric_odometer', 'ad_process', 'ad_numbered_steps', 'ad_lower_third',
  'ad_title_reveal', 'ad_chapter_marker', 'ad_bullet_recap', 'ad_cycle_loop', 'ad_end_prompt',
];

const DOC_TEMPLATES = [
  'ad_lower_third', 'ad_title_reveal', 'ad_pull_quote', 'ad_keyword_underline',
  'ad_bullet_recap', 'ad_numbered_steps', 'ad_chapter_marker', 'ad_source_credit',
  'ad_location_pin', 'ad_date_stamp', 'ad_number_counter', 'ad_progress_bar',
  'ad_bar_chart', 'ad_comparison_split', 'ad_timeline_scrubber', 'ad_branch_diagram',
];

export const STYLE_KITS: Record<ChannelMotionPolicyKey, StyleKit> = {
  ancient_dharma: {
    key: 'ancient_dharma',
    name: 'Ancient Dharma',
    theme: {
      name: 'ancient_dharma',
      primary: '#C59B52',
      accent: '#A05238',
      background: '#00000000',
      text: '#FFF3D7',
      fontFamily: "'Noto Sans Devanagari', serif",
      secondaryFont: "'Noto Sans Devanagari', serif",
      lineWeight: 2,
      radius: 0,
    },
    popup: {
      primary: '#C59B52',
      accent: '#E0B872',
      glow: 'rgba(197,155,82,0.55)',
      surface: 'rgba(20,13,8,0.72)',
      surfaceBorder: 'rgba(197,155,82,0.85)',
      text: '#FFF3D7',
      muted: '#E8D3A9',
      badge: '#C59B52',
      cardStyle: 'none',
    },
    motionTemplates: AD_TEMPLATES,
    popupShapes: ['circle_medallion', 'museum_glass_card', 'metric_counter', 'heritage_intel', 'mystery_hook', 'cutout_relic'],
    sfxPalette: ['sacred_bell', 'paper_slide', 'crystal_ting', 'whoosh', 'none'],
    energy: 'subtle',
    defaultSfx: 'sacred_bell',
  },

  rule_zero: {
    key: 'rule_zero',
    name: 'Rule Zero',
    theme: {
      name: 'rule_zero',
      primary: '#00F0FF',
      accent: '#00FF66',
      background: '#00000000',
      text: '#F0FBFF',
      fontFamily: "'JetBrains Mono', monospace",
      secondaryFont: "'JetBrains Mono', monospace",
      lineWeight: 2,
      radius: 0,
    },
    popup: {
      primary: '#00F0FF',
      accent: '#00FF66',
      glow: 'rgba(0,240,255,0.5)',
      surface: 'rgba(6,12,16,0.86)',
      surfaceBorder: 'rgba(0,240,255,0.75)',
      text: '#EAFDFF',
      muted: '#9BD8E0',
      badge: '#00F0FF',
      cardStyle: 'glass',
    },
    motionTemplates: RZ_TEMPLATES,
    popupShapes: ['tactical_hexagon', 'blueprint_diagram', 'metric_counter', 'circle_medallion', 'museum_glass_card'],
    sfxPalette: ['hud_ping', 'telemetry_ticker', 'telemetry_chirp', 'teletype_chatter', 'sub_impact', 'whoosh', 'none'],
    energy: 'balanced',
    defaultSfx: 'hud_ping',
  },

  against_the_odds: {
    key: 'against_the_odds',
    name: 'Against the Odds',
    theme: {
      name: 'against_the_odds',
      primary: '#FACC15',
      accent: '#EF4444',
      background: '#00000000',
      text: '#FFFFFF',
      fontFamily: "'Montserrat', 'Impact', sans-serif",
      secondaryFont: "'JetBrains Mono', monospace",
      lineWeight: 3,
      radius: 4,
    },
    popup: {
      primary: '#FACC15',
      accent: '#EF4444',
      glow: 'rgba(250,204,21,0.5)',
      surface: 'rgba(10,10,12,0.86)',
      surfaceBorder: 'rgba(250,204,21,0.8)',
      text: '#FFFFFF',
      muted: '#D4D4D8',
      badge: '#FACC15',
      cardStyle: 'glass',
    },
    motionTemplates: ATO_TEMPLATES,
    popupShapes: ['metric_counter', 'blueprint_diagram', 'circle_medallion', 'museum_glass_card', 'magnifying_loupe', 'mystery_hook'],
    sfxPalette: ['sub_impact', 'impact', 'shutter_click', 'hud_ping', 'telemetry_ticker', 'whoosh', 'none'],
    energy: 'expressive',
    defaultSfx: 'sub_impact',
  },

  documentary_standard: {
    key: 'documentary_standard',
    name: 'Documentary Standard',
    theme: {
      name: 'documentary_standard',
      primary: '#F07835',
      accent: '#FFE600',
      background: '#00000000',
      text: '#FFFFFF',
      fontFamily: "'Montserrat', 'Inter', sans-serif",
      secondaryFont: "'JetBrains Mono', monospace",
      lineWeight: 2,
      radius: 6,
    },
    popup: {
      primary: '#F07835',
      accent: '#FFE600',
      glow: 'rgba(240,120,53,0.5)',
      surface: 'rgba(10,10,12,0.86)',
      surfaceBorder: 'rgba(240,120,53,0.8)',
      text: '#FFFFFF',
      muted: '#D4D4D8',
      badge: '#F07835',
      cardStyle: 'glass',
    },
    motionTemplates: DOC_TEMPLATES,
    popupShapes: ['circle_medallion', 'museum_glass_card', 'metric_counter', 'mystery_hook'],
    sfxPalette: ['whoosh', 'camera_click', 'bubble_pop', 'crystal_ting', 'paper_slide', 'none'],
    energy: 'balanced',
    defaultSfx: 'whoosh',
  },
};

export function getStyleKit(key?: string | ChannelMotionPolicyKey | null): StyleKit {
  const resolved = (key && key in STYLE_KITS ? key : 'documentary_standard') as ChannelMotionPolicyKey;
  return STYLE_KITS[resolved];
}

/** Resolve a channel identity (account id, name, title, or profile key) to its kit. */
export function styleKitFor(
  identity: string | { id?: string; name?: string; youtubeChannelTitle?: string; sourceContext?: string } | null | undefined,
  fallback: ChannelMotionPolicyKey = 'documentary_standard'
): StyleKit {
  return getStyleKit(detectChannelMotionKey(identity ?? {}, fallback));
}

export function styleKitThemeFor(identity: unknown): StyleKitTheme {
  return styleKitFor(identity as never).theme;
}

/** True when this channel permits the given motion template. */
export function kitAllowsTemplate(kit: StyleKit, templateId: string): boolean {
  return kit.motionTemplates.includes(templateId.replace(/^(?:rz|ato)_/, 'ad_'));
}

export function kitAllowsSfx(kit: StyleKit, sfx: string): boolean {
  return kit.sfxPalette.includes(canonicalSfx(sfx));
}

/** Clamp a requested sound into the channel palette. */
export function clampSfxToKit(kit: StyleKit, requested?: string | null): SfxName {
  const sfx = canonicalSfx(requested);
  if (sfx === 'none') return 'none';
  return kit.sfxPalette.includes(sfx) ? sfx : kit.defaultSfx;
}

/** Clamp a requested shape into the channel palette. */
export function clampShapeToKit(kit: StyleKit, requested?: string | null): PopupShapeName {
  const shape = (requested || '') as PopupShapeName;
  return (POPUP_SHAPES as readonly string[]).includes(shape) && kit.popupShapes.includes(shape)
    ? shape
    : kit.popupShapes[0];
}

/** Density cap for a 60s short, scaled by channel energy. */
export function kitDensityBudget(kit: StyleKit, durationSec: number): { maxMotion: number; maxPopups: number } {
  const perMinute = { subtle: 4, balanced: 6, expressive: 8 }[kit.energy];
  const minutes = Math.max(1, durationSec / 60);
  const maxMotion = Math.max(2, Math.round(perMinute * minutes));
  return { maxMotion, maxPopups: Math.max(1, Math.ceil(maxMotion / 2)) };
}
