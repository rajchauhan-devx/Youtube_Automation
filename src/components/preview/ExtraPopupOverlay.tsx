import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { ExtraPopupAsset } from '@tubeflow/editing-contracts';
import { playSynthesizedSfx } from './DynamicMotionPlayer';

export interface ExtraPopupOverlayProps {
  popup: ExtraPopupAsset;
  playState?: 'playing' | 'paused' | 'reset';
  scaleMultiplier?: number;
  enableSfx?: boolean;
}

export function ExtraPopupOverlay({
  popup,
  playState = 'playing',
  scaleMultiplier = 1,
  enableSfx = true,
}: ExtraPopupOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const nodeRef = useRef<SVGCircleElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const {
    title,
    subtitle,
    imageUrl,
    shape = 'circle_medallion',
    placement = 'top-right',
    sfx = 'whoosh',
    durationSec = 3.5,
  } = popup;

  // Placement coordinates respecting YouTube Shorts UI safe zones
  const getPlacementStyles = () => {
    switch (placement) {
      case 'top-left':
        return { top: '14%', left: '7%', alignItems: 'flex-start' as const };
      case 'bottom-left':
        return { bottom: '20%', left: '7%', alignItems: 'flex-start' as const };
      case 'bottom-right':
        return { bottom: '20%', right: '7%', alignItems: 'flex-end' as const };
      case 'center-left':
        return { top: '40%', left: '7%', alignItems: 'flex-start' as const };
      case 'center-right':
        return { top: '40%', right: '7%', alignItems: 'flex-end' as const };
      case 'top-right':
      default:
        return { top: '14%', right: '7%', alignItems: 'flex-end' as const };
    }
  };

  useEffect(() => {
    if (!cardRef.current) return;

    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }

    const card = cardRef.current;
    const line = lineRef.current;
    const node = nodeRef.current;

    const tl = gsap.timeline({ paused: true });
    timelineRef.current = tl;

    // Act I: Punch-In Entrance with elastic spring
    tl.fromTo(
      card,
      { scale: 0, opacity: 0, rotationY: 18, transformOrigin: 'center center' },
      {
        scale: 1,
        opacity: 1,
        rotationY: 0,
        duration: 0.45,
        ease: 'back.out(1.8)',
        onStart: () => {
          if (enableSfx && sfx !== 'none') {
            playSynthesizedSfx(sfx, 0.5);
          }
        },
      }
    );

    // Dynamic Leader Line Stroke Draw
    if (line) {
      const length = line.getTotalLength ? line.getTotalLength() : 120;
      tl.fromTo(
        line,
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' },
        '-=0.3'
      );
    }

    // Focal Node Punch-In
    if (node) {
      tl.fromTo(
        node,
        { scale: 0, opacity: 0, transformOrigin: 'center center' },
        { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2.5)' },
        '-=0.2'
      );
    }

    // Act II: Living drift / levitation yoyo
    tl.to(card, {
      y: '-=6px',
      duration: 1.8,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: Math.max(1, Math.floor((durationSec - 1) / 1.8)),
    });

    // Act III: Exit Dissolve
    tl.to(
      card,
      {
        scale: 0.85,
        opacity: 0,
        duration: 0.35,
        ease: 'power2.in',
      },
      `+=${Math.max(0.2, durationSec - 2.5)}`
    );

    if (playState === 'playing') {
      tl.play(0);
    } else if (playState === 'reset') {
      tl.seek(0);
      tl.pause();
    } else {
      tl.pause();
    }

    return () => {
      tl.kill();
    };
  }, [popup, playState, enableSfx, sfx, durationSec]);

  const placementPos = getPlacementStyles();
  const isLeft = placement.includes('left');

  // Frame Rendering based on Shape
  const renderFrameContent = () => {
    const placeholder = (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-amber-950 via-zinc-900 to-black p-2 text-center text-[10px] text-amber-300">
        <span className="font-semibold">{title}</span>
        <span className="text-[8px] text-zinc-400">Macro Inset</span>
      </div>
    );

    switch (shape) {
      case 'tactical_hexagon':
        return (
          <div className="relative h-28 w-28 filter drop-shadow-[0_8px_20px_rgba(6,182,212,0.5)]">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
              <defs>
                <clipPath id={`hexClip-${popup.id}`}>
                  <polygon points="50,2 95,25 95,75 50,98 5,75 5,25" />
                </clipPath>
              </defs>
              <polygon
                points="50,2 95,25 95,75 50,98 5,75 5,25"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2.5"
                className="animate-pulse"
              />
              <polygon
                points="50,6 91,27 91,73 50,94 9,73 9,27"
                fill="none"
                stroke="rgba(6,182,212,0.4)"
                strokeWidth="1"
                strokeDasharray="4 2"
              />
            </svg>
            <div
              className="absolute inset-[4px] overflow-hidden"
              style={{ clipPath: `url(#hexClip-${popup.id})` }}
            >
              {imageUrl ? (
                <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
              ) : (
                placeholder
              )}
            </div>
            {/* Corner telemetry marks */}
            <div className="pointer-events-none absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-cyan-400" />
            <div className="pointer-events-none absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-cyan-400" />
          </div>
        );

      case 'museum_glass_card':
        return (
          <div className="relative flex flex-col overflow-hidden rounded-2xl border border-amber-500/50 bg-zinc-950/90 p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-white/10 shadow-inner">
              {imageUrl ? (
                <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
              ) : (
                placeholder
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/15 to-transparent" />
            </div>
          </div>
        );

      case 'magnifying_loupe':
        return (
          <div className="relative h-28 w-28 filter drop-shadow-[0_12px_28px_rgba(0,0,0,0.7)]">
            <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-zinc-200 bg-black shadow-inner">
              {imageUrl ? (
                <img src={imageUrl} alt={title} className="h-full w-full object-cover scale-110" />
              ) : (
                placeholder
              )}
              {/* Curved lens reflection */}
              <div className="pointer-events-none absolute inset-0 rounded-full border-t-2 border-white/50 bg-gradient-to-b from-white/25 to-transparent" />
            </div>
            {/* Metallic handle */}
            <div className="absolute -bottom-2 -right-1 h-7 w-2 rotate-45 rounded-sm bg-gradient-to-r from-zinc-400 via-zinc-100 to-zinc-500 shadow-md" />
          </div>
        );

      case 'cutout_relic':
        return (
          <div className="relative h-28 w-28 filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.95)]">
            {imageUrl ? (
              <img src={imageUrl} alt={title} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-2xl border border-amber-500/40 bg-black/70 p-2 text-center text-xs text-amber-200">
                {title}
              </div>
            )}
          </div>
        );

      case 'circle_medallion':
      default:
        return (
          <div className="relative h-28 w-28 filter drop-shadow-[0_0_24px_rgba(245,158,11,0.6)]">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
              <defs>
                <clipPath id={`circleClip-${popup.id}`}>
                  <circle cx="50" cy="50" r="41" />
                </clipPath>
              </defs>
              {/* Outer halo ring */}
              <circle cx="50" cy="50" r="46" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.4" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="#d97706" strokeWidth="2" />
              {/* Rotating dashed Vedic runes */}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeDasharray="4 3"
              />
            </svg>
            <div
              className="absolute inset-[9px] overflow-hidden rounded-full"
              style={{ clipPath: `url(#circleClip-${popup.id})` }}
            >
              {imageUrl ? (
                <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
              ) : (
                placeholder
              )}
            </div>
            <div className="pointer-events-none absolute inset-[9px] rounded-full border-t border-white/60" />
          </div>
        );
    }
  };

  const isCyan = shape === 'tactical_hexagon';
  const lineColor = isCyan ? '#06b6d4' : '#f59e0b';

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute z-40 flex flex-col select-none"
      style={{
        ...placementPos,
        transform: `scale(${scaleMultiplier})`,
      }}
    >
      <div ref={cardRef} className="flex flex-col gap-1" style={{ alignItems: placementPos.alignItems }}>
        {/* The Frame */}
        {renderFrameContent()}

        {/* Dynamic Vector Leader Line & Text Badge */}
        <div
          className={`relative flex flex-col ${
            isLeft ? 'items-start' : 'items-end'
          }`}
        >
          {/* Animated SVG Leader Line */}
          <svg className="h-4 w-28 overflow-visible" viewBox="0 0 110 20">
            {isLeft ? (
              <>
                <path
                  ref={lineRef}
                  d="M0 2 L45 2 L75 18"
                  fill="none"
                  stroke={lineColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle
                  ref={nodeRef}
                  cx="75"
                  cy="18"
                  r="3.5"
                  fill={lineColor}
                  className="animate-ping"
                  style={{ animationDuration: '2s' }}
                />
                <circle cx="75" cy="18" r="3.5" fill={lineColor} />
              </>
            ) : (
              <>
                <path
                  ref={lineRef}
                  d="M110 2 L65 2 L35 18"
                  fill="none"
                  stroke={lineColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle
                  ref={nodeRef}
                  cx="35"
                  cy="18"
                  r="3.5"
                  fill={lineColor}
                  className="animate-ping"
                  style={{ animationDuration: '2s' }}
                />
                <circle cx="35" cy="18" r="3.5" fill={lineColor} />
              </>
            )}
          </svg>

          {/* Retention Information Badge */}
          <div
            className={`flex flex-col rounded-lg px-2.5 py-1 backdrop-blur-xl shadow-2xl border ${
              isCyan
                ? 'bg-zinc-950/92 border-cyan-500/50 text-cyan-200 shadow-[0_4px_16px_rgba(6,182,212,0.3)]'
                : 'bg-zinc-950/92 border-amber-500/50 text-amber-200 shadow-[0_4px_16px_rgba(245,158,11,0.3)]'
            }`}
          >
            <span className="text-xs font-bold tracking-wide">{title}</span>
            {subtitle && (
              <span className="text-[10px] font-medium text-zinc-300 opacity-90">
                {subtitle}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
