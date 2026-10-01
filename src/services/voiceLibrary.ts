export type VoiceLanguage = 'en' | 'hi';
export interface SavedVoice {
  id: string;
  name: string;
  language: VoiceLanguage;
  source?: 'builtin' | 'clone' | 'provider';
  deletable?: boolean;
}

export const VOICES_CHANGED = 'tubeflow:voices-changed';
export const VOICE_FILE_ACCEPT = '.wav,.mp3,.m4a,.flac,.ogg,audio/wav,audio/mpeg,audio/mp4,audio/flac,audio/ogg';
const MIME: Record<string, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg' };
const LEGACY_PREFERENCE_KEY = (provider: string, language: string) => `tubeflow:voice:${provider}:${language}`;
const PREFERENCE_KEY = (accountId: string, provider: string, language: string) => `tubeflow:voice:${accountId}:${provider}:${language}`;

export type WorkspaceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

import { parseJsonResponse } from '../lib/safe';

// Voice selections belong to one profile: each account remembers its own
// preferred reference so switching YouTube accounts never carries a voice over.
export function rememberVoice(accountId: string, language: string, provider: string, id: string) {
  try { localStorage.setItem(PREFERENCE_KEY(accountId, provider, language), id); } catch { /* Storage is optional. */ }
}

export function preferredVoice(accountId: string, language: string, provider: string): string {
  try {
    return localStorage.getItem(PREFERENCE_KEY(accountId, provider, language))
      || (accountId === 'default' ? localStorage.getItem(LEGACY_PREFERENCE_KEY(provider, language)) : '')
      || '';
  } catch { return ''; }
}

export async function listVoices(
  language: VoiceLanguage,
  workspaceFetch: WorkspaceFetch,
  signal?: AbortSignal,
): Promise<{ voices: SavedVoice[]; provider: string }> {
  const response = await workspaceFetch(`/api/tts/voices?language=${language}`, { signal });
  const data = await parseJsonResponse<{ voices?: unknown; provider?: string; error?: string }>(response, {});
  if (!response.ok) throw new Error(data.error || 'Could not load saved voices');
  if (!Array.isArray(data.voices)) throw new Error('Invalid voice library response');
  return data as { voices: SavedVoice[]; provider: string };
}

export async function saveVoiceReference(
  name: string,
  language: VoiceLanguage,
  file: File,
  workspaceFetch: WorkspaceFetch,
): Promise<SavedVoice> {
  if (!name.trim()) throw new Error('Enter a voice name.');
  const mime = MIME[file.name.split('.').pop()?.toLowerCase() || ''];
  if (!mime) throw new Error('Choose a WAV, MP3, M4A, FLAC, or OGG recording.');
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('Choose an audio file between 1 byte and 8 MB.');
  // Windows sometimes reports an empty or generic MIME type for valid audio files.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the reference recording.'));
    reader.readAsDataURL(new Blob([file], { type: mime }));
  });
  const response = await workspaceFetch('/api/tts/voices', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), language, dataUrl }),
  });
  const data = await parseJsonResponse<{ voice?: SavedVoice; error?: string }>(response, {});
  if (!response.ok) throw new Error(data.error || 'Could not save the voice reference');
  if (!data.voice) throw new Error('Could not save the voice reference');
  window.dispatchEvent(new Event(VOICES_CHANGED));
  return data.voice;
}

export async function removeVoiceReference(id: string, workspaceFetch: WorkspaceFetch): Promise<void> {
  const response = await workspaceFetch(`/api/tts/voices/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    const data = await parseJsonResponse<{ error?: string }>(response, {});
    throw new Error(data.error || 'Could not delete voice reference');
  }
  window.dispatchEvent(new Event(VOICES_CHANGED));
}
