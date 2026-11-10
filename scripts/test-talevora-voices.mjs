import assert from 'node:assert/strict';
import {
  detectCharacterGender,
  resolveChannelKey,
  CharacterVoiceSession,
  HINDI_FEMALE_VOICE_POOL,
  HINDI_MALE_VOICE_POOL,
} from '../server/dist/services/conversational-types.js';

console.log('--- Testing Talevora Voice & Gender Resolution ---');

// 1. Gender detection test
const femaleTests = ['नताशा', 'natasha', 'Natasha', 'heiress', 'Heiress', 'heroine', 'रिया', 'अनन्या', 'प्रिया', 'महिला', 'मैम', 'Elena', 'clara'];
for (const name of femaleTests) {
  const g = detectCharacterGender(name);
  console.log(`detectCharacterGender("${name}") = ${g}`);
  assert.equal(g, 'female', `Expected "${name}" to be detected as female`);
}

const maleTests = ['विक्रम', 'vikram', 'Vikram', 'bodyguard', 'राम', 'लक्ष्मण', 'अर्जुन', 'पुरुष', 'Julian', 'marcus'];
for (const name of maleTests) {
  const g = detectCharacterGender(name);
  console.log(`detectCharacterGender("${name}") = ${g}`);
  assert.equal(g, 'male', `Expected "${name}" to be detected as male`);
}

// 2. Channel key resolution test
const channelKey = resolveChannelKey('acct_c0316a84-3e92-41be-87cd-c44ba1a20e38');
console.log(`resolveChannelKey("acct_c0316a84-3e92-41be-87cd-c44ba1a20e38") = ${channelKey}`);
assert.equal(channelKey, 'talvora', 'Expected Talevora account to resolve to talvora channelKey');

// 3. Voice session test for Talevora in Hindi
const session = new CharacterVoiceSession({
  language: 'hi',
  channelKey: 'talvora',
  defaultVoice: 'hi-IN-Chirp3-HD-Achernar',
});

const natashaVoice = session.getVoice('नताशा');
console.log('Natasha voice:', natashaVoice);
assert.equal(natashaVoice.gender, 'female', 'Natasha must have female gender');
assert.ok(HINDI_FEMALE_VOICE_POOL.includes(natashaVoice.voiceId), 'Natasha voice must be from HINDI_FEMALE_VOICE_POOL');
assert.equal(natashaVoice.voiceId, 'hi-IN-Chirp3-HD-Despina', 'Natasha should be assigned Despina');

const vikramVoice = session.getVoice('विक्रम');
console.log('Vikram voice:', vikramVoice);
assert.equal(vikramVoice.gender, 'male', 'Vikram must have male gender');
assert.ok(HINDI_MALE_VOICE_POOL.includes(vikramVoice.voiceId), 'Vikram voice must be from HINDI_MALE_VOICE_POOL');
assert.equal(vikramVoice.voiceId, 'hi-IN-Chirp3-HD-Orus', 'Vikram should be assigned Orus');

const sutradharVoice = session.getVoice('सूत्रधार');
console.log('Sutradhar voice:', sutradharVoice);
assert.equal(sutradharVoice.voiceId, 'hi-IN-Chirp3-HD-Achernar', 'Sutradhar should have default requested voice');

console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
