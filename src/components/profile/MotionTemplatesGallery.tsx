import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Zap,
  Volume2,
  Sliders,
  RotateCcw,
  Flame,
  Layers,
  ArrowUpRight,
  Highlighter,
  CircleDot,
  Underline,
  HelpCircle,
} from 'lucide-react';
import type { DynamicMotionGraphicData } from '@tubeflow/editing-contracts';
import { DynamicMotionPlayer, playSynthesizedSfx } from '../preview/DynamicMotionPlayer';
import { useWorkspaceApi } from '../../services/workspaceApi';

export type ProfileId = 'ancient_dharma' | 'rule_zero' | 'against_the_odds' | 'documentary_standard';

interface UsefulTemplateMeta {
  id: string;
  name: string;
  category: 'thunder' | 'highlighter' | 'arrow' | 'circle' | 'sniper' | 'magnifier' | 'stamp' | 'ticker' | 'underline' | 'shockwave';
  description: string;
  isHook: boolean;
  icon: string;
  defaultPlacement: 'center' | 'top' | 'top-right' | 'top-left' | 'center-right' | 'center-left';
  defaultSfx: string;
  defaultTitle: string;
  defaultDetail: string;
  defaultBadge: string;
  role: string;
}

const PROFILES: Array<{
  id: ProfileId;
  name: string;
  desc: string;
  icon: string;
  color: string;
  accent: string;
  badge: string;
  templates: UsefulTemplateMeta[];
}> = [
  {
    id: 'ancient_dharma',
    name: 'Ancient Dharma',
    desc: 'Vedic Mythology, Sacred History & Divine Energy',
    icon: '🌟',
    color: '#C59B52',
    accent: '#E0B872',
    badge: 'Vedic Gold / Sanskrit',
    templates: [
      {
        id: 'thunder_lightning',
        name: 'Vajra Divine Thunderbolt Strike',
        category: 'thunder',
        icon: '⚡',
        description: 'Hook Attention Extractor: crackling celestial golden lightning bolt striking the scene with electric sparks, flash, and divine thunder resonance.',
        isHook: true,
        defaultPlacement: 'center',
        defaultSfx: 'sub_impact',
        defaultTitle: 'पिनाक धनुष चुनौती',
        defaultDetail: 'सीता स्वयंवर प्रतिज्ञा — आदि रामायण',
        defaultBadge: 'वज्र प्रहार',
        role: 'Scene 0 Cold Hook (Attention Extractor #1)',
      },
      {
        id: 'highlighter',
        name: 'Sacred Saffron Marker Highlighter',
        category: 'highlighter',
        icon: '🖊️',
        description: 'Chisel-tip saffron marker pen stroke sweeping across key words with sliding pen nib, ink soak & glint sheen.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'paper_slide',
        defaultTitle: 'अलौकिक पराक्रम',
        defaultDetail: 'एकाएक शिव धनुष उत्थापन',
        defaultBadge: 'पवित्र रहस्य',
        role: 'Keyword & Text Highlight Sweep',
      },
      {
        id: 'arrow_callout',
        name: 'Golden Divya Baan Pointer Arrow',
        category: 'arrow',
        icon: '🏹',
        description: 'Curved celestial golden arrow drawing along an arc with pulsing target radar ping and floating glass tag.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'whoosh',
        defaultTitle: 'दिव्यास्त्र पिनाक',
        defaultDetail: 'भगवान शिव का अमोघ धनुष',
        defaultBadge: 'विशेष ध्यान',
        role: 'Subject & Weapon Pointer Callout',
      },
      {
        id: 'circle_callout',
        name: 'Surya Golden Focus Halo',
        category: 'circle',
        icon: '⭕',
        description: 'Hand-drawn double-loop golden sketch circle drawing 360° around the focal subject with living focus.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'crystal_ting',
        defaultTitle: 'श्री राम आगमन',
        defaultDetail: 'मर्यादा पुरुषोत्तम — इक्ष्वाकु वंश',
        defaultBadge: 'दृष्टि बिंदु',
        role: 'Character / Detail Focus Circle',
      },
      {
        id: 'sniper_lock',
        name: 'Sudarshana Divine Reticle Lock',
        category: 'sniper',
        icon: '🎯',
        description: 'Tactical Vedic reticle: 4 sacred gold corner brackets snapping inward, spinning compass ring, and lock-on crosshair.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'hud_ping',
        defaultTitle: 'अचूक लक्ष्य संधान',
        defaultDetail: 'सुदर्शन चक्र वेध प्रोटोकॉल',
        defaultBadge: 'सुदर्शन चक्र',
        role: 'Target Lock-On & Subject Tracking',
      },
      {
        id: 'magnifying_glass',
        name: 'Vedic Scripture Inspection Loupe',
        category: 'magnifier',
        icon: '🔎',
        description: 'Polished gold inspection loupe with realistic optical glass glare, crosshair reticle, and evidence annotation tag.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'crystal_ting',
        defaultTitle: 'आदि रामायण साक्ष्य',
        defaultDetail: 'वाल्मीकि रचित बालकाण्ड मूल श्लोक',
        defaultBadge: 'प्राचीन ग्रंथ',
        role: 'Document & Evidence Inspection Loupe',
      },
      {
        id: 'redacted_stamp',
        name: 'Satyameva Jayate Seal of Truth',
        category: 'stamp',
        icon: '📜',
        description: 'Sacred seal stamping onto scene with 3D perspective slam, radial impact dust ring, and golden seal typography.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'impact',
        defaultTitle: 'धर्म एव हतो हन्ति',
        defaultDetail: 'सत्य की शाश्वत विजय मुहर',
        defaultBadge: 'सत्यमेव जयते',
        role: 'Authenticity Seal & Classified Stamp Slam',
      },
      {
        id: 'metric_ticker',
        name: 'Cosmic Karma Counter & Surge Bar',
        category: 'ticker',
        icon: '📊',
        description: 'Live rolling number odometer with ascending progress spark bar and radiant golden karma surge badge.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'telemetry_ticker',
        defaultTitle: '१०८ दिशाओं में गर्जना',
        defaultDetail: 'ब्रह्मांडीय तेज में तीव्र वृद्धि',
        defaultBadge: 'कर्म चक्र',
        role: 'Live Dynamic Numeric Counter & Surge Bar',
      },
      {
        id: 'kinetic_underline',
        name: 'Kundalini Energy Underline',
        category: 'underline',
        icon: '〰️',
        description: 'Kinetic glowing golden wave drawing smoothly beneath words with trailing comet spark flare.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'whoosh',
        defaultTitle: 'सत्य और धर्म विजय',
        defaultDetail: 'माता सीता वरमाला — अमर प्रतिज्ञा',
        defaultBadge: 'अंतिम निर्णय',
        role: 'Headline & Keyword Accent Underline',
      },
      {
        id: 'shockwave_pulse',
        name: 'Brahmastra Cosmic Blast Pulse',
        category: 'shockwave',
        icon: '💥',
        description: 'Concentric golden particle shockwave rings rippling outward with central diamond starburst.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'sub_impact',
        defaultTitle: 'प्रचंड ध्वनि कम्पन',
        defaultDetail: 'समस्त त्रिलोकी में महाविस्फोट',
        defaultBadge: 'ब्रह्मास्त्र',
        role: 'Dramatic Narrative Climax Shockwave',
      },
    ],
  },
  {
    id: 'rule_zero',
    name: 'Rule Zero',
    desc: 'Tactical Sci-Fi, AI Telemetry & Cyberpunk HUD',
    icon: '🎯',
    color: '#00F0FF',
    accent: '#00FF66',
    badge: 'Cyber Cyan & Emerald',
    templates: [
      {
        id: 'thunder_lightning',
        name: 'Cyber High-Voltage Arc Surge',
        category: 'thunder',
        icon: '⚡',
        description: 'Hook Attention Extractor: electric neon-cyan lightning surge snapping across the viewport with high-voltage flash.',
        isHook: true,
        defaultPlacement: 'center',
        defaultSfx: 'hud_ping',
        defaultTitle: 'CRITICAL SYSTEM BREACH',
        defaultDetail: 'ANOMALY DETECTED IN SECTOR 07',
        defaultBadge: 'OVERRIDE',
        role: 'Scene 0 Cold Hook (Attention Extractor #1)',
      },
      {
        id: 'highlighter',
        name: 'Holographic Laser Cyan Highlighter',
        category: 'highlighter',
        icon: '🖊️',
        description: 'Translucent cyan laser highlighter bar scanning across telemetry text with sliding cursor head.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'telemetry_ticker',
        defaultTitle: 'BIOMETRIC CONFIRMATION 99.4%',
        defaultDetail: 'TARGET IDENTITY VERIFIED',
        defaultBadge: 'SCAN // COMPLETE',
        role: 'Keyword & Text Highlight Sweep',
      },
      {
        id: 'arrow_callout',
        name: 'Vector HUD Directional Arrow',
        category: 'arrow',
        icon: '🏹',
        description: 'Sharp cyan tactical pointer arrow drawing an arc with pulsing ping beacon locking onto the focal target.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'telemetry_chirp',
        defaultTitle: 'TARGET VECTOR ACQUIRED',
        defaultDetail: 'COORDINATES 34.05° N 118.24° W',
        defaultBadge: 'TRACKING',
        role: 'Subject & Weapon Pointer Callout',
      },
      {
        id: 'circle_callout',
        name: 'Tactical Reticle Target Lock',
        category: 'circle',
        icon: '⭕',
        description: 'Precision dual-ring circular target crosshair with snapping brackets and lock-on ping.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'hud_ping',
        defaultTitle: 'HOSTILE ANOMALY',
        defaultDetail: 'PERIMETER VIOLATION DETECTED',
        defaultBadge: 'LOCK // ON',
        role: 'Character / Detail Focus Circle',
      },
      {
        id: 'sniper_lock',
        name: 'Cyber Military HUD Lock-On',
        category: 'sniper',
        icon: '🎯',
        description: 'High-tech cyan corner brackets slamming inward with spinning degree dial and TARGET ACQUIRED telemetry.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'hud_ping',
        defaultTitle: 'FIREWALL COMPROMISED',
        defaultDetail: 'DEFENSE MATRIX BYPASS // PROTOCOL 0',
        defaultBadge: 'TARGET LOCKED',
        role: 'Target Lock-On & Subject Tracking',
      },
      {
        id: 'magnifying_glass',
        name: 'Forensic Lens Data Zoom',
        category: 'magnifier',
        icon: '🔎',
        description: 'Cyber optic inspection loupe with glowing cyan rim, optical crosshair grid, and zoom telemetry readout.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'telemetry_chirp',
        defaultTitle: 'PACKET HEADER INSPECT',
        defaultDetail: 'DEEP HEURISTIC TRAFFIC ANALYSIS',
        defaultBadge: 'FORENSIC ZOOM',
        role: 'Document & Evidence Inspection Loupe',
      },
      {
        id: 'redacted_stamp',
        name: 'CLASSIFIED // TOP SECRET Stamp',
        category: 'stamp',
        icon: '📜',
        description: 'Angled classified rubber stamp slamming down with 3D impact shockwave and red/cyan alert borders.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'impact',
        defaultTitle: 'TOP SECRET PROTOCOL',
        defaultDetail: 'UNAUTHORIZED ACCESS PUNISHABLE BY LAW',
        defaultBadge: 'CLASSIFIED',
        role: 'Authenticity Seal & Classified Stamp Slam',
      },
      {
        id: 'metric_ticker',
        name: 'Quantum Telemetry Stat Counter',
        category: 'ticker',
        icon: '📊',
        description: 'High-speed live rolling digit ticker with cyan progress bar surge and +99.4% quantum delta badge.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'telemetry_ticker',
        defaultTitle: 'HASH RATE: +98.4%',
        defaultDetail: 'ZERO DAY EXPLOIT PROBABILITY',
        defaultBadge: 'QUANTUM SURGE',
        role: 'Live Dynamic Numeric Counter & Surge Bar',
      },
      {
        id: 'kinetic_underline',
        name: 'Laser Scanline Underline',
        category: 'underline',
        icon: '〰️',
        description: 'Glowing high-frequency laser beam underline snapping beneath technical terms with comet flare.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'telemetry_chirp',
        defaultTitle: 'ROOT SYSTEM OVERRIDE',
        defaultDetail: 'ADMINISTRATIVE PRIVILEGES GRANTED',
        defaultBadge: 'SCANLINE',
        role: 'Headline & Keyword Accent Underline',
      },
      {
        id: 'shockwave_pulse',
        name: 'EMP Kinetic Shockwave Blast',
        category: 'shockwave',
        icon: '💥',
        description: 'Expanding high-voltage EMP shockwave rings bursting from center with digital glitch.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'sub_impact',
        defaultTitle: 'EMP SYSTEM OVERLOAD',
        defaultDetail: 'TOTAL HARDWARE SHUTDOWN IMMINENT',
        defaultBadge: 'EMP BURST',
        role: 'Dramatic Narrative Climax Shockwave',
      },
    ],
  },
  {
    id: 'against_the_odds',
    name: 'Against the Odds',
    desc: 'Survival, Extreme Stakes, Disaster & Danger Telemetry',
    icon: '🧭',
    color: '#FACC15',
    accent: '#EF4444',
    badge: 'Hazard Yellow & Crimson',
    templates: [
      {
        id: 'thunder_lightning',
        name: 'Storm Impact Lightning Strike',
        category: 'thunder',
        icon: '⚡',
        description: 'Hook Attention Extractor: aggressive zigzag crimson/yellow lightning strike with thunder shockwave impact.',
        isHook: true,
        defaultPlacement: 'center',
        defaultSfx: 'sub_impact',
        defaultTitle: 'CATEGORY 5 HURRICANE',
        defaultDetail: 'MAXIMUM WINDS EXCEEDING 180 MPH',
        defaultBadge: 'CRITICAL ALERT',
        role: 'Scene 0 Cold Hook (Attention Extractor #1)',
      },
      {
        id: 'highlighter',
        name: 'Hazard Yellow Felt Marker',
        category: 'highlighter',
        icon: '🖊️',
        description: 'High-contrast fluorescent hazard yellow marker swipe emphasizing vital survival numbers.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'paper_slide',
        defaultTitle: 'BODY CORE TEMP: 89°F',
        defaultDetail: 'HYPOTHERMIA WINDOW 14 MINUTES',
        defaultBadge: 'SURVIVAL INTEL',
        role: 'Keyword & Text Highlight Sweep',
      },
      {
        id: 'arrow_callout',
        name: 'Danger Alert Pointer Arrow',
        category: 'arrow',
        icon: '🏹',
        description: 'Angled hazard pointer arrow with pulsing chevron and beacon pointing toward critical points.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'impact',
        defaultTitle: 'ESCAPE ROUTE BLOCKED',
        defaultDetail: 'EXTRACTION POINT ALPHA 1.4 KM',
        defaultBadge: 'DANGER',
        role: 'Subject & Weapon Pointer Callout',
      },
      {
        id: 'circle_callout',
        name: 'Critical Hazard Zone Circle',
        category: 'circle',
        icon: '⭕',
        description: 'Vibrant red distress loop ringing a hazard area with pulsing warning beacon and target ping.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'hud_ping',
        defaultTitle: 'PRESSURE CHAMBER BREACH',
        defaultDetail: 'INTERNAL TEMPERATURE 420°',
        defaultBadge: 'HOT ZONE',
        role: 'Character / Detail Focus Circle',
      },
      {
        id: 'sniper_lock',
        name: 'Recon Sniper Target Lock-On',
        category: 'sniper',
        icon: '🎯',
        description: 'Tactical military brackets snapping onto critical threat with crosshairs and DANGER TARGET tag.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'hud_ping',
        defaultTitle: 'APEX PREDATOR DETECTED',
        defaultDetail: 'DISTANCE 45 METERS CLOSING FAST',
        defaultBadge: 'HOSTILE LOCK',
        role: 'Target Lock-On & Subject Tracking',
      },
      {
        id: 'magnifying_glass',
        name: 'Satellite Recon Tactical Loupe',
        category: 'magnifier',
        icon: '🔎',
        description: 'Heavy duty tactical reconnaissance loupe with crosshair reticle and coordinates readout.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'impact',
        defaultTitle: 'AVALANCHE DEBRIS GRID',
        defaultDetail: 'SEARCH AND RESCUE SECTOR 4',
        defaultBadge: 'SATELLITE RECON',
        role: 'Document & Evidence Inspection Loupe',
      },
      {
        id: 'redacted_stamp',
        name: 'SURVIVED // VERIFIED Stamp',
        category: 'stamp',
        icon: '📜',
        description: 'Heavy combat stamp slamming onto screen with ground dust ring and high-contrast hazard stamp box.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'sub_impact',
        defaultTitle: 'MIRACLE SURVIVOR',
        defaultDetail: 'AGAINST ALL ODDS CERTIFIED',
        defaultBadge: 'VERIFIED',
        role: 'Authenticity Seal & Classified Stamp Slam',
      },
      {
        id: 'metric_ticker',
        name: 'Survival Odds Rapid Counter',
        category: 'ticker',
        icon: '📊',
        description: 'Live counting number ticker surging from 0% to survival threshold with red/yellow surge bar.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'telemetry_ticker',
        defaultTitle: 'SURVIVAL ODDS: 1.2%',
        defaultDetail: 'CRITICAL ESCAPE PROBABILITY SURGE',
        defaultBadge: 'ODDS COUNT',
        role: 'Live Dynamic Numeric Counter & Surge Bar',
      },
      {
        id: 'kinetic_underline',
        name: 'Seismic Stress Fracture Underline',
        category: 'underline',
        icon: '〰️',
        description: 'Sharp jagged warning line snapping under critical survival stats with shock particle.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'sub_impact',
        defaultTitle: 'AGAINST ALL ODDS',
        defaultDetail: 'HUMAN RESILIENCE SURPASSES LIMITS',
        defaultBadge: 'FRACTURE',
        role: 'Headline & Keyword Accent Underline',
      },
      {
        id: 'shockwave_pulse',
        name: 'Kinetic Blast Wave Impact',
        category: 'shockwave',
        icon: '💥',
        description: 'Violent expanding shockwave rings with center impact flash and camera shake impulse.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'sub_impact',
        defaultTitle: 'SEISMIC SHOCK IMPACT',
        defaultDetail: 'GROUND ACCELERATION 2.8G',
        defaultBadge: 'BLAST WAVE',
        role: 'Dramatic Narrative Climax Shockwave',
      },
    ],
  },
  {
    id: 'documentary_standard',
    name: 'Documentary Standard',
    desc: 'Vox-Style Editorial, Historical Analysis & Business Deep-Dives',
    icon: '📰',
    color: '#F07835',
    accent: '#FFE600',
    badge: 'Editorial Orange / Bauhaus',
    templates: [
      {
        id: 'highlighter',
        name: 'Vox Marker Pen Highlighter',
        category: 'highlighter',
        icon: '🖊️',
        description: 'Hook Attention Extractor: classic Vox-style translucent yellow marker sweeping across key words to highlight evidence.',
        isHook: true,
        defaultPlacement: 'top',
        defaultSfx: 'paper_slide',
        defaultTitle: 'THE $4.2 TRILLION SECRET',
        defaultDetail: 'DECLASSIFIED NATIONAL ARCHIVES EVIDENCE',
        defaultBadge: 'INVESTIGATION',
        role: 'Scene 0 Cold Hook (Attention Extractor #1)',
      },
      {
        id: 'thunder_lightning',
        name: 'Graphic Thunderbolt Accent',
        category: 'thunder',
        icon: '⚡',
        description: 'Stylized pop-editorial lightning bolt for shocking facts and dramatic narrative turns with flash strobe.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'sub_impact',
        defaultTitle: 'THE SUDDEN CRASH',
        defaultDetail: 'WALL STREET COLLAPSE IN 60 SECONDS',
        defaultBadge: 'REVEAL',
        role: 'High-Impact Narrative Lightning Strike',
      },
      {
        id: 'arrow_callout',
        name: 'Editorial Hand-Drawn Curved Arrow',
        category: 'arrow',
        icon: '🏹',
        description: 'Organic hand-drawn curved bezier arrow pointing to a document, face, or detail with elastic bounce.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'whoosh',
        defaultTitle: 'THE MISSING CONTRACT',
        defaultDetail: 'SIGNED IN SECRET AT 2:00 AM',
        defaultBadge: 'LOOK HERE',
        role: 'Subject & Weapon Pointer Callout',
      },
      {
        id: 'circle_callout',
        name: 'Investigative Red Pen Circle',
        category: 'circle',
        icon: '⭕',
        description: 'Authentic red grease-pencil double loop circling around an archival clue or figure.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'crystal_ting',
        defaultTitle: 'KEY WITNESS IDENTIFIED',
        defaultDetail: 'TESTIMONY UNSEALED AFTER 40 YEARS',
        defaultBadge: 'KEY EVIDENCE',
        role: 'Character / Detail Focus Circle',
      },
      {
        id: 'sniper_lock',
        name: 'Investigative Target Reticle',
        category: 'sniper',
        icon: '🎯',
        description: 'Clean editorial target brackets framing an archival photo or suspect with subtle focal crosshair.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'crystal_ting',
        defaultTitle: 'THE HIDDEN ARCHITECT',
        defaultDetail: 'CONNECTING 4 SHELL CORPORATIONS',
        defaultBadge: 'FOCAL POINT',
        role: 'Target Lock-On & Subject Tracking',
      },
      {
        id: 'magnifying_glass',
        name: 'Archival Magnifying Glass Loupe',
        category: 'magnifier',
        icon: '🔎',
        description: 'Classic brass editorial magnifying glass hovering over evidence with glass reflection glare.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'paper_slide',
        defaultTitle: 'THE SMUDGED SIGNATURE',
        defaultDetail: 'FORENSIC DOCUMENT VERIFICATION',
        defaultBadge: 'ARCHIVE LOUPE',
        role: 'Document & Evidence Inspection Loupe',
      },
      {
        id: 'redacted_stamp',
        name: 'DECLASSIFIED // ARCHIVE Stamp',
        category: 'stamp',
        icon: '📜',
        description: 'Authentic red/black archival stamp slamming onto historical evidence with ink splatter.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'impact',
        defaultTitle: 'TOP SECRET MEMO 1974',
        defaultDetail: 'UNSEALED FREEDOM OF INFORMATION ACT',
        defaultBadge: 'DECLASSIFIED',
        role: 'Authenticity Seal & Classified Stamp Slam',
      },
      {
        id: 'metric_ticker',
        name: 'Financial & Growth Metric Ticker',
        category: 'ticker',
        icon: '📊',
        description: 'Live rolling metric odometer calculating dollars, percentage surge, or timeline year with surge bar.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'telemetry_ticker',
        defaultTitle: 'DEBT SURGE: +847%',
        defaultDetail: 'NATIONAL DEFICIT CALCULATION OVER TIME',
        defaultBadge: 'GROWTH METRIC',
        role: 'Live Dynamic Numeric Counter & Surge Bar',
      },
      {
        id: 'kinetic_underline',
        name: 'Kinetic Marker Underline',
        category: 'underline',
        icon: '〰️',
        description: 'Clean ruler-drawn marker underline snapping beneath headlines with leading spark.',
        isHook: false,
        defaultPlacement: 'top',
        defaultSfx: 'whoosh',
        defaultTitle: 'HOW THE EMPIRE FELL',
        defaultDetail: 'A CHAIN REACTION OF THREE CRUCIAL BLUNDERS',
        defaultBadge: 'CONCLUSION',
        role: 'Headline & Keyword Accent Underline',
      },
      {
        id: 'shockwave_pulse',
        name: 'Dramatic Story Beat Pulse',
        category: 'shockwave',
        icon: '💥',
        description: 'Sonic shockwave ripple emphasizing a dramatic plot twist or turning point.',
        isHook: false,
        defaultPlacement: 'center',
        defaultSfx: 'whoosh',
        defaultTitle: 'THE MOMENT IT CHANGED',
        defaultDetail: 'A PIVOTAL SHIFT IN MODERN HISTORY',
        defaultBadge: 'IMPACT',
        role: 'Dramatic Narrative Climax Shockwave',
      },
    ],
  },
];

