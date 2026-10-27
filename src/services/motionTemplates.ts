import { createReusableTemplates, escapeSvgText } from './reusableMotionTemplates';

/**
 * Universal Documentary Motion Graphics Library
 * Foundational, reusable kinetic graphics designed to fit ANY scene across all channel profiles.
 * Strict Zero-Card Mandate: 100% transparent vector overlays (background: transparent).
 * Real kinetic physics, volumetric lighting, animated paths, rotating reticles, and calipers.
 */

export interface MotionTemplate {
  id: string;
  name: string;
  profileId: 'default' | 'rule_zero' | 'against_the_odds' | string;
  profileName: string;
  category: 'highlight' | 'map' | 'lighting' | 'measurement' | 'timeline' | 'scale' | 'metric' | 'magnifier' | 'comparison' | 'flow' | string;
  description: string;
  emergingEffect: string;
  durationFrames: number;
  fps: number;
  aspectRatio: '9:16' | '16:9';
  triggerKeywords: string[];
  soundCue: string;
  collection?: 'essentials';
  defaultParams?: Record<string, string | number>;
  renderSvg: (frame: number, totalFrames: number, width: number, height: number, params?: Record<string, string | number>) => string;
}

// Math and easing helpers
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOutCubic = (t: number) => {
  const c = clamp(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const clamped = clamp(t);
  return 1 + c3 * Math.pow(clamped - 1, 3) + c1 * Math.pow(clamped - 1, 2);
};

// Color theming per channel profile
interface ProfileTheme {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  fontMono: string;
  fontDisplay: string;
  labelPrefix: string;
}

function getTheme(profileId: string): ProfileTheme {
  if (profileId === 'acct_3ea89878-0f41-4dc9-86e5-3f55cda46ef7' || profileId === 'rule_zero') {
    return {
      primary: '#00F0FF',
      secondary: '#3B82F6',
      accent: '#10B981',
      glow: 'rgba(0, 240, 255, 0.4)',
      fontMono: "'JetBrains Mono', monospace",
      fontDisplay: "'Chakra Petch', sans-serif",
      labelPrefix: 'RULE ZERO // '
    };
  }
  if (profileId === 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab' || profileId === 'against_the_odds') {
    return {
      primary: '#FACC15',
      secondary: '#F97316',
      accent: '#EF4444',
      glow: 'rgba(250, 204, 21, 0.4)',
      fontMono: "'JetBrains Mono', monospace",
      fontDisplay: "'Montserrat', sans-serif",
      labelPrefix: 'SURVIVAL // '
    };
  }
  // Ancient Dharma (default)
  return {
    primary: '#FDE047',
    secondary: '#D97706',
    accent: '#F59E0B',
    glow: 'rgba(253, 224, 71, 0.45)',
    fontMono: "'JetBrains Mono', monospace",
    fontDisplay: "'Cinzel', serif",
    labelPrefix: 'VEDIC // '
  };
}

/**
 * Creates the 10 Universal Motion Templates configured for a specific profile.
 */
function createUniversalTemplates(profileId: string, profileName: string): MotionTemplate[] {
  const theme = getTheme(profileId);
  const prefix = profileId === 'rule_zero' ? 'rz_' : profileId === 'against_the_odds' ? 'ato_' : 'ad_';

  const templates: MotionTemplate[] = [
    // 1. Highlight / Focus Reticle (Target Tracker & Spotlight)
    {
      id: `${prefix}highlight_reticle`,
      name: 'Highlight & Target Reticle',
      profileId,
      profileName,
      category: 'highlight',
      description: 'Dynamic rotating targeting reticle with expanding focus ring, angled leader line, and kinetic callout tag to point out any artifact, person, carving, or detail.',
      emergingEffect: 'Elastic dual-ring expansion, 4 corner bracket locks, 45° angled leader line drawing, and glowing text reveal.',
      durationFrames: 90,
      fps: 30,
      aspectRatio: '16:9',
      triggerKeywords: ['notice', 'look at', 'observe', 'here', 'feature', 'detail', 'symbol', 'artifact', 'structure', 'face', 'carving', 'point', 'highlight', 'spotlight'],
      soundCue: 'sfx_reticle_lock.wav',
      defaultParams: {
        x: 0.5,
        y: 0.45,
        title: 'FOCAL POINT // ARTIFACT DETAIL',
        subtitle: 'PRECISION ARCHAEOLOGICAL INSPECTION'
      },
      renderSvg: (frame, totalFrames, w, h, params) => {
        const cx = Number(params?.x ?? 0.5) * w;
        const cy = Number(params?.y ?? 0.45) * h;
        const title = params?.title ?? 'FOCAL POINT // ARTIFACT DETAIL';
        const subtitle = params?.subtitle ?? 'PRECISION INSPECTION RETICLE';

        const p = easeOutBack(clamp(frame / 25));
        const rot = frame * 1.5;
        const r1 = 55 * p;
        const r2 = 75 * p;
        const lineP = easeOutCubic(clamp((frame - 15) / 25));
        const textP = easeOutCubic(clamp((frame - 30) / 20));

        // Leader line geometry
        const lx1 = cx + 55;
        const ly1 = cy - 35;
        const lx2 = cx + 140;
        const ly2 = cy - 90;
        const lx3 = lx2 + 200;

        return `
          <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
            <defs>
              <filter id="bloom-hl-${prefix}" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Pulsing Center Reticle Target -->
            <g transform="translate(${cx}, ${cy})">
              <!-- Inner Pulsing Focus Ring -->
              <circle cx="0" cy="0" r="${r1}" fill="none" stroke="${theme.primary}" stroke-width="2" filter="url(#bloom-hl-${prefix})"/>
              <circle cx="0" cy="0" r="4" fill="${theme.primary}"/>

              <!-- Rotating Outer Calibrated Brackets -->
              <g transform="rotate(${rot})">
                <circle cx="0" cy="0" r="${r2}" fill="none" stroke="${theme.secondary}" stroke-width="1.5" stroke-dasharray="14 10"/>
                <line x1="${-(r2 + 10)}" y1="0" x2="${-(r2 - 6)}" y2="0" stroke="${theme.primary}" stroke-width="2.5"/>
                <line x1="${r2 - 6}" y1="0" x2="${r2 + 10}" y2="0" stroke="${theme.primary}" stroke-width="2.5"/>
                <line x1="0" y1="${-(r2 + 10)}" x2="0" y2="${-(r2 - 6)}" stroke="${theme.primary}" stroke-width="2.5"/>
                <line x1="0" y1="${r2 - 6}" x2="0" y2="${r2 + 10}" stroke="${theme.primary}" stroke-width="2.5"/>
              </g>

              <!-- 4 Corner Framing Brackets -->
              <g opacity="${p}">
                <path d="M -90 -70 L -90 -90 L -70 -90" fill="none" stroke="${theme.primary}" stroke-width="2"/>
                <path d="M 90 -70 L 90 -90 L 70 -90" fill="none" stroke="${theme.primary}" stroke-width="2"/>
                <path d="M -90 70 L -90 90 L -70 90" fill="none" stroke="${theme.primary}" stroke-width="2"/>
                <path d="M 90 70 L 90 90 L 70 90" fill="none" stroke="${theme.primary}" stroke-width="2"/>
              </g>

              <!-- Rangefinder Ticks -->
              <text x="80" y="85" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="11" font-weight="700" opacity="${p}">
                TGT: [${Math.round(cx)}, ${Math.round(cy)}]
              </text>
            </g>

            <!-- Angled Laser Leader Line -->
            ${lineP > 0 ? `
              <polyline points="
                ${lx1},${ly1}
                ${lx1 + (lx2 - lx1) * lineP},${ly1 + (ly2 - ly1) * lineP}
                ${lx1 + (lx2 - lx1) * lineP + (lx3 - lx2) * Math.max(0, (lineP - 0.5) * 2)},${ly1 + (ly2 - ly1) * lineP}
              " fill="none" stroke="${theme.primary}" stroke-width="2" filter="url(#bloom-hl-${prefix})"/>
              <circle cx="${lx1}" cy="${ly1}" r="3" fill="#FFF"/>
            ` : ''}

            <!-- Floating Kinetic Callout Typography (Zero Card) -->
            ${textP > 0 ? `
              <g transform="translate(${lx2 + 10}, ${ly2 - 12})" opacity="${textP}">
                <text x="0" y="0" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="13" font-weight="800" letter-spacing="2" filter="drop-shadow(0 2px 8px rgba(0,0,0,0.9))">
                  ${title}
                </text>
                <text x="0" y="22" fill="#E2E8F0" font-family="${theme.fontDisplay}" font-size="16" font-weight="700" letter-spacing="1" filter="drop-shadow(0 2px 8px rgba(0,0,0,0.9))">
                  ${subtitle}
                </text>
              </g>
            ` : ''}
          </svg>
        `;
      }
    },

    // 2. Dynamic Map Route (Path Tracing & Journey Vector)
    {
      id: `${prefix}map_route`,
      name: 'Dynamic Map Route & Path',
      profileId,
      profileName,
      category: 'map',
      description: 'Animated golden/cyan dashed trajectory curve traveling between locations with glowing origin radar, kinetic traveling waypoint beacon, and destination impact.',
      emergingEffect: 'Curved Bezier path stroke-dash drawing, pulsing origin beacon, moving expedition arrow, and destination arrival shockwave.',
      durationFrames: 90,
      fps: 30,
      aspectRatio: '16:9',
      triggerKeywords: ['travel', 'journey', 'route', 'march', 'path', 'sailed', 'spread', 'border', 'map', 'expedition', 'trade route', 'from', 'reach', 'destination', 'conquest'],
      soundCue: 'sfx_route_trace.wav',
      defaultParams: {
        origin: 'ORIGIN // HARBOR',
        destination: 'EXPEDITION // DESTINATION',
        distance: '1,420 KM'
      },
      renderSvg: (frame, totalFrames, w, h, params) => {
        const originLabel = params?.origin ?? 'MUZIRIS // ANCIENT PORT';
        const destLabel = params?.destination ?? 'SRIVIJAYA // STRAIT';
        const distLabel = params?.distance ?? '1,850 KM EXPEDITION';

        const x1 = w * 0.18, y1 = h * 0.65;
        const cx1 = w * 0.38, cy1 = h * 0.30;
        const cx2 = w * 0.62, cy2 = h * 0.75;
        const x2 = w * 0.82, y2 = h * 0.40;

        // Progress along curve
        const t = easeInOutCubic(clamp(frame / 75));

        // Cubic Bezier interpolation
        const bx = Math.pow(1 - t, 3) * x1 + 3 * Math.pow(1 - t, 2) * t * cx1 + 3 * (1 - t) * Math.pow(t, 2) * cx2 + Math.pow(t, 3) * x2;
        const by = Math.pow(1 - t, 3) * y1 + 3 * Math.pow(1 - t, 2) * t * cy1 + 3 * (1 - t) * Math.pow(t, 2) * cy2 + Math.pow(t, 3) * y2;

        const pulse = Math.sin(frame * 0.2) * 6;
        const destArrived = frame >= 75;

        return `
          <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
            <defs>
              <filter id="bloom-map-${prefix}">
                <feGaussianBlur stdDeviation="6" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Guide Route Path -->
            <path d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}"
                  fill="none" stroke="${theme.secondary}" stroke-width="2.5" stroke-dasharray="10 8" opacity="0.4"/>

            <!-- Animated Drawn Trajectory Beam -->
            <path d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}"
                  fill="none" stroke="${theme.primary}" stroke-width="4" stroke-linecap="round"
                  pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - t}"
                  filter="url(#bloom-map-${prefix})"/>

            <!-- Origin Waypoint Radar -->
            <g transform="translate(${x1}, ${y1})">
              <circle cx="0" cy="0" r="${16 + pulse}" fill="none" stroke="${theme.primary}" stroke-width="2" opacity="0.7"/>
              <circle cx="0" cy="0" r="8" fill="${theme.primary}"/>
              <text x="0" y="32" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="12" font-weight="700">
                ${originLabel}
              </text>
            </g>

            <!-- Destination Waypoint Beacon -->
            <g transform="translate(${x2}, ${y2})">
              <circle cx="0" cy="0" r="10" fill="none" stroke="${theme.secondary}" stroke-width="2"/>
              <circle cx="0" cy="0" r="4" fill="${destArrived ? theme.primary : theme.secondary}"/>
              ${destArrived ? `
                <circle cx="0" cy="0" r="${(frame - 75) * 3}" fill="none" stroke="${theme.primary}" stroke-width="2" opacity="${1 - (frame - 75) / 15}"/>
              ` : ''}
              <text x="0" y="-22" text-anchor="middle" fill="${destArrived ? theme.primary : '#E2E8F0'}" font-family="${theme.fontMono}" font-size="12" font-weight="700">
                ${destLabel}
              </text>
            </g>

            <!-- Traveling Marker & Particle Wake -->
            <g transform="translate(${bx}, ${by})">
              <circle cx="0" cy="0" r="14" fill="${theme.primary}" opacity="0.3" filter="url(#bloom-map-${prefix})"/>
              <circle cx="0" cy="0" r="6" fill="#FFF"/>
              <!-- Trail ripples -->
              <circle cx="-12" cy="0" r="4" fill="${theme.secondary}" opacity="0.6"/>
              <circle cx="-22" cy="0" r="2.5" fill="${theme.secondary}" opacity="0.3"/>
            </g>

            <!-- Live Distance Telemetry HUD (Zero Card) -->
            <g transform="translate(${w * 0.5}, ${h * 0.88})">
              <text x="0" y="0" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="24" font-weight="900" filter="drop-shadow(0 3px 8px rgba(0,0,0,0.95))">
                ${distLabel} <tspan fill="#FFF" font-size="16">// ${(t * 100).toFixed(0)}% TRANSIT</tspan>
              </text>
            </g>
          </svg>
        `;
      }
    },

    // 3. Volumetric Lighting & God Ray Sweep (Atmospheric Reveal)
    {
      id: `${prefix}lighting_sweep`,
      name: 'Volumetric Lighting & Reveal Sweep',
      profileId,
      profileName,
      category: 'lighting',
      description: 'Cinematic volumetric light cone sweeping dynamically across the background video with floating atmospheric dust particle motes and focal point illumination.',
      emergingEffect: 'Linear cone rotation, volumetric luminosity gradient sweep, and drifting Brownian particle motes.',
      durationFrames: 90,
      fps: 30,
      aspectRatio: '16:9',
      triggerKeywords: ['light', 'illuminate', 'reveal', 'sun', 'beam', 'darkness', 'shines', 'sacred', 'glow', 'dawn', 'solstice', 'sunbeam', 'temple light', 'god ray'],
      soundCue: 'sfx_celestial_sweep.wav',
      defaultParams: {
        angle: 45,
        label: 'SOLAR ALIGNMENT // VOLUMETRIC ILLUMINATION'
      },
      renderSvg: (frame, totalFrames, w, h, params) => {
        const label = params?.label ?? 'VOLUMETRIC ILLUMINATION // SOLAR ALIGNMENT';
        const sweepProgress = easeInOutCubic(clamp(frame / 80));
        const coneAngle = -25 + sweepProgress * 50; // -25° to +25°
        const originX = w * 0.5;
        const originY = -50;

        // Particle motes drifting
        const particles = Array.from({ length: 24 }).map((_, i) => {
          const px = (originX - 300) + ((i * 47 + frame * 1.5) % 800);
          const py = 120 + ((i * 37 + frame * 2.2) % (h * 0.75));
          const size = 1.5 + (i % 3);
          const op = 0.2 + 0.6 * Math.sin((frame + i * 10) * 0.1);
          return `<circle cx="${px}" cy="${py}" r="${size}" fill="${theme.primary}" opacity="${op}"/>`;
        }).join('');

        return `
          <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
            <defs>
              <linearGradient id="vol-beam-${prefix}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.85"/>
                <stop offset="20%" stop-color="${theme.primary}" stop-opacity="0.5"/>
                <stop offset="65%" stop-color="${theme.secondary}" stop-opacity="0.15"/>
                <stop offset="100%" stop-color="${theme.secondary}" stop-opacity="0"/>
              </linearGradient>
              <filter id="flare-glow-${prefix}">
                <feGaussianBlur stdDeviation="10" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Overhead Radiant Celestial Source -->
            <circle cx="${originX}" cy="${originY + 60}" r="80" fill="${theme.primary}" opacity="0.35" filter="url(#flare-glow-${prefix})"/>
            <circle cx="${originX}" cy="${originY + 60}" r="30" fill="#FFF" opacity="0.8"/>

            <!-- Volumetric Light Beam Cone -->
            <g transform="translate(${originX}, ${originY + 60}) rotate(${coneAngle})">
              <!-- Central Core Beam -->
              <polygon points="0,0 -220,${h * 1.2} 220,${h * 1.2}" fill="url(#vol-beam-${prefix})"/>
              <!-- Secondary Fringes -->
              <polygon points="0,0 -360,${h * 1.2} -200,${h * 1.2}" fill="url(#vol-beam-${prefix})" opacity="0.4"/>
              <polygon points="0,0 200,${h * 1.2} 360,${h * 1.2}" fill="url(#vol-beam-${prefix})" opacity="0.4"/>
            </g>

            <!-- Floating Atmospheric Dust Motes -->
            <g>${particles}</g>

            <!-- Illuminating Target Reticle at Bottom -->
            <g transform="translate(${originX + coneAngle * 10}, ${h * 0.72})" opacity="${clamp(frame / 20)}">
              <ellipse cx="0" cy="0" rx="90" ry="25" fill="none" stroke="${theme.primary}" stroke-width="2" stroke-dasharray="6 6" filter="url(#flare-glow-${prefix})"/>
              <ellipse cx="0" cy="0" rx="40" ry="12" fill="${theme.primary}" opacity="0.2"/>
            </g>

            <!-- Telemetry Label -->
            <g transform="translate(${w * 0.5}, ${h * 0.90})" opacity="${clamp(frame / 20)}">
              <text x="0" y="0" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="14" font-weight="800" letter-spacing="3" filter="drop-shadow(0 2px 8px rgba(0,0,0,0.9))">
                ${label}
              </text>
            </g>
          </svg>
        `;
      }
    },

    // 4. Distance & Dimension Caliper (Laser Measurement Ruler)
    {
      id: `${prefix}distance_caliper`,
      name: 'Distance & Dimension Caliper',
      profileId,
      profileName,
      category: 'measurement',
      description: 'Schematic dimension overlay for a supplied distance or span. Positions are illustrative; this does not measure the footage.',
      emergingEffect: 'Opposing anchor crosshairs drop, dimension line stretches between them, and numeric distance odometer spins up.',
      durationFrames: 90,
      fps: 30,
      aspectRatio: '16:9',
      triggerKeywords: ['miles', 'kilometers', 'distance', 'span', 'wide', 'across', 'meters', 'length', 'thickness', 'measurement', 'size', 'reach', 'dimensions', 'separated', 'scale'],
      soundCue: 'sfx_digital_tick.wav',
      defaultParams: {
        valNumber: 1240,
        unit: 'KM',
        label: 'RECORDED SPAN // GEOGRAPHIC DISTANCE'
      },
      renderSvg: (frame, totalFrames, w, h, params) => {
        const maxVal = Number(params?.valNumber ?? 1240);
        const unit = params?.unit ?? 'KM';
        const label = params?.label ?? 'RECORDED SPAN // GEOGRAPHIC DISTANCE';

        const y = h * 0.52;
        const x1 = w * 0.18;
        const x2 = w * 0.82;

        const stretchP = easeOutCubic(clamp(frame / 35));
        const currentX2 = x1 + (x2 - x1) * stretchP;
        const currentVal = Math.round(maxVal * easeOutCubic(clamp((frame - 10) / 45)));

        return `
          <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
            <defs>
              <filter id="caliper-bloom-${prefix}">
                <feGaussianBlur stdDeviation="4" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Anchor A (Start) -->
            <g transform="translate(${x1}, ${y})">
              <!-- Perpendicular End Stop -->
              <line x1="0" y1="-35" x2="0" y2="35" stroke="${theme.primary}" stroke-width="3"/>
              <circle cx="0" cy="0" r="6" fill="${theme.primary}"/>
              <circle cx="0" cy="0" r="14" fill="none" stroke="${theme.primary}" stroke-width="1.5" stroke-dasharray="4 4"/>
              <text x="0" y="55" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="12" font-weight="700">POINT A</text>
            </g>

            <!-- Extending Caliper Laser Line -->
            <line x1="${x1}" y1="${y}" x2="${currentX2}" y2="${y}" stroke="${theme.primary}" stroke-width="3.5" filter="url(#caliper-bloom-${prefix})"/>

            <!-- Dimension Tick Marks along Ruler -->
            ${Array.from({ length: 9 }).map((_, i) => {
              const tx = x1 + (x2 - x1) * (i / 8);
              if (tx > currentX2) return '';
              const isMajor = i === 0 || i === 4 || i === 8;
              return `
                <line x1="${tx}" y1="${y - (isMajor ? 14 : 7)}" x2="${tx}" y2="${y + (isMajor ? 14 : 7)}" stroke="${theme.primary}" stroke-width="${isMajor ? 2 : 1}"/>
              `;
            }).join('')}

            <!-- Anchor B (Current/End) -->
            <g transform="translate(${currentX2}, ${y})">
              <!-- Perpendicular End Stop -->
              <line x1="0" y1="-35" x2="0" y2="35" stroke="${theme.primary}" stroke-width="3"/>
              <circle cx="0" cy="0" r="6" fill="${theme.primary}"/>
              <circle cx="0" cy="0" r="14" fill="none" stroke="${theme.primary}" stroke-width="1.5" stroke-dasharray="4 4"/>
              <text x="0" y="55" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="12" font-weight="700">POINT B</text>
            </g>

            <!-- Center Digital Distance Ticker (Zero Card) -->
            <g transform="translate(${(x1 + currentX2) * 0.5}, ${y - 35})">
              <text x="0" y="0" text-anchor="middle" fill="#FFFFFF" font-family="${theme.fontMono}" font-size="34" font-weight="900" filter="drop-shadow(0 3px 10px rgba(0,0,0,0.95))">
                ${currentVal.toLocaleString()} <tspan fill="${theme.primary}">${unit}</tspan>
              </text>
              <text x="0" y="-38" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="13" font-weight="800" letter-spacing="2">
                ${label}
              </text>
            </g>
          </svg>
        `;
      }
    },

    // 5. Horizontal Timeline & Era Scrubber (Historical Milestones)
    {
      id: `${prefix}timeline_scrubber`,
      name: 'Horizontal Timeline & Era Scrubber',
      profileId,
      profileName,
      category: 'timeline',
      description: 'Sleek historical timeline bar gliding horizontally across milestones with glowing cursor, rolling century/year ticker, and era title reveal.',
      emergingEffect: 'Linear axis draw, sequential milestone node pings, and diamond cursor slide with rolling year ticker.',
      durationFrames: 90,
      fps: 30,
      aspectRatio: '16:9',
      triggerKeywords: ['century', 'year', 'bce', 'ce', 'era', 'period', 'timeline', 'decades', 'later', 'history', 'ancient', 'reign', 'dates', 'chronology', 'millennia'],
      soundCue: 'sfx_timeline_slide.wav',
      defaultParams: {
        startYear: '1500 BCE',
        currentYear: '250 BCE',
        endYear: '1000 CE',
        eraName: 'EXAMPLE ERA'
      },
      renderSvg: (frame, totalFrames, w, h, params) => {
        const startYear = params?.startYear ?? '1500 BCE';
        const currentYear = params?.currentYear ?? '250 BCE';
        const endYear = params?.endYear ?? '1000 CE';
        const eraName = params?.eraName ?? 'MAURYAN GOLDEN AGE';

        const y = h * 0.78;
        const xStart = w * 0.15;
        const xEnd = w * 0.85;
        const axisLen = xEnd - xStart;

        const p = easeInOutCubic(clamp(frame / 60));
        const cursorX = xStart + axisLen * (0.15 + p * 0.45);

        return `
          <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
            <defs>
              <filter id="time-bloom-${prefix}">
                <feGaussianBlur stdDeviation="5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Horizontal Master Timeline Axis -->
            <line x1="${xStart}" y1="${y}" x2="${xEnd}" y2="${y}" stroke="${theme.secondary}" stroke-width="2.5" opacity="0.6"/>
            <!-- Active Timeline Segment -->
            <line x1="${xStart}" y1="${y}" x2="${cursorX}" y2="${y}" stroke="${theme.primary}" stroke-width="4" filter="url(#time-bloom-${prefix})"/>

            <!-- Milestones Ticks along Axis -->
            ${Array.from({ length: 7 }).map((_, i) => {
              const mx = xStart + (axisLen * i) / 6;
              const isPast = mx <= cursorX;
              return `
                <circle cx="${mx}" cy="${y}" r="${isPast ? 5 : 3.5}" fill="${isPast ? theme.primary : theme.secondary}"/>
                <line x1="${mx}" y1="${y - 10}" x2="${mx}" y2="${y + 10}" stroke="${isPast ? theme.primary : theme.secondary}" stroke-width="1.5"/>
              `;
            }).join('')}

            <!-- Start & End Date Labels -->
            <text x="${xStart}" y="${y + 35}" text-anchor="middle" fill="${theme.secondary}" font-family="${theme.fontMono}" font-size="13" font-weight="700">${startYear}</text>
            <text x="${xEnd}" y="${y + 35}" text-anchor="middle" fill="${theme.secondary}" font-family="${theme.fontMono}" font-size="13" font-weight="700">${endYear}</text>

            <!-- Luminous Sliding Cursor -->
            <g transform="translate(${cursorX}, ${y})">
              <polygon points="0,-18 12,0 0,18 -12,0" fill="${theme.primary}" filter="url(#time-bloom-${prefix})"/>
              <line x1="0" y1="-50" x2="0" y2="0" stroke="${theme.primary}" stroke-width="2.5" stroke-dasharray="4 2"/>
              <circle cx="0" cy="0" r="3" fill="#FFF"/>
            </g>

            <!-- Active Era Callout Banner (Zero Card) -->
            <g transform="translate(${cursorX}, ${y - 65})">
              <text x="0" y="0" text-anchor="middle" fill="#FFFFFF" font-family="${theme.fontMono}" font-size="32" font-weight="900" filter="drop-shadow(0 3px 10px rgba(0,0,0,0.95))">
                ${currentYear}
              </text>
              <text x="0" y="24" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontDisplay}" font-size="15" font-weight="700" letter-spacing="2">
                ${eraName}
              </text>
            </g>
          </svg>
        `;
      }
    },

    // 6. Vertical Scale & Elevation Scanner (Height & Depth Gauge)
    {
      id: `${prefix}scale_scanner`,
      name: 'Vertical Scale & Elevation Gauge',
      profileId,
      profileName,
      category: 'scale',
      description: 'Dynamic vertical laser elevator scanning from ground level to structure height with calibrated elevation ticks, rising laser datum, and live meter ticker.',
      emergingEffect: 'Vertical laser axis ascent, animated horizontal datum line sweep, and digital height accumulation.',
      durationFrames: 90,
      fps: 30,
      aspectRatio: '16:9',
      triggerKeywords: ['height', 'tall', 'elevation', 'meters', 'feet', 'high', 'altitude', 'depth', 'structure', 'tower', 'vimana', 'pyramid', 'monument', 'scale', 'vertical'],
      soundCue: 'sfx_laser_scan.wav',
      defaultParams: {
        maxHeight: 66,
        unit: 'METERS',
        label: 'MONUMENTAL ELEVATION // VERTICAL SUMMIT'
      },
      renderSvg: (frame, totalFrames, w, h, params) => {
        const maxHeight = Number(params?.maxHeight ?? 66);
        const unit = params?.unit ?? 'METERS';
        const label = params?.label ?? 'MONUMENTAL ELEVATION // VERTICAL SUMMIT';

        const x = w * 0.22;
        const yGround = h * 0.85;
        const yTop = h * 0.22;
        const scanP = easeOutCubic(clamp(frame / 60));
        const currentY = yGround - (yGround - yTop) * scanP;
        const currentHeight = (maxHeight * scanP).toFixed(1);

        return `
          <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
            <defs>
              <filter id="scale-bloom-${prefix}">
                <feGaussianBlur stdDeviation="5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Vertical Ruler Bar -->
            <line x1="${x}" y1="${yGround}" x2="${x}" y2="${yTop - 20}" stroke="${theme.secondary}" stroke-width="2.5" opacity="0.6"/>

            <!-- Elevation Calibrated Ticks -->
            ${Array.from({ length: 11 }).map((_, i) => {
              const ty = yGround - ((yGround - yTop) * i) / 10;
              const isPast = ty >= currentY;
              const val = Math.round((maxHeight * i) / 10);
              return `
                <line x1="${x - 12}" y1="${ty}" x2="${x}" y2="${ty}" stroke="${isPast ? theme.primary : theme.secondary}" stroke-width="${i % 5 === 0 ? 2.5 : 1.5}"/>
                <text x="${x - 22}" y="${ty + 4}" text-anchor="end" fill="${isPast ? theme.primary : theme.secondary}" font-family="${theme.fontMono}" font-size="11" font-weight="700">
                  ${val} ${unit}
                </text>
              `;
            }).join('')}

            <!-- Horizontal Laser Datum Line (Sweeps across the scene) -->
            <line x1="${x}" y1="${currentY}" x2="${w * 0.85}" y2="${currentY}" stroke="${theme.primary}" stroke-width="2.5" stroke-dasharray="12 6" filter="url(#scale-bloom-${prefix})"/>

            <!-- Elevator Cursor Beacon -->
            <g transform="translate(${x}, ${currentY})">
              <circle cx="0" cy="0" r="7" fill="${theme.primary}" filter="url(#scale-bloom-${prefix})"/>
              <circle cx="0" cy="0" r="3" fill="#FFF"/>
            </g>

            <!-- Floating Height Readout (Zero Card) -->
            <g transform="translate(${w * 0.5}, ${currentY - 25})">
              <text x="0" y="0" text-anchor="middle" fill="#FFFFFF" font-family="${theme.fontMono}" font-size="36" font-weight="900" filter="drop-shadow(0 3px 10px rgba(0,0,0,0.95))">
                ${currentHeight} <tspan fill="${theme.primary}">${unit}</tspan>
              </text>
              <text x="0" y="-36" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="12" font-weight="800" letter-spacing="2">
                ${label}
              </text>
            </g>
          </svg>
        `;
      }
    },

    // 7. Radial Stat Gauge & Metric Counter (Data & Percentage Dial)
    {
      id: `${prefix}radial_metric`,
      name: 'Radial Stat Gauge & Metric Counter',
      profileId,
      profileName,
      category: 'metric',
      description: 'High-tech radial progress gauge sweeping smoothly with large kinetic central number odometer, orbital satellite marker, and statistical trend indicator.',
      emergingEffect: 'Circular arc fill sweep (0° to 280°), number odometer spin-up, and orbital beacon pulse.',
      durationFrames: 90,
      fps: 30,
      aspectRatio: '16:9',
      triggerKeywords: ['percent', 'percentage', 'stat', 'number', 'ratio', 'count', 'increase', 'decrease', 'population', 'pure', 'rate', 'data', 'majority', 'accuracy'],
      soundCue: 'sfx_gauge_fill.wav',
      defaultParams: {
        targetPercent: 88,
        label: 'EXAMPLE PERCENTAGE',
        sublabel: 'REPLACE WITH YOUR VERIFIED VALUE'
      },
      renderSvg: (frame, totalFrames, w, h, params) => {
        const targetPercent = Number(params?.targetPercent ?? 88);
        const label = params?.label ?? 'COMPUTED STATISTIC // DATA RATIO';
        const sublabel = params?.sublabel ?? 'CALCULATED EMPIRICAL METRIC';

        const cx = w * 0.5;
        const cy = h * 0.48;
        const radius = 110;

        const p = easeOutCubic(clamp(frame / 50));
        const currentPercent = Math.round(targetPercent * p);

        // Circumference
        const circ = 2 * Math.PI * radius;
        // Arc covers 75% of circle max (270 deg)
        const arcMax = circ * 0.75;
        const offset = circ - arcMax * (currentPercent / 100);

        const orbAngle = (135 + 270 * (currentPercent / 100)) * (Math.PI / 180);
        const orbx = cx + radius * Math.cos(orbAngle);
        const orby = cy + radius * Math.sin(orbAngle);

        return `
          <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
            <defs>
              <filter id="gauge-bloom-${prefix}">
                <feGaussianBlur stdDeviation="6" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Background Outer Gauge Track -->
            <g transform="translate(${cx}, ${cy}) rotate(135)">
              <circle cx="0" cy="0" r="${radius}" fill="none" stroke="${theme.secondary}" stroke-width="8" stroke-dasharray="${arcMax} ${circ}" opacity="0.35"/>
              <!-- Active Progress Arc -->
              <circle cx="0" cy="0" r="${radius}" fill="none" stroke="${theme.primary}" stroke-width="9"
                      stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"
                      filter="url(#gauge-bloom-${prefix})"/>
            </g>

            <!-- Orbital Satellite Pip -->
            <circle cx="${orbx}" cy="${orby}" r="7" fill="#FFFFFF" filter="url(#gauge-bloom-${prefix})"/>
            <circle cx="${orbx}" cy="${orby}" r="14" fill="none" stroke="${theme.primary}" stroke-width="2"/>

            <!-- Center Data Number Odometer (Zero Card) -->
            <g transform="translate(${cx}, ${cy - 10})">
              <text x="0" y="20" text-anchor="middle" fill="#FFFFFF" font-family="${theme.fontMono}" font-size="54" font-weight="900" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.95))">
                ${currentPercent}<tspan fill="${theme.primary}" font-size="34">%</tspan>
              </text>
            </g>

            <!-- Metric Labeling Header & Footer -->
            <g transform="translate(${cx}, ${cy + 95})">
              <text x="0" y="0" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="14" font-weight="800" letter-spacing="2">
                ${label}
              </text>
              <text x="0" y="24" text-anchor="middle" fill="#CBD5E1" font-family="${theme.fontDisplay}" font-size="13" font-weight="600" letter-spacing="1">
                ${sublabel}
              </text>
            </g>
          </svg>
        `;
      }
    },

    // 8. Inspection Loupe & Detail Zoom (Micro-Analysis Lens)
    {
      id: `${prefix}magnifier_loupe`,
      name: 'Inspection Focus Ring',
      profileId,
      profileName,
      category: 'magnifier',
      description: 'Decorative focus ring with rotating crosshairs and an editable label. It does not magnify the underlying footage.',
      emergingEffect: 'Circular loupe spring slide into position, dual reticle rotation, and optic rim reflection pulse.',
      durationFrames: 90,
      fps: 30,
      aspectRatio: '16:9',
      triggerKeywords: ['magnify', 'zoom', 'microscopic', 'detail', 'closer', 'inspection', 'lens', 'evidence', 'examine', 'reveal', 'grain', 'texture', 'coin', 'carving'],
      soundCue: 'sfx_camera_focus.wav',
      defaultParams: {
        x: 0.5,
        y: 0.45,
        zoom: 'DETAIL',
        label: 'OPTICAL MAGNIFICATION // SURFACE INSPECTION'
      },
      renderSvg: (frame, totalFrames, w, h, params) => {
        const cx = Number(params?.x ?? 0.5) * w;
        const cy = Number(params?.y ?? 0.45) * h;
        const zoom = params?.zoom ?? 'DETAIL';
        const label = params?.label ?? 'OPTICAL INSPECTION // MICRO-DETAIL';

        const p = easeOutBack(clamp(frame / 30));
        const r = 130 * p;
        const rot = frame * 1.2;

        return `
          <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
            <defs>
              <filter id="loupe-bloom-${prefix}">
                <feGaussianBlur stdDeviation="5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <g transform="translate(${cx}, ${cy})">
              <!-- Loupe Outer Brass/Gold Bezel -->
              <circle cx="0" cy="0" r="${r}" fill="none" stroke="${theme.primary}" stroke-width="4" filter="url(#loupe-bloom-${prefix})"/>
              <circle cx="0" cy="0" r="${r + 14}" fill="none" stroke="${theme.secondary}" stroke-width="1.5" stroke-dasharray="16 8"/>

              <!-- Counter-Rotating Vernier Caliper Degrees -->
              <g transform="rotate(${rot})">
                ${Array.from({ length: 12 }).map((_, i) => {
                  const a = (i * 30 * Math.PI) / 180;
                  const x1 = Math.cos(a) * (r - 12);
                  const y1 = Math.sin(a) * (r - 12);
                  const x2 = Math.cos(a) * r;
                  const y2 = Math.sin(a) * r;
                  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${theme.primary}" stroke-width="2"/>`;
                }).join('')}
              </g>

              <!-- Central Crosshairs -->
              <line x1="-${r * 0.7}" y1="0" x2="${r * 0.7}" y2="0" stroke="${theme.primary}" stroke-width="1" stroke-dasharray="8 6"/>
              <line x1="0" y1="-${r * 0.7}" x2="0" y2="${r * 0.7}" stroke="${theme.primary}" stroke-width="1" stroke-dasharray="8 6"/>
              <circle cx="0" cy="0" r="18" fill="none" stroke="${theme.primary}" stroke-width="1.5"/>

              <!-- Optic Glass Curvature Reflection Arc -->
              <path d="M -${r * 0.7} -${r * 0.4} A ${r * 0.8} ${r * 0.8} 0 0 1 ${r * 0.5} -${r * 0.6}" fill="none" stroke="#FFFFFF" stroke-width="3" opacity="0.6"/>

              <!-- Dynamic Zoom Badge -->
              <g transform="translate(0, ${r + 42})" opacity="${p}">
                <text x="0" y="0" text-anchor="middle" fill="#FFFFFF" font-family="${theme.fontMono}" font-size="24" font-weight="900" filter="drop-shadow(0 3px 8px rgba(0,0,0,0.9))">
                  FOCUS <tspan fill="${theme.primary}">${zoom}</tspan>
                </text>
                <text x="0" y="22" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="12" font-weight="700" letter-spacing="2">
                  ${label}
                </text>
              </g>
            </g>
          </svg>
        `;
      }
    },

    // 9. Side-by-Side Comparison Split (Versus / Dual Metric Divider)
    {
      id: `${prefix}comparison_split`,
      name: 'Side-by-Side Comparison Split',
      profileId,
      profileName,
      category: 'comparison',
      description: 'Laser dividing seam slicing down the screen center with contrasting left/right metric readouts to contrast theories, factions, before/after, or myth vs evidence.',
      emergingEffect: 'Vertical laser slice downward, outward acoustic pulse wave, and dual-wing typography fade-in.',
      durationFrames: 90,
      fps: 30,
      aspectRatio: '16:9',
      triggerKeywords: ['compare', 'versus', 'vs', 'difference', 'myth', 'evidence', 'before', 'after', 'opposing', 'theory', 'split', 'contrast', 'two sides'],
      soundCue: 'sfx_laser_slice.wav',
      defaultParams: {
        leftTitle: 'CONVENTIONAL BELIEF',
        leftDesc: 'FIRST ACCOUNT',
        rightTitle: 'ARCHAEOLOGICAL FINDINGS',
        rightDesc: 'SECOND ACCOUNT'
      },
      renderSvg: (frame, totalFrames, w, h, params) => {
        const leftTitle = params?.leftTitle ?? 'CONVENTIONAL BELIEF';
        const leftDesc = params?.leftDesc ?? 'TRADITIONAL NARRATIVE';
        const rightTitle = params?.rightTitle ?? 'EMPIRICAL EVIDENCE';
        const rightDesc = params?.rightDesc ?? 'RADIO-CARBON EXCAVATION';

        const midX = w * 0.5;
        const sliceP = easeOutCubic(clamp(frame / 30));
        const textP = easeOutCubic(clamp((frame - 20) / 25));

        return `
          <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
            <defs>
              <filter id="split-bloom-${prefix}">
                <feGaussianBlur stdDeviation="6" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Center Vertical Laser Slicing Beam -->
            <line x1="${midX}" y1="0" x2="${midX}" y2="${h * sliceP}" stroke="${theme.primary}" stroke-width="4" filter="url(#split-bloom-${prefix})"/>

            <!-- Center Impact Shockwave & Reticle -->
            ${frame >= 25 ? `
              <circle cx="${midX}" cy="${h * 0.5}" r="${(frame - 25) * 4}" fill="none" stroke="${theme.primary}" stroke-width="2" opacity="${1 - (frame - 25) / 20}"/>
              <circle cx="${midX}" cy="${h * 0.5}" r="10" fill="${theme.primary}"/>
              <text x="${midX}" y="${h * 0.5 - 20}" text-anchor="middle" fill="#FFFFFF" font-family="${theme.fontMono}" font-size="14" font-weight="900">VS</text>
            ` : ''}

            <!-- Left Wing: Side A (Zero Card) -->
            <g transform="translate(${midX - 80}, ${h * 0.5})" opacity="${textP}">
              <text x="0" y="-15" text-anchor="end" fill="#F87171" font-family="${theme.fontMono}" font-size="14" font-weight="800" letter-spacing="2">
                SIDE A // PERSPECTIVE
              </text>
              <text x="0" y="18" text-anchor="end" fill="#FFFFFF" font-family="${theme.fontDisplay}" font-size="28" font-weight="900" filter="drop-shadow(0 3px 10px rgba(0,0,0,0.9))">
                ${leftTitle}
              </text>
              <text x="0" y="45" text-anchor="end" fill="#CBD5E1" font-family="sans-serif" font-size="14" font-weight="600">
                ${leftDesc}
              </text>
            </g>

            <!-- Right Wing: Side B (Zero Card) -->
            <g transform="translate(${midX + 80}, ${h * 0.5})" opacity="${textP}">
              <text x="0" y="-15" text-anchor="start" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="14" font-weight="800" letter-spacing="2">
                SIDE B // PERSPECTIVE
              </text>
              <text x="0" y="18" text-anchor="start" fill="#FFFFFF" font-family="${theme.fontDisplay}" font-size="28" font-weight="900" filter="drop-shadow(0 3px 10px rgba(0,0,0,0.9))">
                ${rightTitle}
              </text>
              <text x="0" y="45" text-anchor="start" fill="#CBD5E1" font-family="sans-serif" font-size="14" font-weight="600">
                ${rightDesc}
              </text>
            </g>
          </svg>
        `;
      }
    },

    // 10. Kinetic Flow Vector & Direction Arrow (Process / Movement Stream)
    {
      id: `${prefix}flow_vector`,
      name: 'Kinetic Flow Vector & Movement Arrow',
      profileId,
      profileName,
      category: 'flow',
      description: 'Continuous directional vector arrows streaming along organic curved pathways to visualize water currents, river basins, wind dynamics, or process flow.',
      emergingEffect: 'Curved vector spline reveal, animated cycling chevrons, and speed telemetry counter.',
      durationFrames: 90,
      fps: 30,
      aspectRatio: '16:9',
      triggerKeywords: ['flow', 'stream', 'river', 'water', 'wind', 'current', 'direction', 'movement', 'channel', 'drainage', 'process', 'step', 'cycle', 'circulation'],
      soundCue: 'sfx_wind_flow.wav',
      defaultParams: {
        speed: '3.8 M/S',
        label: 'CONTINUOUS HYDRODYNAMIC DRAINAGE VECTOR'
      },
      renderSvg: (frame, totalFrames, w, h, params) => {
        const speed = params?.speed ?? '3.8 M/S';
        const label = params?.label ?? 'CONTINUOUS DIRECTIONAL FLOW VECTOR';

        const y = h * 0.55;
        const xStart = w * 0.12;
        const xEnd = w * 0.88;
        const len = xEnd - xStart;

        // Animated travelling chevrons
        const chevronOffset = (frame * 5) % 80;

        return `
          <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
            <defs>
              <filter id="flow-bloom-${prefix}">
                <feGaussianBlur stdDeviation="5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Base Guideway Flow Channel -->
            <path d="M ${xStart} ${y} C ${w * 0.35} ${y - 80}, ${w * 0.65} ${y + 80}, ${xEnd} ${y}"
                  fill="none" stroke="${theme.secondary}" stroke-width="4" opacity="0.3"/>

            <!-- Glowing Kinetic Flow Spline -->
            <path d="M ${xStart} ${y} C ${w * 0.35} ${y - 80}, ${w * 0.65} ${y + 80}, ${xEnd} ${y}"
                  fill="none" stroke="${theme.primary}" stroke-width="3" filter="url(#flow-bloom-${prefix})"/>

            <!-- Moving Directional Chevron Pulses -->
            ${Array.from({ length: 9 }).map((_, i) => {
              const t = ((i * 110 + chevronOffset) % (len)) / len;
              // Bezier interpolation
              const bx = Math.pow(1 - t, 3) * xStart + 3 * Math.pow(1 - t, 2) * t * (w * 0.35) + 3 * (1 - t) * Math.pow(t, 2) * (w * 0.65) + Math.pow(t, 3) * xEnd;
              const by = Math.pow(1 - t, 3) * y + 3 * Math.pow(1 - t, 2) * t * (y - 80) + 3 * (1 - t) * Math.pow(t, 2) * (y + 80) + Math.pow(t, 3) * y;
              return `
                <g transform="translate(${bx}, ${by})">
                  <polygon points="-8,-12 4,0 -8,12 0,12 12,0 0,-12" fill="${theme.primary}" opacity="${0.4 + 0.6 * Math.sin(t * Math.PI)}" filter="url(#flow-bloom-${prefix})"/>
                </g>
              `;
            }).join('')}

            <!-- Telemetry Indicator Banner (Zero Card) -->
            <g transform="translate(${w * 0.5}, ${y + 110})">
              <text x="0" y="0" text-anchor="middle" fill="#FFFFFF" font-family="${theme.fontMono}" font-size="28" font-weight="900" filter="drop-shadow(0 3px 8px rgba(0,0,0,0.9))">
                VELOCITY: <tspan fill="${theme.primary}">${speed}</tspan>
              </text>
              <text x="0" y="24" text-anchor="middle" fill="${theme.primary}" font-family="${theme.fontMono}" font-size="12" font-weight="700" letter-spacing="2">
                ${label}
              </text>
            </g>
          </svg>
        `;
      }
    }
  ];
  // Escape every supplied/default label before inserting it into SVG markup.
  // Legacy layouts use a landscape design canvas, fitted inside either output format.
  const safeTemplates = templates.map(template => ({
    ...template,
    renderSvg: (frame: number, totalFrames: number, w: number, h: number, params?: Record<string, string | number>) => {
      const safe = Object.fromEntries(Object.entries({ ...template.defaultParams, ...params }).map(([key, value]) => {
        if (typeof template.defaultParams?.[key] === 'number') {
          const numeric = Number(value);
          const max = key === 'targetPercent' ? 100 : key === 'x' || key === 'y' ? 1 : 1e9;
          return [key, Math.max(0, Math.min(max, Number.isFinite(numeric) ? numeric : 0))];
        }
        return [key, escapeSvgText(String(value))];
      }));
      const progress = clamp(frame / Math.max(1, totalFrames - 1));
      const raw = template.renderSvg(progress * (template.durationFrames - 1), template.durationFrames, 1920, 1080, safe);
      const inner = raw.slice(raw.indexOf('>') + 1, raw.lastIndexOf('</svg>'));
      const scale = Math.min(w / 1920, h / 1080);
      const opacity = easeOutCubic(progress / 0.08) * easeOutCubic((1-progress) / 0.10);
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%"><g opacity="${opacity}" transform="translate(${(w-1920*scale)/2},${(h-1080*scale)/2}) scale(${scale})">${inner}</g></svg>`;
    },
  }));
  return [...safeTemplates, ...createReusableTemplates(profileId, profileName, theme.primary, theme.secondary, prefix)];
}

