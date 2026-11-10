import fs from 'node:fs';
import path from 'node:path';
import { synthesizeGoogleTts } from './google-tts.js';
import { concatWavs, cleanScriptForTTS, TtsError } from './tts-shared.js';
import { currentWorkspace } from './workspace.js';

export * from './conversational-types.js';
import {
  parseDialogueTurns,
  resolveCharacterVoice,
  CharacterVoiceSession,
  getOrCreateScriptVoiceSession,
  type DialogueTurn,
} from './conversational-types.js';

/**
 * Generates an exact silent PCM WAV buffer for conversational pacing.
 */
export function createSilentWav(durationSeconds = 0.3, sampleRate = 24000): Buffer {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

/**
 * Synthesizes a multi-character dialogue text block into a single, seamless WAV buffer
 * with character-specific voices and natural conversational breath pauses.
 * Uses CharacterVoiceSession to guarantee voice locking and uniqueness across characters.
 */

/**
 * Formats a single dialogue turn or narration sentence into expressive, natural SSML
 * with human breath pauses between clauses, vocatives, and sentences.
 */
export function formatConversationalTurnForSpeech(text: string, speaker: string, language: 'hi' | 'en'): string {
  // Strip leading speaker tags like [कृष्ण]: or कृष्ण:
  let cleaned = text.replace(/^\[[^\]]+\]:\s*|^[^\s:]+:\s*/u, '').trim();

  // If already SSML, return as is
  if (/^\s*<speak[\s>]/i.test(cleaned)) return cleaned;

  if (language === 'hi') {
    // 1. Crisp pauses after vocatives (calling someone's name)
    // E.g. कर्ण! वासुदेव! विक्रम... नताशा!
    cleaned = cleaned.replace(/(कर्ण|वासुदेव|माधव|पार्थ|राजन|महाराज|प्रभु|तात|सूतपुत्र|सौमित्र|लक्ष्मण|राम|श्रीराम|सीते|दशानन|रावण|पवनपुत्र|हनुमान|अंगद|विभीषण|रघुवीर|रघुनंदन|भ्राता|प्रभो|विक्रम|नताशा|मैम|मैडम)(!|—|,|\.\.\.|…)/gu, '$1$2 <break time="180ms"/>');

    // 2. Clause boundaries & natural breath breaks
    cleaned = cleaned.replace(/(?:\.\.\.|…)\s*/gu, '... <break time="180ms"/> ');
    cleaned = cleaned.replace(/,\s*/g, ', <break time="140ms"/> ');
    cleaned = cleaned.replace(/—\s*/g, '— <break time="150ms"/> ');

    // 3. Sentence boundaries: danda, exclamation, question mark, full stop (crisp human pacing)
    cleaned = cleaned.replace(/([।!?\.])\s+(?!<break)/gu, '$1 <break time="220ms"/> ');

    // 4. Clean up any duplicate breaks
    cleaned = cleaned.replace(/(?:<break time="[^"]*"\/>\s*){2,}/g, '<break time="220ms"/> ');
  } else {
    // English conversational pauses
    cleaned = cleaned.replace(/(?:\.\.\.|…)\s*/g, '... <break time="180ms"/> ');
    cleaned = cleaned.replace(/([,;])\s*/g, '$1 <break time="140ms"/> ');
    cleaned = cleaned.replace(/([.!?])\s+(?!<break)/g, '$1 <break time="220ms"/> ');
    cleaned = cleaned.replace(/—\s*/g, '— <break time="150ms"/> ');
  }

  return `<speak>${cleaned.trim()}</speak>`;
}

export async function synthesizeConversationalBlock(params: {
  text: string;
  language: 'hi' | 'en';
  channelKey?: string;
  defaultVoice?: string;
  scriptId?: string;
  session?: CharacterVoiceSession;
  onProgress?: (turn: number, total: number) => void;
}): Promise<{ buffer: Buffer; durationSec: number; turns: DialogueTurn[] }> {
  const turns = parseDialogueTurns(params.text);
  if (turns.length === 0) {
    throw new TtsError('VALIDATION', 'No spoken dialogue lines found in conversational script.');
  }

  // Retrieve or create voice session
  const voiceSession = params.session
    || (params.scriptId ? getOrCreateScriptVoiceSession(params.scriptId, {
        language: params.language,
        channelKey: params.channelKey,
        defaultVoice: params.defaultVoice,
      }) : new CharacterVoiceSession({
        language: params.language,
        channelKey: params.channelKey,
        defaultVoice: params.defaultVoice,
      }));

  const audioParts: Buffer[] = [];
  const measuredTurns: DialogueTurn[] = [];
  let currentOffsetSec = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const cast = voiceSession.getVoice(turn.speaker);
    const isCharacter = !voiceSession.isNarrator(turn.speaker);

    // Format turn text with natural SSML breath pauses
    const ssmlText = formatConversationalTurnForSpeech(turn.text, turn.speaker, params.language);

    // Subtle 80ms pre-roll lead-in for speaking character video scenes so visual mouth motion begins cleanly as voice starts
    if (isCharacter) {
      const preRoll = createSilentWav(0.08, 24000);
      audioParts.push(preRoll);
      currentOffsetSec += 0.08;
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
      startSec: currentOffsetSec - (isCharacter ? 0.08 : 0),
      endSec: currentOffsetSec + turnDurationSec,
      durationSec: turnDurationSec + (isCharacter ? 0.08 : 0),
    });

    audioParts.push(turnWav);
    currentOffsetSec += turnDurationSec;

    // Insert natural human conversational turn-taking pause before next speaker
    if (i < turns.length - 1) {
      const nextTurn = turns[i + 1];
      // 300ms pause when passing to/from Narrator; 180ms between characters for snappy, natural pacing
      const pauseDuration = voiceSession.isNarrator(turn.speaker) || voiceSession.isNarrator(nextTurn.speaker) ? 0.30 : 0.18;
      const pauseWav = createSilentWav(pauseDuration, 24000);
      audioParts.push(pauseWav);
      currentOffsetSec += pauseDuration;
    }

    if (params.onProgress) {
      params.onProgress(i + 1, turns.length);
    }
  }

  const combinedWav = concatWavs(audioParts);
  return {
    buffer: combinedWav,
    durationSec: currentOffsetSec,
    turns: measuredTurns,
  };
}
