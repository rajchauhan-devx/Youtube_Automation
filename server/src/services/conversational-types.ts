
export interface DialogueTurn {
  speaker: string;
  text: string;
  voiceId?: string;
  speed?: number;
  pitch?: number;
  startSec?: number;
  endSec?: number;
  durationSec?: number;
}

export interface CharacterVoiceAssignment {
  voiceId: string;
  speed: number;
  pitch?: number;
  description?: string;
  gender?: 'male' | 'female' | 'neutral';
}

/**
 * Distinct Chirp 3 HD voice pools for Hindi.
 * Narrator voice (Charon) is strictly reserved for [सूत्रधार] / [Narrator] and excluded from character pools.
 */
export const HINDI_MALE_VOICE_POOL = [
  'hi-IN-Chirp3-HD-Fenrir',      // Fierce, energetic warrior / younger brother
  'hi-IN-Chirp3-HD-Alnilam',     // Noble, serene, measured leader / prince
  'hi-IN-Chirp3-HD-Schedar',     // Deep, authoritative, majestic sovereign / oceanic baritone
  'hi-IN-Chirp3-HD-Enceladus',   // Resonant, powerful, devout warrior
  'hi-IN-Chirp3-HD-Algieba',     // Thoughtful, sage, philosopher / advisor
  'hi-IN-Chirp3-HD-Orus',        // Grounded, direct warrior
  'hi-IN-Chirp3-HD-Puck',        // Sharp, agile speaker
  'hi-IN-Chirp3-HD-Sadachbia',   // Steady, balanced speaker
  'hi-IN-Chirp3-HD-Achird',      // Distinct male character
  'hi-IN-Chirp3-HD-Algenib',     // Distinct male character
  'hi-IN-Chirp3-HD-Iapetus',     // Distinct male character
  'hi-IN-Chirp3-HD-Rasalgethi',  // Distinct male character
  'hi-IN-Chirp3-HD-Sadaltager',  // Distinct male character
  'hi-IN-Chirp3-HD-Umbriel',     // Distinct male character
  'hi-IN-Chirp3-HD-Zubenelgenubi', // Distinct male character
];

export const HINDI_FEMALE_VOICE_POOL = [
  'hi-IN-Chirp3-HD-Aoede',       // Dignified, graceful, divine female lead
  'hi-IN-Chirp3-HD-Despina',     // Expressive, regal queen / passionate female
  'hi-IN-Chirp3-HD-Achernar',    // Distinct female character
  'hi-IN-Chirp3-HD-Autonoe',     // Distinct female character
  'hi-IN-Chirp3-HD-Callirrhoe',  // Distinct female character
  'hi-IN-Chirp3-HD-Erinome',     // Distinct female character
  'hi-IN-Chirp3-HD-Gacrux',      // Distinct female character
  'hi-IN-Chirp3-HD-Kore',        // Distinct female character
  'hi-IN-Chirp3-HD-Laomedeia',   // Distinct female character
  'hi-IN-Chirp3-HD-Leda',        // Distinct female character
  'hi-IN-Chirp3-HD-Pulcherrima', // Distinct female character
  'hi-IN-Chirp3-HD-Sulafat',     // Distinct female character
  'hi-IN-Chirp3-HD-Vindemiatrix',// Distinct female character
  'hi-IN-Chirp3-HD-Zephyr',      // Distinct female character
];

export const ENGLISH_MALE_VOICE_POOL = [
  'en-US-Chirp3-HD-Fenrir',
  'en-US-Chirp3-HD-Alnilam',
  'en-US-Chirp3-HD-Schedar',
  'en-US-Chirp3-HD-Enceladus',
  'en-US-Chirp3-HD-Algieba',
  'en-US-Chirp3-HD-Orus',
  'en-US-Chirp3-HD-Puck',
  'en-US-Chirp3-HD-Charon',
];

export const ENGLISH_FEMALE_VOICE_POOL = [
  'en-US-Chirp3-HD-Despina',
  'en-US-Chirp3-HD-Aoede',
  'en-US-Chirp3-HD-Kore',
  'en-US-Chirp3-HD-Leda',
  'en-US-Chirp3-HD-Callirrhoe',
  'en-US-Chirp3-HD-Zephyr',
  'en-US-Chirp3-HD-Autonoe',
];

