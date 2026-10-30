import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Sparkles } from 'lucide-react';
import { gsap } from 'gsap';
import type { DynamicMotionGraphicData } from '@tubeflow/editing-contracts';

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

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

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
          setCurrentTime(timelineRef.current.time());
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
  }, [isPlaying, duration]);

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (timelineRef.current) {
      timelineRef.current.seek(time);
    }
  }

  function handleRestart() {
    if (timelineRef.current) {
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

        {/* Dynamic Motion Graphic DOM Container (GSAP Mount Target) */}
        <div
          ref={containerRef}
          className="pointer-events-none absolute inset-0 overflow-hidden"
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
