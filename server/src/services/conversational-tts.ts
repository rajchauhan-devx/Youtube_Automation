import fs from 'node:fs';
import path from 'node:path';
import { synthesizeGoogleTts } from './google-tts.js';
import { concatWavs, cleanScriptForTTS, TtsError } from './tts-shared.js';
import { currentWorkspace } from './workspace.js';

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

/** Pre-configured voice castings per channel / language */
export const CHARACTER_CAST_PRESETS: Record<string, Record<string, CharacterVoiceAssignment>> = {
  // Ancient Dharma / Hindi Epics
  ancient_dharma: {
    narrator: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 1.0, description: 'Venerable, calm storyteller', gender: 'male' },
    सूत्रधार: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 1.0, description: 'Venerable, calm storyteller', gender: 'male' },
    ram: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.95, description: 'Noble, serene, measured elder brother', gender: 'male' },
    राम: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.95, description: 'Noble, serene, measured elder brother', gender: 'male' },
    shri_ram: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.95, description: 'Noble, serene, measured elder brother', gender: 'male' },
    श्रीराम: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.95, description: 'Noble, serene, measured elder brother', gender: 'male' },
    lakshman: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.05, description: 'Fierce, energetic, loyal younger warrior', gender: 'male' },
    लक्ष्मण: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.05, description: 'Fierce, energetic, loyal younger warrior', gender: 'male' },
    sita: { voiceId: 'hi-IN-Chirp3-HD-Aoede', speed: 0.98, description: 'Dignified, graceful, divine female voice', gender: 'female' },
    सीता: { voiceId: 'hi-IN-Chirp3-HD-Aoede', speed: 0.98, description: 'Dignified, graceful, divine female voice', gender: 'female' },
    hanuman: { voiceId: 'hi-IN-Chirp3-HD-Enceladus', speed: 0.95, description: 'Devoted, powerful, resonant warrior', gender: 'male' },
    हनुमान: { voiceId: 'hi-IN-Chirp3-HD-Enceladus', speed: 0.95, description: 'Devoted, powerful, resonant warrior', gender: 'male' },
    ravana: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.92, description: 'Authoritative, imposing, arrogant baritone', gender: 'male' },
    रावण: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.92, description: 'Authoritative, imposing, arrogant baritone', gender: 'male' },
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
    krishna: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.95, description: 'Transcendent, tranquil supreme teacher', gender: 'male' },
    कृष्ण: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.95, description: 'Transcendent, tranquil supreme teacher', gender: 'male' },
    श्रीकृष्ण: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.95, description: 'Transcendent, tranquil supreme teacher', gender: 'male' },
    arjuna: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.02, description: 'Determined, earnest archer', gender: 'male' },
    अर्जुन: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 1.02, description: 'Determined, earnest archer', gender: 'male' },
    shiva: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.9, description: 'Deep cosmic ascetic deity', gender: 'male' },
    शिव: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.9, description: 'Deep cosmic ascetic deity', gender: 'male' },
    mahadev: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.9, description: 'Deep cosmic ascetic deity', gender: 'male' },
    महादेव: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.9, description: 'Deep cosmic ascetic deity', gender: 'male' },
  },

  // Talvora / Romantic & Nocturnal Drama (English)
  talvora: {
    narrator: { voiceId: 'en-US-Chirp3-HD-Aoede', speed: 1.0, description: 'Moody, intimate storyteller', gender: 'female' },
    elena: { voiceId: 'en-US-Chirp3-HD-Despina', speed: 1.02, description: 'Expressive, vulnerable 28yo female lead', gender: 'female' },
    stranger: { voiceId: 'en-US-Chirp3-HD-Charon', speed: 0.95, description: 'Low, calm, enigmatic male baritone', gender: 'male' },
    julian: { voiceId: 'en-US-Chirp3-HD-Charon', speed: 0.95, description: 'Low, calm, enigmatic male baritone', gender: 'male' },
    marcus: { voiceId: 'en-US-Chirp3-HD-Fenrir', speed: 1.04, description: 'Impatient, sharp male counterpart', gender: 'male' },
    clara: { voiceId: 'en-US-Chirp3-HD-Aoede', speed: 0.98, description: 'Melancholy confidante', gender: 'female' },
    detective: { voiceId: 'en-US-Chirp3-HD-Algieba', speed: 0.96, description: 'Methodical investigator', gender: 'male' },
    man: { voiceId: 'en-US-Chirp3-HD-Fenrir', speed: 1.0, description: 'Direct male voice', gender: 'male' },
    woman: { voiceId: 'en-US-Chirp3-HD-Despina', speed: 1.02, description: 'Expressive female voice', gender: 'female' },
  },

  // Against the Odds / Survival Documentaries
  against_the_odds: {
    narrator: { voiceId: 'en-US-Chirp3-HD-Algieba', speed: 1.0, description: 'Grounded documentary narrator', gender: 'male' },
    survivor: { voiceId: 'en-US-Chirp3-HD-Fenrir', speed: 1.04, description: 'Intense firsthand survival voice', gender: 'male' },
    rescuer: { voiceId: 'en-US-Chirp3-HD-Charon', speed: 0.96, description: 'Authoritative dispatch voice', gender: 'male' },
  },
};

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
 * Detects if a text block contains character dialogue attribution tags like [Ram]: or Lakshman:
 */