/** Pre-configured voice castings per channel / language */
export const CHARACTER_CAST_PRESETS: Record<string, Record<string, CharacterVoiceAssignment>> = {
  // Ancient Dharma / Hindi Epics
  ancient_dharma: {
    narrator: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.86, description: 'Venerable, calm storyteller', gender: 'male' },
    सूत्रधार: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.86, description: 'Venerable, calm storyteller', gender: 'male' },
    ram: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85, description: 'Noble, serene, measured elder brother', gender: 'male' },
    राम: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85, description: 'Noble, serene, measured elder brother', gender: 'male' },
    shri_ram: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85, description: 'Noble, serene, measured elder brother', gender: 'male' },
    श्रीराम: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85, description: 'Noble, serene, measured elder brother', gender: 'male' },
    lakshman: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 0.88, description: 'Fierce, energetic, loyal younger warrior', gender: 'male' },
    लक्ष्मण: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 0.88, description: 'Fierce, energetic, loyal younger warrior', gender: 'male' },
    sita: { voiceId: 'hi-IN-Chirp3-HD-Aoede', speed: 0.86, description: 'Dignified, graceful, divine female voice', gender: 'female' },
    सीता: { voiceId: 'hi-IN-Chirp3-HD-Aoede', speed: 0.86, description: 'Dignified, graceful, divine female voice', gender: 'female' },
    hanuman: { voiceId: 'hi-IN-Chirp3-HD-Enceladus', speed: 0.86, description: 'Devoted, powerful, resonant warrior', gender: 'male' },
    हनुमान: { voiceId: 'hi-IN-Chirp3-HD-Enceladus', speed: 0.86, description: 'Devoted, powerful, resonant warrior', gender: 'male' },
    ravana: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.84, description: 'Authoritative, imposing, arrogant baritone', gender: 'male' },
    रावण: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.84, description: 'Authoritative, imposing, arrogant baritone', gender: 'male' },
    samudra: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.92, description: 'Deep, majestic, oceanic sovereign deity', gender: 'male' },
    समुद्र: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.92, description: 'Deep, majestic, oceanic sovereign deity', gender: 'male' },
    सागर: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.92, description: 'Deep, majestic, oceanic sovereign deity', gender: 'male' },
    vibhishana: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.96, description: 'Thoughtful, righteous seeker', gender: 'male' },
    विभीषण: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.96, description: 'Thoughtful, righteous seeker', gender: 'male' },
    bharat: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.95, description: 'Devoted, humble brother', gender: 'male' },
    भरत: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.95, description: 'Devoted, humble brother', gender: 'male' },
    dasharatha: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.92, description: 'Aged, noble emperor', gender: 'male' },
    दशरथ: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.92, description: 'Aged, noble emperor', gender: 'male' },
    kaikeyi: { voiceId: 'hi-IN-Chirp3-HD-Despina', speed: 1.0, description: 'Conflicted, passionate queen', gender: 'female' },
    कैकेयी: { voiceId: 'hi-IN-Chirp3-HD-Despina', speed: 1.0, description: 'Conflicted, passionate queen', gender: 'female' },
    indrajit: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.08, description: 'Cunning, fierce warrior prince', gender: 'male' },
    मेघनाद: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.08, description: 'Cunning, fierce warrior prince', gender: 'male' },
    इंद्रजीत: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.08, description: 'Cunning, fierce warrior prince', gender: 'male' },
    kumbhakarna: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.88, description: 'Deep, thunderous giant baritone', gender: 'male' },
    कुंभकर्ण: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.88, description: 'Deep, thunderous giant baritone', gender: 'male' },
    jatayu: { voiceId: 'hi-IN-Chirp3-HD-Enceladus', speed: 0.96, description: 'Noble, resonant elder warrior guardian', gender: 'male' },
    जटायु: { voiceId: 'hi-IN-Chirp3-HD-Enceladus', speed: 0.96, description: 'Noble, resonant elder warrior guardian', gender: 'male' },
    krishna: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85, description: 'Transcendent, tranquil supreme teacher', gender: 'male' },
    कृष्ण: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85, description: 'Transcendent, tranquil supreme teacher', gender: 'male' },
    श्रीकृष्ण: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85, description: 'Transcendent, tranquil supreme teacher', gender: 'male' },
    arjuna: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.02, description: 'Determined, earnest archer', gender: 'male' },
    अर्जुन: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.02, description: 'Determined, earnest archer', gender: 'male' },
    karna: { voiceId: 'hi-IN-Chirp3-HD-Orus', speed: 0.86, description: 'Proud, tragic warrior', gender: 'male' },
    कर्ण: { voiceId: 'hi-IN-Chirp3-HD-Orus', speed: 0.86, description: 'Proud, tragic warrior', gender: 'male' },
    draupadi: { voiceId: 'hi-IN-Chirp3-HD-Despina', speed: 1.02, description: 'Fiery, dignified empress', gender: 'female' },
    द्रौपदी: { voiceId: 'hi-IN-Chirp3-HD-Despina', speed: 1.02, description: 'Fiery, dignified empress', gender: 'female' },
    shiva: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.9, description: 'Deep cosmic ascetic deity', gender: 'male' },
    शिव: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.9, description: 'Deep cosmic ascetic deity', gender: 'male' },
    mahadev: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.9, description: 'Deep cosmic ascetic deity', gender: 'male' },
    महादेव: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.9, description: 'Deep cosmic ascetic deity', gender: 'male' },
    // Historical, philosophical & craft archetypes
    acharya: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.96, description: 'Wise philosopher / ancient master', gender: 'male' },
    आचार्य: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.96, description: 'Wise philosopher / ancient master', gender: 'male' },
    guru: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.96, description: 'Revered spiritual guide', gender: 'male' },
    गुरु: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.96, description: 'Revered spiritual guide', gender: 'male' },
    rishi: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.94, description: 'Vedic sage', gender: 'male' },
    ऋषि: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.94, description: 'Vedic sage', gender: 'male' },
    craftsman: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.04, description: 'Skilled master craftsman / swordsmith', gender: 'male' },
    कारीगर: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.04, description: 'Skilled master craftsman / swordsmith', gender: 'male' },
    metallurgist: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.04, description: 'Ancient metallurgist', gender: 'male' },
    लोहार: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.04, description: 'Ancient metallurgist / blacksmith', gender: 'male' },
    apprentice: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 1.0, description: 'Earnest youth / student', gender: 'male' },
    shishya: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 1.0, description: 'Earnest youth / student', gender: 'male' },
    शिष्य: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 1.0, description: 'Earnest youth / student', gender: 'male' },
    scientist: { voiceId: 'hi-IN-Chirp3-HD-Enceladus', speed: 1.0, description: 'Inquisitive modern or ancient researcher', gender: 'male' },
    वैज्ञानिक: { voiceId: 'hi-IN-Chirp3-HD-Enceladus', speed: 1.0, description: 'Inquisitive modern or ancient researcher', gender: 'male' },
    scholar: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.98, description: 'Historian / scholar', gender: 'male' },
    विद्वान: { voiceId: 'hi-IN-Chirp3-HD-Algieba', speed: 0.98, description: 'Historian / scholar', gender: 'male' },
    king: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.93, description: 'Commanding sovereign / king', gender: 'male' },
    राजा: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.93, description: 'Commanding sovereign / king', gender: 'male' },
    queen: { voiceId: 'hi-IN-Chirp3-HD-Despina', speed: 0.98, description: 'Regal queen', gender: 'female' },
    रानी: { voiceId: 'hi-IN-Chirp3-HD-Despina', speed: 0.98, description: 'Regal queen', gender: 'female' },
    woman: { voiceId: 'hi-IN-Chirp3-HD-Aoede', speed: 1.0, description: 'Expressive female lead', gender: 'female' },
    स्त्री: { voiceId: 'hi-IN-Chirp3-HD-Aoede', speed: 1.0, description: 'Expressive female lead', gender: 'female' },
    man: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.02, description: 'Direct male speaker', gender: 'male' },
    पुरुष: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.02, description: 'Direct male speaker', gender: 'male' },
  },

  // Talvora / Suspense Thriller & Dramatic Mystery (Hindi & English)
  talvora: {
    // Hindi characters - natural brisk pacing (1.04x speed) for conversational realism
    सूत्रधार: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 1.02, description: 'Suspense drama narrator', gender: 'male' },
    नताशा: { voiceId: 'hi-IN-Chirp3-HD-Despina', speed: 1.04, description: 'Sharp, charismatic heroine', gender: 'female' },
    विक्रम: { voiceId: 'hi-IN-Chirp3-HD-Orus', speed: 1.04, description: 'Intense tactical investigator', gender: 'male' },
    स्त्री: { voiceId: 'hi-IN-Chirp3-HD-Aoede', speed: 1.04, description: 'Intense female lead', gender: 'female' },
    महिला: { voiceId: 'hi-IN-Chirp3-HD-Aoede', speed: 1.04, description: 'Intense female lead', gender: 'female' },
    लड़की: { voiceId: 'hi-IN-Chirp3-HD-Despina', speed: 1.04, description: 'Young woman lead', gender: 'female' },
    मालकिन: { voiceId: 'hi-IN-Chirp3-HD-Despina', speed: 1.04, description: 'Influential woman', gender: 'female' },
    मैम: { voiceId: 'hi-IN-Chirp3-HD-Despina', speed: 1.04, description: 'Influential woman', gender: 'female' },
    पुरुष: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 1.04, description: 'Determined male operative', gender: 'male' },
    बॉडीगार्ड: { voiceId: 'hi-IN-Chirp3-HD-Orus', speed: 1.04, description: 'Protective specialist', gender: 'male' },

    // English / Shared characters
    narrator: { voiceId: 'en-US-Chirp3-HD-Aoede', speed: 1.04, description: 'Atmospheric thriller narrator', gender: 'female' },
    elena: { voiceId: 'en-US-Chirp3-HD-Despina', speed: 1.04, description: 'Sharp, intelligent female lead', gender: 'female' },
    natasha: { voiceId: 'en-US-Chirp3-HD-Despina', speed: 1.04, description: 'Sharp, charismatic heroine', gender: 'female' },
    vikram: { voiceId: 'en-US-Chirp3-HD-Orus', speed: 1.04, description: 'Intense tactical investigator', gender: 'male' },
    stranger: { voiceId: 'en-US-Chirp3-HD-Charon', speed: 1.02, description: 'Low, calm, enigmatic male baritone', gender: 'male' },
    julian: { voiceId: 'en-US-Chirp3-HD-Charon', speed: 1.02, description: 'Low, calm, enigmatic male baritone', gender: 'male' },
    marcus: { voiceId: 'en-US-Chirp3-HD-Fenrir', speed: 1.04, description: 'Sharp male counterpart', gender: 'male' },
    clara: { voiceId: 'en-US-Chirp3-HD-Aoede', speed: 1.02, description: 'Focused confidante', gender: 'female' },
    detective: { voiceId: 'en-US-Chirp3-HD-Algieba', speed: 1.04, description: 'Methodical investigator', gender: 'male' },
    heiress: { voiceId: 'en-US-Chirp3-HD-Despina', speed: 1.04, description: 'Determined heiress', gender: 'female' },
    heroine: { voiceId: 'en-US-Chirp3-HD-Aoede', speed: 1.04, description: 'Sharp female protagonist', gender: 'female' },
    bodyguard: { voiceId: 'en-US-Chirp3-HD-Orus', speed: 1.04, description: 'Protective specialist', gender: 'male' },
    man: { voiceId: 'en-US-Chirp3-HD-Fenrir', speed: 1.04, description: 'Direct male voice', gender: 'male' },
    woman: { voiceId: 'en-US-Chirp3-HD-Despina', speed: 1.04, description: 'Expressive female voice', gender: 'female' },
  },

  // Against the Odds / Survival Documentaries
  against_the_odds: {
    narrator: { voiceId: 'en-US-Chirp3-HD-Algieba', speed: 1.0, description: 'Grounded documentary narrator', gender: 'male' },
    survivor: { voiceId: 'en-US-Chirp3-HD-Fenrir', speed: 1.04, description: 'Intense firsthand survival voice', gender: 'male' },
    rescuer: { voiceId: 'en-US-Chirp3-HD-Charon', speed: 0.96, description: 'Authoritative dispatch voice', gender: 'male' },
  },
};

