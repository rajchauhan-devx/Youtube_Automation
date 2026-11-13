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

const ATO_TEMPLATES = [
  'ad_distance_caliper', 'ad_scale_scanner', 'ad_timeline_scrubber', 'ad_number_counter',
  'ad_progress_bar', 'ad_bar_chart', 'ad_line_chart', 'ad_comparison_split', 'ad_map_route',
  'ad_flow_vector', 'ad_metric_odometer', 'ad_process', 'ad_numbered_steps', 'ad_lower_third',
  'ad_title_reveal', 'ad_chapter_marker', 'ad_bullet_recap', 'ad_cycle_loop', 'ad_end_prompt',
];

const TLV_TEMPLATES = [
  'ad_title_reveal', 'ad_lower_third', 'ad_pull_quote', 'ad_keyword_underline',
  'ad_chapter_marker', 'ad_end_prompt', 'ad_progress_bar', 'ad_bullet_recap',
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

  talvora: {
    key: 'talvora',
    name: 'Talvora',
    theme: {
      name: 'talvora',
      primary: '#F43F5E',
      accent: '#FB7185',
      background: '#00000000',
      text: '#FFF1F2',
      fontFamily: "'Playfair Display', 'Cinzel', serif",
      secondaryFont: "'Montserrat', sans-serif",
      lineWeight: 2,
      radius: 6,
    },
    popup: {
      primary: '#F43F5E',
      accent: '#FB7185',
      glow: 'rgba(244,63,94,0.45)',
      surface: 'rgba(18,10,14,0.88)',
      surfaceBorder: 'rgba(244,63,94,0.7)',
      text: '#FFF1F2',
      muted: '#FDA4AF',
      badge: '#F43F5E',
      cardStyle: 'glass',
    },
    motionTemplates: TLV_TEMPLATES,
    popupShapes: ['museum_glass_card', 'circle_medallion', 'metric_counter', 'mystery_hook'],
    sfxPalette: ['whoosh', 'crystal_ting', 'sub_impact', 'paper_slide', 'none'],
    energy: 'balanced',
    defaultSfx: 'crystal_ting',
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

export type MotionGraphicCategory =
  | 'questions'
  | 'arrows'
  | 'highlighters'
  | 'targets'
  | 'alerts'
  | 'reactions'
  | 'metrics'
  | 'archival'
  | 'dharma'
  | 'cinematic';

export interface FixedMotionTemplate {
  id: string;
  name: string;
  description: string;
  isHookTemplate: boolean;
  defaultPlacement: 'center' | 'top' | 'bottom' | 'top-right' | 'top-left' | 'center-right' | 'center-left' | 'bottom-left' | 'bottom-right';
  defaultSfx: SfxName;
  category?: MotionGraphicCategory;
  icon?: string;
  tags?: string[];
}

export const PROFILE_FIXED_TEMPLATES: Record<ChannelMotionPolicyKey, readonly FixedMotionTemplate[]> = {
  ancient_dharma: [
    // --- 1. Cinematic & Storytelling Documentary Templates ---
    {
      id: 'vedic_title_reveal',
      name: '01. Cinematic Episode Title Reveal',
      description: 'Grand golden title emerging from darkness, radiant light rays, floating incense embers, and temple silhouette.',
      isHookTemplate: true,
      defaultPlacement: 'center',
      defaultSfx: 'sacred_bell',
    },
    {
      id: 'ancient_scroll_unfurl',
      name: '02. Ancient Bhurjapatra Scroll Unfurl',
      description: 'Aged birch-bark parchment scroll unfurling with animated calligraphy Sanskrit ink-bleed and royal wax seal.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'paper_slide',
    },
    {
      id: 'divine_character_intro',
      name: '03. Divine Character & Sacred Mandala Halo',
      description: 'Deity and Rishi profile with continuously rotating Sri Yantra mandala halo, royal attributes badge, and sacred aura.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'sacred_bell',
    },
    {
      id: 'ancient_india_map',
      name: '04. Sacred Bharat Geography & Pilgrimage Map',
      description: 'Animated antique India map tracing sacred pilgrimage routes with glowing footsteps, rivers, and golden location pings.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'crystal_ting',
    },
    {
      id: 'temple_architecture',
      name: '05. Temple Architecture & Carving Breakdown',
      description: 'Iconic top-down rock-cut laser slice animation through the monolith with human scale silhouette (🧍 1.8m) vs 32m spire and tonnage metric.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'crystal_ting',
    },
    {
      id: 'historical_timeline',
      name: '06. Historical Dynasty & Yuga Epoch Timeline',
      description: 'Ascending golden Sushumna energy thread with animated laser scrubber and pulsing cosmic era milestone tags.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'telemetry_ticker',
    },
    {
      id: 'sanskrit_shloka_reveal',
      name: '07. Sacred Sanskrit Shloka & Meaning Reveal',
      description: 'Sacred Sanskrit verse in radiant gold Devanagari with temple bracket double-dandas and blooming Om medallion.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'sacred_bell',
    },
    {
      id: 'sacred_geometry_yantra',
      name: '08. Sri Yantra Sacred Geometry Pulse',
      description: 'Hypnotic 9 interlocking Sri Yantra triangles drawing themselves with counter-rotating lotus rings and Bindu shockwave ripples.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'energy_hum',
    },
    {
      id: 'dynasty_family_tree',
      name: '09. Mythological Lineage & Dynasty Tree',
      description: 'Vertical cascading ancestral tree connecting royal avatar medallions with glowing golden Surya lineage branches.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'crystal_ting',
    },
    {
      id: 'divine_weapon_showcase',
      name: '18. Divine Astra & Celestial Weapon Showcase',
      description: '16-serrated Sudarshana Chakra spinning at high velocity with counter-rotating solar flare rings and kinetic impact stats.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'sub_impact',
    },
    {
      id: 'documentary_lower_third',
      name: '11. Temple & Scripture Documentary Lower Third',
      description: 'Chiseled architectural stone nameplate with gold filigree trim, expert attribution, and sacred medallion.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'paper_slide',
    },
    {
      id: 'stone_inscription_reveal',
      name: '15. Ancient Stone Inscription Deciphering',
      description: 'Ancient rock-edict inscription tablet with golden deciphering laser scanline revealing modern Devanagari translation.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'telemetry_ticker',
    },
    {
      id: 'cosmic_universe_explainer',
      name: '16. Vedic Cosmology & Brahmanda Universe',
      description: 'Concentric 14 Lokas cosmic sphere model with Mount Meru axis and cyclic Yuga time caliper odometer.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'energy_hum',
    },
    {
      id: 'cinematic_outro_seal',
      name: '20. Cinematic Outro & Shanti Mantra Seal',
      description: 'Ancient Dharma royal insignia, floating sacred embers, closing Shanti prayer invocation, and subscribe seal.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'sacred_bell',
    },

    // --- 2. Creator Attention Extractor Tools (Highlighters, Lightning, Pointers) ---
    {
      id: 'thunder_lightning',
      name: 'Vajra Divine Thunderbolt Strike',
      description: 'Hook Attention Extractor: crackling celestial golden lightning bolt striking the scene with electric sparks and thunder resonance.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'sub_impact',
    },
    {
      id: 'highlighter',
      name: 'Sacred Saffron Marker Highlighter',
      description: 'Hand-drawn saffron/gold translucent marker pen stroke sweeping across key words with ink glow and gliding pen nib.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'paper_slide',
    },
    {
      id: 'arrow_callout',
      name: 'Golden Divya Baan Pointer Arrow',
      description: 'Curved celestial golden arrow drawing along an arc with pulsing target locator beacon and floating glass badge.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'whoosh',
    },
    {
      id: 'circle_callout',
      name: 'Surya Golden Focus Halo',
      description: 'Hand-drawn double-loop golden sketch circle drawing 360° around the focal subject with living breathing focus.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'crystal_ting',
    },
    {
      id: 'sniper_lock',
      name: 'Sudarshana Divine Reticle Lock',
      description: 'Tactical Vedic reticle: 4 sacred gold corner brackets snapping inward, spinning compass ring, and lock-on crosshair.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'hud_ping',
    },
    {
      id: 'magnifying_glass',
      name: 'Vedic Scripture Inspection Loupe',
      description: 'Polished gold inspection loupe with realistic optical glass glare, crosshair reticle, and evidence annotation tag.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'crystal_ting',
    },
    {
      id: 'redacted_stamp',
      name: 'Satyameva Jayate Seal of Truth',
      description: 'Sacred seal stamping onto scene with 3D perspective slam, radial impact dust ring, and golden seal typography.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'impact',
    },
    {
      id: 'metric_ticker',
      name: 'Cosmic Karma Counter & Surge Bar',
      description: 'Live rolling number odometer with ascending progress spark bar and radiant golden karma surge badge.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'telemetry_ticker',
    },
    {
      id: 'kinetic_underline',
      name: 'Kundalini Energy Underline',
      description: 'Kinetic glowing golden wave drawing smoothly beneath words or captions with trailing spark flare.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'whoosh',
    },
    {
      id: 'shockwave_pulse',
      name: 'Brahmastra Cosmic Blast Pulse',
      description: 'Concentric golden particle shockwave rings rippling outward with central diamond starburst.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'sub_impact',
    },
  ],

  against_the_odds: [
    {
      id: 'thunder_lightning',
      name: 'Storm Impact Lightning Strike',
      description: 'Hook Attention Extractor: aggressive zigzag crimson/yellow lightning strike with thunder shockwave impact.',
      isHookTemplate: true,
      defaultPlacement: 'center',
      defaultSfx: 'sub_impact',
    },
    {
      id: 'highlighter',
      name: 'Hazard Yellow Felt Marker',
      description: 'High-contrast fluorescent hazard yellow marker swipe emphasizing vital survival numbers.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'paper_slide',
    },
    {
      id: 'arrow_callout',
      name: 'Danger Alert Pointer Arrow',
      description: 'Angled hazard pointer arrow with pulsing chevron and beacon pointing toward critical points.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'impact',
    },
    {
      id: 'circle_callout',
      name: 'Critical Hazard Zone Circle',
      description: 'Vibrant red distress loop ringing a hazard area with pulsing warning beacon and target ping.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'hud_ping',
    },
    {
      id: 'sniper_lock',
      name: 'Recon Sniper Target Lock-On',
      description: 'Tactical military brackets snapping onto critical threat with crosshairs and DANGER TARGET tag.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'hud_ping',
    },
    {
      id: 'magnifying_glass',
      name: 'Satellite Recon Tactical Loupe',
      description: 'Heavy duty tactical reconnaissance loupe with crosshair reticle and coordinates readout.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'impact',
    },
    {
      id: 'redacted_stamp',
      name: 'SURVIVED // VERIFIED Stamp',
      description: 'Heavy combat stamp slamming onto screen with ground dust ring and high-contrast hazard stamp box.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'sub_impact',
    },
    {
      id: 'metric_ticker',
      name: 'Survival Odds Rapid Counter',
      description: 'Live counting number ticker surging from 0% to survival threshold with red/yellow surge bar.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'telemetry_ticker',
    },
    {
      id: 'kinetic_underline',
      name: 'Seismic Stress Fracture Underline',
      description: 'Sharp jagged warning line snapping under critical survival stats with shock particle.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'sub_impact',
    },
    {
      id: 'shockwave_pulse',
      name: 'Kinetic Blast Wave Impact',
      description: 'Violent expanding shockwave rings with center impact flash and camera shake impulse.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'sub_impact',
    },
  ],

  talvora: [
    {
      id: 'vedic_title_reveal',
      name: 'Cinematic Noir Title Reveal',
      description: 'Hook Attention Extractor: elegant rose-gold typography emerging with soft anamorphic glow and gentle atmospheric vignette.',
      isHookTemplate: true,
      defaultPlacement: 'center',
      defaultSfx: 'whoosh',
    },
    {
      id: 'highlighter',
      name: 'Rose Velvet Highlighter',
      description: 'Velvet crimson-rose brush sweep emphasizing emotional and dramatic dialogue turns.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'paper_slide',
    },
    {
      id: 'arrow_callout',
      name: 'Subtle Gaze Directional Callout',
      description: 'Sleek golden hairline arrow indicating character gaze or focal point.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'crystal_ting',
    },
    {
      id: 'circle_callout',
      name: 'Intimate Focus Vignette Ring',
      description: 'Soft glowing rose-gold ring softly encircling the focal subject or expression.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'crystal_ting',
    },
    {
      id: 'kinetic_underline',
      name: 'Golden Ribbon Underline',
      description: 'Silken golden light trail tracing beneath title words or character names.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'crystal_ting',
    },
    {
      id: 'shockwave_pulse',
      name: 'Heartbeat Dramatic Pulse',
      description: 'Warm crimson radial pulse wave accentuating emotional revelations or sudden plot turns.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'sub_impact',
    },
  ],

  documentary_standard: [
    {
      id: 'highlighter',
      name: 'Vox Marker Pen Highlighter',
      description: 'Hook Attention Extractor: classic Vox-style translucent yellow marker sweeping across key words to highlight evidence.',
      isHookTemplate: true,
      defaultPlacement: 'top',
      defaultSfx: 'paper_slide',
    },
    {
      id: 'thunder_lightning',
      name: 'Graphic Thunderbolt Accent',
      description: 'Stylized pop-editorial lightning bolt for shocking facts and dramatic narrative turns with flash strobe.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'sub_impact',
    },
    {
      id: 'arrow_callout',
      name: 'Editorial Hand-Drawn Curved Arrow',
      description: 'Organic hand-drawn curved bezier arrow pointing to a document, face, or detail with elastic bounce.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'whoosh',
    },
    {
      id: 'circle_callout',
      name: 'Investigative Red Pen Circle',
      description: 'Authentic red grease-pencil double loop circling around an archival clue or figure.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'crystal_ting',
    },
    {
      id: 'sniper_lock',
      name: 'Investigative Target Reticle',
      description: 'Clean editorial target brackets framing an archival photo or suspect with subtle focal crosshair.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'crystal_ting',
    },
    {
      id: 'magnifying_glass',
      name: 'Archival Magnifying Glass Loupe',
      description: 'Classic brass editorial magnifying glass hovering over evidence with glass reflection glare.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'paper_slide',
    },
    {
      id: 'redacted_stamp',
      name: 'DECLASSIFIED // ARCHIVE Stamp',
      description: 'Authentic red/black archival stamp slamming onto historical evidence with ink splatter.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'impact',
    },
    {
      id: 'metric_ticker',
      name: 'Financial & Growth Metric Ticker',
      description: 'Live rolling metric odometer calculating dollars, percentage surge, or timeline year with surge bar.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'telemetry_ticker',
    },
    {
      id: 'kinetic_underline',
      name: 'Kinetic Marker Underline',
      description: 'Clean ruler-drawn marker underline snapping beneath headlines with leading spark.',
      isHookTemplate: false,
      defaultPlacement: 'top',
      defaultSfx: 'whoosh',
    },
    {
      id: 'shockwave_pulse',
      name: 'Dramatic Story Beat Pulse',
      description: 'Sonic shockwave ripple emphasizing a dramatic plot twist or turning point.',
      isHookTemplate: false,
      defaultPlacement: 'center',
      defaultSfx: 'whoosh',
    },
  ],
};

export function getProfileFixedTemplates(key?: string | ChannelMotionPolicyKey | null): readonly FixedMotionTemplate[] {
  const resolved = (key && key in PROFILE_FIXED_TEMPLATES ? key : 'documentary_standard') as ChannelMotionPolicyKey;
  return PROFILE_FIXED_TEMPLATES[resolved];
}

export function getProfileHookTemplate(key?: string | ChannelMotionPolicyKey | null): FixedMotionTemplate {
  const templates = getProfileFixedTemplates(key);
  return templates.find((t) => t.isHookTemplate) || templates[0];
}

/**
 * 100+ Simple, High-Utility YouTube Motion Graphics Catalog.
 * Curated for documentary, story, and video essay editors.
 */
export const SIMPLE_MOTION_GRAPHICS_CATALOG: readonly FixedMotionTemplate[] = [
  // --- 1. Questions & Mysteries (10) ---
  {
    id: 'question_head',
    name: 'Question Mark (Above Head)',
    description: 'Bouncing 3D animated ? mark bobbing above character head with curiosity glow and mystery ping.',
    category: 'questions',
    icon: '❓',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'bubble_pop',
    tags: ['question', 'head', 'confusion', 'mystery', 'doubt', 'what', 'why'],
  },
  {
    id: 'triple_question',
    name: 'Triple Mystery Marks (???)',
    description: 'Cascading pop-in of three glowing question marks for intense dilemma or unsolved enigma.',
    category: 'questions',
    icon: '❔',
    isHookTemplate: false,
    defaultPlacement: 'top-right',
    defaultSfx: 'crystal_ting',
    tags: ['triple', 'mystery', 'unsolved', 'enigma'],
  },
  {
    id: 'thought_cloud',
    name: 'Thought Bubble with Question',
    description: 'Drifting thought bubble with rising bubbles and center question mark over subject.',
    category: 'questions',
    icon: '💭',
    isHookTemplate: false,
    defaultPlacement: 'top-right',
    defaultSfx: 'whoosh',
    tags: ['thought', 'bubble', 'thinking', 'pondering'],
  },
  {
    id: 'confused_wobble',
    name: 'Confused Head Wobble Question',
    description: 'Elastic wobbling question mark popping with sound effect for moments of sudden doubt.',
    category: 'questions',
    icon: '🤔',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'bubble_pop',
    tags: ['confused', 'wobble', 'shocked'],
  },
  {
    id: 'unsolved_case',
    name: 'Unsolved Mystery Tag',
    description: 'Archival file badge stamped with a glowing neon question mark and confidential border.',
    category: 'questions',
    icon: '📂',
    isHookTemplate: false,
    defaultPlacement: 'center-right',
    defaultSfx: 'paper_slide',
    tags: ['unsolved', 'cold case', 'archive'],
  },
  {
    id: 'contradiction_dilemma',
    name: 'Moral Dilemma / Paradox Split',
    description: 'Two conflicting question paths branching with glowing contradiction aura.',
    category: 'questions',
    icon: '⚖️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'hud_ping',
    tags: ['dilemma', 'choice', 'paradox', 'split'],
  },
  {
    id: 'divine_inquiry',
    name: 'Sacred Question & Divine Query',
    description: 'Radiant golden Sanskrit question aura for scriptural paradoxes and cosmic mysteries.',
    category: 'questions',
    icon: '🕉️',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'sacred_bell',
    tags: ['sacred', 'dharma', 'inquiry'],
  },
  {
    id: 'curiosity_hook_mark',
    name: 'Viral Curiosity Hook Question',
    description: 'Bold high-contrast question callout optimized for the first 15 seconds of long videos.',
    category: 'questions',
    icon: '🪝',
    isHookTemplate: true,
    defaultPlacement: 'center',
    defaultSfx: 'sub_impact',
    tags: ['hook', 'curiosity', 'opening'],
  },
  {
    id: 'who_is_it',
    name: 'Identity Mystery Silhouette Pin',
    description: 'Silhouette profile with glowing question mark over the face for secret figures.',
    category: 'questions',
    icon: '👤',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'camera_click',
    tags: ['who', 'identity', 'hidden', 'secret'],
  },
  {
    id: 'why_question',
    name: 'Bold WHY? Question Badge',
    description: 'Punchy text badge slamming down with "WHY?" for critical plot turning points.',
    category: 'questions',
    icon: '❗',
    isHookTemplate: false,
    defaultPlacement: 'top-left',
    defaultSfx: 'impact',
    tags: ['why', 'reason', 'motive'],
  },

  // --- 2. Arrows & Pointers (10) ---
  {
    id: 'bouncing_arrow',
    name: 'Bouncing Down Arrow',
    description: 'Vertical arrow with energetic spring bounce pointing directly down at a character or clue.',
    category: 'arrows',
    icon: '⬇️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'impact',
    tags: ['arrow', 'bouncing', 'down', 'look', 'pointer'],
  },
  {
    id: 'arrow_callout',
    name: 'Curved Pointer Arrow',
    description: 'Elegant curved bezier arrow with tangent arrowhead, ping circle, and detail label.',
    category: 'arrows',
    icon: '↪️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'hud_ping',
    tags: ['curved', 'pointer', 'arrow', 'callout'],
  },
  {
    id: 'sketch_arrow',
    name: 'Hand-Drawn Sketch Arrow',
    description: 'Organic hand-drawn marker arrow tracing itself with sketched arrow tip.',
    category: 'arrows',
    icon: '↗️',
    isHookTemplate: false,
    defaultPlacement: 'center-right',
    defaultSfx: 'paper_slide',
    tags: ['sketch', 'hand drawn', 'marker'],
  },
  {
    id: 'arrow_target',
    name: 'Target Precision Arrow',
    description: 'Straight laser arrow shooting directly into a pulsing circular target reticle.',
    category: 'arrows',
    icon: '🎯',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'hud_ping',
    tags: ['target', 'precision', 'bullseye'],
  },
  {
    id: 'double_pointer_arrow',
    name: 'Comparison Double Arrow',
    description: 'Dual arrows pointing to two opposing details on screen for split analysis.',
    category: 'arrows',
    icon: '↔️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'whoosh',
    tags: ['double', 'compare', 'split'],
  },
  {
    id: 'diagonal_strike_arrow',
    name: 'Urgent Diagonal Alert Arrow',
    description: 'High-speed diagonal arrow snapping from corner toward the center subject.',
    category: 'arrows',
    icon: '↘️',
    isHookTemplate: false,
    defaultPlacement: 'top-right',
    defaultSfx: 'whoosh',
    tags: ['diagonal', 'urgent', 'speed'],
  },
  {
    id: 'pulsing_beacon_arrow',
    name: 'Neon Pulsing Beacon Arrow',
    description: 'Glowing neon arrow with radiant beacon pulse looping at the target tip.',
    category: 'arrows',
    icon: '💡',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'energy_hum',
    tags: ['neon', 'beacon', 'pulse'],
  },
  {
    id: 'danger_warning_arrow',
    name: 'Hazard Chevron Arrow',
    description: 'Striped hazard yellow/black chevron arrow for survival threats and peril.',
    category: 'arrows',
    icon: '⚠️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'sub_impact',
    tags: ['hazard', 'danger', 'chevron'],
  },
  {
    id: 'finger_pointer',
    name: 'Iconic Pointing Finger',
    description: 'Pop-in cartoon or sketch hand with pointing index finger tapping the subject.',
    category: 'arrows',
    icon: '👉',
    isHookTemplate: false,
    defaultPlacement: 'center-left',
    defaultSfx: 'bubble_pop',
    tags: ['finger', 'hand', 'point'],
  },
  {
    id: 'curved_loop_arrow',
    name: 'U-Turn Reversal Arrow',
    description: 'Sweeping 180-degree loop arrow signaling a retreat, reversal, or turning point.',
    category: 'arrows',
    icon: '🔄',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'whoosh',
    tags: ['uturn', 'reversal', 'loop'],
  },

  // --- 3. Highlighters & Focus (10) ---
  {
    id: 'highlighter',
    name: 'Marker Pen Highlighter',
    description: 'Fluorescent yellow chisel felt-tip marker sliding across text with glint sweep.',
    category: 'highlighters',
    icon: '🖊️',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'paper_slide',
    tags: ['highlight', 'marker', 'chisel', 'pen', 'swipe'],
  },
  {
    id: 'box_highlight',
    name: 'Neon Glowing Box Draw',
    description: 'Animated rectangle drawing its borders around key document clauses, faces or numbers.',
    category: 'highlighters',
    icon: '🔲',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'hud_ping',
    tags: ['box', 'frame', 'rectangle', 'highlight'],
  },
  {
    id: 'kinetic_underline',
    name: 'Kinetic Brush Underline',
    description: 'Ruler-straight marker stroke snapping beneath important narration words with leading spark.',
    category: 'highlighters',
    icon: '➖',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'whoosh',
    tags: ['underline', 'kinetic', 'stroke'],
  },
  {
    id: 'double_underline',
    name: 'Double Line Emphasizer',
    description: 'Dual parallel precision lines underlining an essential takeaway or law.',
    category: 'highlighters',
    icon: '⏸️',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'whoosh',
    tags: ['double', 'line', 'emphasize'],
  },
  {
    id: 'spotlight_oval',
    name: 'Spotlight Glow Oval',
    description: 'Cinematic oval spotlight isolating a dark scene subject with radial vignette.',
    category: 'highlighters',
    icon: '🔦',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'crystal_ting',
    tags: ['spotlight', 'oval', 'glow', 'isolate'],
  },
  {
    id: 'scribble_highlight',
    name: 'Hand-Drawn Scribble Highlight',
    description: 'Authentic hand-drawn zigzag pencil scribble highlighting a key paragraph.',
    category: 'highlighters',
    icon: '〰️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'paper_slide',
    tags: ['scribble', 'pencil', 'drawn'],
  },
  {
    id: 'bracket_callout',
    name: 'Editorial Quotation Brackets',
    description: 'Two grand corner quotation brackets framing a quote or evidence phrase.',
    category: 'highlighters',
    icon: '「」',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'shutter_click',
    tags: ['brackets', 'quote', 'citation'],
  },
  {
    id: 'marker_strike',
    name: 'Red Marker Strikeout',
    description: 'Aggressive red marker strike line crossing out a false claim or debunked theory.',
    category: 'highlighters',
    icon: '❌',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'impact',
    tags: ['strike', 'cross out', 'debunked'],
  },
  {
    id: 'gold_shimmer_highlight',
    name: 'Vedic Golden Shimmer Highlight',
    description: 'Radiant Surya gold shimmer stroke for Sanatana Dharma sacred scripture verses.',
    category: 'highlighters',
    icon: '✨',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'sacred_bell',
    tags: ['gold', 'shimmer', 'vedic', 'shloka'],
  },
  {
    id: 'hazard_yellow_highlight',
    name: 'Fluorescent Hazard Highlight',
    description: 'High-contrast emergency yellow marker with hazard caution icon.',
    category: 'highlighters',
    icon: '⚡',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'sub_impact',
    tags: ['hazard', 'yellow', 'survival'],
  },

  // --- 4. Targets, Reticles & Circles (10) ---
  {
    id: 'red_circle',
    name: 'YouTube Viral Red Circle',
    description: 'The iconic hand-drawn red circle looping twice around a detail with high-retention focus.',
    category: 'targets',
    icon: '⭕',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'impact',
    tags: ['red circle', 'viral', 'focus', 'clickbait', 'detail'],
  },
  {
    id: 'circle_callout',
    name: 'Double-Loop Marker Sketch Circle',
    description: 'Two overlapping sketched circles with center crosshair reticle and caption badge.',
    category: 'targets',
    icon: '🎯',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'hud_ping',
    tags: ['circle', 'loop', 'sketch', 'reticle'],
  },
  {
    id: 'sniper_lock',
    name: 'Tactical Sniper HUD Reticle',
    description: '4 inward snapping corner brackets, rotating compass degree dial and target lock-on crosshair.',
    category: 'targets',
    icon: '🎯',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'hud_ping',
    tags: ['sniper', 'hud', 'reticle', 'lock'],
  },
  {
    id: 'magnifying_glass',
    name: 'Optical Loupe Lens Zoom',
    description: 'Polished inspection loupe with glass glare reflection zooming into evidence.',
    category: 'targets',
    icon: '🔍',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'shutter_click',
    tags: ['magnifying', 'loupe', 'glass', 'zoom', 'lens'],
  },
  {
    id: 'sonar_ping',
    name: 'Concentric Sonar Radar Ping',
    description: 'Expanding circular sonar ripple waves pulsing from target origin.',
    category: 'targets',
    icon: '📡',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'hud_ping',
    tags: ['sonar', 'radar', 'ping', 'ripple'],
  },
  {
    id: 'crosshair_pinpoint',
    name: 'GPS Coordinate Crosshair',
    description: 'Fine crosshair snapping onto target with rolling latitude/longitude telemetry.',
    category: 'targets',
    icon: '📍',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'telemetry_ticker',
    tags: ['gps', 'coordinates', 'crosshair'],
  },
  {
    id: 'reticle_scan',
    name: 'Rotating Target Scanner',
    description: 'High-tech segmented outer ring rotating around a pulsing target core.',
    category: 'targets',
    icon: '⚙️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'energy_hum',
    tags: ['scanner', 'reticle', 'rotating'],
  },
  {
    id: 'focus_frame',
    name: 'Camera Viewfinder Frame',
    description: 'Documentary camera 4-corner crop frame with record REC dot and gridlines.',
    category: 'targets',
    icon: '📷',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'camera_click',
    tags: ['viewfinder', 'camera', 'rec'],
  },
  {
    id: 'orbital_ring',
    name: 'Cosmic Planetary Orbit Ring',
    description: 'Glowing orbital ellipse looping around an astral or celestial subject.',
    category: 'targets',
    icon: '🪐',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'energy_hum',
    tags: ['orbit', 'planetary', 'cosmic'],
  },
  {
    id: 'microscope_lens',
    name: 'Forensic Micro-Focus Lens',
    description: 'Circular scientific lens with measurement ticks and depth-of-field blur.',
    category: 'targets',
    icon: '🔬',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'crystal_ting',
    tags: ['microscope', 'forensic', 'science'],
  },

  // --- 5. Alerts, Warnings & Urgency (10) ---
  {
    id: 'alert_exclamation',
    name: 'High Voltage Exclamation (!)',
    description: 'Glowing red/yellow ! exclamation mark slamming in with shockwave ring and danger strobe.',
    category: 'alerts',
    icon: '❗',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'sub_impact',
    tags: ['exclamation', 'alert', 'warning', 'danger', 'critical'],
  },
  {
    id: 'danger_hazard',
    name: 'Yellow Hazard Triangle',
    description: 'Flashing hazard triangle with bold exclamation mark and caution border.',
    category: 'alerts',
    icon: '⚠️',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'sub_impact',
    tags: ['danger', 'hazard', 'triangle', 'warning'],
  },
  {
    id: 'shockwave_pulse',
    name: 'Story Beat Shockwave Burst',
    description: 'Sonic shockwave ripple emphasizing a dramatic plot twist, reversal, or impact.',
    category: 'alerts',
    icon: '💥',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'sub_impact',
    tags: ['shockwave', 'pulse', 'impact', 'twist'],
  },
  {
    id: 'red_siren_strobe',
    name: 'Emergency Red Siren Strobe',
    description: 'Subtle atmospheric red strobe flash indicating catastrophic failure.',
    category: 'alerts',
    icon: '🚨',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'telemetry_chirp',
    tags: ['siren', 'emergency', 'red alert'],
  },
  {
    id: 'caution_tape',
    name: 'Caution Barrier Tape Slam',
    description: 'Diagonal black/yellow caution warning tape stretching across the screen.',
    category: 'alerts',
    icon: '🚧',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'paper_slide',
    tags: ['caution', 'tape', 'barrier', 'police'],
  },
  {
    id: 'critical_alert_badge',
    name: 'Critical Warning Pill Badge',
    description: 'Floating neon red pill badge with pulsing LED dot and warning text.',
    category: 'alerts',
    icon: '🔴',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'telemetry_chirp',
    tags: ['badge', 'pill', 'warning', 'status'],
  },
  {
    id: 'impact_blast',
    name: 'Comic Impact Blast Lines',
    description: 'Radial dynamic speed lines bursting outward from subject for sudden shocks.',
    category: 'alerts',
    icon: '💢',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'impact',
    tags: ['blast', 'impact', 'burst', 'speed lines'],
  },
  {
    id: 'system_failure',
    name: 'Telemetry System Malfunction',
    description: 'Glitch flicker overlay signaling critical telemetry or instrument failure.',
    category: 'alerts',
    icon: '⚡',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'teletype_chatter',
    tags: ['glitch', 'failure', 'malfunction'],
  },
  {
    id: 'countdown_warning',
    name: 'Urgent Countdown Pulse',
    description: 'Pulsing circular digital countdown ring (3-2-1) for impending disaster.',
    category: 'alerts',
    icon: '⏱️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'telemetry_ticker',
    tags: ['countdown', 'timer', 'urgent'],
  },
  {
    id: 'breach_alarm',
    name: 'Security Perimeter Breach',
    description: 'Tactical HUD flashing "BREACH DETECTED" with red tracking brackets.',
    category: 'alerts',
    icon: '🛡️',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'hud_ping',
    tags: ['breach', 'security', 'alarm'],
  },

  // --- 6. Reactions, Discoveries & Status (10) ---
  {
    id: 'idea_lightbulb',
    name: 'Eureka Discovery Lightbulb (💡)',
    description: 'Glowing lightbulb popping in above character head with golden ray burst and revelation ping.',
    category: 'reactions',
    icon: '💡',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'crystal_ting',
    tags: ['idea', 'lightbulb', 'eureka', 'discovery', 'solution'],
  },
  {
    id: 'check_verified',
    name: 'Green Verified Checkmark (✓)',
    description: 'Bold vibrant green checkmark stamping down with verified seal animation.',
    category: 'reactions',
    icon: '✅',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'impact',
    tags: ['check', 'verified', 'success', 'true'],
  },
  {
    id: 'cross_failed',
    name: 'Red Rejection Crossmark (✗)',
    description: 'Bold red X slamming down on screen signaling failure, false theory, or casualty.',
    category: 'reactions',
    icon: '❌',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'sub_impact',
    tags: ['cross', 'rejected', 'failed', 'false'],
  },
  {
    id: 'star_breakthrough',
    name: 'Golden Breakthrough Star',
    description: '5-point star burst spinning in with particle sparkle trail for major achievements.',
    category: 'reactions',
    icon: '⭐',
    isHookTemplate: false,
    defaultPlacement: 'top-right',
    defaultSfx: 'crystal_ting',
    tags: ['star', 'breakthrough', 'achievement'],
  },
  {
    id: 'lock_secured',
    name: 'Padlock Secured Badge',
    description: 'Heavy metal padlock snapping closed with mechanical click and security glow.',
    category: 'reactions',
    icon: '🔒',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'shutter_click',
    tags: ['lock', 'secured', 'sealed', 'classified'],
  },
  {
    id: 'key_unlocked',
    name: 'Secret Unlocked Golden Key',
    description: 'Antique golden key turning in air and unlocking a secret truth revelation.',
    category: 'reactions',
    icon: '🔑',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'crystal_ting',
    tags: ['key', 'unlocked', 'secret', 'revelation'],
  },
  {
    id: 'thumbs_up_seal',
    name: 'Approval Thumbs Up Seal',
    description: 'Vintage wax seal or metallic medal of approval popping up.',
    category: 'reactions',
    icon: '👍',
    isHookTemplate: false,
    defaultPlacement: 'top-right',
    defaultSfx: 'bubble_pop',
    tags: ['thumbs up', 'approved', 'like'],
  },
  {
    id: 'skull_danger',
    name: 'High-Stakes Skull Peril Icon',
    description: 'Stylized bone skull popping up to emphasize lethal danger or casualties.',
    category: 'reactions',
    icon: '☠️',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'sub_impact',
    tags: ['skull', 'death', 'danger', 'lethal'],
  },
  {
    id: 'fire_streak',
    name: 'Viral Fire Flame Streak',
    description: 'Ascending stylized flame burst for intense battles, speed, or viral highlights.',
    category: 'reactions',
    icon: '🔥',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'whoosh',
    tags: ['fire', 'flame', 'intense', 'viral'],
  },
  {
    id: 'lightning_spark',
    name: 'Kinetic Flash Spark',
    description: 'High-energy electrical spark burst connecting two key ideas.',
    category: 'reactions',
    icon: '⚡',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'sub_impact',
    tags: ['spark', 'flash', 'energy'],
  },

  // --- 7. Metrics, Gauges & Numbers (10) ---
  {
    id: 'metric_ticker',
    name: 'Live Number & Currency Ticker',
    description: 'Fast-rolling digital number odometer counting from zero to key milestone with surge bar.',
    category: 'metrics',
    icon: '📊',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'telemetry_ticker',
    tags: ['ticker', 'odometer', 'counter', 'numbers', 'stats'],
  },
  {
    id: 'gauge_needle',
    name: 'Speedometer / Hazard Gauge',
    description: 'Semi-circular analog meter with needle revving from green safety into redline danger.',
    category: 'metrics',
    icon: '🎛️',
    isHookTemplate: false,
    defaultPlacement: 'top-right',
    defaultSfx: 'telemetry_ticker',
    tags: ['gauge', 'speedometer', 'needle', 'meter'],
  },
  {
    id: 'altitude_meter',
    name: 'Altimeter & Depth Gauge',
    description: 'Vertical bar gauge measuring climbing altitude in feet/meters or underwater depth.',
    category: 'metrics',
    icon: '📈',
    isHookTemplate: false,
    defaultPlacement: 'center-right',
    defaultSfx: 'telemetry_ticker',
    tags: ['altitude', 'depth', 'meter', 'height'],
  },
  {
    id: 'percentage_surge',
    name: 'Circular Percentage Ring',
    description: 'Radial progress circle drawing from 0% to 100% with bold center readout.',
    category: 'metrics',
    icon: '⭕',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'telemetry_ticker',
    tags: ['percentage', 'ring', 'progress', 'circle'],
  },
  {
    id: 'bar_stat_compare',
    name: 'Ascending Stat Comparison Bar',
    description: 'Two comparative vertical bars racing upwards to illustrate scale disparity.',
    category: 'metrics',
    icon: '📊',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'whoosh',
    tags: ['bars', 'compare', 'stats', 'growth'],
  },
  {
    id: 'timeline_scrubber',
    name: 'Historical Timeline Scrubber',
    description: 'Horizontal time axis with sliding scrub head and milestone markers.',
    category: 'metrics',
    icon: '⏳',
    isHookTemplate: false,
    defaultPlacement: 'bottom',
    defaultSfx: 'paper_slide',
    tags: ['timeline', 'scrubber', 'years', 'history'],
  },
  {
    id: 'vital_heartbeat',
    name: 'EKG Vital Heartbeat Pulse',
    description: 'Oscilloscope heartbeat line with audio blip indicating human survival stress.',
    category: 'metrics',
    icon: '💓',
    isHookTemplate: false,
    defaultPlacement: 'bottom',
    defaultSfx: 'telemetry_chirp',
    tags: ['heartbeat', 'ekg', 'vitals', 'pulse'],
  },
  {
    id: 'thermometer_temp',
    name: 'Extreme Temperature Gauge',
    description: 'Mercury thermometer dropping to sub-zero frost or climbing to scorching heat.',
    category: 'metrics',
    icon: '🌡️',
    isHookTemplate: false,
    defaultPlacement: 'center-left',
    defaultSfx: 'telemetry_ticker',
    tags: ['temperature', 'thermometer', 'freeze', 'heat'],
  },
  {
    id: 'battery_depleting',
    name: 'Battery / Fuel Depletion Bar',
    description: 'Pulsing battery indicator draining into red flashing emergency reserve.',
    category: 'metrics',
    icon: '🔋',
    isHookTemplate: false,
    defaultPlacement: 'top-left',
    defaultSfx: 'telemetry_chirp',
    tags: ['battery', 'fuel', 'depletion', 'empty'],
  },
  {
    id: 'clock_timer',
    name: 'Ticking Stopwatch Dial',
    description: 'Analog clock face with spinning second hand demonstrating race against time.',
    category: 'metrics',
    icon: '⏱️',
    isHookTemplate: false,
    defaultPlacement: 'top-right',
    defaultSfx: 'telemetry_ticker',
    tags: ['clock', 'stopwatch', 'time', 'ticking'],
  },

  // --- 8. Documentary & Archival (10) ---
  {
    id: 'redacted_stamp',
    name: 'DECLASSIFIED // ARCHIVE Stamp',
    description: 'Heavy ink stamp slamming onto scene with 3D perspective impact and dust scatter.',
    category: 'archival',
    icon: '📑',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'impact',
    tags: ['stamp', 'classified', 'declassified', 'archive', 'secret'],
  },
  {
    id: 'location_pin',
    name: 'Map Location Drop Pin',
    description: '3D map pin dropping from top with ground impact ripple and location nameplate.',
    category: 'archival',
    icon: '📍',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'impact',
    tags: ['location', 'pin', 'map', 'place', 'gps'],
  },
  {
    id: 'archival_dossier',
    name: 'Classified Folder Dossier Tab',
    description: 'Kraft paper file folder tab unfurling with archival typewriter intel notes.',
    category: 'archival',
    icon: '📁',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'paper_slide',
    tags: ['dossier', 'folder', 'archive', 'classified'],
  },
  {
    id: 'date_stamp',
    name: 'Historical Calendar Date Stamp',
    description: 'Flipping calendar date card snapping into place with year and epoch.',
    category: 'archival',
    icon: '📅',
    isHookTemplate: false,
    defaultPlacement: 'top-left',
    defaultSfx: 'shutter_click',
    tags: ['date', 'calendar', 'year', 'history'],
  },
  {
    id: 'newspaper_headline',
    name: 'Vintage Newspaper Headline',
    description: 'Spinning vintage broadsheet newspaper slamming to front with bold headline.',
    category: 'archival',
    icon: '📰',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'paper_slide',
    tags: ['newspaper', 'headline', 'press', 'breaking'],
  },
  {
    id: 'polaroid_photo',
    name: 'Archival Polaroid Photo Drop',
    description: 'Vintage instant photo dropping at a slight angle with paper thud and caption.',
    category: 'archival',
    icon: '🖼️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'paper_slide',
    tags: ['polaroid', 'photo', 'vintage', 'picture'],
  },
  {
    id: 'audio_waveform',
    name: 'Wiretap Audio Frequency Wave',
    description: 'Living audio spectrogram wave animating with recorded survivor or ATC radio voice.',
    category: 'archival',
    icon: '🎙️',
    isHookTemplate: false,
    defaultPlacement: 'bottom',
    defaultSfx: 'teletype_chatter',
    tags: ['waveform', 'audio', 'radio', 'tape'],
  },
  {
    id: 'fingerprint_scan',
    name: 'Biometric Fingerprint Scanline',
    description: 'Glowing laser beam scanning an archival biometric fingerprint.',
    category: 'archival',
    icon: '🖐️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'telemetry_chirp',
    tags: ['fingerprint', 'biometric', 'scan', 'identity'],
  },
  {
    id: 'evidence_tag',
    name: 'Physical Evidence Tag #01',
    description: 'Cardboard evidence tag with punched eyelet and string tied to a clue.',
    category: 'archival',
    icon: '🏷️',
    isHookTemplate: false,
    defaultPlacement: 'top-left',
    defaultSfx: 'paper_slide',
    tags: ['evidence', 'tag', 'clue', 'label'],
  },
  {
    id: 'flight_path',
    name: 'Dotted Flight Trajectory Path',
    description: 'Animated dotted line tracing aircraft or expedition path across topography.',
    category: 'archival',
    icon: '✈️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'whoosh',
    tags: ['flight', 'path', 'trajectory', 'route'],
  },

  // --- 9. Sacred Lore & Ancient Dharma (10) ---
  {
    id: 'vedic_title_reveal',
    name: 'Vedic Golden Title Reveal',
    description: 'Cinematic golden title emerging from darkness with floating incense embers and Surya rays.',
    category: 'dharma',
    icon: '🌟',
    isHookTemplate: true,
    defaultPlacement: 'center',
    defaultSfx: 'sacred_bell',
    tags: ['vedic', 'title', 'gold', 'dharma', 'intro'],
  },
  {
    id: 'ancient_scroll_unfurl',
    name: 'Sacred Manuscript Scroll',
    description: 'Aged parchment scroll rolling open with Sanskrit Devanagari script and Om watermark.',
    category: 'dharma',
    icon: '📜',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'paper_slide',
    tags: ['scroll', 'manuscript', 'parchment', 'scripture'],
  },
  {
    id: 'sanskrit_shloka_reveal',
    name: 'Sanskrit Shloka Verse & Danda',
    description: 'Sacred Sanskrit verse in radiant gold Devanagari with double-dandas and floral border.',
    category: 'dharma',
    icon: '🕉️',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'sacred_bell',
    tags: ['shloka', 'verse', 'sanskrit', 'danda'],
  },
  {
    id: 'divine_astra_focus',
    name: 'Celestial Astra Weapon Focus',
    description: 'Spinning Sudarshana Chakra or Kodanda bow with sacred solar flare rings and kinetic stats.',
    category: 'dharma',
    icon: '☸️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'sub_impact',
    tags: ['astra', 'weapon', 'chakra', 'divine'],
  },
  {
    id: 'sri_yantra_pulse',
    name: 'Sri Yantra Sacred Geometry',
    description: '9 interlocking sacred triangles drawing themselves with counter-rotating lotus petals.',
    category: 'dharma',
    icon: '🔯',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'energy_hum',
    tags: ['yantra', 'mandala', 'geometry', 'sacred'],
  },
  {
    id: 'temple_blueprint',
    name: 'Vedic Temple Architecture Blueprint',
    description: 'Golden architectural wireframe drafting Dravidian/Nagara temple shikhara and garbhagriha.',
    category: 'dharma',
    icon: '🏛️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'hud_ping',
    tags: ['temple', 'architecture', 'blueprint', 'vastu'],
  },
  {
    id: 'dynasty_lineage',
    name: 'Surya / Chandra Vamsha Lineage Tree',
    description: 'Golden ancestral tree connecting royal avatar medallions across generations.',
    category: 'dharma',
    icon: '🌳',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'crystal_ting',
    tags: ['dynasty', 'lineage', 'family tree', 'vamsha'],
  },
  {
    id: 'holy_river_map',
    name: 'Sacred River Course (Ganga / Saraswati)',
    description: 'Glowing golden water river path tracing across ancient Aryavarta topography.',
    category: 'dharma',
    icon: '🌊',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'whoosh',
    tags: ['river', 'map', 'ganga', 'saraswati'],
  },
  {
    id: 'sacred_bell_ring',
    name: 'Temple Bell Resonance Wave',
    description: 'Golden temple bell swaying with concentric sacred acoustic chime waves.',
    category: 'dharma',
    icon: '🔔',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'sacred_bell',
    tags: ['bell', 'chime', 'resonance', 'temple'],
  },
  {
    id: 'om_mandala_seal',
    name: 'Sacred Om Shanti Outro Seal',
    description: 'Radiant golden Om seal blooming in center with peaceful shanti rays.',
    category: 'dharma',
    icon: '🕉️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'sacred_bell',
    tags: ['om', 'shanti', 'outro', 'seal'],
  },

  // --- 10. Cinematic Layouts & Captions (10) ---
  {
    id: 'documentary_lower_third',
    name: 'Documentary Nameplate Lower Third',
    description: 'Sleek cinematic glass lower third with speaker name, role/title, and accent bar.',
    category: 'cinematic',
    icon: '🏷️',
    isHookTemplate: false,
    defaultPlacement: 'top',
    defaultSfx: 'paper_slide',
    tags: ['lower third', 'nameplate', 'speaker', 'title'],
  },
  {
    id: 'pull_quote_banner',
    name: 'Documentary Pull Quote Banner',
    description: 'Floating glass banner with quotation mark and high-impact verbatim testimonial quote.',
    category: 'cinematic',
    icon: '💬',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'whoosh',
    tags: ['quote', 'pull quote', 'testimonial'],
  },
  {
    id: 'bullet_recap_card',
    name: '3-Point Key Takeaway Recap Card',
    description: 'Cascading 3-bullet recap card summarizing discoveries or survival rules.',
    category: 'cinematic',
    icon: '📋',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'crystal_ting',
    tags: ['recap', 'bullets', 'points', 'summary'],
  },
  {
    id: 'chapter_intro_card',
    name: 'Cinematic Act & Chapter Slate',
    description: 'Bold act break card (e.g. ACT III: THE REVERSAL) with minimalist rule line.',
    category: 'cinematic',
    icon: '🎬',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'sub_impact',
    tags: ['chapter', 'act', 'title card'],
  },
  {
    id: 'split_screen_vs',
    name: 'Versus Comparison Split Screen',
    description: 'Vertical laser dividing line with center VS medallion comparing two theories.',
    category: 'cinematic',
    icon: '⚔️',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'impact',
    tags: ['vs', 'versus', 'compare', 'split screen'],
  },
  {
    id: 'speech_bubble',
    name: 'Character Dialogue Speech Bubble',
    description: 'Pop-in dialogue bubble with tail pointing toward speaking character.',
    category: 'cinematic',
    icon: '🗨️',
    isHookTemplate: false,
    defaultPlacement: 'center-right',
    defaultSfx: 'bubble_pop',
    tags: ['dialogue', 'speech', 'bubble', 'talk'],
  },
  {
    id: 'thought_bubble',
    name: 'Inner Dilemma Thought Bubble',
    description: 'Soft cloud bubble illustrating a character or survivor inner dilemma.',
    category: 'cinematic',
    icon: '💭',
    isHookTemplate: false,
    defaultPlacement: 'top-left',
    defaultSfx: 'whoosh',
    tags: ['thought', 'inner', 'mind'],
  },
  {
    id: 'citation_source',
    name: 'Archival Citation & Source Tag',
    description: 'Minimalist academic/archival citation box citing official records or scriptures.',
    category: 'cinematic',
    icon: '📖',
    isHookTemplate: false,
    defaultPlacement: 'top-left',
    defaultSfx: 'shutter_click',
    tags: ['citation', 'source', 'proof', 'records'],
  },
  {
    id: 'subscribe_cta_badge',
    name: 'Clean YouTube Subscribe & Bell CTA',
    description: 'Sleek YouTube subscribe button with ringing notification bell and subscribe pulse.',
    category: 'cinematic',
    icon: '🔔',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'crystal_ting',
    tags: ['subscribe', 'cta', 'bell', 'outro'],
  },
  {
    id: 'outro_end_screen',
    name: 'Next Episode Teaser Card',
    description: 'Cinematic next story teaser card with curiosity question for ending screen retention.',
    category: 'cinematic',
    icon: '📺',
    isHookTemplate: false,
    defaultPlacement: 'center',
    defaultSfx: 'whoosh',
    tags: ['next', 'teaser', 'outro', 'end screen'],
  },
];

/**
 * Filter the catalog by category or search term.
 */
export function getMotionGraphicsCatalog(category?: MotionGraphicCategory): readonly FixedMotionTemplate[] {
  if (!category) return SIMPLE_MOTION_GRAPHICS_CATALOG;
  return SIMPLE_MOTION_GRAPHICS_CATALOG.filter((t) => t.category === category);
}

export function searchMotionGraphicsCatalog(query: string): readonly FixedMotionTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return SIMPLE_MOTION_GRAPHICS_CATALOG;
  return SIMPLE_MOTION_GRAPHICS_CATALOG.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(q)))
  );
}