export function MotionTemplatesGallery() {
  const { account } = useWorkspaceApi();

  const detectedProfileId: ProfileId = React.useMemo(() => {
    const raw = `${account.id} ${account.name} ${account.youtubeChannelTitle || ''}`.toLowerCase();
    if (raw.includes('rule') || raw.includes('zero')) return 'rule_zero';
    if (raw.includes('odds') || raw.includes('against')) return 'against_the_odds';
    if (raw.includes('dharma') || raw.includes('vedic') || raw.includes('ancient') || raw.includes('राम')) return 'ancient_dharma';
    return 'ancient_dharma';
  }, [account]);

  const [selectedProfileId, setSelectedProfileId] = useState<ProfileId>(detectedProfileId);
  const activeProfile = PROFILES.find((p) => p.id === selectedProfileId) || PROFILES[0];

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(activeProfile.templates[0].id);
  const activeTemplate = activeProfile.templates.find((t) => t.id === selectedTemplateId) || activeProfile.templates[0];

  // Editable fields
  const [title, setTitle] = useState(activeTemplate.defaultTitle);
  const [detail, setDetail] = useState(activeTemplate.defaultDetail);
  const [badge, setBadge] = useState(activeTemplate.defaultBadge);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'hooks' | 'highlighter' | 'callouts' | 'inspection' | 'data'>('all');
  const [size, setSize] = useState<'compact' | 'standard' | 'hero'>('standard');
  const [placement, setPlacement] = useState<string>(activeTemplate.defaultPlacement);
  const [backdrop, setBackdrop] = useState<'dark' | 'grid' | 'ambient'>('dark');

  // Filtered templates based on selected category
  const filteredTemplates = activeProfile.templates.filter((tpl) => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'hooks') return tpl.isHook || tpl.category === 'thunder' || tpl.category === 'shockwave';
    if (selectedCategory === 'highlighter') return tpl.category === 'highlighter';
    if (selectedCategory === 'callouts') return tpl.category === 'arrow' || tpl.category === 'circle';
    if (selectedCategory === 'inspection') return tpl.category === 'sniper' || tpl.category === 'magnifier';
    if (selectedCategory === 'data') return tpl.category === 'stamp' || tpl.category === 'ticker' || tpl.category === 'underline';
    return true;
  });

  // Compiled graphic representation
  const [compiledGraphic, setCompiledGraphic] = useState<DynamicMotionGraphicData | null>(null);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);

  // When active profile changes, reset to profile's #1 Hook
  useEffect(() => {
    const hook = activeProfile.templates[0];
    setSelectedTemplateId(hook.id);
    setTitle(hook.defaultTitle);
    setDetail(hook.defaultDetail);
    setBadge(hook.defaultBadge);
    setSize(hook.isHook ? 'hero' : 'standard');
    setPlacement(hook.defaultPlacement);
  }, [selectedProfileId]);

  // When selected template changes, load its default fields
  const handleSelectTemplate = (template: UsefulTemplateMeta) => {
    setSelectedTemplateId(template.id);
    setTitle(template.defaultTitle);
    setDetail(template.defaultDetail);
    setBadge(template.defaultBadge);
    setSize(template.isHook ? 'hero' : 'standard');
    setPlacement(template.defaultPlacement);
  };

  // Re-compile graphic whenever parameters change
  useEffect(() => {
    let isCancelled = false;
    setIsCompiling(true);

    const plan = {
      templateId: selectedTemplateId,
      profileKey: selectedProfileId,
      sceneIndex: 0,
      title,
      detail,
      badge,
      size,
      placement,
      startSec: 0.05,
      durationSec: 4.5,
    };

    fetch('/api/editing/dynamic-motion/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, width: 1080, height: 1920, fps: 30 }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!isCancelled && data.graphic) {
          setCompiledGraphic(data.graphic);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('Compile error:', err);
        }
      })
      .finally(() => {
        if (!isCancelled) setIsCompiling(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedProfileId, selectedTemplateId, title, detail, badge, size, placement]);

  const handleTestSfx = () => {
    playSynthesizedSfx(activeTemplate.defaultSfx, 0.85);
  };

  const handleResetDefaults = () => {
    setTitle(activeTemplate.defaultTitle);
    setDetail(activeTemplate.defaultDetail);
    setBadge(activeTemplate.defaultBadge);
    setSize(activeTemplate.isHook ? 'hero' : 'standard');
    setPlacement(activeTemplate.defaultPlacement);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Profile Switcher */}
      <div className="rounded-2xl border border-border/80 bg-surface/80 p-5 backdrop-blur-md shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/20 text-accent text-sm">
                <Zap className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-accent">
                Video Editor Motion Graphics Suite
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                10 Creator Tools · Specular Polish · Living Motion
              </span>
            </div>
            <h2 className="text-xl font-black text-white mt-1">
              Practical Motion Graphics & Attention Tools
            </h2>
            <p className="text-xs text-muted mt-0.5 max-w-2xl leading-relaxed">
              Real creator-grade tools used in vertical videos: <strong>Lightning Strikes</strong> for instant hook retention, <strong>Marker Highlighters</strong> with sliding nib, <strong>Bouncing Arrows</strong> with target ping, <strong>Double-Loop Focus Circles</strong>, <strong>Sniper Lock-On Reticles</strong>, <strong>Inspection Loupes</strong>, <strong>Classified Stamp Slams</strong>, <strong>Live Numeric Tickers</strong>, and <strong>Kinetic Underlines</strong>.
            </p>
          </div>

          {/* Profile Switcher Pills */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface2/80 p-1">
            {PROFILES.map((prof) => {
              const isSelected = prof.id === selectedProfileId;
              const isChannelActive = prof.id === detectedProfileId;
              return (
                <button
                  key={prof.id}
                  onClick={() => setSelectedProfileId(prof.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-accent text-white shadow-glow'
                      : 'text-muted hover:text-white hover:bg-surface'
                  }`}
                >
                  <span>{prof.icon}</span>
                  <span>{prof.name}</span>
                  {isChannelActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Active channel profile" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Profile DNA Specs */}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border/60 pt-3 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Palette:</span>
            <div className="flex items-center gap-1">
              <span className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: activeProfile.color }} />
              <span className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: activeProfile.accent }} />
              <span className="font-semibold text-zinc-300 ml-1">{activeProfile.badge}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Toolkit:</span>
            <span className="font-semibold text-zinc-200">
              {activeProfile.templates.length} Essential Broadcast Tools
            </span>
          </div>
        </div>
      </div>

      {/* Main Studio Workspace: 2-Column (Tools List + Live 9:16 Video Stage) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 Cols): Tool Selector Cards with Category Filters */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-accent" />
              Motion Tools ({activeProfile.templates.length})
            </h3>
            <span className="text-[11px] text-zinc-400">
              Showing {filteredTemplates.length}
            </span>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            {[
              { id: 'all', label: 'All', count: activeProfile.templates.length },
              { id: 'hooks', label: '⚡ Hooks & Blasts', count: 2 },
              { id: 'highlighter', label: '🖊️ Highlighter', count: 1 },
              { id: 'callouts', label: '🏹 Pointer & Circles', count: 2 },
              { id: 'inspection', label: '🎯 Reticles & Loupes', count: 2 },
              { id: 'data', label: '📊 Stamps & Tickers', count: 3 },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as any)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-accent/25 text-accent border border-accent/40 shadow-sm'
                    : 'bg-surface2/60 text-muted hover:text-white border border-border/60 hover:bg-surface2'
                }`}
              >
                {cat.label} ({cat.count})
              </button>
            ))}
          </div>

          <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
            {filteredTemplates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              return (
                <div
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`group relative cursor-pointer rounded-xl border p-3.5 transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/10 shadow-glow'
                      : 'border-border/70 bg-surface/60 hover:border-border hover:bg-surface2/60'
                  }`}
                >
                  {/* Hook Badge for Scene 0 Extractor */}
                  {tpl.isHook && (
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-400 border border-amber-500/40">
                        <Flame className="h-3 w-3" />
                        ATTENTION EXTRACTOR #1 (SCENE 0 HOOK)
                      </span>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="text-xl flex-shrink-0 mt-0.5">{tpl.icon}</span>
                      <div>
                        <h4 className="text-sm font-bold text-white group-hover:text-accent transition-colors">
                          {tpl.name}
                        </h4>
                        <p className="mt-0.5 text-xs text-muted leading-relaxed">
                          {tpl.description}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border flex-shrink-0 ${
                        isSelected
                          ? 'border-accent/40 bg-accent/20 text-accent'
                          : 'border-border bg-surface text-muted'
                      }`}
                    >
                      {tpl.defaultPlacement}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-zinc-400">
                    <span className="text-accent font-semibold">{tpl.role}</span>
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Volume2 className="h-3 w-3 text-zinc-500" />
                      {tpl.defaultSfx}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column (7 Cols): Live 9:16 Video Stage & Customizer */}
        <div className="lg:col-span-7 space-y-4">
          {/* Stage Card */}
          <div className="rounded-2xl border border-border/80 bg-surface/80 p-5 shadow-card backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-accent">
                  Live Responsive Viewport
                </span>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                  <span>{activeTemplate.icon} {activeTemplate.name}</span>
                  {activeTemplate.isHook && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                      Hook
                    </span>
                  )}
                </h3>
              </div>

              {/* Backdrop Toggle & Sound Test */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestSfx}
                  title="Trigger SFX"
                  className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-accent transition"
                >
                  <Volume2 className="h-3.5 w-3.5 text-accent" />
                  <span>Test SFX ({activeTemplate.defaultSfx})</span>
                </button>

                <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 text-xs">
                  <button
                    onClick={() => setBackdrop('dark')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold ${
                      backdrop === 'dark' ? 'bg-accent text-white' : 'text-muted'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => setBackdrop('grid')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold ${
                      backdrop === 'grid' ? 'bg-accent text-white' : 'text-muted'
                    }`}
                  >
                    Grid
                  </button>
                  <button
                    onClick={() => setBackdrop('ambient')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold ${
                      backdrop === 'ambient' ? 'bg-accent text-white' : 'text-muted'
                    }`}
                  >
                    Ambient
                  </button>
                </div>
              </div>
            </div>

            {/* Video Viewport Container (9:16 aspect ratio centered) */}
            <div className="flex justify-center py-2">
              <div
                className={`relative w-[340px] h-[604px] rounded-2xl overflow-hidden border-2 border-border/90 shadow-2xl transition-all ${
                  backdrop === 'grid'
                    ? 'bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] bg-[#0c0c0e]'
                    : backdrop === 'ambient'
                    ? selectedProfileId === 'rule_zero'
                      ? 'bg-gradient-to-b from-[#060c14] via-[#021820] to-[#040810]'
                      : selectedProfileId === 'against_the_odds'
                      ? 'bg-gradient-to-b from-[#180a0a] via-[#100808] to-[#0a0505]'
                      : 'bg-gradient-to-b from-[#181109] via-[#0f0c08] to-[#080604]'
                    : 'bg-[#09090b]'
                }`}
              >
                {/* 9:16 Safe Zone Overlays (Header & Subtitle guides) */}
                <div className="absolute top-0 inset-x-0 h-[15%] pointer-events-none border-b border-dashed border-white/10 z-10 flex items-center justify-center">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">
                    Header Safe Zone (Top 15%)
                  </span>
                </div>
                <div className="absolute bottom-0 inset-x-0 h-[25%] pointer-events-none border-t border-dashed border-white/10 z-10 flex items-center justify-center">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">
                    Subtitle Safe Zone (Bottom 25%)
                  </span>
                </div>

                {/* Subtitle simulation at bottom */}
                <div className="absolute bottom-6 inset-x-4 text-center z-20 pointer-events-none">
                  <span className="inline-block bg-black/70 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-black text-white shadow-lg border border-white/10">
                    [ Subtitle Safe Band · MarginV 280 ]
                  </span>
                </div>

                {/* Live GSAP Player */}
                {compiledGraphic ? (
                  <DynamicMotionPlayer
                    key={`${compiledGraphic.id}-${backdrop}`}
                    graphic={compiledGraphic}
                    aspectRatio="9:16"
                    autoPlay={true}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                    {isCompiling ? 'Rendering motion graphic...' : 'No graphic rendered'}
                  </div>
                )}
              </div>
            </div>

            {/* Flexible Customization Controls */}
            <div className="mt-5 rounded-xl border border-border/70 bg-surface2/60 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-accent" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Customize Graphic Content & Sizing
                  </h4>
                </div>
                <button
                  onClick={handleResetDefaults}
                  className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Defaults
                </button>
              </div>

              {/* Form Inputs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Title */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Focal Heading / Keyword
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-white focus:border-accent focus:outline-none"
                    placeholder="Enter keyword or focal text..."
                  />
                </div>

                {/* Badge */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Callout Badge / Tag
                  </label>
                  <input
                    type="text"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-white focus:border-accent focus:outline-none"
                    placeholder="e.g. ⚡ वज्र प्रहार, LOOK HERE"
                  />
                </div>

                {/* Detail */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Detail / Context Note
                  </label>
                  <input
                    type="text"
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-white focus:border-accent focus:outline-none"
                    placeholder="Enter secondary punchline or context..."
                  />
                </div>

                {/* Size Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Graphic Scale
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['compact', 'standard', 'hero'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSize(s)}
                        className={`rounded py-1 text-center capitalize font-semibold transition ${
                          size === s
                            ? 'bg-accent text-white shadow-sm'
                            : 'bg-surface text-muted hover:text-white border border-border'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Placement Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Position
                  </label>
                  <select
                    value={placement}
                    onChange={(e) => setPlacement(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-white focus:border-accent focus:outline-none"
                  >
                    <option value="center">Center (Upper Third · 20%)</option>
                    <option value="top">Top (18%)</option>
                    <option value="top-right">Top Right (18%)</option>
                    <option value="top-left">Top Left (18%)</option>
                    <option value="center-right">Center Right (25%)</option>
                    <option value="center-left">Center Left (25%)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
