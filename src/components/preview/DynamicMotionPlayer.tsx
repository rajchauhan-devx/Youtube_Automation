import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { gsap } from 'gsap';
import type { DynamicMotionGraphicData } from '@tubeflow/editing-contracts';

/**
 * Procedural Web Audio API sound effect synthesizer.
 * Generates instant, zero-latency cinematic SFX directly in the browser!
 */
export function playSynthesizedSfx(kind?: string, volume: number = 0.5) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const sfxKind = kind || 'whoosh';

    if (sfxKind === 'energy_hum') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65, now);
      osc.frequency.exponentialRampToValueAtTime(130, now + 0.4);
      gain.gain.setValueAtTime(volume * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    } else if (sfxKind === 'telemetry_chirp') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.08);
      osc.frequency.setValueAtTime(1760, now + 0.16);
      gain.gain.setValueAtTime(volume * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (sfxKind === 'impact_boom') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.6);
      gain.gain.setValueAtTime(volume * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (sfxKind === 'sacred_bell') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(528, now);
      gain.gain.setValueAtTime(volume * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.8);
    } else {
      // Default whoosh
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
      gain.gain.setValueAtTime(volume * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
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
}

export function DynamicMotionPlayer({
  graphic,
  backgroundImageUrl,
  aspectRatio = '9:16',
  autoPlay = true,
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
