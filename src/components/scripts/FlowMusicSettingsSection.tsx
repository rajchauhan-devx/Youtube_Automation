import { useState, useEffect, useMemo } from 'react';
import {
  Music,
  UserCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Activity,
  Globe,
  Mic,
} from 'lucide-react';
import { useWorkspaceApi } from '../../services/workspaceApi';

export interface FlowMusicConfig {
  enabled: boolean;
  prompt: string;
  lyrics: string;
  lyricsMode?: 'custom' | 'instrumental' | 'ai';
  language?: 'auto' | 'hi' | 'en' | 'instrumental';
  title?: string;
  mood?: string;
  theme?: string;
  vocalProfile?: string;
  sfxBooms?: boolean;
  sfxRisers?: boolean;
  dholPercussion?: boolean;
  brassSwells?: boolean;
  duration?: number;
  bpm?: number;
  producerModel?: string;
  imageOnlyReel?: boolean;
  letterboxBanner?: string;
  vfxParticles?: boolean;
}

const selectClass = 'studio-input mt-1 w-full';

export function FlowMusicSettingsSection({
  value,
  onChange,
  onClear,
  topicName = '',
}: {
  value?: Partial<FlowMusicConfig>;
  onChange: (patch: Partial<FlowMusicConfig>) => void;
  onClear?: () => void;
  onLoadPreset?: () => void;
  topicName?: string;
}) {
  const { fetch } = useWorkspaceApi();
  const [account, setAccount] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<'checking' | 'ok' | 'auth_required'>('checking');
  const [switching, setSwitching] = useState(false);
  const [switchMessage, setSwitchMessage] = useState('');
  const [switchError, setSwitchError] = useState('');

  const cfg: FlowMusicConfig = {
    enabled: value?.enabled ?? false,
    prompt: value?.prompt ?? '',
    lyrics: value?.lyrics ?? '',
    lyricsMode: value?.lyricsMode || 'custom',
    language: value?.language || 'auto',
    title: value?.title ?? (topicName ? `${topicName}` : ''),
    mood: value?.mood ?? '',
    theme: value?.theme ?? '',
    vocalProfile: value?.vocalProfile || 'male',
    sfxBooms: value?.sfxBooms ?? false,
    sfxRisers: value?.sfxRisers ?? false,
    dholPercussion: value?.dholPercussion ?? false,
    brassSwells: value?.brassSwells ?? false,
    duration: value?.duration || 60,
    bpm: value?.bpm || 110,
    producerModel: value?.producerModel || 'Google Lyria / Flow Music',
    imageOnlyReel: value?.imageOnlyReel ?? true,
    letterboxBanner: value?.letterboxBanner ?? '',
    vfxParticles: value?.vfxParticles ?? false,
  };

  const detectedLanguage = useMemo<'hi' | 'en' | 'instrumental'>(() => {
    if (cfg.lyricsMode === 'instrumental' || cfg.language === 'instrumental') return 'instrumental';
    if (cfg.language === 'hi') return 'hi';
    if (cfg.language === 'en') return 'en';

    const full = [cfg.lyrics, cfg.prompt, cfg.title].filter(Boolean).join(' ');
    if (/[\u0900-\u097F]/.test(full)) return 'hi';

    if (/\b(hindi|hinglish|bollywood|bhajan|kirtan|aarti|chalisa|shloka|mantra|sufi|qawwali|punjabi|desi|bhojpuri|ghazal|geet|deshbhakti|hindustani|indian)\b/i.test(full)) {
      return 'hi';
    }
    if (/\b(sing in hindi|sing in hinglish|hindi song|hindi vocals|hindi lyrics|hindi singing)\b/i.test(full)) {
      return 'hi';
    }
    if (/\b(jai shri|jai shree|sita ram|hare krishna|hare rama|har har|tere bin|tu hi|kya baat|mera dil|meri jaan|nach le|ho gaya|ek baar|aisa kyu|dard e dil|ab to|dil diya|tod de)\b/i.test(full)) {
      return 'hi';
    }
    const HINDI_WORDS = new Set([
      'hai', 'hain', 'ho', 'hoon', 'hun', 'tha', 'thi', 'the', 'kya', 'kyun', 'kyon',
      'mera', 'meri', 'mere', 'tera', 'teri', 'tere', 'hum', 'tum', 'aap', 'woh', 'yeh',
      'main', 'mujhe', 'tujhe', 'humein', 'dil', 'jaan', 'zindagi', 'ishq', 'pyaar', 'pyar',
      'mohabbat', 'shayar', 'aankhein', 'sanam', 'raat', 'subah', 'shaam', 'duniya', 'ram',
      'shri', 'sita', 'hanuman', 'radha', 'krishna', 'karo', 'karna', 'raha', 'rahi', 'rahe',
      'gaya', 'gayi', 'gaye', 'dekh', 'dekho', 'suno', 'bolo', 'jaana', 'baat', 'baatein',
      'saath', 'paas', 'door', 'kabhi', 'abhi', 'phir', 'nahi', 'nahin', 'chal', 'chale',
      'naina', 'saajna', 'mahi', 'dholna', 'piya', 'jeena', 'marna', 'tod', 'bajrangbali'
    ]);
    const words = full.toLowerCase().match(/[a-z]+/g) || [];
    const matches = new Set(words.filter((w) => HINDI_WORDS.has(w)));
    if (matches.size >= 2) return 'hi';
    return 'en';
  }, [cfg.language, cfg.lyricsMode, cfg.lyrics, cfg.prompt, cfg.title]);

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/flow-music/status');
      if (res.ok) {
        const data = await res.json();
        setAccount(data.account || null);
        setAccountStatus(data.account ? 'ok' : 'auth_required');
      } else {
        setAccountStatus('auth_required');
      }
    } catch {
      setAccountStatus('auth_required');
    }
  };

  useEffect(() => {
    void loadStatus();
    const interval = setInterval(loadStatus, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleSwitchAccount = async (fresh = true) => {
    setSwitching(true);
    setSwitchMessage('');
    setSwitchError('');
    try {
      const res = await fetch('/api/flow-music/launch-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fresh }),
      });
      const data = await res.json();
      if (res.ok) {
        setSwitchMessage(data.message || 'Browser launched. Please sign in and close the browser.');
      } else {
        setSwitchError(data.error || 'Could not launch login browser');
      }
    } catch (err: any) {
      setSwitchError(err?.message || 'Failed to connect');
    } finally {
      setSwitching(false);
      void loadStatus();
    }
  };

  const clearFields = () => {
    onChange({
      prompt: '',
      lyrics: '',
      title: '',
      language: 'auto',
      vocalProfile: 'male',
      mood: '',
      theme: '',
      letterboxBanner: '',
      sfxBooms: false,
      sfxRisers: false,
      dholPercussion: false,
      brassSwells: false,
      vfxParticles: false,
    });
    onClear?.();
  };

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-zinc-950 p-4 shadow-xl">
      {/* Title & Connection Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
            <Music className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              Google Flow Music
              <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300 border border-sky-500/30">
                Raw Input
              </span>
            </h4>
            <p className="text-[11px] text-zinc-400">
              Submit raw prompts directly to Google Flow Music without modified data or forced styles
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearFields}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-white/10 transition-colors"
          >
            Clear Fields
          </button>
        </div>
      </div>

      {/* Account Connection & Switch Account */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/40 p-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              account ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            <UserCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-zinc-400">Google Flow Connected Account</p>
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              {account || 'No Google Account connected'}
              {account && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={switching}
            onClick={() => handleSwitchAccount(true)}
            className="flex items-center gap-1.5 rounded-lg border border-blue-400/40 bg-blue-600/20 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-600/30 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${switching ? 'animate-spin' : ''}`} />
            Switch Google Account
          </button>
          <button
            type="button"
            onClick={loadStatus}
            title="Refresh status"
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-400 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {switchMessage && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-2 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{switchMessage}</span>
        </div>
      )}
      {switchError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-2 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{switchError}</span>
        </div>
      )}

      {/* 1. Prompt (Raw Google Flow Music Composer Input) */}
      <div>
        <label className="block text-xs font-semibold text-zinc-300 mb-1 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Music className="h-3.5 w-3.5 text-sky-400" />
            Music Prompt (Google Flow Music Composer)
          </span>
          <span className="text-[10px] text-zinc-500">Sent directly to Google Flow Music</span>
        </label>
        <textarea
          rows={4}
          value={cfg.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder="Describe the track you want to create (style, genre, tempo, instruments, mood, vocals, lyrics)... e.g. 'Chill lo-fi hip hop beat with warm rhodes piano and rain sounds' or 'High energy 80s synthwave with punchy drums and driving bassline'"
          className="studio-input w-full font-sans text-xs leading-relaxed"
        />
      </div>

      {/* 2. Lyrics (Optional) */}
      <div>
        <label className="block text-xs font-semibold text-zinc-300 mb-1 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            Lyrics (Optional)
          </span>
          <div className="flex items-center gap-2">
            {detectedLanguage === 'hi' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                <Globe className="h-3 w-3" />
                🇮🇳 Hindi Singing Active
              </span>
            )}
            {detectedLanguage === 'en' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-300 border border-sky-500/30">
                <Globe className="h-3 w-3" />
                🇺🇸 English Singing
              </span>
            )}
            {detectedLanguage === 'instrumental' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300 border border-purple-500/30">
                <Music className="h-3 w-3" />
                Instrumental
              </span>
            )}
            <span className="text-[10px] text-zinc-500 hidden sm:inline">Hindi (हिंदी/Hinglish) or English</span>
          </div>
        </label>
        <textarea
          rows={4}
          value={cfg.lyrics}
          onChange={(e) => onChange({ lyrics: e.target.value })}
          placeholder="Enter lyrics or spoken dialogue in Hindi (हिंदी or Hinglish) or English (leave blank for instrumental)..."
          className="studio-input w-full font-mono text-xs leading-relaxed text-zinc-200"
        />
      </div>

      {/* 3. Track Details, Vocal Language & Duration */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="block text-xs font-semibold text-zinc-300">Track Title (Optional)</label>
          <input
            type="text"
            value={cfg.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className={selectClass}
            placeholder="e.g. Midnight Drive"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-300 flex items-center gap-1">
            <Globe className="h-3.5 w-3.5 text-zinc-400" /> Vocal Language
          </label>
          <select
            value={cfg.language || 'auto'}
            onChange={(e) => onChange({ language: e.target.value as any })}
            className={selectClass}
          >
            <option value="auto">Auto-Detect (Hindi / English)</option>
            <option value="hi">🇮🇳 Hindi (हिंदी / Hinglish)</option>
            <option value="en">🇺🇸 English</option>
            <option value="instrumental">🎵 Instrumental (No Vocals)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-300 flex items-center gap-1">
            <Mic className="h-3.5 w-3.5 text-zinc-400" /> Vocalist Style
          </label>
          <select
            value={cfg.vocalProfile || 'male'}
            onChange={(e) => onChange({ vocalProfile: e.target.value })}
            className={selectClass}
          >
            <option value="male">Male Lead Singer</option>
            <option value="female">Female Lead Singer</option>
            <option value="duet">Duet / Harmonies</option>
            <option value="choir">Devotional Choir</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-300 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-zinc-400" /> Duration
          </label>
          <select
            value={cfg.duration}
            onChange={(e) => onChange({ duration: Number(e.target.value) })}
            className={selectClass}
          >
            <option value={30}>30 seconds (Shorts hook)</option>
            <option value={45}>45 seconds</option>
            <option value={60}>60 seconds (Full Track)</option>
            <option value={90}>90 seconds</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-300 flex items-center gap-1">
            <Activity className="h-3.5 w-3.5 text-zinc-400" /> Tempo / BPM
          </label>
          <select
            value={cfg.bpm}
            onChange={(e) => onChange({ bpm: Number(e.target.value) })}
            className={selectClass}
          >
            <option value={90}>90 BPM (Relaxed / Lofi)</option>
            <option value={110}>110 BPM (Mid-tempo)</option>
            <option value={120}>120 BPM (Standard Dance / Pop)</option>
            <option value={128}>128 BPM (Upbeat / Driving)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