// Talevora alias
CHARACTER_CAST_PRESETS.talevora = CHARACTER_CAST_PRESETS.talvora;

/**
 * Normalizes a speaker name by stripping honorifics, prefixes, brackets and whitespace.
 * Canonicalizes known epic aliases (e.g. सौमित्र -> lakshman, राघव -> ram).
 */
export function normalizeCharacterName(speaker: string): string {
  if (!speaker || typeof speaker !== 'string') return '';
  let s = speaker.replace(/[[\]:—–_-]/g, ' ').trim().toLowerCase();

  // Strip honorific prefixes
  s = s.replace(/^(?:श्रीमान|श्री|भगवान|प्रभु|महर्षि|देव|श्रीमती|माता|देवी|lord|saint|king|queen|prince|princess|shri|shree)\s+/i, '');
  // Strip honorific suffixes
  s = s.replace(/\s+(?:जी|देव|lord|king|queen|prince|ji)$/i, '');
  s = s.replace(/\s+/g, '_').trim();

  // Known canonical aliases in Ancient Dharma
  if (/^सौमित्र$/i.test(s)) return 'लक्ष्मण';
  if (/^(?:राघव|रघुपति|दशरथनंदन|कौशल्यानंदन)$/i.test(s)) return 'राम';
  if (/^(?:जानकी|वैदेही|मैथिली)$/i.test(s)) return 'सीता';
  if (/^(?:मारुति|पवनपुत्र|बजरंगबली|अंजनीपुत्र)$/i.test(s)) return 'हनुमान';
  if (/^(?:दशानन|लंकपति|लंकेश)$/i.test(s)) return 'रावण';
  if (/^(?:सागर|सागर_देव|वरुण|समुद्र_देव)$/i.test(s)) return 'समुद्र';
  if (/^(?:माधव|केशव|वासुदेव|गोविंद|मुरलीधर)$/i.test(s)) return 'कृष्ण';
  if (/^(?:पार्थ|धनंजय|गांडीवधारी)$/i.test(s)) return 'अर्जुन';

  return s;
}

