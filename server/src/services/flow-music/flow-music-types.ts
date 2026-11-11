export interface FlowMusicSettings {
  enabled: boolean;
  prompt: string;
  lyrics: string;
  lyricsMode: 'custom' | 'instrumental' | 'ai';
  title: string;
  mood: string;
  theme: string;
  vocalProfile: string;
  sfxBooms: boolean;
  sfxRisers: boolean;
  dholPercussion: boolean;
  brassSwells: boolean;
  duration: number;
  bpm: number;
  producerModel: string;
  accountEmail?: string;
  imageOnlyReel: boolean;
  letterboxBanner: string;
  vfxParticles: boolean;
}

export interface FlowMusicJob {
  id: string;
  scriptId: string;
  state: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  stage: string;
  progress: number;
  error?: string;
  settings: FlowMusicSettings;
  audioPath?: string;
  downloadUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowMusicAccount {
  account: string;
  tier?: string;
  status: 'ok' | 'auth_required' | 'unknown';
  lastSync?: string;
  credits?: number | null;
}
