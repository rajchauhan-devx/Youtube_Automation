export type VoiceLanguage = 'en' | 'hi';
export interface SavedVoice {
  id: string;
  name: string;
  language: VoiceLanguage;
  source?: 'builtin' | 'provider';
  deletable?: boolean;
}

const LEGACY_PREFERENCE_KEY = (provider: string, language: string) => `tubeflow:voice:${provider}:${language}`;
const PREFERENCE_KEY = (accountId: string, provider: string, language: string) => `tubeflow:voice:${accountId}:${provider}:${language}`;



// Voice selections belong to one profile: each account remembers its own
// preferred narrator so switching YouTube accounts never carries a voice over.
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
