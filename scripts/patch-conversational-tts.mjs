import fs from 'fs';

const file = 'server/src/services/conversational-tts.ts';
let content = fs.readFileSync(file, 'utf8');

// Add formatConversationalTurnForSpeech helper before synthesizeConversationalBlock
const helperCode = `
/**
 * Formats a single dialogue turn or narration sentence into expressive, natural SSML
 * with human breath pauses between clauses, vocatives, and sentences.
 */
export function formatConversationalTurnForSpeech(text: string, speaker: string, language: 'hi' | 'en'): string {
  // Strip leading speaker tags like [कृष्ण]: or कृष्ण:
  let cleaned = text.replace(/^\\[[^\\]]+\\]:\\s*|^[^\\s:]+:\\s*/u, '').trim();

  // If already SSML, return as is
  if (/^\\s*<speak[\\s>]/i.test(cleaned)) return cleaned;

  if (language === 'hi') {
    // 1. Dramatic pauses after vocatives (calling someone's name)
    // E.g. कर्ण! वासुदेव! माधव! हे पार्थ!
    cleaned = cleaned.replace(/(कर्ण|वासुदेव|माधव|पार्थ|राजन|महाराज|प्रभु|तात|सूतपुत्र)(!|—|,)/gu, '$1$2 <break time="340ms"/>');

    // 2. Clause boundaries: commas and dashes
    cleaned = cleaned.replace(/,\\s*/g, ', <break time="240ms"/> ');
    cleaned = cleaned.replace(/—\\s*/g, '— <break time="260ms"/> ');

    // 3. Sentence boundaries: danda, exclamation, question mark, full stop
    cleaned = cleaned.replace(/([।!?\\.])\\s+(?!<break)/gu, '$1 <break time="380ms"/> ');

    // 4. Clean up any duplicate breaks
    cleaned = cleaned.replace(/(?:<break time="[^"]*"\\/>\\s*){2,}/g, '<break time="380ms"/> ');
  } else {
    // English conversational pauses
    cleaned = cleaned.replace(/([,;])\\s*/g, '$1 <break time="220ms"/> ');
    cleaned = cleaned.replace(/([.!?])\\s+(?!<break)/g, '$1 <break time="350ms"/> ');
    cleaned = cleaned.replace(/—\\s*/g, '— <break time="250ms"/> ');
  }

  return \`<speak>\${cleaned.trim()}</speak>\`;
}
`;

const oldTurnLoop = `  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const cast = voiceSession.getVoice(turn.speaker);

    const turnWav = await synthesizeGoogleTts(turn.text, cast.voiceId, params.language, cast.speed);
    // Google Chirp outputs 24,000 Hz, 16-bit mono = 48,000 bytes/sec
    const pcmDataSize = Math.max(0, turnWav.length - 44);
    const turnDurationSec = pcmDataSize / 48000;

    measuredTurns.push({
      speaker: turn.speaker,
      text: turn.text,
      voiceId: cast.voiceId,
      speed: cast.speed,
      startSec: currentOffsetSec,
      endSec: currentOffsetSec + turnDurationSec,
      durationSec: turnDurationSec,
    });

    audioParts.push(turnWav);
    currentOffsetSec += turnDurationSec;

    // Insert natural human conversational turn-taking pause before next speaker
    if (i < turns.length - 1) {
      const nextTurn = turns[i + 1];
      // 400ms pause when passing to/from Narrator; 260ms between characters
      const pauseDuration = voiceSession.isNarrator(turn.speaker) || voiceSession.isNarrator(nextTurn.speaker) ? 0.4 : 0.26;
      const pauseWav = createSilentWav(pauseDuration, 24000);
      audioParts.push(pauseWav);
      currentOffsetSec += pauseDuration;
    }

    if (params.onProgress) {
      params.onProgress(i + 1, turns.length);
    }
  }`;

const newTurnLoop = `  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const cast = voiceSession.getVoice(turn.speaker);
    const isCharacter = !voiceSession.isNarrator(turn.speaker);

    // Format turn text with natural SSML breath pauses
    const ssmlText = formatConversationalTurnForSpeech(turn.text, turn.speaker, params.language);

    // Subtle 120ms pre-roll lead-in for speaking character video scenes so visual mouth motion begins as voice starts
    if (isCharacter) {
      const preRoll = createSilentWav(0.12, 24000);
      audioParts.push(preRoll);
      currentOffsetSec += 0.12;
    }

    const turnWav = await synthesizeGoogleTts(ssmlText, cast.voiceId, params.language, cast.speed);
    // Google Chirp outputs 24,000 Hz, 16-bit mono = 48,000 bytes/sec
    const pcmDataSize = Math.max(0, turnWav.length - 44);
    const turnDurationSec = pcmDataSize / 48000;

    measuredTurns.push({
      speaker: turn.speaker,
      text: turn.text,
      voiceId: cast.voiceId,
      speed: cast.speed,
      startSec: currentOffsetSec - (isCharacter ? 0.12 : 0),
      endSec: currentOffsetSec + turnDurationSec,
      durationSec: turnDurationSec + (isCharacter ? 0.12 : 0),
    });

    audioParts.push(turnWav);
    currentOffsetSec += turnDurationSec;

    // Insert natural human conversational turn-taking pause before next speaker
    if (i < turns.length - 1) {
      const nextTurn = turns[i + 1];
      // 450ms pause when passing to/from Narrator; 320ms between characters
      const pauseDuration = voiceSession.isNarrator(turn.speaker) || voiceSession.isNarrator(nextTurn.speaker) ? 0.45 : 0.32;
      const pauseWav = createSilentWav(pauseDuration, 24000);
      audioParts.push(pauseWav);
      currentOffsetSec += pauseDuration;
    }

    if (params.onProgress) {
      params.onProgress(i + 1, turns.length);
    }
  }`;

content = content.replace('export async function synthesizeConversationalBlock', helperCode + '\nexport async function synthesizeConversationalBlock');
content = content.replace(oldTurnLoop, newTurnLoop);

fs.writeFileSync(file, content, 'utf8');
console.log('conversational-tts.ts updated with SSML formatting and video lead-in pauses');