// Generate 30 reusable templates for Ancient Dharma, Rule Zero, and Against the Odds
export const ANCIENT_DHARMA_TEMPLATES: MotionTemplate[] = createUniversalTemplates('default', 'Ancient Dharma');
export const RULE_ZERO_TEMPLATES: MotionTemplate[] = createUniversalTemplates('rule_zero', 'Rule Zero');
export const AGAINST_THE_ODDS_TEMPLATES: MotionTemplate[] = createUniversalTemplates('against_the_odds', 'Against the Odds');

/**
 * Returns the motion graphics templates tailored to the selected channel profile.
 */
export function getTemplatesForProfile(profileId: string): MotionTemplate[] {
  if (profileId === 'acct_3ea89878-0f41-4dc9-86e5-3f55cda46ef7' || profileId === 'rule_zero') {
    return RULE_ZERO_TEMPLATES;
  }
  if (profileId === 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab' || profileId === 'against_the_odds') {
    return AGAINST_THE_ODDS_TEMPLATES;
  }
  return ANCIENT_DHARMA_TEMPLATES;
}

/**
 * Sample demo contents for UI testing and demonstration.
 */
export function templateDemoContent(templateId: string): { items: { text: string }[] } {
  const contentMap: Record<string, string[]> = {
    highlight_reticle: ['Target Detail Inspection', 'Carved Stele Inscription', 'Focus Point Reticle', 'Precision Visual Lock'],
    map_route: ['Trade Route Corridor', 'Expedition Waypoint A', 'Transit Trajectory', 'Destination Waypoint B'],
    lighting_sweep: ['Volumetric Sunbeam Sweep', 'Solar Solstice Alignment', 'Celestial God Ray', 'Atmospheric Particle Motes'],
    distance_caliper: ['Measurement Caliper', 'Point A to Point B Span', 'Geographic Distance', '1,240 Kilometers Span'],
    timeline_scrubber: ['Historical Era Chronology', '1500 BCE Initial Era', '250 BCE Golden Period', '1000 CE Milestone'],
    scale_scanner: ['Monumental Elevation Bar', 'Ground Datum 0m', 'Ascending Laser Scan', 'Peak Summit 66m'],
    radial_metric: ['Statistical Ratio Gauge', '88% Calculated Metric', 'Radial Progress Arc', 'Empirical Verification'],
    magnifier_loupe: ['Optical Inspection Loupe', '8.5X Magnification', 'Micro-Detail Analysis', 'Surface Reticle Inspection'],
    comparison_split: ['Side-by-Side Slicing Laser', 'Conventional View', 'Empirical Findings', 'Dual Metric Comparison'],
    flow_vector: ['Directional Flow Channel', 'Hydrodynamic Vector', 'Speed 3.8 m/s', 'Continuous Directional Motion']
  };

  const matched = Object.entries(contentMap).find(([key]) => templateId.includes(key));
  const lines = matched ? matched[1] : [
    'Universal Motion Graphic',
    'Foundational Kinetic Template',
    'Zero-Card 100% Transparent Overlay',
    'Fits Every Documentary Scene'
  ];

  return { items: lines.map(text => ({ text })) };
}

/**
 * Automatically selects the best universal template matching words in the scene script.
 */
export function findMatchingTemplate(scriptText: string, profileId: string): MotionTemplate | null {
  const templates = getTemplatesForProfile(profileId);
  const words = ` ${scriptText.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()} `;
  const ranked = templates.map(template => ({ template, score: template.triggerKeywords.filter(keyword => {
    const normalized = keyword.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
    return normalized && words.includes(` ${normalized} `);
  }).length })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].template : null;
}
