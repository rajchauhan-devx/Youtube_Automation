import { useState, useEffect } from 'react';
import {
  Music,
  UserCheck,
  RefreshCw,
  Sparkles,
  Volume2,
  Sliders,
  FileText,
  Flame,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { useWorkspaceApi } from '../../services/workspaceApi';

export interface FlowMusicConfig {
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
  imageOnlyReel: boolean;
  letterboxBanner: string;
  vfxParticles: boolean;
}

const selectClass = 'studio-input mt-1 w-full';

export function FlowMusicSettingsSection({
  value,
  onChange,
  onClear,
  onLoadPreset,
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
    title: value?.title ?? (topicName ? `${topicName}` : ''),
    mood: value?.mood ?? '',
    theme: value?.theme ?? '',
    vocalProfile: value?.vocalProfile ?? '',
    sfxBooms: value?.sfxBooms ?? true,
    sfxRisers: value?.sfxRisers ?? true,
    dholPercussion: value?.dholPercussion ?? true,
    brassSwells: value?.brassSwells ?? true,
    duration: value?.duration || 60,
    bpm: value?.bpm || 110,
    producerModel: value?.producerModel || 'Google Lyria / Flow Music',
    imageOnlyReel: value?.imageOnlyReel ?? true,
    letterboxBanner: value?.letterboxBanner ?? '',
    vfxParticles: value?.vfxParticles ?? true,
  };

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

  const loadHanumanPreset = () => {
    onChange({
      title: 'Lord Hanuman Vow // Goosebumps 🚩',
      theme: 'Mythological retelling, Valmiki Ramayana, Lord Hanuman Vow to Lord Rama',
      prompt:
        'Epic cinematic trailer sound track, heavy indian percussion, dhol drums, orchestral brass swells, deep sub-bass drops, emotional sad strings transitioning into aggressive action hybrid music, Sanskrit chants, high energy war theme',
      lyrics: `[Dramatic Dialogue Phase]
राम जी: "हनुमान, अगर सूर्य निकल गया तो लक्ष्मण मर जाएगा।"
हनुमान जी: "प्रभु, सूर्यदेव मेरा स्वभाव जानते हैं... जब तक जड़ी-बूटी लेकर नहीं आऊँगा, सूरज को उगने नहीं दूंगा।"
राम जी: "हनुमान, मौत आगे बढ़ रही है..."
हनुमान जी: "प्रभु, आप कहते हैं मौत लक्ष्मण को खा जाएगी? मैं आपकी कसम खा के कहता हूँ... आज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!"

[Epic Vocal Chorus / Sanskrit Chants]
राम रामं जपती...
हनुमान अतुलितबलधामम्...
हनुमान महाकाल शंभोरावतारः...
बजरंगबली... जय श्री राम!`,
      mood: 'Heroic, Dramatic, High-Intensity, Emotionally Charged (Goosebumps 🚩)',
      vocalProfile:
        'Deep resonant male voice with heavy chest resonance, strong bass, aggressive cadence suited for epic trailers',
      letterboxBanner: 'Goosebumps 🚩',
      sfxBooms: true,
      sfxRisers: true,
      dholPercussion: true,
      brassSwells: true,
      imageOnlyReel: true,
      vfxParticles: true,
    });
    onLoadPreset?.();
  };

  const clearFields = () => {
    onChange({
      prompt: '',
      lyrics: '',
      title: '',
      mood: '',
      theme: '',
      vocalProfile: '',
      letterboxBanner: '',
    });
    onClear?.();
  };

  return (
    <div className="space-y-4 rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-500/10 via-zinc-950/80 to-zinc-950 p-4 shadow-xl">
      {/* Title & Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
            <Music className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              Script, Lyrics & Music Direction
              <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300 border border-amber-500/30">
                Playwright Automated
              </span>
            </h4>
            <p className="text-[11px] text-zinc-400">
              Write your script, lyrics or chants, set audio mood, and configure 9:16 letterbox styling
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
          <button
            type="button"
            onClick={loadHanumanPreset}
            className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Load Hanuman Demo
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

      {/* 1. Prompt & Musical Direction */}
      <div>
        <label className="block text-xs font-semibold text-zinc-300 mb-1 flex items-center justify-between">
          <span>Musical Style & Prompt (Google Flow Music Engine)</span>
          <span className="text-[10px] text-zinc-500">Instruments, Mood & Cadence</span>
        </label>
        <textarea
          rows={3}
          value={cfg.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder="Describe soundtrack style, percussion, orchestral brass, bass drops, Sanskrit chants..."
          className="studio-input w-full font-sans text-xs leading-relaxed"
        />
      </div>

      {/* 2. Lyrics & Chants */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-amber-400" />
            Song Lyrics & Sacred Chants (Devanagari / Sanskrit)
          </label>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-zinc-400">Mode:</span>
            <select
              value={cfg.lyricsMode}
              onChange={(e) => onChange({ lyricsMode: e.target.value as any })}
              className="rounded border border-white/10 bg-zinc-900 px-2 py-0.5 text-zinc-200 text-[10px]"
            >
              <option value="custom">Custom Lyrics & Chants</option>
              <option value="instrumental">Instrumental Only</option>
              <option value="ai">AI Auto-Compose</option>
            </select>
          </div>
        </div>
        <textarea
          rows={6}
          value={cfg.lyrics}
          onChange={(e) => onChange({ lyrics: e.target.value })}
          placeholder="Enter dialogue script and Sanskrit chanting verses (e.g. राम रामं जपती... हनुमान अतुलितबलधामम्...)..."
          className="studio-input w-full font-mono text-xs leading-relaxed text-amber-100/90"
        />
        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-zinc-400">
          <span className="text-zinc-500">Insert tags:</span>
          {['[Dialogue Phase]', '[Epic Vocal Chorus]', '[Sanskrit Chant]', '[Bass Drop]', '[Outro]'].map(
            (tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onChange({ lyrics: `${cfg.lyrics}\n${tag}\n` })}
                className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 hover:bg-white/10 text-zinc-300"
              >
                {tag}
              </button>
            )
          )}
        </div>
      </div>

      {/* 3. Details & Metadata */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-zinc-300">Track Title / Project Name</label>
          <input
            type="text"
            value={cfg.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className={selectClass}
            placeholder="e.g. Ancient Warrior Awakening // Epic Reel"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-300">Mood & Tone</label>
          <input
            type="text"
            value={cfg.mood}
            onChange={(e) => onChange({ mood: e.target.value })}
            className={selectClass}
            placeholder="e.g. Heroic, Dramatic, Suspenseful, Emotional"
          />
        </div>
      </div>

      {/* 4. Sound & Mix Settings */}
      <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
          <Sliders className="h-3.5 w-3.5 text-amber-400" /> Sound & Audio Mix Controls
        </div>

        <div>
          <label className="block text-[11px] text-zinc-400 mb-0.5">Vocal Profile & Delivery</label>
          <input
            type="text"
            value={cfg.vocalProfile}
            onChange={(e) => onChange({ vocalProfile: e.target.value })}
            className={selectClass}
            placeholder="Deep, resonant male voice with heavy chest resonance, strong bass, aggressive cadence"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              className="accent-amber-500 rounded"
              checked={cfg.sfxBooms}
              onChange={(e) => onChange({ sfxBooms: e.target.checked })}
            />
            <span>Sub-bass Impacts & Booms</span>
          </label>
          <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              className="accent-amber-500 rounded"
              checked={cfg.sfxRisers}
              onChange={(e) => onChange({ sfxRisers: e.target.checked })}
            />
            <span>Cinematic Riser Sweeps</span>
          </label>
          <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              className="accent-amber-500 rounded"
              checked={cfg.dholPercussion}
              onChange={(e) => onChange({ dholPercussion: e.target.checked })}
            />
            <span>Dhol Drums Percussion</span>
          </label>
          <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              className="accent-amber-500 rounded"
              checked={cfg.brassSwells}
              onChange={(e) => onChange({ brassSwells: e.target.checked })}
            />
            <span>Orchestral Brass Swells</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[11px] text-zinc-400">Duration</label>
            <select
              value={cfg.duration}
              onChange={(e) => onChange({ duration: Number(e.target.value) })}
              className={selectClass}
            >
              <option value={30}>30 seconds (Shorts hook)</option>
              <option value={45}>45 seconds</option>
              <option value={60}>60 seconds (Full Reel)</option>
              <option value={90}>90 seconds</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-zinc-400">Tempo / Cadence</label>
            <select
              value={cfg.bpm}
              onChange={(e) => onChange({ bpm: Number(e.target.value) })}
              className={selectClass}
            >
              <option value={90}>90 BPM (Slow Dramatic)</option>
              <option value={110}>110 BPM (High-Intensity Trailer)</option>
              <option value={128}>128 BPM (Aggressive War Beat)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 5. HD Reel Visual Styling */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            9:16 & 16:9 Visual Edit Styling
          </div>
          <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 uppercase">
            9:16 Letterboxed
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] text-zinc-300 font-medium">Top Banner Headline (Optional)</label>
            <input
              type="text"
              value={cfg.letterboxBanner}
              onChange={(e) => onChange({ letterboxBanner: e.target.value })}
              className={selectClass}
              placeholder="Optional e.g. Goosebumps 🚩 (leave blank for none)"
            />
            <p className="mt-1 text-[10px] text-zinc-400">
              Displayed at the top of the 9:16 vertical letterbox frame when set.
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                className="accent-amber-500 rounded"
                checked={cfg.imageOnlyReel}
                onChange={(e) => onChange({ imageOnlyReel: e.target.checked })}
              />
              <span className="font-semibold text-white">2K HD Multi-Scene Mode</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                className="accent-amber-500 rounded"
                checked={cfg.vfxParticles}
                onChange={(e) => onChange({ vfxParticles: e.target.checked })}
              />
              <span>Floating Fire Embers & VFX Particles</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
