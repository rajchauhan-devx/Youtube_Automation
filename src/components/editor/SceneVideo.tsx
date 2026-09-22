import { useEffect, useRef } from 'react';

export function SceneVideo({ src, time, playing }: { src: string; time: number; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const sync = () => {
      if (Math.abs(video.currentTime - time) > 0.15) video.currentTime = Math.max(0, Math.min(9.999, time));
      if (playing) void video.play().catch(() => {}); else video.pause();
    };
    sync(); video.addEventListener('loadedmetadata', sync);
    return () => video.removeEventListener('loadedmetadata', sync);
  }, [src, time, playing]);
  return <video ref={ref} src={src} muted playsInline preload="auto" className="h-full w-full object-contain" />;
}
