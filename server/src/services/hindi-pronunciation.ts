import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJson } from './accounts.js';
import { accountDir } from './workspace.js';
import { TtsError } from './tts-shared.js';

export const HINDI_SYNTHESIS_REVISION = 'hindi-pronunciation-v2';
export type Pronunciations = Record<string, string>;
const dictionaryPath = () => path.join(accountDir(), 'hindi-pronunciations.json');
const forbidden = /[\p{Cc}\p{Cf}\[\]<>]/u;

/**
 * Standard built-in pronunciation and terminology mapping layer for Hindi mythology / ancient Indian scripts.
 * Fixes commonly butchered terms, missing syllables, and English acronyms.
 */
export const BUILTIN_HINDI_PRONUNCIATIONS: Record<string, string> = {
  // Common acronyms & historical date abbreviations
  'NASA': 'नासा',
  'Nasa': 'नासा',
  'OSL': 'ओ एस एल',
  'Osl': 'ओ एस एल',
  'ISRO': 'इसरो',
  'Isro': 'इसरो',
  'AI': 'ए आई',
  'Ai': 'ए आई',
  'ASI': 'ए एस आई',
  'Asi': 'ए एस आई',
  'DNA': 'डी एन ए',
  'BC': 'ईसा पूर्व',
  'B.C.': 'ईसा पूर्व',
  'AD': 'ईस्वी',
  'A.D.': 'ईस्वी',

  // Geographic & architectural terms commonly butchered by TTS
  'Palk Strait': 'पॉक स्ट्रेट',
  'पार्क स्ट्रेट': 'पॉक स्ट्रेट',
  'पलक स्ट्रेट': 'पॉक स्ट्रेट',
  'युद्ध कंडा': 'युद्धकांड',
  'युद्ध-कंडा': 'युद्धकांड',

  // Sacred names & terms with critical phonetic pronunciations
  'नल': 'नल',
  'इक्ष्वाकु': 'इक्ष्वाकु',
  'ब्रह्मास्त्र': 'ब्रह्मास्त्र',
  'गांडीव': 'गांडीव',
  'कुरुक्षेत्र': 'कुरुक्षेत्र',
  'हस्तिनापुर': 'हस्तिनापुर',
  'सुदर्शन': 'सुदर्शन',
  'कवच-कुंडल': 'कवच कुंडल',
};

/**
 * Common stray Romanized words that contaminate Hindi LLM outputs.
 * When left in Roman letters, TTS engines pronounce them as English words
 * (e.g., 'mein' -> 'mi', 'na to' -> 'EN-AY to', 'us' -> 'U.S.', 'hi' -> 'high').
 */
const ROMAN_HINDI_CONVERSIONS: Array<[RegExp, string]> = [
  [/\bmein\b/gi, 'में'],
  [/\bna\s+to\b/gi, 'न तो'],
  [/\bus\b/gi, 'उस'],
  [/\bhi\b/gi, 'ही'],
  [/\bko\b/gi, 'को'],
  [/\bse\b/gi, 'से'],
  [/\bka\b/gi, 'का'],
  [/\bki\b/gi, 'की'],
  [/\bke\b/gi, 'के'],
  [/\bhai\b/gi, 'है'],
  [/\bhain\b/gi, 'हैं'],
  [/\btha\b/gi, 'था'],
  [/\bthi\b/gi, 'थी'],
  [/\bthe\b/gi, 'थे'],
  [/\bpar\b/gi, 'पर'],
  [/\baur\b/gi, 'और'],
  [/\bya\b/gi, 'या'],
  [/\bkya\b/gi, 'क्या'],
  [/\bkyun\b/gi, 'क्यों'],
  [/\bkyon\b/gi, 'क्यों'],
  [/\bjab\b/gi, 'जब'],
  [/\btab\b/gi, 'तब'],
  [/\bab\b/gi, 'अब'],
  [/\byahan\b/gi, 'यहाँ'],
  [/\bvahan\b/gi, 'वहाँ'],
  [/\bek\b/gi, 'एक'],
  [/\bdo\b/gi, 'दो'],
];

