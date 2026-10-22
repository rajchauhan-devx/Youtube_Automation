import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJson } from './accounts.js';
import { accountDir } from './workspace.js';
import { TtsError } from './tts-shared.js';

export const HINDI_SYNTHESIS_REVISION = 'hindi-pronunciation-v1';
export type Pronunciations = Record<string, string>;
const dictionaryPath = () => path.join(accountDir(), 'hindi-pronunciations.json');
const forbidden = /[\p{Cc}\p{Cf}\[\]<>]/u;

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
  const normalized = text.normalize('NFC');
  const words = Object.keys(entries).sort((a, b) => b.length - a.length);
  if (!words.length) return normalized;
  const alternatives = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // Combining marks are part of a Hindi word. JS \b would match inside words
  // such as रामायण, because it only understands ASCII word characters.
  const pattern = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{M}\\p{N}_])`, 'gu');
  // A single pass prevents one replacement from being replaced a second time.
  // Keep explicit pause annotations outside the pronunciation dictionary.
  return normalized.split(/(\[\s*(?:pause|break)[^\]]*\]|\(\s*pause[^)]*\))/gi)
    .map((part, index) => index % 2 ? part : part.replace(pattern, word => entries[word]))
    .join('');
}

export function hindiPronunciationFingerprint(): string {
  return createHash('sha256').update(JSON.stringify([HINDI_SYNTHESIS_REVISION, getHindiPronunciations()])).digest('hex');
}
