import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  type ExtraPopupAsset,
  type DynamicMotionGraphicData,
  type ExtraPopupShapeType,
  type ExtraPopupPlacementType,
  type SfxName,
  styleKitFor,
  clampShapeToKit,
  clampSfxToKit,
  mobileSafePlacement,
  MOBILE_SAFE_PLACEMENTS,
  POPUP_SHAPES,
  SFX_NAMES,
} from '@tubeflow/editing-contracts';
import { store } from './store.js';
import { chat, getGeminiApiKey } from './gemini.js';
import { generatedDir, mediaUrl } from './workspace.js';
import { generateCloudflareImage, isCloudflareConfigured } from './cloudflare-image.js';
import { generateGoogleImage, isGoogleImageConfigured } from './google-image.js';
import { generateImage, checkComfyStatus } from './comfyui.js';

/** Shapes that render a hero card with a headline (no photograph frame). */
const CARD_ARCHETYPES = ['metric_counter', 'mystery_hook', 'heritage_intel', 'blueprint_diagram'] as const;

export function enhanceMacroPrompt(subject: string, channelProfile?: string): string {
  const cleanSubject = (subject || '').trim().replace(/^["']|["']$/g, '');
  if (!cleanSubject) {
    return 'Isolated macro studio close-up of high-detail relic texture, centered composition, dramatic cinematic rim lighting, clean dark studio backdrop, 8k photograph.';
  }

  // If already contains macro directives, return as is
  if (/\b(isolated macro|macro studio|close-up|micro-detail)\b/i.test(cleanSubject)) {
    return cleanSubject;
  }

  const isAncient = /dharma|ancient|mythology|vedic|sacred|history/i.test(channelProfile || '');
  const isSciFi = /tech|cyber|scifi|rule\s*zero|engineering/i.test(channelProfile || '');

  if (isAncient) {
    return `Isolated macro studio close-up of ${cleanSubject}, sacred craftsmanship, deep obsidian and antique gold sheen, micro-fissures with subtle glowing diya amber embers, razor-sharp tactile texture, centered composition, shallow depth of field, clean dark studio backdrop, 8k photorealistic.`;
  }

  if (isSciFi) {
    return `Isolated macro studio close-up of ${cleanSubject}, high-tech aerospace alloy and laser micro-welds, matte carbon gunmetal sheen, faint cyan laser telemetry line, centered composition, shallow depth of field, clean dark studio backdrop, 8k photorealistic.`;
  }

  return `Isolated macro studio close-up of ${cleanSubject}, centered composition, extreme micro-detail, cinematic 8k photograph, razor-sharp focus on texture, dramatic side rim lighting, clean dark studio backdrop with shallow depth of field, high contrast, zero background clutter.`;
}

export interface ProfessionalPopupIntel {
  title: string;
  subtitle: string;
  badgeTag: string;
  shape: ExtraPopupShapeType;
  archetype: string;
  cueWord: string;
  sfx: SfxName;
  statValue?: string;
  statUnit?: string;
}

/**
 * Professional Video Editor Semantic Intel Extractor.
 * Never outputs raw grammatical fragments (e.g. "भगवान राम ने जैसे ही").
 * Instead, extracts logical, useful proper nouns, weapon breakdowns, character dossiers,
 * precise numbers, and sacred geographic stamps, matched to exact spoken keywords.
 */
export function extractProfessionalPopupIntel(
  narration: string,
  visualPrompt: string,
  index: number,
  isHindi: boolean,
  kit: any,
  scriptName?: string
): ProfessionalPopupIntel {
  const combined = `${narration} ${visualPrompt}`.toLowerCase();

  // 1. Divine Weapons & Sacred Instruments
  if (combined.includes('पिनाक') || combined.includes('pinaka')) {
    return {
      title: isHindi ? 'पिनाक धनुष' : 'Pinaka Bow',
      subtitle: isHindi ? 'भगवान शिव का अमोघ धनुष' : 'Lord Shiva’s Inviolable Bow',
      badgeTag: isHindi ? 'दिव्यास्त्र' : 'DIVINE RELIC',
      shape: 'cutout_relic',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('पिनाक') ? 'पिनाक' : (narration.includes('धनुष') ? 'धनुष' : 'pinaka'),
      sfx: 'crystal_ting',
    };
  }

  if (combined.includes('सुदर्शन') || combined.includes('sudarshan')) {
    return {
      title: isHindi ? 'सुदर्शन चक्र' : 'Sudarshana Chakra',
      subtitle: isHindi ? '१०८ दंत सौर तेज चक्र' : '108-Blade Cosmic Sun Wheel',
      badgeTag: isHindi ? 'अचूक अस्त्र' : 'CELESTIAL WEAPON',
      shape: 'circle_medallion',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('सुदर्शन') ? 'सुदर्शन' : (narration.includes('चक्र') ? 'चक्र' : 'chakra'),
      sfx: 'energy_hum',
    };
  }

  if (combined.includes('त्रिशूल') || combined.includes('trishul')) {
    return {
      title: isHindi ? 'दिव्य त्रिशूल' : 'Sacred Trishula',
      subtitle: isHindi ? 'त्रिगुण ऊर्जा का प्रतीक' : 'Symbol of Three Cosmic Powers',
      badgeTag: isHindi ? 'दिव्यास्त्र' : 'DIVINE WEAPON',
      shape: 'cutout_relic',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('त्रिशूल') ? 'त्रिशूल' : 'trishul',
      sfx: 'crystal_ting',
    };
  }

  if (combined.includes('ब्रह्मास्त्र') || combined.includes('brahmastra')) {
    return {
      title: isHindi ? 'ब्रह्मास्त्र' : 'Brahmastra',
      subtitle: isHindi ? 'परम संहारक अस्त्र' : 'Ultimate Cosmic Weapon',
      badgeTag: isHindi ? 'महास्त्र' : 'COSMIC WEAPON',
      shape: 'cutout_relic',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('ब्रह्मास्त्र') ? 'ब्रह्मास्त्र' : 'brahmastra',
      sfx: 'energy_hum',
    };
  }

  if (combined.includes('गांडीव') || combined.includes('gandiva')) {
    return {
      title: isHindi ? 'गांडीव धनुष' : 'Gandiva Bow',
      subtitle: isHindi ? 'अग्निदेव द्वारा प्रदत्त धनुष' : 'Divine Bow of Agni',
      badgeTag: isHindi ? 'दिव्यास्त्र' : 'DIVINE RELIC',
      shape: 'cutout_relic',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('गांडीव') ? 'गांडीव' : 'gandiva',
      sfx: 'crystal_ting',
    };
  }

  if (combined.includes('पाशुपत') || combined.includes('pashupata')) {
    return {
      title: isHindi ? 'पाशुपतास्त्र' : 'Pashupatastra',
      subtitle: isHindi ? 'महादेव का अमोघ संहारक अस्त्र' : 'Lord Shiva’s Ultimate Weapon',
      badgeTag: isHindi ? 'दिव्यास्त्र' : 'DIVINE WEAPON',
      shape: 'cutout_relic',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('पाशुपत') ? 'पाशुपत' : 'pashupata',
      sfx: 'crystal_ting',
    };
  }

  if (combined.includes('संजीवनी') || combined.includes('sanjeevani')) {
    return {
      title: isHindi ? 'संजीवनी बूटी' : 'Sanjeevani Herb',
      subtitle: isHindi ? 'द्रोणागिरि पर्वत औषधि' : 'Life-Restoring Celestial Herb',
      badgeTag: isHindi ? 'दिव्य औषधि' : 'DIVINE REMEDY',
      shape: 'cutout_relic',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('संजीवनी') ? 'संजीवनी' : 'sanjeevani',
      sfx: 'crystal_ting',
    };
  }

  if (combined.includes('धनुष') || combined.includes('bow')) {
    return {
      title: isHindi ? 'शिव धनुष' : 'Shiva Bow',
      subtitle: isHindi ? 'अतुल्य भार एवं अलौकिक तेज' : 'Unmatched Weight & Divine Tejas',
      badgeTag: isHindi ? 'दिव्यास्त्र' : 'DIVINE WEAPON',
      shape: 'cutout_relic',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('धनुष') ? 'धनुष' : 'bow',
      sfx: 'crystal_ting',
    };
  }

  // 2. Metrics / Quantities / Scale / Timelines
  const numMatch = narration.match(/(\d[\d,\.]*\s*(?:लाख|करोड़|हजार|दंत|वर्ष|साल|युग|माह|दिन|टन|ton|feet|फ़ीट|मीटर|meter|योजन|मील)?)/i);
  if (numMatch) {
    const raw = numMatch[1].trim();
    const valMatch = raw.match(/^([\d,\.]+)/);
    const statValue = valMatch ? valMatch[1] : raw;
    const statUnit = raw.slice(statValue.length).trim() || undefined;

    let title = isHindi ? 'प्रमाणित संख्या' : 'Key Metric';
    let subtitle = isHindi ? 'धार्मिक एवं ऐतिहासिक गणना' : 'Historical & Scriptural Scale';
    let badgeTag = isHindi ? 'प्रमाणित आँकड़ा' : 'DATA METRIC';
    let cueWord = statUnit && narration.includes(statUnit) ? statUnit : statValue;

    if (raw.includes('14') && (raw.includes('वर्ष') || raw.includes('साल') || combined.includes('वनवास'))) {
      title = isHindi ? 'वनवास कालखंड' : 'Exile Timeline';
      subtitle = isHindi ? 'मर्यादा और त्याग की अवधि' : '14-Year Period of Ascetic Exile';
      badgeTag = isHindi ? 'समय सीमा' : 'TIMELINE';
      cueWord = isHindi && narration.includes('वर्ष') ? 'वर्ष' : '14';
    } else if (raw.includes('108') || combined.includes('१०८')) {
      title = isHindi ? 'सौर चक्र दंत' : 'Solar Blades';
      subtitle = isHindi ? 'सौर ऊर्जा मापक — Tejas' : '108 Rays of Solar Energy';
      badgeTag = isHindi ? 'प्रमाणित संख्या' : 'MEASUREMENT';
      cueWord = isHindi && narration.includes('चक्र') ? 'चक्र' : '108';
    } else if (raw.includes('लाख') || raw.includes('करोड़') || raw.includes('हजार')) {
      title = isHindi ? 'विशाल संख्या बल' : 'Vast Scale';
      subtitle = isHindi ? 'महाकाव्यीय सेना विस्तार' : 'Epic Scale Documentation';
      badgeTag = isHindi ? 'आँकड़ा' : 'METRIC';
    }

    return {
      title,
      subtitle,
      badgeTag,
      statValue,
      statUnit,
      shape: 'metric_counter',
      archetype: 'metric_counter',
      cueWord,
      sfx: 'hud_ping',
    };
  }

  // 3. Characters & Personalities Dossiers
  if (combined.includes('राम') || combined.includes('rama')) {
    return {
      title: isHindi ? 'श्री राम' : 'Lord Rama',
      subtitle: isHindi ? 'मर्यादा पुरुषोत्तम — इक्ष्वाकु वंश' : 'Embodiment of Dharma — Ikshvaku Dynasty',
      badgeTag: isHindi ? 'चरित्र परिचय' : 'DOSSIER',
      shape: 'circle_medallion',
      archetype: 'macro_relic',
      cueWord: isHindi && narration.includes('राम') ? 'राम' : 'rama',
      sfx: 'bubble_pop',
    };
  }

  if (combined.includes('सीता') || combined.includes('sita')) {
    return {
      title: isHindi ? 'माता सीता' : 'Mata Sita',
      subtitle: isHindi ? 'विदेह राजकुमारी — जनकपुत्री' : 'Princess of Mithila — Janaka’s Daughter',
      badgeTag: isHindi ? 'चरित्र परिचय' : 'DOSSIER',
      shape: 'circle_medallion',
      archetype: 'macro_relic',
      cueWord: isHindi && narration.includes('सीता') ? 'सीता' : 'sita',
      sfx: 'bubble_pop',
    };
  }

  if (combined.includes('रावण') || combined.includes('ravana')) {
    return {
      title: isHindi ? 'दशानन रावण' : 'Ravana',
      subtitle: isHindi ? 'लंकेश्वर — त्रिलोक विजयी' : 'King of Lanka — The Ten-Headed Emperor',
      badgeTag: isHindi ? 'प्रतिद्वंद्वी' : 'ADVERSARY',
      shape: 'circle_medallion',
      archetype: 'macro_relic',
      cueWord: isHindi && narration.includes('रावण') ? 'रावण' : 'ravana',
      sfx: 'sub_impact',
    };
  }

  if (combined.includes('हनुमान') || combined.includes('hanuman')) {
    return {
      title: isHindi ? 'श्री हनुमान' : 'Lord Hanuman',
      subtitle: isHindi ? 'पवनपुत्र — रुद्रावतार' : 'Son of Vayu — Rudra Incarnation',
      badgeTag: isHindi ? 'परम भक्त' : 'HERO DOSSIER',
      shape: 'circle_medallion',
      archetype: 'macro_relic',
      cueWord: isHindi && narration.includes('हनुमान') ? 'हनुमान' : 'hanuman',
      sfx: 'bubble_pop',
    };
  }

  if (combined.includes('जनक') || combined.includes('janak')) {
    return {
      title: isHindi ? 'महाराज जनक' : 'King Janaka',
      subtitle: isHindi ? 'विदेह मिथिला नरेश' : 'Philosopher King of Mithila',
      badgeTag: isHindi ? 'राजवंश' : 'ROYALTY',
      shape: 'circle_medallion',
      archetype: 'macro_relic',
      cueWord: isHindi && narration.includes('जनक') ? 'जनक' : 'janak',
      sfx: 'bubble_pop',
    };
  }

  if (combined.includes('दशरथ') || combined.includes('dasharath')) {
    return {
      title: isHindi ? 'महाराज दशरथ' : 'King Dasharatha',
      subtitle: isHindi ? 'अयोध्या के चक्रवर्ती नरेश' : 'Emperor of Ayodhya',
      badgeTag: isHindi ? 'अयोध्या' : 'ROYALTY',
      shape: 'circle_medallion',
      archetype: 'macro_relic',
      cueWord: isHindi && narration.includes('दशरथ') ? 'दशरथ' : 'dasharatha',
      sfx: 'bubble_pop',
    };
  }

  if (combined.includes('शिव') || combined.includes('shiva') || combined.includes('महादेव')) {
    return {
      title: isHindi ? 'भगवान शिव' : 'Lord Shiva',
      subtitle: isHindi ? 'देवाधिदेव महादेव' : 'The Supreme Destroyer & Transformer',
      badgeTag: isHindi ? 'महादेव' : 'DIVINE DOSSIER',
      shape: 'circle_medallion',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('शिव') ? 'शिव' : (narration.includes('महादेव') ? 'महादेव' : 'shiva'),
      sfx: 'crystal_ting',
    };
  }

  if (combined.includes('कृष्ण') || combined.includes('krishna')) {
    return {
      title: isHindi ? 'भगवान श्रीकृष्ण' : 'Lord Krishna',
      subtitle: isHindi ? 'योगेश्वर — द्वारकाधीश' : 'Yogeshvara — Supreme Master of Yoga',
      badgeTag: isHindi ? 'योगेश्वर' : 'DIVINE DOSSIER',
      shape: 'circle_medallion',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('कृष्ण') ? 'कृष्ण' : 'krishna',
      sfx: 'crystal_ting',
    };
  }

  // 4. Sacred Geography, Kingdoms & Temple Architecture
  if (combined.includes('जनकपुर') || combined.includes('मिथिला') || combined.includes('mithila') || combined.includes('janakpur')) {
    return {
      title: isHindi ? 'जनकपुर धाम' : 'Janakpur Dham',
      subtitle: isHindi ? 'प्राचीन मिथिला राज्य की राजधानी' : 'Capital of Ancient Mithila Kingdom',
      badgeTag: isHindi ? 'पवित्र स्थल' : 'LOCATION',
      shape: 'museum_glass_card',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('जनकपुर') ? 'जनकपुर' : (narration.includes('मिथिला') ? 'मिथिला' : 'mithila'),
      sfx: 'shutter_click',
    };
  }

  if (combined.includes('अयोध्या') || combined.includes('ayodhya')) {
    return {
      title: isHindi ? 'अयोध्या पुरी' : 'Ayodhya Puri',
      subtitle: isHindi ? 'सूर्यवंश की पावन राजधानी' : 'Holy Capital of the Solar Dynasty',
      badgeTag: isHindi ? 'पवित्र नगरी' : 'LOCATION',
      shape: 'museum_glass_card',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('अयोध्या') ? 'अयोध्या' : 'ayodhya',
      sfx: 'shutter_click',
    };
  }

  if (combined.includes('लंका') || combined.includes('lanka')) {
    return {
      title: isHindi ? 'स्वर्ण लंका' : 'Golden Lanka',
      subtitle: isHindi ? 'त्रिकूट पर्वत साम्राज्य' : 'Citadel Atop Trikuta Mountain',
      badgeTag: isHindi ? 'स्थान' : 'LOCATION',
      shape: 'museum_glass_card',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('लंका') ? 'लंका' : 'lanka',
      sfx: 'shutter_click',
    };
  }

  if (combined.includes('कैलाश') || combined.includes('kailash')) {
    return {
      title: isHindi ? 'कैलाश पर्वत' : 'Mount Kailash',
      subtitle: isHindi ? 'महादेव का पावन निवास स्थल' : 'Sacred Abode of Lord Shiva',
      badgeTag: isHindi ? 'तीर्थ' : 'SACRED SITE',
      shape: 'museum_glass_card',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('कैलाश') ? 'कैलाश' : 'kailash',
      sfx: 'crystal_ting',
    };
  }

  if (combined.includes('चित्रकूट') || combined.includes('chitrakoot')) {
    return {
      title: isHindi ? 'चित्रकूट धाम' : 'Chitrakoot Dham',
      subtitle: isHindi ? 'श्री राम का पावन वनवास स्थल' : 'Holy Abode of Rama During Exile',
      badgeTag: isHindi ? 'तपोभूमि' : 'SACRED SITE',
      shape: 'museum_glass_card',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('चित्रकूट') ? 'चित्रकूट' : 'chitrakoot',
      sfx: 'shutter_click',
    };
  }

  if (combined.includes('दंडकारण्य') || combined.includes('dandakaranya')) {
    return {
      title: isHindi ? 'दंडकारण्य वन' : 'Dandakaranya Forest',
      subtitle: isHindi ? 'प्राचीन घना तपोवन क्षेत्र' : 'Ancient Dense Sacred Wilderness',
      badgeTag: isHindi ? 'वन क्षेत्र' : 'LOCATION',
      shape: 'museum_glass_card',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('दंडकारण्य') ? 'दंडकारण्य' : 'dandakaranya',
      sfx: 'shutter_click',
    };
  }

  if (combined.includes('लक्षद्वीप') || combined.includes('lakshadweep')) {
    return {
      title: isHindi ? 'लक्षद्वीप मंदिर' : 'Lakshadweep Temple',
      subtitle: isHindi ? 'प्राचीन समुद्री पुरातात्विक धरोहर' : 'Ancient Maritime Archeological Heritage',
      badgeTag: isHindi ? 'पुरातत्व' : 'HERITAGE',
      shape: 'museum_glass_card',
      archetype: 'heritage_intel',
      cueWord: isHindi && narration.includes('लक्षद्वीप') ? 'लक्षद्वीप' : 'lakshadweep',
      sfx: 'shutter_click',
    };
  }

  if (combined.includes('मंदिर') || combined.includes('temple') || combined.includes('वास्तु') || combined.includes('architecture')) {
    return {
      title: isHindi ? 'प्राचीन मंदिर स्थापत्य' : 'Temple Architecture',
      subtitle: isHindi ? 'द्रविड़ एवं नागर वास्तु प्रमाण' : 'Dravida & Nagara Architectural Code',
      badgeTag: isHindi ? 'वास्तुकला' : 'ARCHITECTURE',
      shape: 'blueprint_diagram',
      archetype: 'blueprint_diagram',
      cueWord: isHindi && narration.includes('मंदिर') ? 'मंदिर' : (narration.includes('वास्तु') ? 'वास्तु' : 'temple'),
      sfx: 'hud_ping',
    };
  }

  // 5. Mysteries, Vows & Key Story Turning Points
  if (combined.includes('स्वयंवर') || combined.includes('प्रतिज्ञा') || combined.includes('शर्त')) {
    return {
      title: isHindi ? 'शिव धनुष प्रतिज्ञा' : 'The Sacred Vow',
      subtitle: isHindi ? 'सीता स्वयंवर का नियम' : 'Condition of the Sita Swayamvara',
      badgeTag: isHindi ? 'महत्वपूर्ण प्रसंग' : 'KEY TURNING POINT',
      shape: 'mystery_hook',
      archetype: 'mystery_hook',
      cueWord: isHindi && narration.includes('प्रतिज्ञा') ? 'प्रतिज्ञा' : (narration.includes('शर्त') ? 'शर्त' : (narration.includes('स्वयंवर') ? 'स्वयंवर' : 'vow')),
      sfx: 'crystal_ting',
    };
  }

  if (combined.includes('रहस्य') || combined.includes('unsolved') || combined.includes('mystery')) {
    return {
      title: isHindi ? 'अबूझ रहस्य' : 'Unsolved Mystery',
      subtitle: isHindi ? 'प्राचीन ग्रंथों का अनुत्तरित प्रश्न' : 'Unanswered Question of Scripture',
      badgeTag: isHindi ? 'अनसुलझा रहस्य' : 'MYSTERY',
      shape: 'mystery_hook',
      archetype: 'mystery_hook',
      cueWord: isHindi && narration.includes('रहस्य') ? 'रहस्य' : 'mystery',
      sfx: 'crystal_ting',
    };
  }

  // 6. Intelligent Semantic Fallback (Noun Phrase / Proper Entity, NEVER Incomplete Clauses!)
  const stopWords = new Set([
    'ने', 'को', 'से', 'के', 'की', 'का', 'में', 'पर', 'जैसे', 'ही', 'तब', 'जब', 'इस', 'उस', 'और',
    'था', 'थी', 'थे', 'है', 'हैं', 'कि', 'तो', 'भी', 'यह', 'वह', 'कर', 'रहा', 'रही', 'रहे', 'गया', 'गई',
    'a', 'an', 'the', 'is', 'was', 'are', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'but', 'so'
  ]);
  const words = narration.split(/[\s,।!?.]+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
  const topicWord = words[0] || (isHindi ? 'धरोहर' : 'Intel');

  return {
    title: isHindi ? `${topicWord} संदर्भ` : `${topicWord} Intel`,
    subtitle: isHindi ? 'प्राचीन प्रामाणिक ग्रंथ उल्लेख' : 'Documented Historical Reference',
    badgeTag: isHindi ? 'प्रमाणिक संदर्भ' : 'HISTORICAL INTEL',
    shape: 'circle_medallion',
    archetype: 'heritage_intel',
    cueWord: topicWord,
    sfx: 'bubble_pop',
  };
}

/**
 * Offline fallback. Grounds every field in the actual narration and picks the
 * shape / sound from the channel StyleKit. Never invents sample copy.
 */
export function heuristicExtractPopups(script: any): ExtraPopupAsset[] {
  const scenes = Array.isArray(script.scenePlan?.scenes) ? script.scenePlan.scenes : [];
  const popups: ExtraPopupAsset[] = [];
  const scriptText = scenes.map((s: any) => s.narration || '').join(' ');
  const isHindi = /[\u0900-\u097F]/.test(scriptText) || script.language === 'hi';
  const kit = styleKitFor(script.autoPilotSettings?.channelProfile || script.name || '');

  const placements: ExtraPopupPlacementType[] = ['top-right', 'center-right', 'top-left', 'center-left'];

  scenes.forEach((scene: any, index: number) => {
    const narration = String(scene.narration || '').trim();
    const visual = String(scene.imagePrompt || scene.videoPrompt || '').trim();
    const intel = extractProfessionalPopupIntel(narration, visual, index, isHindi, kit, script.name);

    const subject = intel.title || visual || 'archival detail';
    const sfx = clampSfxToKit(kit, intel.sfx);

    popups.push({
      id: `popup_${index}_${crypto.randomBytes(4).toString('hex')}`,
      sceneIndex: index,
      cueWord: intel.cueWord,
      cueOffsetSec: 1.0,
      durationSec: 3.2,
      title: intel.title,
      subtitle: intel.subtitle,
      badgeTag: intel.badgeTag,
      statValue: intel.statValue,
      statUnit: intel.statUnit,
      archetype: intel.archetype,
      prompt: enhanceMacroPrompt(subject, script.name),
      shape: clampShapeToKit(kit, intel.shape),
      placement: placements[index % placements.length],
      scalePercent: 30,
      sfx: sfx || 'bubble_pop',
      status: 'ready',
    });
  });

  return popups;
}

export async function detectPopupsForScript(
  scriptId: string,
  apiKeyParam?: string
): Promise<ExtraPopupAsset[]> {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) {
    throw new Error(`Script not found: ${scriptId}`);
  }

  const scenes = Array.isArray(script.scenePlan?.scenes) ? script.scenePlan.scenes : [];
  if (scenes.length === 0) {
    return [];
  }

  const apiKey = getGeminiApiKey(apiKeyParam);
  if (!apiKey) {
    const detected = heuristicExtractPopups(script);
    script.extraPopups = detected;
    store.add('scripts', script);
    return detected;
  }

  try {
    const scriptText = scenes.map((s: any) => s.narration || '').join(' ');
    const isHindi = /[\u0900-\u097F]/.test(scriptText) || script.language === 'hi';
    const kit = styleKitFor(script.autoPilotSettings?.channelProfile || script.name || '');

    const sceneDescriptions = scenes.map((s: any, idx: number) => ({
      sceneIndex: idx,
      narration: s.narration || '',
      visualPrompt: s.imagePrompt || s.videoPrompt || '',
      durationSec: s.duration || 5,
    }));

    const systemPrompt = `You are a Lead Visual & Motion Graphics Editor for world-class cinematic documentary YouTube Shorts (inspired by Vox, Lemmino, MagnatesMedia).
For each scene in the script, analyze the narration and identify the SINGLE HIGHEST-RETENTION on-screen popup to captivate the viewer.

CRITICAL PROFESSIONAL EDITOR RULES:
1. STRICTLY NO BROKEN SENTENCE FRAGMENTS:
   - Grammatical clauses like "भगवान राम ने जैसे ही" or "जब यह हुआ" are BANNED.
   - Popups MUST be meaningful, useful intel callouts:
     * Entity / Character Dossier (e.g. "श्री राम" | "मर्यादा पुरुषोत्तम — इक्ष्वाकु वंश")
     * Divine Weapon / Relic Architecture (e.g. "पिनाक धनुष" | "भगवान शिव का अमोघ धनुष")
     * Metric / Quantity / Scale (e.g. "१४ वर्ष वनवास" | "मर्यादा एवं त्याग कालखंड")
     * Geographic Location Stamp (e.g. "जनकपुर धाम" | "प्राचीन मिथिला राज्य की राजधानी")
     * Crucial Story Context / Vow (e.g. "शिव धनुष प्रतिज्ञा" | "सीता स्वयंवर का नियम")
2. EXACT CUE SYNCHRONIZATION:
   - "cueWord" MUST be the exact spoken keyword in that scene (e.g. "पिनाक", "धनुष", "चक्र", "जनकपुर", "वर्ष", "राम").
   - The popup triggers right when this word is spoken.
3. CONCISE HIGH-RETENTION COPY:
   - "title": 2 to 4 bold words naming the entity, relic, place, or metric.
   - "subtitle": 3 to 6 words giving rich context or meaning.
   - "badgeTag": 1 to 2 words (e.g. "दिव्यास्त्र", "धरोहर", "स्थान", "चरित्र", "समय सीमा", "रहस्य").

CHANNEL STYLE KIT (this is a brand contract — obey it exactly):
- Palette: primary ${kit.popup.primary}, accent ${kit.popup.accent}, text ${kit.popup.text}
- Allowed shapes ONLY: ${kit.popupShapes.join(' | ')}
- Allowed sounds ONLY: ${kit.sfxPalette.filter(s => s !== 'none').join(' | ')}
- Tone energy: ${kit.energy}

ARCHETYPES (pick the most powerful one per scene):
1. "metric_counter": dramatic numbers, scale, quantities, years, weights, dimensions.
2. "mystery_hook": unsolved paradoxes, open loops, missing evidence, shocking questions.
3. "heritage_intel": historical dates, dynasties, rulers, scriptures, locations.
4. "blueprint_diagram": architectural methods, geometry, subterranean cutaways.
5. "macro_relic": concrete physical materials, tools, carving textures.

LANGUAGE:
${isHindi ? '- Script is HINDI. Output "title", "subtitle", "badgeTag" in HINDI (Devanagari) matching the spoken narration.' : '- Output clean, punchy English titles, subtitles and tags.'}

PLACEMENT RULE:
- Only use: "top-right", "top-left", "center-right", "center-left". Never bottom corners (mobile subtitle safe zone).

OUTPUT JSON SCHEMA:
[
  {
    "sceneIndex": number,
    "archetype": "${CARD_ARCHETYPES.join('" | "')} | "macro_relic",
    "cueWord": "Exact spoken word triggering the popup",
    "cueOffsetSec": number (0.8-1.8),
    "durationSec": number (2.8-3.5),
    "title": "Bold proper noun / entity name (2-4 words)",
    "subtitle": "Explanatory context line (3-6 words)",
    "badgeTag": "Small category pill tag (1-2 words)",
    "statValue": "Large number if metric_counter",
    "statUnit": "Unit tag if metric_counter",
    "subject": "Physical item or texture prompt for image generation",
    "shape": "${kit.popupShapes.join('" | "')}",
    "placement": "${MOBILE_SAFE_PLACEMENTS.join('" | "')}",
    "sfx": "${kit.sfxPalette.filter(s => s !== 'none').join('" | "')}"
  }
]`;

    const userPrompt = `Script Scenes:
${JSON.stringify(sceneDescriptions, null, 2)}`;

    const response = await chat(
      apiKey,
      {
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        json: true,
        temperature: 0.35,
      }
    );

    const rawText = response.choices?.[0]?.message?.content?.trim() || '[]';
    let parsed: any[] = [];
    try {
      parsed = JSON.parse(rawText);
      if (!Array.isArray(parsed) && Array.isArray((parsed as any).popups)) {
        parsed = (parsed as any).popups;
      }
    } catch {
      parsed = [];
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      const fallback = heuristicExtractPopups(script);
      script.extraPopups = fallback;
      store.add('scripts', script);
      return fallback;
    }

    const detected: ExtraPopupAsset[] = parsed.map((item, idx) => {
      const sceneIdx = typeof item.sceneIndex === 'number' ? item.sceneIndex : idx;
      const popupId = `popup_${sceneIdx}_${crypto.randomBytes(4).toString('hex')}`;
      const subject = item.subject || item.title || item.cueWord || 'Relic detail';
      const prompt = enhanceMacroPrompt(subject, script.name);

      const shape = clampShapeToKit(kit, item.shape) === clampShapeToKit(kit, item.archetype)
        ? clampShapeToKit(kit, item.shape)
        : clampShapeToKit(kit, item.shape || item.archetype);
      const placement = mobileSafePlacement(item.placement);
      const sfx = clampSfxToKit(kit, item.sfx);

      return {
        id: popupId,
        sceneIndex: sceneIdx,
        cueWord: String(item.cueWord || subject).slice(0, 100),
        cueOffsetSec: typeof item.cueOffsetSec === 'number' ? item.cueOffsetSec : 1.0,
        durationSec: typeof item.durationSec === 'number' ? Math.min(3.5, item.durationSec) : 3.0,
        title: String(item.title || subject).slice(0, 100),
        subtitle: item.subtitle ? String(item.subtitle).slice(0, 200) : undefined,
        badgeTag: item.badgeTag ? String(item.badgeTag).slice(0, 50) : undefined,
        statValue: item.statValue ? String(item.statValue).slice(0, 30) : undefined,
        statUnit: item.statUnit ? String(item.statUnit).slice(0, 20) : undefined,
        archetype: item.archetype || shape,
        prompt,
        shape,
        placement,
        scalePercent: 30,
        sfx: sfx || 'bubble_pop',
        status: 'ready',
      };
    });

    script.extraPopups = detected;
    store.add('scripts', script);
    return detected;
  } catch (err) {
    console.warn('[extra-popups] Gemini detection failed, falling back to heuristic:', err);
    const fallback = heuristicExtractPopups(script);
    script.extraPopups = fallback;
    store.add('scripts', script);
    return fallback;
  }
}

/**
 * Zero-config Pollinations image generator fallback.
 */
async function generatePollinationsImage(
  prompt: string,
  scriptId: string,
  seed: number
): Promise<{ publicUrl: string; fileName: string; seed: number; elapsedMs: number }> {
  const started = Date.now();
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) {
    throw new Error(`Pollinations API returned status ${res.status}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  const outDir = path.join(generatedDir(), scriptId);
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `popup-${Date.now()}-${seed}.png`;
  fs.writeFileSync(path.join(outDir, fileName), buffer);

  return {
    publicUrl: mediaUrl(`generate/file/${scriptId}/${fileName}`),
    fileName,
    seed,
    elapsedMs: Date.now() - started,
  };
}

export async function generatePopupImage(opts: {
  scriptId: string;
  popupId: string;
  prompt?: string;
  provider?: 'local' | 'cloudflare' | 'google' | 'pollinations';
  modelName?: string;
  seed?: number;
}): Promise<ExtraPopupAsset> {
  const { scriptId, popupId } = opts;
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);

  const popups: ExtraPopupAsset[] = script.extraPopups || [];
  const target = popups.find(p => p.id === popupId);
  if (!target) throw new Error(`Popup not found: ${popupId}`);

  const prompt = opts.prompt || target.prompt;
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const preferredProvider = opts.provider;

  target.status = 'generating';
  delete target.error;
  store.add('scripts', script);

  try {
    let result: { publicUrl: string; fileName: string; seed: number; elapsedMs: number };

    if (preferredProvider === 'pollinations') {
      result = await generatePollinationsImage(prompt, scriptId, seed);
    } else if (preferredProvider === 'cloudflare' || (!preferredProvider && isCloudflareConfigured())) {
      result = await generateCloudflareImage({
        prompt,
        scriptId,
        index: target.sceneIndex,
        seed,
        preset: 'high',
        modelName: opts.modelName,
        filePrefix: 'popup' as any,
      });
    } else if (preferredProvider === 'google' || (!preferredProvider && isGoogleImageConfigured())) {
      result = await generateGoogleImage({
        prompt,
        scriptId,
        index: target.sceneIndex,
        seed,
        filePrefix: 'popup' as any,
      });
    } else if (preferredProvider === 'local') {
      const comfy = await checkComfyStatus();
      if (comfy.online) {
        result = await generateImage({
          prompt,
          scriptId,
          index: target.sceneIndex,
          seed,
          preset: 'high',
          filePrefix: 'popup' as any,
        });
      } else {
        result = await generatePollinationsImage(prompt, scriptId, seed);
      }
    } else {
      // Automatic fallback: try cloudflare -> local -> pollinations
      if (isCloudflareConfigured()) {
        try {
          result = await generateCloudflareImage({
            prompt,
            scriptId,
            index: target.sceneIndex,
            seed,
            preset: 'high',
            modelName: opts.modelName,
            filePrefix: 'popup' as any,
          });
        } catch (cfErr) {
          console.warn('[extra-popups] Cloudflare failed, trying local Comfy:', cfErr);
          const comfy = await checkComfyStatus();
          if (comfy.online) {
            result = await generateImage({
              prompt,
              scriptId,
              index: target.sceneIndex,
              seed,
              preset: 'high',
              filePrefix: 'popup' as any,
            });
          } else {
            result = await generatePollinationsImage(prompt, scriptId, seed);
          }
        }
      } else {
        const comfy = await checkComfyStatus();
        if (comfy.online) {
          result = await generateImage({
            prompt,
            scriptId,
            index: target.sceneIndex,
            seed,
            preset: 'high',
            filePrefix: 'popup' as any,
          });
        } else {
          result = await generatePollinationsImage(prompt, scriptId, seed);
        }
      }
    }

    target.imageUrl = result.publicUrl;
    target.status = 'ready';
    store.add('scripts', script);
    return target;
  } catch (err: any) {
    console.error(`[extra-popups] Failed to generate image for popup ${popupId}:`, err);
    target.status = 'error';
    target.error = err.message || 'Generation failed';
    store.add('scripts', script);
    throw err;
  }
}

export async function generateAllPopupsForScript(
  scriptId: string,
  options?: {
    apiKey?: string;
    imageProvider?: 'local' | 'cloudflare' | 'google' | 'pollinations';
    onProgress?: (completed: number, total: number, currentPopup: ExtraPopupAsset) => void;
  }
): Promise<ExtraPopupAsset[]> {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);

  let popups: ExtraPopupAsset[] = script.extraPopups || [];
  if (popups.length === 0) {
    popups = await detectPopupsForScript(scriptId, options?.apiKey);
  }

  const results: ExtraPopupAsset[] = [];
  const pending = popups.filter(p => p.status !== 'ready');

  for (let i = 0; i < popups.length; i++) {
    const p = popups[i];
    if (p.status === 'ready' && p.imageUrl) {
      results.push(p);
      options?.onProgress?.(i + 1, popups.length, p);
      continue;
    }

    try {
      const updated = await generatePopupImage({
        scriptId,
        popupId: p.id,
        provider: options?.imageProvider,
      });
      results.push(updated);
      options?.onProgress?.(i + 1, popups.length, updated);
    } catch (err) {
      console.warn(`[extra-popups] Skipped popup ${p.id} due to error:`, err);
      results.push(p);
      options?.onProgress?.(i + 1, popups.length, p);
    }
  }

  return results;
}

/** Create a user-authored popup, clamped into the channel StyleKit. */
export function addCustomPopupAsset(scriptId: string, input: Partial<ExtraPopupAsset> & { subject?: string }): ExtraPopupAsset {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);
  const kit = styleKitFor(script.autoPilotSettings?.channelProfile || script.name || '');
  const popups: ExtraPopupAsset[] = script.extraPopups || [];

  const popup: ExtraPopupAsset = {
    id: input.id || `popup_custom_${crypto.randomBytes(4).toString('hex')}`,
    sceneIndex: input.sceneIndex ?? 0,
    cueWord: input.cueWord || input.title || 'detail',
    cueOffsetSec: input.cueOffsetSec ?? 1.0,
    durationSec: input.durationSec ?? 3.2,
    title: input.title || 'Untitled',
    subtitle: input.subtitle,
    prompt: input.prompt || enhanceMacroPrompt(input.subject || input.title || 'detail', script.name),
    negativePrompt: input.negativePrompt,
    shape: clampShapeToKit(kit, input.shape),
    placement: mobileSafePlacement(input.placement),
    scalePercent: input.scalePercent ?? 30,
    imageUrl: input.imageUrl,
    maskUrl: input.maskUrl,
    sfx: clampSfxToKit(kit, input.sfx),
    statValue: input.statValue,
    statUnit: input.statUnit,
    badgeTag: input.badgeTag,
    archetype: input.archetype || input.shape,
    status: input.imageUrl ? 'ready' : 'pending',
  };

  popups.push(popup);
  script.extraPopups = popups;
  store.add('scripts', script);
  return popup;
}

/** Merge a partial edit into an existing popup, re-clamping shape/sfx/placement to the kit. */
export function updatePopupAsset(scriptId: string, input: Partial<ExtraPopupAsset> & { id: string }): ExtraPopupAsset {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);
  const kit = styleKitFor(script.autoPilotSettings?.channelProfile || script.name || '');
  const popups: ExtraPopupAsset[] = script.extraPopups || [];
  const idx = popups.findIndex(p => p.id === input.id);
  if (idx < 0) throw new Error(`Popup not found: ${input.id}`);

  const existing = popups[idx];
  const merged: ExtraPopupAsset = {
    ...existing,
    ...input,
    shape: input.shape ? clampShapeToKit(kit, input.shape) : existing.shape,
    placement: input.placement ? mobileSafePlacement(input.placement) : existing.placement,
    sfx: input.sfx ? clampSfxToKit(kit, input.sfx) : existing.sfx,
  };
  popups[idx] = merged;
  script.extraPopups = popups;
  store.add('scripts', script);
  return merged;
}

export function deletePopupAsset(scriptId: string, popupId: string): void {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);
  script.extraPopups = (script.extraPopups || []).filter((p: ExtraPopupAsset) => p.id !== popupId);
  store.add('scripts', script);
}

/** Persist a base64 image supplied by the client as the popup's artwork. */
export function saveUploadedPopupImage(scriptId: string, popupId: string, base64Data: string): ExtraPopupAsset {
  const script = store.getById<any>('scripts', scriptId);
  if (!script) throw new Error(`Script not found: ${scriptId}`);
  const popups: ExtraPopupAsset[] = script.extraPopups || [];
  const target = popups.find(p => p.id === popupId);
  if (!target) throw new Error(`Popup not found: ${popupId}`);

  const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(base64Data);
  const buffer = Buffer.from(match ? match[2] : base64Data, 'base64');
  const ext = match?.[1] === 'jpeg' ? 'jpg' : match?.[1] || 'png';

  const outDir = path.join(generatedDir(), scriptId);
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `popup-upload-${popupId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(outDir, fileName), buffer);

  target.imageUrl = mediaUrl(`generate/file/${scriptId}/${fileName}`);
  target.status = 'ready';
  delete target.error;
  script.extraPopups = popups;
  store.add('scripts', script);
  return target;
}

export function compileExtraPopupToMotionGraphic(
  popup: ExtraPopupAsset,
  opts: {
    width?: number;
    height?: number;
    startSec?: number;
    durationSec?: number;
    fps?: number;
    channelKey?: string;
  } = {}
): DynamicMotionGraphicData {
  const width = opts.width || 1080;
  const height = opts.height || 1920;
  const id = `dmg-${popup.id}`;
  const shape = popup.shape || 'circle_medallion';
  const isLeft = (popup.placement || '').includes('left');
  const durSec = typeof opts.durationSec === 'number' ? opts.durationSec : (popup.durationSec || 3.2);
  const startSec = typeof opts.startSec === 'number' ? Math.max(0, opts.startSec) : (popup.cueOffsetSec || 1.0);

  // Single source of visual identity: the channel StyleKit. No hardcoded palette here.
  const kit = styleKitFor(opts.channelKey || popup.archetype || '');
  const theme = kit.popup;
  const noCard = theme.cardStyle === 'none';

  // Resolve image to base64 Data URI for 100% reliable zero-latency offline rendering in Chromium
  let imgSrc = popup.imageUrl || '';
  if (imgSrc.startsWith('/api/generate/file/')) {
    const rawParts = imgSrc.replace('/api/generate/file/', '').split('/');
    if (rawParts.length >= 2) {
      const sId = rawParts[0];
      const fName = rawParts.slice(1).join('/');
      const diskPath = path.resolve(generatedDir(), sId, fName);
      if (fs.existsSync(diskPath)) {
        try {
          const b64 = fs.readFileSync(diskPath).toString('base64');
          imgSrc = `data:image/png;base64,${b64}`;
        } catch (err) {
          console.warn('[extra-popups] Could not read disk image for base64:', err);
        }
      }
    }
  }

  // Safe zones: protect top 15% (Shorts header/camera safe zone) and bottom 25% (subtitle area)
  let posStyles = '';
  switch (popup.placement) {
    case 'top-left':
      posStyles = 'top: 18%; left: 6%; align-items: flex-start;';
      break;
    case 'bottom-left':
      posStyles = 'top: 26%; left: 6%; align-items: flex-start;';
      break;
    case 'bottom-right':
      posStyles = 'top: 26%; right: 6%; align-items: flex-end;';
      break;
    case 'center-left':
      posStyles = 'top: 24%; left: 6%; align-items: flex-start;';
      break;
    case 'center-right':
      posStyles = 'top: 24%; right: 6%; align-items: flex-end;';
      break;
    case 'top-right':
    default:
      posStyles = 'top: 18%; right: 6%; align-items: flex-end;';
      break;
  }

  const hasImage = Boolean(imgSrc && imgSrc.length > 10);
  const themeColor = theme.primary;
  const themeGlow = theme.glow;
  const isMetric = shape === 'metric_counter' || popup.archetype === 'metric_counter';
  const isMystery = shape === 'mystery_hook' || popup.archetype === 'mystery_hook';
  const isBlueprint = shape === 'blueprint_diagram' || popup.archetype === 'blueprint_diagram';
  const isHeritage = shape === 'heritage_intel' || popup.archetype === 'heritage_intel';
  const badgeTag = popup.badgeTag || (isMetric ? 'STATED FIGURE' : isMystery ? 'OPEN QUESTION' : isHeritage ? 'HERITAGE' : isBlueprint ? 'GEOMETRY' : 'DETAIL');

  // Graphic frame SVG (Only rendered when a high-resolution photo/macro asset is present)
  let frameSvg = '';
  if (hasImage) {
    if (shape === 'tactical_hexagon') {
      frameSvg = `
        <div class="ep-frame-thumb ep-hex">
          <svg viewBox="0 0 100 100" class="ep-svg">
            <defs>
              <clipPath id="hexClip-${popup.id}">
                <polygon points="50,4 94,26 94,74 50,96 6,74 6,26" />
              </clipPath>
            </defs>
            <polygon points="50,2 96,25 96,75 50,98 4,75 4,25" fill="none" stroke="${themeGlow}" stroke-width="4" />
            <polygon points="50,4 94,26 94,74 50,96 6,74 6,26" fill="none" stroke="${themeColor}" stroke-width="3" />
            <image href="${imgSrc}" x="6" y="4" width="88" height="92" clip-path="url(#hexClip-${popup.id})" preserveAspectRatio="xMidYMid slice" />
          </svg>
        </div>
      `;
    } else if (shape === 'museum_glass_card') {
      frameSvg = `
        <div class="ep-frame-thumb ep-glass">
          <div class="ep-glass-inner" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(255,215,0,0.2),rgba(0,0,0,0.75));">
            <img src="${imgSrc}" alt="${popup.title}" class="ep-img" />
            <div class="ep-glass-shine"></div>
          </div>
        </div>
      `;
    } else if (shape === 'magnifying_loupe') {
      frameSvg = `
        <div class="ep-frame-thumb ep-loupe">
          <svg viewBox="0 0 100 100" class="ep-svg">
            <defs>
              <clipPath id="loupeClip-${popup.id}"><circle cx="45" cy="45" r="38" /></clipPath>
            </defs>
            <circle cx="45" cy="45" r="41" fill="none" stroke="${themeGlow}" stroke-width="4" />
            <circle cx="45" cy="45" r="39" fill="none" stroke="${themeColor}" stroke-width="2.5" />
            <image href="${imgSrc}" x="7" y="7" width="76" height="76" clip-path="url(#loupeClip-${popup.id})" preserveAspectRatio="xMidYMid slice" />
            <line x1="72" y1="72" x2="96" y2="96" stroke="${themeColor}" stroke-width="6" stroke-linecap="round" />
          </svg>
        </div>
      `;
    } else if (shape === 'cutout_relic') {
      frameSvg = `
        <div class="ep-frame-thumb ep-cutout">
          <svg viewBox="0 0 100 100" class="ep-svg">
            <defs>
              <clipPath id="cutClip-${popup.id}">
                <path d="M50 3 C70 3 92 18 95 42 C98 66 82 90 52 96 C24 100 4 78 5 50 C6 24 28 3 50 3 Z" />
              </clipPath>
            </defs>
            <path d="M50 3 C70 3 92 18 95 42 C98 66 82 90 52 96 C24 100 4 78 5 50 C6 24 28 3 50 3 Z" fill="none" stroke="${themeGlow}" stroke-width="4" />
            <image href="${imgSrc}" x="2" y="2" width="96" height="96" clip-path="url(#cutClip-${popup.id})" preserveAspectRatio="xMidYMid slice" />
            <path d="M50 3 C70 3 92 18 95 42 C98 66 82 90 52 96 C24 100 4 78 5 50 C6 24 28 3 50 3 Z" fill="none" stroke="${themeColor}" stroke-width="2" stroke-dasharray="6 4" />
          </svg>
        </div>
      `;
    } else {
      frameSvg = `
        <div class="ep-frame-thumb ep-circle">
          <svg viewBox="0 0 100 100" class="ep-svg">
            <defs>
              <clipPath id="circleClip-${popup.id}">
                <circle cx="50" cy="50" r="41" />
              </clipPath>
            </defs>
            <circle cx="50" cy="50" r="46" fill="none" stroke="${themeGlow}" stroke-width="3.5" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="${themeColor}" stroke-width="2.5" />
            <image href="${imgSrc}" x="9" y="9" width="82" height="82" clip-path="url(#circleClip-${popup.id})" preserveAspectRatio="xMidYMid slice" />
          </svg>
        </div>
      `;
    }
  }

  let badgeContentHtml = '';
  if (isMetric && (popup.statValue || popup.statUnit)) {
    badgeContentHtml = `
      <div class="ep-badge-pill">
        <span class="ep-pill-dot"></span>
        <span class="ep-pill-tag">${badgeTag}</span>
      </div>
      <div class="ep-stat-row">
        <span class="ep-stat-num">${popup.statValue || popup.title}</span>
        ${popup.statUnit ? `<span class="ep-stat-unit">${popup.statUnit}</span>` : ''}
      </div>
      <div class="ep-title">${popup.title}</div>
      ${popup.subtitle ? `<div class="ep-sub">${popup.subtitle}</div>` : ''}
    `;
  } else {
    badgeContentHtml = `
      <div class="ep-badge-pill">
        <span class="ep-pill-dot"></span>
        <span class="ep-pill-tag">${badgeTag}</span>
      </div>
      <div class="ep-title">${popup.title}</div>
      ${popup.subtitle ? `<div class="ep-sub">${popup.subtitle}</div>` : ''}
    `;
  }

  const cardBodyHtml = hasImage
    ? `
      <div class="ep-card ep-dossier-card ep-has-thumb">
        <div class="ep-media-row">
          ${frameSvg}
          <div class="ep-content-side">
            ${badgeContentHtml}
          </div>
        </div>
      </div>
    `
    : `
      <div class="ep-card ep-dossier-card ${isMetric ? 'ep-card-metric' : ''}">
        ${badgeContentHtml}
      </div>
    `;

  const html = `
    <div id="${id}" class="ep-wrapper" style="${posStyles}">
      ${cardBodyHtml}
    </div>
  `;

  const css = `
    #${id}.ep-wrapper {
      position: absolute;
      display: flex;
      flex-direction: column;
      pointer-events: none;
      z-index: 50;
      user-select: none;
      visibility: hidden;
      opacity: 0;
      font-family: ${kit.theme.fontFamily}, system-ui, -apple-system, sans-serif;
    }
    #${id} .ep-card {
      display: flex;
      flex-direction: column;
      padding: 16px 22px;
      border-radius: ${Math.max(12, kit.theme.radius * 2.5)}px;
      background: ${noCard ? 'transparent' : 'rgba(12, 10, 8, 0.90)'};
      border: 1.5px solid ${theme.surfaceBorder};
      box-shadow: 0 16px 42px rgba(0,0,0,0.92), 0 0 28px ${theme.glow};
      backdrop-filter: blur(20px);
      min-width: 280px;
      max-width: 380px;
    }
    #${id} .ep-card-metric {
      border-color: ${theme.primary};
      box-shadow: 0 16px 42px rgba(0,0,0,0.92), 0 0 32px ${theme.glow};
    }
    #${id} .ep-media-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    #${id} .ep-frame-thumb {
      position: relative;
      width: 110px;
      height: 110px;
      flex-shrink: 0;
    }
    #${id} .ep-frame-thumb .ep-svg {
      width: 100%;
      height: 100%;
    }
    #${id} .ep-glass {
      padding: 6px;
      border-radius: 16px;
      background: rgba(255, 215, 0, 0.08);
      border: 1.5px solid ${theme.primary};
    }
    #${id} .ep-glass-inner {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 12px;
      overflow: hidden;
    }
    #${id} .ep-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    #${id} .ep-content-side {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    #${id} .ep-badge-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.06);
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    #${id} .ep-pill-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: ${theme.badge};
      box-shadow: 0 0 8px ${theme.badge};
    }
    #${id} .ep-pill-tag {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.14em;
      color: ${theme.primary};
      text-transform: uppercase;
    }
    #${id} .ep-stat-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin: 4px 0 6px 0;
    }
    #${id} .ep-stat-num {
      font-size: 44px;
      font-weight: 900;
      color: ${theme.text};
      letter-spacing: -0.02em;
      line-height: 1.0;
      text-shadow: 0 0 20px ${theme.glow};
    }
    #${id} .ep-stat-unit {
      font-size: 18px;
      font-weight: 800;
      color: ${theme.primary};
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    #${id} .ep-title {
      font-size: 26px;
      font-weight: 900;
      color: ${theme.text};
      letter-spacing: 0.01em;
      line-height: 1.25;
      text-shadow: 0 2px 10px rgba(0,0,0,0.95);
    }
    #${id} .ep-sub {
      font-size: 15px;
      font-weight: 500;
      color: ${theme.muted};
      margin-top: 4px;
      line-height: 1.35;
      text-shadow: 0 1px 6px rgba(0,0,0,0.9);
    }
  `;

  const js = `
  {
    const rootEl = typeof container !== 'undefined' && container ? container : document;
    const wrapper = rootEl.querySelector('#${id}');
    const card = rootEl.querySelector('#${id} .ep-card');

    if (wrapper && card) {
      gsap.set(wrapper, { autoAlpha: 0 });
      tl.set(wrapper, { autoAlpha: 1 }, ${startSec.toFixed(3)});
      tl.fromTo(card,
        { scale: 0.8, autoAlpha: 0, x: ${isLeft ? -35 : 35}, transformOrigin: '${isLeft ? "left center" : "right center"}' },
        { scale: 1, autoAlpha: 1, x: 0, duration: 0.42, ease: 'back.out(1.6)' },
        ${startSec.toFixed(3)}
      );

      tl.to(card, {
        y: '-=5px',
        duration: 1.6,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: ${Math.max(1, Math.floor(durSec / 1.6))}
      }, ${(startSec + 0.42).toFixed(3)});

      tl.to(card, {
        scale: 0.88,
        autoAlpha: 0,
        x: ${isLeft ? -25 : 25},
        duration: 0.35,
        ease: 'power2.in'
      }, ${(startSec + durSec - 0.35).toFixed(3)});

      tl.set(wrapper, { autoAlpha: 0 }, ${(startSec + durSec).toFixed(3)});
    }
  }
  `;

  return {
    id,
    sceneIndex: popup.sceneIndex,
    type: 'extra_popup',
    title: popup.title,
    detail: popup.subtitle,
    cuePhrase: popup.cueWord,
    startSec: typeof opts.startSec === 'number' ? opts.startSec : popup.cueOffsetSec,
    durationSec: durSec,
    placement: {
      position: popup.placement as any,
      align: 'center',
    },
    visualConcept: popup.prompt,
    sfx: {
      kind: popup.sfx as any,
      volume: 0.7,
      startSec: 0,
    },
    render: {
      html,
      css,
      js,
    },
  };
}
