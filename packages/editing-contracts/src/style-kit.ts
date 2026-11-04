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

export interface FixedMotionTemplate {
  id: string;
  name: string;
  description: string;
  isHookTemplate: boolean;
  defaultPlacement: 'center' | 'top' | 'top-right' | 'top-left' | 'center-right';
  defaultSfx: SfxName;
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
