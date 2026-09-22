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

export function rememberVoice(language: string, provider: string, id: string) {
  try { localStorage.setItem(`tubeflow:voice:${provider}:${language}`, id); } catch { /* Storage is optional. */ }
}
export function preferredVoice(language: string, provider: string): string {
  try { return localStorage.getItem(`tubeflow:voice:${provider}:${language}`) || ''; } catch { return ''; }
}

export async function listVoices(language: VoiceLanguage, signal?: AbortSignal): Promise<{ voices: SavedVoice[]; provider: string }> {
  const response = await fetch(`/api/tts/voices?language=${language}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load saved voices');
  if (!Array.isArray(data.voices)) throw new Error('Invalid voice library response');
  return data;
}

export async function saveVoiceReference(name: string, language: VoiceLanguage, file: File): Promise<SavedVoice> {
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
  const response = await fetch('/api/tts/voices', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), language, dataUrl }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not save the voice reference');
  window.dispatchEvent(new Event(VOICES_CHANGED));
  return data.voice;
}

export async function removeVoiceReference(id: string): Promise<void> {
  const response = await fetch(`/api/tts/voices/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Could not delete voice reference');
  }
  window.dispatchEvent(new Event(VOICES_CHANGED));
}
