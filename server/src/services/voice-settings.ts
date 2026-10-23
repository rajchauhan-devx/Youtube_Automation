/** Stable defaults and migration of saved voice options from retired engines. */
export function defaultGoogleVoice(language: 'en' | 'hi'): string {
  return `${language === 'hi' ? 'hi' : 'en'}-IN-Chirp3-HD-Charon`;
}

export function normalizeSavedVoiceSettings(settings: unknown): void {
  if (!settings || typeof settings !== 'object' || !('voice' in settings)) return;
  const voice = (settings as { voice: unknown }).voice;
  if (!voice || typeof voice !== 'object' || Array.isArray(voice)) return;
  const record = voice as Record<string, unknown>;
  const keys = new Set(['provider', 'language', 'voiceId', 'rate', 'pitch', 'speed']);
  for (const key of Object.keys(record)) if (!keys.has(key)) delete record[key];
  if (!['default', 'google', 'edge', 'openrouter', 'omni'].includes(String(record.provider))) record.provider = 'google';
  if (record.provider === 'google' || record.provider === 'default') {
    if (!/^(?:hi-IN|en-IN|en-US)-Chirp3-HD-[A-Za-z]+$/.test(String(record.voiceId))) {
      record.voiceId = defaultGoogleVoice(record.language === 'hi' ? 'hi' : 'en');
    }
  }
}
