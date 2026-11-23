import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHindiForTTS, BUILTIN_HINDI_PRONUNCIATIONS } from '../dist/services/hindi-pronunciation.js';
import { resolveMusicTrack } from '../dist/services/music.js';
import { buildWorldBibleForTopic, injectWorldBibleIntoPrompt, STRICT_NEGATIVE_VISUAL_RULES } from '../dist/services/world-bible.js';
import { VisionQASchema } from '../dist/services/vision-qa.js';
import { validateNarrationScript, auditNarrationScenesQA } from '../dist/services/tts-qa.js';
import { cleanVoiceAudioBuffer, VOICE_CLEANUP_FILTER } from '../dist/services/voice-cleanup.js';

test('TTS Sanitizer: converts Romanized Hindi words to clean Devanagari', () => {
  const input = 'yahan us na to mein hi tha';
  const sanitized = sanitizeHindiForTTS(input);
  assert.match(sanitized, /यहाँ/);
  assert.match(sanitized, /उस/);
  assert.match(sanitized, /न तो/);
  assert.match(sanitized, /में/);
  assert.match(sanitized, /ही/);
  assert.doesNotMatch(sanitized, /\bmein\b/i);
  assert.doesNotMatch(sanitized, /\bus\b/i);
});

test('TTS Sanitizer: converts acronyms and butchered terms into phonetically accurate Devanagari', () => {
  const input = 'NASA और OSL रिसर्च के अनुसार Palk Strait पर रामसेतु स्थित है।';
  const sanitized = sanitizeHindiForTTS(input);
  assert.match(sanitized, /नासा/);
  assert.match(sanitized, /ओ एस एल/);
  assert.match(sanitized, /पॉक स्ट्रेट/);
  assert.doesNotMatch(sanitized, /NASA/);
  assert.doesNotMatch(sanitized, /OSL/);
});

test('TTS Sanitizer: strips unformatted markdown characters', () => {
  const input = '**श्रीकृष्ण** ने कहा: *“कर्ण, सुनो!”* [रहस्य]';
  const sanitized = sanitizeHindiForTTS(input);
  assert.doesNotMatch(sanitized, /[*_[\]]/);
  assert.match(sanitized, /श्रीकृष्ण ने कहा/);
});

test('BGM Resolver: successfully resolves all 4 mandatory mood categories without silence', () => {
  const war = resolveMusicTrack('epic_war');
  assert.ok(war, 'epic_war track must resolve');
  assert.ok(war.length > 0);

  const calm = resolveMusicTrack('devotional_calm');
  assert.ok(calm, 'devotional_calm track must resolve');

  const sci = resolveMusicTrack('mysterious_science');
  assert.ok(sci, 'mysterious_science track must resolve');

  const tragic = resolveMusicTrack('emotional_tragic');
  assert.ok(tragic, 'emotional_tragic track must resolve');

  // Fallback test
  const fallback = resolveMusicTrack('non_existent_mood_random');
  assert.ok(fallback, 'Unknown mood must resolve to fallback track instead of null/silence');
});

test('World Bible: creates locked character descriptors and negative rules for mythology topics', () => {
  const bible = buildWorldBibleForTopic('The Mystery of Vali and Sugriva in Kishkindha');
  assert.ok(bible.characters['bali'] || bible.characters['sugriva']);
  assert.match(bible.eraSetting, /Treta Yuga/i);

  const prompt = 'Bali stands atop a cliff looking down at the army';
  const injected = injectWorldBibleIntoPrompt(prompt, bible);
  assert.match(injected, /vanara/i);
  assert.match(injected, /NO text/i);
  assert.match(injected, /NO split-screen/i);
  assert.match(injected, /NO modern anachronisms/i);
});

test('Vision QA Schema: parses compliant vision validation objects', () => {
  const raw = {
    pass: true,
    has_text_artifact: false,
    is_collage_or_split_panel: false,
    has_modern_anachronism: false,
    character_or_lore_mismatch: false,
    reason: 'Composition is cinematic and authentic to Treta Yuga era.',
  };
  const parsed = VisionQASchema.parse(raw);
  assert.equal(parsed.pass, true);
  assert.equal(parsed.has_text_artifact, false);
});

test('TTS QA Validator: flags unhandled English acronyms and banned street slang', () => {
  const slangCheck = validateNarrationScript('तू इधर आ और सुन', 'hi');
  assert.equal(slangCheck.valid, false);
  assert.ok(slangCheck.warnings.some(w => w.includes('Banned street slang')));

  const outroCheck = validateNarrationScript('हमारे चैनल को सब्सक्राइब करें और वीडियो को लाइक करें', 'hi', true);
  assert.equal(outroCheck.valid, false);
  assert.ok(outroCheck.warnings.some(w => w.includes('Generic subscription/like CTA outro')));
});