export function validatePronunciations(value: unknown): Pronunciations {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 100) {
    throw new TtsError('VALIDATION', 'Use at most 100 pronunciation corrections.');
  }
  const entries: [string, string][] = [];
  const seen = new Set<string>();
  for (const [key, raw] of Object.entries(value)) {
    const word = key.normalize('NFC').trim();
    const spoken = typeof raw === 'string' ? raw.normalize('NFC').trim() : '';
    if (!word || word.length > 80 || !spoken || spoken.length > 160 || forbidden.test(word + spoken) || seen.has(word)) {
      throw new TtsError('VALIDATION', 'Each correction needs a unique word (up to 80 characters) and spoken form (up to 160), without markup.');
    }
    seen.add(word);
    entries.push([word, spoken]);
  }
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

export function getHindiPronunciations(): Pronunciations {
  const file = dictionaryPath();
  if (!fs.existsSync(file)) return {};
  return validatePronunciations(JSON.parse(fs.readFileSync(file, 'utf8')).entries);
}

export function saveHindiPronunciations(value: unknown): Pronunciations {
  const entries = validatePronunciations(value);
  atomicJson(dictionaryPath(), { version: 1, entries });
  return entries;
}

export function applyHindiPronunciations(text: string, entries = getHindiPronunciations()): string {
  const mergedEntries: Record<string, string> = { ...BUILTIN_HINDI_PRONUNCIATIONS, ...entries };
  let normalized = text.normalize('NFC');

  // Convert stray Romanized Hindi function words to Devanagari first
  for (const [pattern, devanagari] of ROMAN_HINDI_CONVERSIONS) {
    normalized = normalized.replace(pattern, devanagari);
  }

  const words = Object.keys(mergedEntries).sort((a, b) => b.length - a.length);
  if (!words.length) return normalized;
  const alternatives = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{M}\\p{N}_])`, 'gu');
  return normalized.split(/(\[\s*(?:pause|break)[^\]]*\]|\(\s*pause[^)]*\))/gi)
    .map((part, index) => index % 2 ? part : part.replace(pattern, word => mergedEntries[word]))
    .join('');
}

/**
 * Pre-TTS Sanitizer:
 * 1. Cleans unformatted markdown, asterisks, brackets, emojis, and URLs.
 * 2. Normalizes Romanized Hindi words into Devanagari so TTS doesn't read them as English.
 * 3. Applies the Built-in Pronunciation Dictionary + custom user pronunciation mappings.
 * 4. Ensures 100% clean, speakable text is delivered to the TTS engine.
 */
export function sanitizeHindiForTTS(text: string, customEntries?: Pronunciations): string {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text
    // Strip markdown formatting and headers
    .replace(/^#+\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/[*_`~]/g, '')
    // Strip bracketed cues, metadata, or stage notes [anything] and (anything)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\[\]()]/g, '')
    .replace(/^(?:Narrator|Voiceover|Host|Speaker\s*\d*|Scene\s*\d*):\s*/gim, '')
    // Strip emojis & URLs
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/https?:\/\/\S+/gi, '');

  // Apply pronunciation mappings & Romanized Hindi word conversions
  cleaned = applyHindiPronunciations(cleaned, customEntries);

  // Normalize spacing and repeated punctuation
  cleaned = cleaned
    .replace(/\?{2,}/g, '?')
    .replace(/!{2,}/g, '!')
    .replace(/,{2,}/g, ', ')
    .replace(/([.!?])([A-Za-z\u0900-\u097F])/g, '$1 $2')
    .replace(/,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

export function hindiPronunciationFingerprint(): string {
  return createHash('sha256').update(JSON.stringify([HINDI_SYNTHESIS_REVISION, BUILTIN_HINDI_PRONUNCIATIONS, getHindiPronunciations()])).digest('hex');
}
