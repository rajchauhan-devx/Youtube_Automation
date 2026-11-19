import React, { useEffect, useRef } from 'react';
import lottie, { type AnimationItem } from 'lottie-web';
import { getLottieTemplate, applyThemeToLottie } from '../../lib/lottie-engine';

interface LottieMotionPlayerProps {
  templateId: string;
  primaryColor?: string;
  accentColor?: string;
  width?: number | string;
  height?: number | string;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}

export const LottieMotionPlayer: React.FC<LottieMotionPlayerProps> = ({
  templateId,
  primaryColor,
  accentColor,
  width = 200,
  height = 200,
  loop = true,
  autoplay = true,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const meta = getLottieTemplate(templateId);
    if (!meta || !containerRef.current) return;

    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    fetch(meta.path)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load Lottie: ${meta.path}`);
        return res.json();
      })
      .then((data) => {
        if (isCancelled || !containerRef.current) return;
        const themedData = applyThemeToLottie(data, primaryColor, accentColor);

        animRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop,
          autoplay,
          animationData: themedData,
        });
      })
      .catch((err) => {
        console.warn('[LottieMotionPlayer] Error loading template:', err);
      });

    return () => {
      isCancelled = true;
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [templateId, primaryColor, accentColor, loop, autoplay]);

  return (
    <div
      ref={containerRef}
      style={{ width, height }}
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
    />
  );
};
