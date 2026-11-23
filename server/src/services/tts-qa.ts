import { sanitizeHindiForTTS } from './hindi-pronunciation.js';

export interface NarrationQAResult {
  valid: boolean;
  warnings: string[];
  sanitized: string;
}

export interface SceneNarrationQAResult {
  sceneId: string;
  original: string;
  sanitized: string;
  warnings: string[];
  passed: boolean;
}

const ENGLISH_ACRONYM_REGEX = /\b[A-Z]{2,}\b/g;
const LATIN_WORDS_REGEX = /\b[a-zA-Z]{2,}\b/g;
const GENERIC_OUTRO_PATTERNS = [
  /सब्सक्राइब\s*करें/i,
  /लाइक\s*करें/i,
  /शेयर\s*करें/i,
  /कमेंट\s*करें/i,
  /घंटी\s*दबाएं/i,
  /चैनल\s*को\s*सब्सक्राइब/i,
];

const BANNED_SLANG = [
  /(?<!\p{L})तू(?!\p{L})/u,
  /(?<!\p{L})तेरा(?!\p{L})/u,
  /(?<!\p{L})तुझे(?!\p{L})/u,
  /(?<!\p{L})तूने(?!\p{L})/u,
  /(?<!\p{L})काय\s+रे(?!\p{L})/u,
];

/**
 * Validates and sanitizes narration text before TTS synthesis.
 * Catches unhandled English acronyms, stray Latin words, markdown syntax,
 * overly long sentences, and generic outro boilerplate.
 */
export function validateNarrationScript(text: string, language: string = 'hi', isShorts: boolean = false): NarrationQAResult {
  const warnings: string[] = [];
  const sanitized = language.toLowerCase().startsWith('hi') ? sanitizeHindiForTTS(text) : text;

  // 1. Check for stray unformatted markdown artifacts
  if (/[*#_`~[\]]/.test(text)) {
    warnings.push('Narration contains markdown formatting symbols (*, #, _, `, [, ]) which TTS might read aloud.');
  }

  // 2. Check for unhandled English acronyms in Hindi scripts
  if (language.toLowerCase().startsWith('hi')) {
    const acronymMatches = sanitized.match(ENGLISH_ACRONYM_REGEX);
    if (acronymMatches && acronymMatches.length > 0) {
      warnings.push(`Unhandled English acronyms found in Hindi narration: ${[...new Set(acronymMatches)].join(', ')}. These should be phonetically spelled in Devanagari.`);
    }

    const latinMatches = sanitized.match(LATIN_WORDS_REGEX);
    if (latinMatches && latinMatches.length > 0) {
      warnings.push(`Stray Latin characters found in Hindi narration: ${[...new Set(latinMatches)].slice(0, 5).join(', ')}.`);
    }

    // 3. Check for banned slang
    for (const pattern of BANNED_SLANG) {
      if (pattern.test(sanitized)) {
        warnings.push(`Banned street slang / informal pronoun detected: '${pattern.source}'. Divine figures and ancient narrators must use respectful honorifics.`);
        break;
      }
    }

    // 4. Check for banned generic outros in Shorts
    if (isShorts) {
      for (const pattern of GENERIC_OUTRO_PATTERNS) {
        if (pattern.test(sanitized)) {
          warnings.push('Generic subscription/like CTA outro detected in Shorts script. Shorts must end abruptly on a moral twist or question without generic CTA padding.');
          break;
        }
      }
    }

    // 5. Check sentence length (pacing)
    const sentences = sanitized.split(/[।!?\n]/).map(s => s.trim()).filter(Boolean);
    for (const s of sentences) {
      const wordCount = s.split(/\s+/).filter(Boolean).length;
      if (wordCount > 18) {
        warnings.push(`Sentence exceeds 18 words (${wordCount} words): "${s.slice(0, 40)}...". Split into shorter sentences (8–14 words) for clean rhythmic TTS.`);
        break;
      }
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
    sanitized,
  };
}

/**
 * Audits all scenes in a scene plan for TTS safety and pacing.
 */
export function auditNarrationScenesQA(
  scenes: Array<{ id: string; narration: string }>,
  language: string = 'hi',
  isShorts: boolean = false
): SceneNarrationQAResult[] {
  return scenes.map((scene, idx) => {
    const isLastScene = idx === scenes.length - 1;
    const qa = validateNarrationScript(scene.narration, language, isShorts && isLastScene);
    return {
      sceneId: scene.id,
      original: scene.narration,
      sanitized: qa.sanitized,
      warnings: qa.warnings,
      passed: qa.warnings.length === 0,
    };
  });
}
