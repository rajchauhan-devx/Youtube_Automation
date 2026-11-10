import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isConversationalScript,
  detectCharacterGender,
  resolveChannelKey,
  CharacterVoiceSession,
  HINDI_FEMALE_VOICE_POOL,
  HINDI_MALE_VOICE_POOL,
} from '../dist/services/conversational-types.js';
import { buildFreePrompt, buildGenerationPrompt } from '../dist/services/script-generation.js';
import { buildResearchMessages } from '../dist/services/script-research.js';
import { ancientDharmaEditorial } from '../dist/services/ancient-dharma-editorial.js';

test('conversational script template usr_dharma_conversational_dialogue is detected as conversational', async () => {
  const fs = await import('node:fs');
  const scripts = JSON.parse(fs.readFileSync('server/data/scripts.json', 'utf8'));
  const script = scripts.find(s => s.id === 'usr_dharma_conversational_dialogue');

  assert.ok(script, 'usr_dharma_conversational_dialogue should exist in scripts.json');
  assert.equal(isConversationalScript(script), true, 'Script must be recognized as conversational');
  assert.equal(script.conversational, true);
  assert.equal(script.isConversational, true);
});

test('buildFreePrompt and buildGenerationPrompt force character dialogue even for descriptive/event topics', () => {
  const template = 'Shorts conversational dialogue template with [लक्ष्मण]: and [सूत्रधार]:';
  const topic = 'Building of Ram Setu (Ram Setu Nirman)'; // An event title without characters speaking
  const instructions = '';

  const freePrompt = buildFreePrompt(template, topic, instructions, 60);
  assert.match(freePrompt, /FORCE FULL MULTI-CHARACTER CONVERSATION/i);
  assert.match(freePrompt, /Even if the topic does not explicitly state characters or dialogue/i);
  assert.match(freePrompt, /FORCE THE CHARACTERS TO SPEAK/i);
  assert.match(freePrompt, /DO NOT include modern science, archaeology, satellite data, carbon dating/i);

  const genPrompt = buildGenerationPrompt(template, topic, instructions, 60, 'shorts');
  assert.match(genPrompt, /FORCE FULL MULTI-CHARACTER CONVERSATION/i);
  assert.match(genPrompt, /DO NOT include modern science, archaeology, satellite data, carbon dating/i);
});

test('buildResearchMessages for Ancient Dharma conversational skips satellite/carbon-dating and focuses on epic dialogue', () => {
  const template = 'Ancient Dharma conversational [ANCIENT DHARMA EDITORIAL RULES] rules [/ANCIENT DHARMA EDITORIAL RULES]';
  const messages = buildResearchMessages({
    topic: 'Karna and Krishna confrontation before Kurukshetra',
    template,
    instructions: 'conversational multi-character dialogue',
    duration: 60,
  });

  const content = messages[1].content;
  assert.match(content, /MULTI-CHARACTER CONVERSATIONAL DRAMA/i);
  assert.match(content, /Do NOT research satellite imagery, carbon-dating, engineering, metallurgy, or archaeology/i);
  assert.match(content, /MANDATORY CONVERSATIONAL DRAMATIZATION/i);
  assert.doesNotMatch(content, /calcified conglomerate/);
});

test('ancientDharmaEditorial accommodates conversational dramatization without forbidding dialogue', () => {
  const editorial = ancientDharmaEditorial('shorts');
  assert.match(editorial, /For conversational multi-character episodes: dramatize the episode faithfully through living character dialogue/i);
  assert.match(editorial, /strictly NEVER include modern science, satellite imagery, or archaeology/i);
});

test('Talevora female character voice assignment detects modern female names and assigns female Chirp 3 voice', () => {
  // 1. Channel key for Talevora UUID
  const channelKey = resolveChannelKey('acct_c0316a84-3e92-41be-87cd-c44ba1a20e38');
  assert.equal(channelKey, 'talvora', 'Talevora account must resolve to talvora');

  // 2. Female gender detection
  assert.equal(detectCharacterGender('नताशा'), 'female', 'नताशा must be female');
  assert.equal(detectCharacterGender('Natasha'), 'female', 'Natasha must be female');
  assert.equal(detectCharacterGender('heiress'), 'female', 'heiress must be female');
  assert.equal(detectCharacterGender('महिला'), 'female', 'महिला must be female');
  assert.equal(detectCharacterGender('विक्रम'), 'male', 'विक्रम must be male');

  // 3. Voice session assignments
  const session = new CharacterVoiceSession({
    language: 'hi',
    channelKey,
    defaultVoice: 'hi-IN-Chirp3-HD-Achernar',
  });

  const natasha = session.getVoice('नताशा');
  assert.equal(natasha.gender, 'female');
  assert.ok(HINDI_FEMALE_VOICE_POOL.includes(natasha.voiceId), 'Natasha must have voice from HINDI_FEMALE_VOICE_POOL');
  assert.equal(natasha.voiceId, 'hi-IN-Chirp3-HD-Despina');

  const vikram = session.getVoice('विक्रम');
  assert.equal(vikram.gender, 'male');
  assert.ok(HINDI_MALE_VOICE_POOL.includes(vikram.voiceId), 'Vikram must have voice from HINDI_MALE_VOICE_POOL');
  assert.equal(vikram.voiceId, 'hi-IN-Chirp3-HD-Orus');
});

test('both Ancient Dharma and Talevora conversational scripts are 100% video and zero narrator', async () => {
  const fs = await import('node:fs');
  const scripts = JSON.parse(fs.readFileSync('server/data/scripts.json', 'utf8'));

  const dharma = scripts.find(s => s.id === 'usr_dharma_conversational_dialogue');
  assert.ok(dharma, 'Dharma script must exist');
  assert.ok(dharma.scenePlan.scenes.length >= 6, 'Dharma has scenes');
  for (const scene of dharma.scenePlan.scenes) {
    assert.equal(scene.mediaType, 'video', `Dharma scene ${scene.id} must be full video`);
    assert.notEqual(scene.speaker, 'सूत्रधार', `Dharma scene ${scene.id} must not be narrator`);
    assert.notEqual(scene.speaker, 'narrator', `Dharma scene ${scene.id} must not be narrator`);
  }

  const talevora = scripts.find(s => s.id === 'usr_talevora_conversational_dialogue');
  assert.ok(talevora, 'Talevora script must exist');
  assert.ok(talevora.scenePlan.scenes.length >= 6, 'Talevora has scenes');
  for (const scene of talevora.scenePlan.scenes) {
    assert.equal(scene.mediaType, 'video', `Talevora scene ${scene.id} must be full video`);
    assert.notEqual(scene.speaker, 'सूत्रधार', `Talevora scene ${scene.id} must not be narrator`);
    assert.notEqual(scene.speaker, 'narrator', `Talevora scene ${scene.id} must not be narrator`);
  }
});