export function hasSpeakerDialogueTags(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  // Match lines like "[Ram]:", "Ram:", "[लक्ष्मण]:", "Lakshman:", etc.
  const speakerTagRegex = /(?:^|\n)\s*(?:\[\s*([A-Za-z\u0900-\u097F\s]{2,25})\s*\]|([A-Za-z\u0900-\u097F]{2,20}))\s*:\s*/m;
  return speakerTagRegex.test(text);
}

/**
 * Parses raw narration text into structured character dialogue turns.
 */
export function parseDialogueTurns(text: string): DialogueTurn[] {
  if (!text || typeof text !== 'string') return [];

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const turns: DialogueTurn[] = [];

  const lineRegex = /^(?:\[\s*([A-Za-z\u0900-\u097F\s]{2,25})\s*\]|([A-Za-z\u0900-\u097F]{2,20}))\s*:\s*(.*)$/;

  let currentSpeaker = 'Narrator';
  let currentText = '';

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (match) {
      // Flush previous accumulated line
      if (currentText.trim()) {
        turns.push({ speaker: currentSpeaker, text: cleanDialogueLine(currentText) });
        currentText = '';
      }
      currentSpeaker = (match[1] || match[2]).trim();
      currentText = match[3] || '';
    } else {
      // Continuation of current speaker's dialogue or introductory narration
      currentText += (currentText ? ' ' : '') + line;
    }
  }

  if (currentText.trim()) {
    turns.push({ speaker: currentSpeaker, text: cleanDialogueLine(currentText) });
  }

  // Filter out empty turns
  return turns.filter((t) => t.text.length > 0);
}

function cleanDialogueLine(line: string): string {
  return line
    .replace(/^["“'«](.*)["”'»]$/, '$1') // strip surrounding dialogue quotes
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
  if (accountId === 'acct_talvora' || /talvora/i.test(accountId)) return 'talvora';
  if (accountId.includes('620a1d5e') || /against/i.test(accountId)) return 'against_the_odds';
  return 'ancient_dharma';
}

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
 * Resolves the best-matched voice model for a given character name.
 */
export function resolveCharacterVoice(
  speaker: string,
  language: 'hi' | 'en',
  channelKey = 'ancient_dharma',
  fallbackVoice = 'default'
): CharacterVoiceAssignment {
  const normKey = speaker.toLowerCase().trim().replace(/[\s_-]+/g, '_');
  const channelPreset = CHARACTER_CAST_PRESETS[channelKey] || CHARACTER_CAST_PRESETS.ancient_dharma;

  // Direct match in channel cast
  if (channelPreset[normKey]) {
    return channelPreset[normKey];
  }

  // Search by substring (e.g. "shri ram" matches "ram")
  for (const [key, cast] of Object.entries(channelPreset)) {
    if (normKey.includes(key) || key.includes(normKey)) {
      return cast;
    }
  }

  // Fallback defaults based on language
  if (language === 'hi') {
    return {
      voiceId: fallbackVoice && fallbackVoice !== 'default' ? fallbackVoice : 'hi-IN-Chirp3-HD-Charon',
      speed: 1.0,
      description: 'Default Hindi voice',
      gender: 'male',
    };
  }

  return {
    voiceId: fallbackVoice && fallbackVoice !== 'default' ? fallbackVoice : 'en-US-Chirp3-HD-Aoede',
    speed: 1.0,
    description: 'Default English voice',
    gender: 'female',
  };
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