/**
 * Adapts a voice ID from one language pool to another if the persona is shared
 * (e.g. en-US-Chirp3-HD-Despina -> hi-IN-Chirp3-HD-Despina).
 */
export function adaptVoiceForLanguage(voiceId: string, targetLanguage: 'hi' | 'en'): string {
  const currentLang = voiceLanguageOf(voiceId);
  if (!currentLang || currentLang === targetLanguage) return voiceId;
  const persona = voiceId.replace(/^(?:hi-IN|en-US)-/, '');
  const prefix = targetLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const adapted = `${prefix}-${persona}`;
  const targetPool = targetLanguage === 'hi'
    ? [...HINDI_MALE_VOICE_POOL, ...HINDI_FEMALE_VOICE_POOL, 'hi-IN-Chirp3-HD-Charon']
    : [...ENGLISH_MALE_VOICE_POOL, ...ENGLISH_FEMALE_VOICE_POOL, 'en-US-Chirp3-HD-Aoede', 'en-US-Chirp3-HD-Charon'];
  if (targetPool.includes(adapted)) {
    return adapted;
  }
  return voiceId;
}

/**
 * Detects character gender from name and lexical cues.
 */
export function detectCharacterGender(speaker: string): 'female' | 'male' {
  const norm = normalizeCharacterName(speaker);

  // 1. Role words & titles (English & Hindi)
  const femaleRoleRegex = /\b(?:female|woman|women|girl|girls|lady|ladies|heiress|heroine|heroines|actress|model|maid|madam|madame|ma'am|mrs|ms|miss|she|her|queen|princess|sister|daughter|wife|bride|aunt|niece|mother|mom|femme|matron|waitress|hostess|duchess|empress|priestess|goddess|witch)\b/i;
  const femaleHindiRoleRegex = /(?:स्त्री|औरत|महिला|लड़की|लड़कियां|कन्या|रानी|राजकुमारी|मालकिन|मैम|मैडम|नायिका|अभिनेत्री|अप्सरा|देवी|परी|माता|माँ|बहन|बेटी|पत्नी|दुल्हन|सखी|सहेली|श्रीमती|दासी|पुत्री)/u;

  if (femaleRoleRegex.test(norm) || femaleRoleRegex.test(speaker) || femaleHindiRoleRegex.test(norm) || femaleHindiRoleRegex.test(speaker)) {
    return 'female';
  }

  // 2. Specific Female Character Names (Ancient, modern Indian, romantic, Western)
  const femalePatterns = [
    // Ancient & Epic
    /sita|सीता|राधा|radha|द्रौपदी|draupadi|कुंती|kunti|गांधारी|gandhari|कैकेयी|kaikeyi/i,
    /कौशल्या|kaushalya|सुमित्रा|sumitra|उर्मिला|urmila|मंदोदरी|mandodari|शूर्पणखा|shurpanakha/i,
    /तारा|tara|रुक्मिणी|rukmini|सत्यभामा|satyabhama|पार्वती|parvati|लक्ष्मी|lakshmi|सरस्वती|saraswati/i,
    /गंगा|ganga|मेनका|menaka|रंभा|rambha|उर्वशी|urvashi|शकुंतला|shakuntala|दमयंती|damayanti|अहिल्या|ahilya/i,

    // Modern Indian & Romance (Talevora / Shorts / Contemporary)
    /नताशा|natasha|रिया|riya|ria|अनन्या|ananya|प्रिया|priya|माया|maya|नेहा|neha|सिमरन|simran/i,
    /तान्या|tanya|पूजा|pooja|puja|स्नेहा|sneha|काव्या|kavya|दीया|diya|अदिति|aditi|ईशा|isha|तनु|tanu/i,
    /मीरा|meera|mira|आरोही|aarohi|शिल्पा|shilpa|अंजली|anjali|रोशनी|roshni|किरण|kiran|सोनाली|sonali/i,
    /प्रीति|preeti|priti|नैना|naina|सोनम|sonam|दीपाली|deepali|स्वाति|swati|खुशी|khushi|निशा|nisha/i,
    /सपना|sapna|श्रेया|shreya|तृषा|trisha|मोहिनी|mohini|अवंतिका|avantika|आयशा|ayesha|aisha|ज़ोया|zoya/i,
    /तन्वी|tanvi|रितिका|ritika|पायल|payal|श्वेता|shweta|दिव्या|divya|रितु|ritu|अमृता|amrita|सुनीता|sunita/i,
    /गीता|geeta|gita|रीता|reeta|rita|संगीता|sangeeta|रेखा|rekha|ममता|mamta|भारती|bharti|अंकिता|ankita/i,
    /मनीषा|manisha|सृष्टि|srishti|श्रुति|shruti|दृष्टि|drishti|रागिनी|ragini|मीना|meena|तनुजा|tanuja/i,
    /उमा|uma|दुर्गा|durga|काली|kali|काजल|kajal|भावना|bhavna|निधि|nidhi|सलोनी|saloni|पूनम|poonam/i,

    // Western Drama
    /elena|clara|sophia|sarah|emma|olivia|maria|anna|emily|jessica|ashley|amanda|rachel|lauren/i,
    /megan|amber|hannah|nicole|taylor|stephanie|chloe|natalie|victoria|zoe|penelope|lily|grace|natalia/i,
  ];

  for (const pattern of femalePatterns) {
    if (pattern.test(norm) || pattern.test(speaker)) {
      return 'female';
    }
  }

  // 3. Devanagari feminine morphological check (e.g. names ending in ा or ी),
  // excluding known male epic/sovereign figures
  const maleDevanagariExceptions = /^(?:राम|श्रीराम|लक्ष्मण|भरत|शत्रुघ्न|दशरथ|जनक|रावण|मेघनाद|कुंभकर्ण|विभीषण|हनुमान|सुग्रीव|बाली|अंगद|जाम्बवंत|जटायु|कृष्ण|श्रीकृष्ण|अर्जुन|कर्ण|युधिष्ठिर|भीम|नकुल|सहदेव|दुर्योधन|दुःशासन|द्रोण|द्रोणाचार्य|भीष्म|कृपाचार्य|शकुनि|धृतराष्ट्र|पांडु|विदुर|शिव|महादेव|ब्रह्मा|विष्णु|इंद्र|वरुण|अग्नि|वायु|सूर्य|चंद्र|यम|नारद|वशिष्ठ|विश्वामित्र|परशुराम|राजा|महाराजा|राणा|योद्धा|स्वामी|सेनापति|सारथी|ऋषि|मुनि|गुरु|आचार्य|विद्वान|शिष्य|कारीगर|लोहार|पुरुष|लड़का|बालक|सूत्रधार|विक्रम)$/u;

  if (norm.length >= 2 && !maleDevanagariExceptions.test(norm)) {
    if (/[ाी]$/u.test(norm)) {
      return 'female';
    }
  }

  return 'male';
}

/**
 * CharacterVoiceSession ensures:
 * 1. VOICE LOCKING: Once a character is assigned a voice, they keep that exact voice forever across all scenes.
 * 2. UNIQUE VOICES: Different characters are guaranteed to receive DIFFERENT distinct voices from the voice pool.
 * 3. NARRATOR ISOLATION: The narrator voice (Charon) is never assigned to any character.
 */
/** Language family of a provider voice ID ('hi-IN-...', 'en-US-...', 'hi_swara', ...). */
export function voiceLanguageOf(voiceId?: string | null): 'hi' | 'en' | undefined {
  if (!voiceId || typeof voiceId !== 'string') return undefined;
  if (voiceId.startsWith('hi-') || voiceId.startsWith('hi_')) return 'hi';
  if (voiceId.startsWith('en-') || voiceId.startsWith('en_')) return 'en';
  return undefined;
}

export class CharacterVoiceSession {
  private assigned = new Map<string, CharacterVoiceAssignment>();
  private usedVoiceIds = new Set<string>();
  public readonly language: 'hi' | 'en';
  public readonly channelKey: string;
  public readonly narratorVoiceId: string;

  constructor(options: { language?: 'hi' | 'en'; channelKey?: string; defaultVoice?: string }) {
    this.language = options.language || 'hi';
    this.channelKey = options.channelKey || 'ancient_dharma';

    const isHindi = this.language === 'hi';
    const requestedVoice = options.defaultVoice && options.defaultVoice !== 'default' ? options.defaultVoice : undefined;
    const requestedLanguage = voiceLanguageOf(requestedVoice);
    // A narrator voice from another language family would make Google speech reject the
    // whole scene ("Choose an available ... voice for this language"), so fall back to the
    // language default instead of trusting a mismatched saved voice ID.
    this.narratorVoiceId = requestedVoice && (!requestedLanguage || requestedLanguage === (isHindi ? 'hi' : 'en'))
      ? requestedVoice
      : (isHindi ? 'hi-IN-Chirp3-HD-Charon' : 'en-US-Chirp3-HD-Aoede');

    const narratorAssignment: CharacterVoiceAssignment = {
      voiceId: this.narratorVoiceId,
      speed: 1.0,
      description: 'Story narrator',
      gender: isHindi ? 'male' : 'female',
    };

    // Lock narrator names
    this.assigned.set('narrator', narratorAssignment);
    this.assigned.set('सूत्रधार', narratorAssignment);
    this.usedVoiceIds.add(this.narratorVoiceId);
  }

  public isNarrator(speaker: string): boolean {
    const norm = normalizeCharacterName(speaker);
    return norm === 'narrator' || norm === 'सूत्रधार';
  }

  /**
   * Resolves or assigns a voice for a character.
   * Locked to that character for the life of this session.
   * Guarantees distinct voice from all other characters.
   */
  public getVoice(speaker: string): CharacterVoiceAssignment {
    const norm = normalizeCharacterName(speaker);

    // 1. Narrator lookup
    if (this.isNarrator(speaker)) {
      return this.assigned.get('narrator')!;
    }

    // 2. Already assigned / locked?
    if (this.assigned.has(norm)) {
      return this.assigned.get(norm)!;
    }

    // Check fuzzy match in assigned
    for (const [key, existing] of this.assigned.entries()) {
      if (key === 'narrator' || key === 'सूत्रधार') continue;
      if (norm === key || norm.includes(key) || key.includes(norm)) {
        this.assigned.set(norm, existing);
        return existing;
      }
    }

    // 3. New character! Assign a unique, distinct voice from the pool.
    const detectedGender = detectCharacterGender(speaker);
    const isHindi = this.language === 'hi';
    const channelPreset = CHARACTER_CAST_PRESETS[this.channelKey]
      || (this.channelKey === 'talevora' ? CHARACTER_CAST_PRESETS.talvora : undefined)
      || CHARACTER_CAST_PRESETS.ancient_dharma;

    // Check preset match first
    let preferredVoiceId: string | undefined;
    let preferredSpeed = isHindi ? 0.86 : 1.0;
    let preferredDesc = `${speaker} voice`;

    const presetEntry = channelPreset[norm] || Object.entries(channelPreset).find(([k]) => norm.includes(k) || k.includes(norm))?.[1];
    const gender = presetEntry?.gender || detectedGender;

    // Presets are per-channel; adapt voice persona to current session language if needed
    if (presetEntry && presetEntry.voiceId !== this.narratorVoiceId) {
      const adapted = adaptVoiceForLanguage(presetEntry.voiceId, isHindi ? 'hi' : 'en');
      const adaptedLanguage = voiceLanguageOf(adapted);
      if (adaptedLanguage === (isHindi ? 'hi' : 'en')) {
        preferredVoiceId = adapted;
        preferredSpeed = presetEntry.speed || preferredSpeed;
        preferredDesc = presetEntry.description || preferredDesc;
      }
    }

    let assignedVoiceId: string;
    // If the preset voice is unclaimed by another character in this session, assign it!
    if (preferredVoiceId && !this.usedVoiceIds.has(preferredVoiceId)) {
      assignedVoiceId = preferredVoiceId;
    } else {
      // Pick next available, unclaimed voice from the gender pool
      const pool = isHindi
        ? (gender === 'female' ? HINDI_FEMALE_VOICE_POOL : HINDI_MALE_VOICE_POOL)
        : (gender === 'female' ? ENGLISH_FEMALE_VOICE_POOL : ENGLISH_MALE_VOICE_POOL);

      const available = pool.find((v) => !this.usedVoiceIds.has(v));
      if (available) {
        assignedVoiceId = available;
      } else {
        // Pool exhausted (very rare), fallback to least recently used non-narrator voice
        assignedVoiceId = pool.find((v) => v !== this.narratorVoiceId) || pool[0];
      }
    }

    // Mark as CLAIMED and lock for this character
    this.usedVoiceIds.add(assignedVoiceId);
    const assignment: CharacterVoiceAssignment = {
      voiceId: assignedVoiceId,
      speed: preferredSpeed,
      description: preferredDesc,
      gender,
    };

    this.assigned.set(norm, assignment);
    return assignment;
  }

  public getAllAssignments(): Record<string, CharacterVoiceAssignment> {
    const result: Record<string, CharacterVoiceAssignment> = {};
    for (const [k, v] of this.assigned.entries()) {
      result[k] = v;
    }
    return result;
  }
}

/** Global script session cache so scene-by-scene calls for the same script share the exact locked voice registry */
interface CachedVoiceSession {
  session: CharacterVoiceSession;
  options: { language: 'hi' | 'en'; channelKey: string; defaultVoice: string };
}
const scriptSessionCache = new Map<string, CachedVoiceSession>();

export function getOrCreateScriptVoiceSession(
  scriptId: string,
  options: { language?: 'hi' | 'en'; channelKey?: string; defaultVoice?: string }
): CharacterVoiceSession {
  const resolved: CachedVoiceSession['options'] = {
    language: options.language || 'hi',
    channelKey: options.channelKey || 'ancient_dharma',
    defaultVoice: options.defaultVoice || 'default',
  };
  if (scriptId) {
    const cached = scriptSessionCache.get(scriptId);
    // Rebuild whenever the requested language/voice/channel changed so a regenerated
    // narration never keeps voices locked to stale settings from an earlier run.
    if (cached
      && cached.options.language === resolved.language
      && cached.options.channelKey === resolved.channelKey
      && cached.options.defaultVoice === resolved.defaultVoice) {
      return cached.session;
    }
  }
  const session = new CharacterVoiceSession(resolved);
  if (scriptId) {
    scriptSessionCache.set(scriptId, { session, options: resolved });
  }
  return session;
}

export function clearScriptVoiceSession(scriptId: string): void {
  if (scriptId) {
    scriptSessionCache.delete(scriptId);
  }
}

/**
 * Checks whether a script text or script object is intended for conversational multi-voice synthesis.
 * Explicitly returns FALSE for regular narrator scripts so they are never accidentally touched!
 */
export function isConversationalScript(script: any): boolean {
  if (!script) return false;
  if (script.conversational === true || script.isConversational === true) return true;
  if (script.name && /conversational|dialogue|discourse/i.test(script.name)) return true;

  const narrationText = script.narration || script.extractedScript || script.aiResponse || '';
  return hasSpeakerDialogueTags(narrationText);
}

/**
 * Detects if a text block contains character dialogue attribution tags like [Ram]:, [लक्ष्मण]:, or Lakshman:
 */
export function hasSpeakerDialogueTags(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const speakerTagRegex = /(?:^|\n|\s)(?:\[\s*([A-Za-z\u0900-\u097F\s]{2,25})\s*\]|([A-Za-z\u0900-\u097F]{2,20}))\s*[:—–-]\s*/m;
  return speakerTagRegex.test(text);
}

/**
 * Removes character attribution tags ([Ram]:, [सूत्रधार]:) from a text block while leaving
 * the dialogue itself and any [pause] markers untouched. Used before synthesis engines
 * that have no built-in speaker-tag handling (Edge), so the speaker names are never spoken.
 */
export function stripSpeakerTags(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    // eslint-disable-next-line no-misleading-character-class
    .replace(/\[\s*[A-Za-z\u0900-\u097F\s]{2,25}\s*\][ \t]*[:—–-][ \t]*/g, '')
    .replace(/^["“'«]+|["”'»]+$/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
/**
 * Removes speaker attributions and bracketed stage cues for anything that gets BURNED
 * into the frame (ASS subtitles, caption phrases): [Ram]: → dropped with its separator,
 * [pause 1s] / [Scene 2]: → dropped, stray leading separators trimmed.
 */
export function stripBracketCues(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    // eslint-disable-next-line no-misleading-character-class
    .replace(/\[[A-Za-z\u0900-\u097F\s]{2,25}\][ \t]*[:—–-][ \t]*/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/^[\s:;–—-]+/, '')
    .replace(/^(\s*["“'«])\s+/, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
/**
 * Extracts the primary speaker name from a text block or dialogue line.
 */
export function extractSpeakerName(text: string): string | undefined {
  if (!text || typeof text !== 'string') return undefined;
  const m = text.match(/(?:^|\n|\s)(?:\[\s*([A-Za-z\u0900-\u097F\s]{2,25})\s*\]|([A-Za-z\u0900-\u097F]{2,20}))\s*[:—–-]/m);
  return m ? (m[1] || m[2]).trim() : undefined;
}

/**
 * Parses raw narration text into structured character dialogue turns.
 */
export function parseDialogueTurns(text: string): DialogueTurn[] {
  if (!text || typeof text !== 'string') return [];

  // Normalize: split any inline / mid-text speaker tags onto their own newlines
  const normalized = text.replace(/(?<=[^\n])\s*(?=\[\s*[A-Za-z\u0900-\u097F\s]{2,25}\s*\]\s*[:—–-])/g, '\n');
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  const turns: DialogueTurn[] = [];

  const lineRegex = /^(?:\[\s*([A-Za-z\u0900-\u097F\s]{2,25})\s*\]|([A-Za-z\u0900-\u097F]{2,20}))\s*[:—–-]\s*(.*)$/;

  let currentSpeaker = 'Narrator';
  let currentText = '';

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (match) {
      if (currentText.trim()) {
        turns.push({ speaker: currentSpeaker, text: cleanDialogueLine(currentText) });
        currentText = '';
      }
      currentSpeaker = (match[1] || match[2]).trim();
      currentText = match[3] || '';
    } else {
      currentText += (currentText ? ' ' : '') + line;
    }
  }

  if (currentText.trim()) {
    turns.push({ speaker: currentSpeaker, text: cleanDialogueLine(currentText) });
  }

  return turns.filter((t) => t.text.length > 0);
}

export function cleanDialogueLine(line: string): string {
  return line
    .replace(/^["“'«](.*)["”'»]$/, '$1')
    .replace(/\((?:break|pause|beat|whisper|softly|sighs?|laughs?)\)/gi, ' ')
    .replace(/\[(?:pause|break|beat|whisper|softly|sighs?|laughs?)[^\]]*\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maps an account ID to its matching channel cast preset key.
 */
export function resolveChannelKey(accountId?: string): string {
  if (!accountId) return 'ancient_dharma';
  if (
    accountId === 'acct_talvora' ||
    accountId === 'acct_talevora' ||
    accountId.includes('c0316a84') ||
    /talvora|talevora/i.test(accountId)
  ) {
    return 'talvora';
  }
  if (accountId.includes('620a1d5e') || /against/i.test(accountId)) {
    return 'against_the_odds';
  }
  if (accountId.includes('3ea89878') || /zero/i.test(accountId)) {
    return 'rule_zero';
  }

  return 'ancient_dharma';
}

/**
 * Resolves the best-matched voice model for a given character name.
 * Uses the provided CharacterVoiceSession (or falls back to an internal session) to guarantee voice locking
 * and uniqueness across different characters.
 */
export function resolveCharacterVoice(
  speaker: string,
  language: 'hi' | 'en',
  channelKey = 'ancient_dharma',
  fallbackVoice = 'default',
  session?: CharacterVoiceSession
): CharacterVoiceAssignment {
  if (session) {
    return session.getVoice(speaker);
  }

  const tempSession = new CharacterVoiceSession({ language, channelKey, defaultVoice: fallbackVoice });
  return tempSession.getVoice(speaker);
}
