import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, SkipBack, SkipForward, Layers, Sparkles, 
  Volume2, Key, Film, CheckCircle2, ShieldCheck, Sliders, Edit3, RefreshCw 
} from 'lucide-react';
import type { Channel } from '../../data';
import { 
  getTemplatesForProfile, 
  MotionTemplate, 
  ANCIENT_DHARMA_TEMPLATES 
} from '../../services/motionTemplates';

interface Props {
  account: Channel;
  accounts: Channel[];
  onSelectAccount: (account: Channel) => void;
}

export function ProfileMotionTemplatesPage(props: Props) {
  return <ProfileMotionLibrary key={props.account.id} {...props} />;
}

function ProfileMotionLibrary({ account, accounts, onSelectAccount }: Props) {
  // Fetch universal templates for selected channel profile
  const templates = useMemo(() => getTemplatesForProfile(account.id), [account.id]);
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id || '');
  const [category, setCategory] = useState<string>('all');
  const [aspect, setAspect] = useState<'16:9' | '9:16'>('16:9');
  const [frame, setFrame] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [background, setBackground] = useState<'artwork' | 'dark' | 'checker'>('artwork');

  // Interactive Scene Customizer parameters
  const [customParams, setCustomParams] = useState<Record<string, Record<string, any>>>({});

  // Ensure selectedId is valid if templates change
  const selected: MotionTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedId) || templates[0] || ANCIENT_DHARMA_TEMPLATES[0];
  }, [templates, selectedId]);

  const activeParams = useMemo(() => {
    return {
      ...(selected.defaultParams || {}),
      ...(customParams[selected.id] || {})
    };
  }, [selected, customParams]);

  const updateParam = (key: string, value: any) => {
    setCustomParams(prev => ({
      ...prev,
      [selected.id]: {
        ...(prev[selected.id] || selected.defaultParams || {}),
        [key]: value
      }
    }));
  };

  const resetParams = () => {
    setCustomParams(prev => {
      const copy = { ...prev };
      delete copy[selected.id];
      return copy;
    });
  };

  const totalFrames = selected?.durationFrames || 90;
  const fps = selected?.fps || 30;
  const width = aspect === '16:9' ? 1920 : 1080;
  const height = aspect === '16:9' ? 1080 : 1920;

  const frameRef = useRef(frame);
  frameRef.current = frame;

  // Animation loop with requestAnimationFrame
  useEffect(() => {
    if (!playing) return;
    let animId = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const advance = dt * fps * playbackSpeed;
      setFrame(prev => (prev + advance) % totalFrames);
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [playing, totalFrames, fps, playbackSpeed, selectedId]);

  // Reset frame when switching template or aspect
  useEffect(() => {
    setFrame(0);
  }, [selectedId, aspect]);

  // Render SVG string for current frame with live parameters
  const renderedSvg = useMemo(() => {
    if (!selected || typeof selected.renderSvg !== 'function') return '';
    try {
      return selected.renderSvg(Math.floor(frame), totalFrames, width, height, activeParams);
    } catch (e) {
      console.error('Error rendering template SVG:', e);
      return '';
    }
  }, [selected, frame, totalFrames, width, height, activeParams]);

  // Filter templates by category
  const categories = useMemo(() => {
    const set = new Set(templates.map(t => t.category));
    return ['all', ...Array.from(set)];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (category === 'all') return templates;
    return templates.filter(t => t.category === category);
  }, [templates, category]);

  // Background artwork selector for Ancient Dharma / realistic preview
  const sampleArtworkUrl = '/motion-templates/ancient-dharma/vedic_metallurgy_title_card_1792859160762.jpg';

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16 px-2 sm:px-4">
      {/* Profile Header & Account Switcher */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent">
            <Layers className="h-4 w-4" />
            <span>Universal Motion Graphics Library</span>
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] text-accent font-mono">
              ZERO-CARD ARCHITECTURE
            </span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            {account.name}
            <span className="text-xs font-normal font-mono px-2.5 py-1 rounded-md bg-white/10 text-gray-300">
              {templates.length} Universal FX
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted max-w-2xl">
            Foundational, scene-agnostic motion graphics that fit <strong>every scene</strong> in your videos. Highlights, maps, volumetric lighting, distance calipers, timelines, and scale meters with 100% transparent vector overlays.
          </p>
        </div>

        {/* Profile Switcher Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted mr-1 font-medium">Channel Profile:</span>
          {accounts.map(a => {
            const isActive = a.id === account.id;
            return (
              <button
                key={a.id}
                onClick={() => onSelectAccount(a)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'border-accent bg-accent/20 text-white shadow-sm ring-1 ring-accent/30'
                    : 'border-border bg-surface/60 text-muted hover:border-gray-500 hover:text-white'
                }`}
              >
                {a.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Studio Viewport & Controls Grid */}
      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* Left Column: Interactive Player & Scrubber (8 Cols) */}
        <div className="space-y-4 lg:col-span-8 min-w-0">
          <div className="overflow-hidden rounded-2xl border border-border bg-[#0B0C10] shadow-2xl">
            {/* Viewport Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 bg-white/[0.02]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h2 className="font-semibold text-white text-sm sm:text-base truncate">
                  {selected?.name}
                </h2>
                <span className="rounded bg-accent/15 px-2 py-0.5 text-[11px] font-mono text-accent uppercase tracking-wider">
                  {selected?.category}
                </span>
              </div>

              {/* Viewport Display Settings */}
              <div className="flex items-center gap-2">
                {/* Aspect Ratio */}
                <select
                  aria-label="Preview aspect ratio"
                  value={aspect}
                  onChange={e => setAspect(e.target.value as '16:9' | '9:16')}
                  className="rounded-lg border border-border bg-bg/80 px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="16:9">16:9 Landscape (Video)</option>
                  <option value="9:16">9:16 Portrait (Shorts)</option>
                </select>

                {/* Background Mode */}
                <select
                  aria-label="Preview background"
                  value={background}
                  onChange={e => setBackground(e.target.value as 'artwork' | 'dark' | 'checker')}
                  className="rounded-lg border border-border bg-bg/80 px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="artwork">Background: Video Footage</option>
                  <option value="dark">Background: Obsidian Dark</option>
                  <option value="checker">Background: Alpha Grid</option>
                </select>
              </div>
            </div>

            {/* Viewport Canvas Screen */}
            <div className="relative flex items-center justify-center bg-black/40 p-4 sm:p-6 min-h-[380px]">
              <div
                className={`relative w-full overflow-hidden rounded-xl border border-white/10 shadow-inner transition-all ${
                  background === 'checker'
                    ? 'bg-[#12131A] bg-[radial-gradient(#4A4D5E_1px,transparent_1px)] bg-[size:16px_16px]'
                    : background === 'dark'
                    ? 'bg-[#0A0908]'
                    : 'bg-[#181410]'
                }`}
                style={{
                  aspectRatio: aspect === '16:9' ? '16 / 9' : '9 / 16',
                  maxWidth: aspect === '9:16' ? '360px' : '100%',
                }}
              >
                {/* Background Footage Layer (Simulating Video Underlay) */}
                {background === 'artwork' && (
                  <img
                    src={sampleArtworkUrl}
                    alt="Sample documentary background"
                    className="absolute inset-0 h-full w-full object-cover opacity-35 filter brightness-75 contrast-125 select-none pointer-events-none"
                  />
                )}

                {/* Kinetic Motion SVG Render Layer */}
                <div
                  className="absolute inset-0 h-full w-full pointer-events-none"
                  dangerouslySetInnerHTML={{ __html: renderedSvg }}
                />

                {/* Live Telemetry Watermark */}
                <div className="absolute top-3 left-3 flex items-center gap-2 rounded bg-black/70 backdrop-blur-md px-2.5 py-1 text-[11px] font-mono text-gray-300 border border-white/10">
                  <span className="text-accent font-bold">FRAME {Math.floor(frame)}/{totalFrames}</span>
                  <span className="text-gray-500">|</span>
                  <span>{(frame / fps).toFixed(2)}s</span>
                  <span className="text-gray-500">|</span>
                  <span className="text-emerald-400">30 FPS</span>
                </div>

                {/* Zero Card Proof Tag */}
                <div className="absolute top-3 right-3 rounded bg-black/70 backdrop-blur-md px-2.5 py-1 text-[10px] font-mono text-amber-300 border border-amber-500/20 flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3 text-amber-400" />
                  <span>100% TRANSPARENT (NO CARDS)</span>
                </div>
              </div>
            </div>

            {/* Transport & Scrubber Bar */}
            <div className="border-t border-white/10 bg-white/[0.02] p-4 space-y-3">
              {/* Timeline Scrubber */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted w-12 text-right">
                  {(frame / fps).toFixed(1)}s
                </span>
                <input
                  type="range"
                  aria-label="Timeline scrubber"
                  min={0}
                  max={totalFrames - 1}
                  step={0.5}
                  value={Math.min(frame, totalFrames - 1)}
                  onChange={e => {
                    setPlaying(false);
                    setFrame(parseFloat(e.target.value));
                  }}
                  className="flex-1 accent-accent h-2 bg-white/10 rounded-lg cursor-pointer"
                />
                <span className="text-xs font-mono text-muted w-12">
                  {(totalFrames / fps).toFixed(1)}s
                </span>
              </div>

              {/* Playback Button Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  {/* Restart */}
                  <button
                    onClick={() => { setFrame(0); setPlaying(false); }}
                    title="Restart (Frame 0)"
                    className="rounded-lg border border-border p-2 text-muted hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>

                  {/* Step Back -1 */}
                  <button
                    onClick={() => { setPlaying(false); setFrame(f => Math.max(0, f - 1)); }}
                    title="Previous Frame"
                    className="rounded-lg border border-border p-2 text-muted hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>

                  {/* Play / Pause Toggle */}
                  <button
                    onClick={() => setPlaying(!playing)}
                    title={playing ? 'Pause' : 'Play'}
                    className="rounded-lg bg-accent px-4 py-2 text-white font-medium flex items-center gap-2 shadow-lg shadow-accent/25 hover:bg-accent/90 transition-all"
                  >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />}
                    <span className="text-xs">{playing ? 'Pause' : 'Play Motion'}</span>
                  </button>

                  {/* Step Forward +1 */}
                  <button
                    onClick={() => { setPlaying(false); setFrame(f => (f + 1) % totalFrames); }}
                    title="Next Frame"
                    className="rounded-lg border border-border p-2 text-muted hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>

                {/* Speed Controls */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted font-mono">Speed:</span>
                  {[0.5, 1.0].map(s => (
                    <button
                      key={s}
                      onClick={() => setPlaybackSpeed(s)}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                        playbackSpeed === s
                          ? 'bg-accent/20 text-accent font-bold border border-accent/40'
                          : 'text-muted hover:text-white'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Scene Customizer: Adapt to Any Scene */}
          {selected && (
            <div className="rounded-2xl border border-border bg-surface/70 p-5 space-y-4">
              <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    Scene Customizer · Fits Any Video Scene
                  </h3>
                </div>
                <button
                  onClick={resetParams}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors"
                  title="Reset to defaults"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Reset Params</span>
                </button>
              </div>

              {/* Dynamic Parameter Inputs based on template category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Distance Caliper Inputs */}
                {selected.category === 'measurement' && (
                  <>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Distance Value
                      </label>
                      <input
                        type="number"
                        value={activeParams.valNumber ?? 1240}
                        onChange={e => updateParam('valNumber', Number(e.target.value))}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Unit of Measure
                      </label>
                      <input
                        type="text"
                        value={activeParams.unit ?? 'KM'}
                        onChange={e => updateParam('unit', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {/* Highlight Reticle Inputs */}
                {selected.category === 'highlight' && (
                  <>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Focal Title
                      </label>
                      <input
                        type="text"
                        value={activeParams.title ?? 'FOCAL POINT // ARTIFACT DETAIL'}
                        onChange={e => updateParam('title', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Subtitle
                      </label>
                      <input
                        type="text"
                        value={activeParams.subtitle ?? 'PRECISION INSPECTION RETICLE'}
                        onChange={e => updateParam('subtitle', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {/* Map Route Inputs */}
                {selected.category === 'map' && (
                  <>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Origin Location
                      </label>
                      <input
                        type="text"
                        value={activeParams.origin ?? 'MUZIRIS // ANCIENT PORT'}
                        onChange={e => updateParam('origin', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Destination Location
                      </label>
                      <input
                        type="text"
                        value={activeParams.destination ?? 'SRIVIJAYA // STRAIT'}
                        onChange={e => updateParam('destination', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {/* Timeline Scrubber Inputs */}
                {selected.category === 'timeline' && (
                  <>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Active Year / Date
                      </label>
                      <input
                        type="text"
                        value={activeParams.currentYear ?? '250 BCE'}
                        onChange={e => updateParam('currentYear', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Era / Event Name
                      </label>
                      <input
                        type="text"
                        value={activeParams.eraName ?? 'MAURYAN GOLDEN AGE'}
                        onChange={e => updateParam('eraName', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {/* Radial Metric Inputs */}
                {selected.category === 'metric' && (
                  <>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Percentage Target (0-100%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={activeParams.targetPercent ?? 88}
                        onChange={e => updateParam('targetPercent', Number(e.target.value))}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Stat Label
                      </label>
                      <input
                        type="text"
                        value={activeParams.label ?? 'COMPUTED STRUCTURAL PURITY'}
                        onChange={e => updateParam('label', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {/* Side-by-Side Comparison Inputs */}
                {selected.category === 'comparison' && (
                  <>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Side A Title
                      </label>
                      <input
                        type="text"
                        value={activeParams.leftTitle ?? 'CONVENTIONAL BELIEF'}
                        onChange={e => updateParam('leftTitle', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Side B Title
                      </label>
                      <input
                        type="text"
                        value={activeParams.rightTitle ?? 'ARCHAEOLOGICAL FINDINGS'}
                        onChange={e => updateParam('rightTitle', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {/* Vertical Scale Inputs */}
                {selected.category === 'scale' && (
                  <>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Maximum Elevation / Height
                      </label>
                      <input
                        type="number"
                        value={activeParams.maxHeight ?? 66}
                        onChange={e => updateParam('maxHeight', Number(e.target.value))}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Elevation Label
                      </label>
                      <input
                        type="text"
                        value={activeParams.label ?? 'MONUMENTAL ELEVATION // SUMMIT'}
                        onChange={e => updateParam('label', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {/* Lighting Sweep Inputs */}
                {selected.category === 'lighting' && (
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                      Illumination Banner Text
                    </label>
                    <input
                      type="text"
                      value={activeParams.label ?? 'VOLUMETRIC ILLUMINATION // SOLAR ALIGNMENT'}
                      onChange={e => updateParam('label', e.target.value)}
                      className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                    />
                  </div>
                )}

                {/* Flow Vector Inputs */}
                {selected.category === 'flow' && (
                  <>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Flow Velocity Text
                      </label>
                      <input
                        type="text"
                        value={activeParams.speed ?? '3.8 M/S'}
                        onChange={e => updateParam('speed', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Flow Label
                      </label>
                      <input
                        type="text"
                        value={activeParams.label ?? 'CONTINUOUS HYDRODYNAMIC DRAINAGE VECTOR'}
                        onChange={e => updateParam('label', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {/* Magnifier Inputs */}
                {selected.category === 'magnifier' && (
                  <>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Zoom Level Factor
                      </label>
                      <input
                        type="text"
                        value={activeParams.zoom ?? '8.5X'}
                        onChange={e => updateParam('zoom', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-muted uppercase block mb-1">
                        Inspection Subtitle
                      </label>
                      <input
                        type="text"
                        value={activeParams.label ?? 'OPTICAL INSPECTION // MICRO-DETAIL'}
                        onChange={e => updateParam('label', e.target.value)}
                        className="w-full rounded-lg border border-border bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Technical Specs & Emerging Physics Breakdown */}
              <div className="pt-3 border-t border-border/60">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase font-mono text-muted">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Kinetic Motion &amp; Emerging Effect
                </h4>
                <p className="mt-1 text-xs text-gray-300 leading-relaxed">
                  {selected.emergingEffect}
                </p>
              </div>

              {/* Trigger Keywords */}
              <div>
                <p className="text-[10px] font-mono text-muted uppercase flex items-center gap-1.5 mb-1.5">
                  <Key className="h-3 w-3 text-accent" />
                  Auto-Editing Script Trigger Keywords:
                </p>
                <div className="flex flex-wrap gap-1">
                  {selected.triggerKeywords.slice(0, 10).map(kw => (
                    <span
                      key={kw}
                      className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-amber-200/90"
                    >
                      #{kw}
                    </span>
                  ))}
                  {selected.triggerKeywords.length > 10 && (
                    <span className="text-[10px] text-muted font-mono self-center">
                      +{selected.triggerKeywords.length - 10} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Template Catalog & Category Filters (4 Cols) */}
        <div className="space-y-4 lg:col-span-4 min-w-0">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                  category === c
                    ? 'border-accent bg-accent/20 text-white font-semibold ring-1 ring-accent/30'
                    : 'border-border bg-surface/60 text-muted hover:border-gray-500 hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Template List Cards */}
          <div className="max-h-[760px] space-y-2.5 overflow-y-auto pr-1">
            {filteredTemplates.map((t, idx) => {
              const isCurrent = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedId(t.id);
                    setFrame(0);
                    setPlaying(true);
                  }}
                  className={`group block w-full rounded-xl border p-3.5 text-left transition-all ${
                    isCurrent
                      ? 'border-accent bg-accent/15 shadow-md ring-1 ring-accent/40'
                      : 'border-border bg-surface/70 hover:border-gray-500 hover:bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-mono font-bold text-accent">
                      FX #{idx + 1} · {t.category}
                    </span>
                    <span className="text-[10px] font-mono text-muted">
                      {t.durationFrames / t.fps}s
                    </span>
                  </div>

                  <h4 className="mt-1 text-sm font-semibold text-white group-hover:text-accent transition-colors">
                    {t.name}
                  </h4>

                  <p className="mt-1 text-xs text-muted line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>

                  <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2 text-[10px] font-mono text-gray-400">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Fits Any Scene
                    </span>
                    <span className="text-amber-300">
                      {t.soundCue.replace('.wav', '')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
