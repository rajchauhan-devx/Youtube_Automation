import fs from 'node:fs';
import path from 'node:path';
import { synthesizeGoogleTts } from './google-tts.js';
import { concatWavs, cleanScriptForTTS, TtsError } from './tts-shared.js';
import { currentWorkspace } from './workspace.js';

export * from './conversational-types.js';
import {
  parseDialogueTurns,
  resolveCharacterVoice,
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
 */
export async function synthesizeConversationalBlock(params: {
  text: string;
  language: 'hi' | 'en';
  channelKey?: string;
  defaultVoice?: string;
  onProgress?: (turn: number, total: number) => void;
}): Promise<{ buffer: Buffer; durationSec: number; turns: DialogueTurn[] }> {
  const turns = parseDialogueTurns(params.text);
  if (turns.length === 0) {
    throw new TtsError('VALIDATION', 'No spoken dialogue lines found in conversational script.');
  }

  const audioParts: Buffer[] = [];
  const measuredTurns: DialogueTurn[] = [];
  let currentOffsetSec = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const cast = resolveCharacterVoice(turn.speaker, params.language, params.channelKey, params.defaultVoice);

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
      const pauseDuration = turn.speaker.toLowerCase() === 'narrator' || nextTurn.speaker.toLowerCase() === 'narrator' ? 0.4 : 0.26;
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
