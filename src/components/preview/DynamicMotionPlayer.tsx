import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { gsap } from 'gsap';
import type { DynamicMotionGraphicData, ExtraPopupAsset } from '@tubeflow/editing-contracts';
import { ExtraPopupOverlay } from './ExtraPopupOverlay';

/**
 * Procedural Web Audio API sound effect synthesizer.
 * Generates instant, zero-latency cinematic SFX directly in the browser!
 */
export function playSynthesizedSfx(kind?: string, volume: number = 0.5) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const sfxKind = kind || 'sacred_bell';

    // Master bus with gentle warmth
    const master = ctx.createGain();
    master.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), now);
    master.connect(ctx.destination);

    if (sfxKind === 'bubble_pop') {
      // 1. Organic Satisfying Bubble Pop (Fast pitch-drop + warm acoustic resonance)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(820, now);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.08);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.55, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.13);

    } else if (sfxKind === 'crystal_ting') {
      // 2. Crystal Glass Ting (Sweet dual harmonic chime: D6 + G6 + D7 sparkle)
      const partials = [
        { freq: 1174.66, gain: 0.45, decay: 1.4 }, // D6
        { freq: 1567.98, gain: 0.55, decay: 1.6 }, // G6
        { freq: 2349.32, gain: 0.25, decay: 0.9 }, // D7
        { freq: 3135.96, gain: 0.12, decay: 0.5 }, // G7
      ];

      partials.forEach(p => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.freq, now);

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(p.gain * 0.4, now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

        osc.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + p.decay + 0.05);
      });

    } else if (sfxKind === 'camera_click') {
      // 3. Tactile Macro Lens Click (Satisfying mechanical focus snap)
      const click = (delay: number, freq: number, gainVal: number) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filt = ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + delay);
        osc.frequency.exponentialRampToValueAtTime(80, now + delay + 0.03);

        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(freq * 1.5, now + delay);
        filt.Q.setValueAtTime(2.5, now + delay);

        g.gain.setValueAtTime(0.001, now + delay);
        g.gain.linearRampToValueAtTime(gainVal, now + delay + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.045);

        osc.connect(filt);
        filt.connect(g);
        g.connect(master);
        osc.start(now + delay);
        osc.stop(now + delay + 0.05);
      };

      click(0, 720, 0.45);
      click(0.028, 480, 0.38);

    } else if (sfxKind === 'sacred_bell') {
      // 4. Sacred Tibetan/Vedic Golden Bell (Warm Solfeggio 528 Hz with rich choral partials)
      const harmonics = [
        { freq: 528, gain: 0.65, decay: 2.4 },      // Fundamental 528 Hz
        { freq: 531.5, gain: 0.35, decay: 2.2 },    // Chorus detune warmth (+3.5Hz)
        { freq: 792, gain: 0.38, decay: 1.8 },      // Perfect fifth
        { freq: 1056, gain: 0.28, decay: 1.4 },     // Octave shimmer
        { freq: 1584, gain: 0.16, decay: 0.9 },     // 3rd harmonic
        { freq: 2112, gain: 0.08, decay: 0.5 },     // Upper sheen
      ];

      harmonics.forEach(h => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(h.freq, now);

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(h.gain * 0.38, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + h.decay);

        osc.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + h.decay + 0.05);
      });

    } else if (sfxKind === 'telemetry_chirp') {
      // 5. Ethereal Arpeggio Chime (D5 -> F#5 -> A5 major triad harp glide)
      const notes = [
        { freq: 587.33, time: 0, decay: 0.7 },     // D5
        { freq: 739.99, time: 0.045, decay: 0.8 }, // F#5
        { freq: 880.00, time: 0.09, decay: 1.1 },  // A5
        { freq: 1174.66, time: 0.135, decay: 1.2 },// D6
      ];

      notes.forEach(n => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, now + n.time);

        g.gain.setValueAtTime(0.001, now + n.time);
        g.gain.linearRampToValueAtTime(0.32, now + n.time + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.decay);

        osc.connect(g);
        g.connect(master);
        osc.start(now + n.time);
        osc.stop(now + n.time + n.decay + 0.05);
      });

    } else if (sfxKind === 'energy_hum') {
      // 6. Deep Warm Ambient Resonance (Smooth Cello / Singing Bowl Hum)
      const freqs = [110, 165, 220]; // A2 + E3 + A3 warm fifths
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime((0.35 / (i + 1)), now + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

        osc.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + 1.45);
      });

    } else if (sfxKind === 'impact_boom') {
      // 7. Soft Cinematic Sub Thud (Zero harsh clipping, velvety low-end pulse)
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(105, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.4);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(160, now);

      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.55, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

      osc.connect(filter);
      filter.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + 0.7);

    } else {
      // 8. Default: Velvet Air Whoosh (Smooth organic noise sweep passed through sweeping bandpass)
      const sampleRate = ctx.sampleRate;
      const dur = 0.42;
      const bufferSize = Math.floor(sampleRate * dur);
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      // Pink noise algorithm
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.0990460;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.08;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(2.0, now);
      filter.frequency.setValueAtTime(240, now);
      filter.frequency.exponentialRampToValueAtTime(1250, now + 0.18);
      filter.frequency.exponentialRampToValueAtTime(200, now + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      noise.start(now);
    }
  } catch (err) {
    console.warn('Web Audio SFX playback error:', err);
  }
}

export interface DynamicMotionPlayerProps {
  graphic: DynamicMotionGraphicData;
  backgroundImageUrl?: string;
  aspectRatio?: '9:16' | '16:9';
  autoPlay?: boolean;
  extraPopup?: ExtraPopupAsset;
}

export function DynamicMotionPlayer({
  graphic,
  backgroundImageUrl,
  aspectRatio = '9:16',
  autoPlay = true,
  extraPopup,
}: DynamicMotionPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasTriggeredSfxRef = useRef<boolean>(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(true);

  const duration = Math.max(2.0, graphic.durationSec || 4.5);
  const isVertical = aspectRatio === '9:16';

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.timeScale(speed);
    }
  }, [speed]);

  // Initialize and run the GSAP timeline
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any previous animations
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }

    const container = containerRef.current;
    // Set up HTML markup and inject custom CSS into the isolated container
    container.innerHTML = `<style>${graphic.render.css}</style>${graphic.render.html}`;

    // Create a new master GSAP timeline for this component
    const tl = gsap.timeline({
      paused: true,
      onUpdate: () => {
        if (timelineRef.current) {
          setCurrentTime(timelineRef.current.time());
        }
      },
      onComplete: () => {
        setIsPlaying(false);
      },
    });
    timelineRef.current = tl;

    // Execute the motion graphic JS code within an isolated scope exposing `tl`, `gsap`, and container/document proxy
    try {
      const docProxy = {
        getElementById: (id: string) => container.querySelector(`#${id}`) || document.getElementById(id),
        querySelector: (sel: string) => container.querySelector(sel) || document.querySelector(sel),
        querySelectorAll: (sel: string) => container.querySelectorAll(sel),
      };
      const runner = new Function('tl', 'gsap', 'container', 'document', graphic.render.js);
      runner(tl, gsap, container, docProxy);
    } catch (err) {
      console.warn('Failed executing dynamic motion JS:', err);
    }

    // Seek to start
    tl.seek(0);
    setCurrentTime(0);

    if (autoPlay) {
      setIsPlaying(true);
    }

    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [graphic, autoPlay]);

  // Handle play / pause loop
  useEffect(() => {
    if (!timelineRef.current) return;

    if (isPlaying) {
      // If at end, loop to start
      if (timelineRef.current.time() >= duration - 0.05) {
        timelineRef.current.seek(0);
      }
      timelineRef.current.play();

      const tick = () => {
        if (timelineRef.current) {
          const t = timelineRef.current.time();
          setCurrentTime(t);
          if (sfxEnabled && !hasTriggeredSfxRef.current && t >= 0.15 && t <= 1.5) {
            playSynthesizedSfx(graphic.sfx?.kind || 'whoosh', graphic.sfx?.volume || 0.7);
            hasTriggeredSfxRef.current = true;
          }
          if (t < 0.1) {
            hasTriggeredSfxRef.current = false;
          }
        }
        if (isPlaying) {
          animationFrameRef.current = requestAnimationFrame(tick);
        }
      };
      animationFrameRef.current = requestAnimationFrame(tick);
    } else {
      timelineRef.current.pause();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, duration, sfxEnabled, graphic]);

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (time < 0.1) {
      hasTriggeredSfxRef.current = false;
    }
    if (timelineRef.current) {
      timelineRef.current.seek(time);
    }
  }

  function handleRestart() {
    if (timelineRef.current) {
      hasTriggeredSfxRef.current = false;
      timelineRef.current.seek(0);
      setCurrentTime(0);
      setIsPlaying(true);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-amber-500/30 bg-black/90 shadow-2xl">
      {/* Motion Graphic Header Meta */}
      <div className="flex items-center justify-between border-b border-amber-500/20 bg-surface/80 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
            <Sparkles className="h-3 w-3" />
          </span>
          <span className="font-semibold text-amber-200">
            {graphic.type.replace(/_/g, ' ').toUpperCase()}
          </span>
          <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-gray-400">
            Scene {graphic.sceneIndex}
          </span>
          {graphic.vfx?.tilt3d && (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono text-amber-300">
              3D DEPTH
            </span>
          )}
          {graphic.vfx?.lensflare && (
            <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300">
              LENS FLARE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-[11px] font-mono">
            {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
          </span>
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
            {graphic.placement.position.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Stage Canvas Viewport */}
      <div
        className={`relative w-full overflow-hidden bg-[#0c0905] ${
          isVertical ? 'aspect-[9/16] max-h-[460px]' : 'aspect-video max-h-[360px]'
        } flex items-center justify-center`}
      >
        {/* Scoped CSS for this motion graphic */}
        <style dangerouslySetInnerHTML={{ __html: graphic.render.css }} />

        {/* Scene Background Media */}
        {backgroundImageUrl ? (
          <img
            src={backgroundImageUrl}
            alt="Scene background"
            className="absolute inset-0 h-full w-full object-cover filter brightness-[0.75] contrast-[1.05]"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-gray-600 bg-radial from-[#1e150b] to-[#0a0704]">
            <Sparkles className="h-8 w-8 text-amber-500/30 mb-2 animate-pulse" />
            <p className="text-xs text-amber-200/50">Scene Preview Background</p>
          </div>
        )}

        {/* Subtle Dark Vignette for Cinematic Depth */}
        <div className="pointer-events-none absolute inset-0 bg-radial from-transparent via-black/20 to-black/70" />

        {/* Dynamic Motion Graphic DOM Container (GSAP Mount Target with 3D perspective) */}
        <div
          ref={containerRef}
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
        />

        {/* Extra Popup Spotlight Asset Overlay Layer */}
        {extraPopup && (
          <ExtraPopupOverlay
            popup={extraPopup}
            playState={isPlaying ? 'playing' : 'paused'}
            enableSfx={sfxEnabled}
          />
        )}
      </div>

      {/* Playback Controls & Timeline Scrubber */}
      <div className="flex items-center gap-3 border-t border-amber-500/20 bg-surface/90 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={handleRestart}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface2 text-gray-300 hover:text-white transition"
          title="Restart"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        {/* Web Audio SFX Toggle & Test Trigger */}
        <button
          type="button"
          onClick={() => {
            const next = !sfxEnabled;
            setSfxEnabled(next);
            if (next) {
              playSynthesizedSfx(graphic.sfx?.kind || 'whoosh', graphic.sfx?.volume || 0.7);
            }
          }}
          className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
            sfxEnabled
              ? 'border-amber-500/40 bg-amber-500/20 text-amber-300 shadow-glow'
              : 'border-border bg-surface2 text-gray-500'
          }`}
          title={sfxEnabled ? `SFX Active: ${graphic.sfx?.kind || 'whoosh'} (Click to mute)` : 'SFX Muted (Click to enable)'}
        >
          {sfxEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>

        {/* Scrub Slider */}
        <div className="flex-1 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration}
            step={0.02}
            value={currentTime}
            onChange={handleScrub}
            className="w-full accent-amber-400 cursor-pointer h-1.5 rounded-lg bg-gray-800"
          />
        </div>

        <button
          type="button"
          onClick={() => setSpeed((s) => (s === 1 ? 1.25 : s === 1.25 ? 1.5 : s === 1.5 ? 0.75 : 1))}
          className="rounded border border-amber-500/20 bg-black/40 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 hover:bg-amber-500/20"
          title="Playback speed"
        >
          {speed}x
        </button>

        <div className="text-[11px] font-mono text-gray-400 shrink-0">
          {currentTime.toFixed(1)}s
        </div>
      </div>
    </div>
  );
}
