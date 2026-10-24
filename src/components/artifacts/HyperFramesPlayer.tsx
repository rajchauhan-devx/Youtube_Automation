import React, {
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  useState,
} from 'react';
import { SceneGraphOverlay } from './SceneGraphOverlay';

export interface PlayerRef {
  seekTo: (frame: number) => void;
  play: () => void;
  pause: () => void;
  addEventListener: (event: string, callback: any) => void;
  removeEventListener: (event: string, callback: any) => void;
}

export interface PlayerProps {
  durationInFrames: number;
  fps: number;
  compositionWidth: number;
  compositionHeight: number;
  controls?: boolean;
  loop?: boolean;
  inFrame?: number;
  outFrame?: number;
  initialFrame?: number;
  style?: React.CSSProperties;
  allowFullscreen?: boolean;
  inputProps?: any;
  component?: any;
  moveToBeginningWhenEnded?: boolean;
}

export const HyperFramesPlayer = forwardRef<PlayerRef, PlayerProps>(
  (props, ref) => {
    const {
      durationInFrames,
      fps,
      compositionWidth,
      compositionHeight,
      controls = true,
      loop = false,
      inFrame = 0,
      outFrame,
      initialFrame = 0,
      style,
      inputProps,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const backgroundVideoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [audioError, setAudioError] = useState('');
    const listeners = useRef<Map<string, Set<Function>>>(new Map());
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(initialFrame);

    const maxFrame = outFrame ?? durationInFrames - 1;

    // Dispatch custom events to registered listeners
    const trigger = (event: string, detail: any) => {
      const set = listeners.current.get(event);
      if (set) {
        set.forEach((cb) => {
          try {
            cb({ detail });
          } catch (e) {
            console.error(e);
          }
        });
      }
    };

    useImperativeHandle(ref, () => ({
      seekTo: (frame: number) => {
        const clamped = Math.max(0, Math.min(frame, durationInFrames - 1));
        setCurrentFrame(clamped);
        if (videoRef.current) {
          videoRef.current.currentTime = clamped / fps;
        }
        if (audioRef.current) audioRef.current.currentTime = clamped / fps;
        trigger('seeked', { frame: clamped });
        trigger('timeupdate', { frame: clamped });
      },
      play: () => {
        setIsPlaying(true);

      },
      pause: () => {
        setIsPlaying(false);

      },
      addEventListener: (event: string, cb: Function) => {
        if (!listeners.current.has(event)) {
          listeners.current.set(event, new Set());
        }
        listeners.current.get(event)!.add(cb);
      },
      removeEventListener: (event: string, cb: Function) => {
        listeners.current.get(event)?.delete(cb);
      },
    }));

    // Time animation loop if no underlying video source
    useEffect(() => {
      let raf: number;
      let lastTime = performance.now();

      const loopPlay = (now: number) => {
        if (!isPlaying) return;
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        setCurrentFrame((prev) => {
          const clock = videoRef.current || audioRef.current;
          let next = clock ? clock.currentTime * fps : prev + delta * fps;
          if (clock && clock.paused && !clock.ended) return prev;
          if (next > maxFrame) {
            if (loop) {
              next = inFrame;
              if (clock) { clock.currentTime = inFrame / fps; void clock.play(); }
            } else {
              setIsPlaying(false);
              next = maxFrame;
            }
          }
          const rounded = Math.round(next);
          trigger('timeupdate', { frame: rounded });
          return next;
        });

        raf = requestAnimationFrame(loopPlay);
      };

      if (isPlaying) {
        lastTime = performance.now();
        raf = requestAnimationFrame(loopPlay);
      }

      return () => cancelAnimationFrame(raf);
    }, [isPlaying, fps, loop, inFrame, maxFrame]);

    useEffect(() => {
      const media = videoRef.current || audioRef.current;
      if (!media) return;
      let cancelled = false;
      if (isPlaying) {
        if (currentFrame >= maxFrame) { media.currentTime = inFrame / fps; setCurrentFrame(inFrame); }
        void media.play().catch(() => { if (cancelled) return; setIsPlaying(false); setAudioError('Audio could not play. Try Play again after the mix loads.'); });
      } else media.pause();
      return () => { cancelled = true; media.pause(); };
    }, [isPlaying]);

    useEffect(() => {
      setIsPlaying(false); setCurrentFrame(initialFrame); setAudioError('');
    }, [inputProps?.project?.revisionId, inputProps?.audioPreviewUrl]);

    // Video media url if available in inputProps
    const videoUrl =
      inputProps?.videoUrl ||
      inputProps?.project?.outputUrl ||
      inputProps?.project?.videoUrl ||
      null;

    // Resolve current scene image and active artifacts
    const project = inputProps?.project;
    const assets = inputProps?.assets || {};
    const roundedFrame = Math.round(currentFrame);

    const currentScene = project?.scenes?.find(
      (s: any) => roundedFrame >= s.startFrame && roundedFrame < s.endFrame
    ) || project?.scenes?.[0];

    const sceneAsset = currentScene ? assets[currentScene.assetId] : null;
    const sceneImageUrl = sceneAsset?.url;

    // Active artifacts in this frame
    const activeArtifacts = project?.artifacts?.filter(
      (a: any) => a.enabled && roundedFrame >= a.startFrame && roundedFrame < a.endFrame
    ) || [];

    useEffect(() => {
      const video = backgroundVideoRef.current;
      if (!video || !currentScene) return;
      const time = Math.max(0, (currentFrame - currentScene.startFrame) / fps);
      const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 1 / fps) : time;
      const target = Math.min(time, end);
      if (Math.abs(video.currentTime - target) > 1 / fps) video.currentTime = target;
      if (isPlaying && time < end) void video.play().catch(() => {}); else video.pause();
    }, [currentFrame, currentScene?.id, isPlaying, fps]);

    return (
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...style,
        }}
      >
        {!videoUrl && inputProps?.audioPreviewUrl && <audio ref={audioRef} src={inputProps.audioPreviewUrl} preload="metadata"
          onError={() => { setIsPlaying(false); setAudioError('Preview audio is unavailable. Check the audio mix and retry.'); }} />}
        {audioError && <div role="alert" style={{position:'absolute',top:8,left:8,right:8,zIndex:50,color:'#fecaca',background:'#450a0a',padding:8,fontSize:12}}>{audioError}</div>}
        <style>{(project?.style?.fontAssetIds || []).map((id: string) =>
          `@font-face{font-family:sg-font-${id};src:url("${assets[id]?.url}");font-weight:400;font-display:block;}`).join('\n')}</style>
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onTimeUpdate={() => {
              if (videoRef.current) {
                const f = Math.round(videoRef.current.currentTime * fps);
                setCurrentFrame(f);
                trigger('timeupdate', { frame: f });
              }
            }}
            onEnded={() => {
              if (loop) {
                if (videoRef.current) {
                  videoRef.current.currentTime = inFrame / fps;
                  videoRef.current.play();
                }
              } else {
                setIsPlaying(false);
              }
            }}
          />
        ) : (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#0a0d14',
            }}
          >
            {/* Background scene image */}
            {sceneImageUrl && sceneAsset?.record?.mime === 'video/mp4' ? <video ref={backgroundVideoRef} muted playsInline src={sceneImageUrl} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:currentScene?.framing || 'cover'}} /> : sceneImageUrl ? (
              <img
                src={sceneImageUrl}
                alt="Scene background"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: currentScene?.framing || 'cover',
                  position: 'absolute',
                  inset: 0,
                }}
              />
            ) : (
              <div style={{ color: '#4A5568', fontSize: '13px' }}>
                No scene media
              </div>
            )}

            {/* HyperFrames Motion Graphics Overlay preview */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                overflow: 'hidden',
              }}
            >
              {/* Active artifacts display */}
              {activeArtifacts.map((art: any) => {
                if (art.sceneGraph) {
                  return <SceneGraphOverlay key={art.id} graph={art.sceneGraph} frame={roundedFrame - art.startFrame}
                    options={{ width: compositionWidth, height: compositionHeight, fps,
                      durationFrames: art.endFrame - art.startFrame, idPrefix: `sg-${art.id}`,
                      motion: project.settings?.motionLevel,
                      imageSizes: Object.fromEntries(Object.entries(assets).map(([id,a]:[string,any]) => [id,{width:a.record?.width,height:a.record?.height}])) ,
                      assets: Object.fromEntries(Object.entries(assets).map(([id, a]: [string, any]) => [id, a.url])),
                      fonts: Object.fromEntries((project.style?.fontAssetIds || []).map((id: string) => [id, `sg-font-${id}`])) }} />;
                }
                const g = art.graphic;
                if (!g) return null;

                // Captions / Subtitles: Safe lower-third (bottom: 18%), compact font size, active word highlight
                if (g.kind === 'caption') {
                  const text = g.body || g.title || '';
                  const words = text.split(' ');
                  const midIndex = Math.floor(words.length / 2);
                  return (
                    <div
                      key={art.id}
                      style={{
                        position: 'absolute',
                        bottom: '18%',
                        left: '5%',
                        right: '5%',
                        textAlign: 'center',
                        zIndex: 20,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                          fontWeight: 800,
                          fontSize: '13px',
                          lineHeight: '1.35',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: '#FFFFFF',
                          textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 2px #000',
                          display: 'inline-block',
                          maxWidth: '92%',
                        }}
                      >
                        {words.map((w: string, idx: number) => (
                          <span
                            key={idx}
                            style={{
                              color: idx === midIndex ? '#FFD600' : '#FFFFFF',
                              marginRight: '4px',
                            }}
                          >
                            {w}
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                }

                // 1. Free-floating chapter title
                if (g.kind === 'title') {
                  return (
                    <div
                      key={art.id}
                      style={{
                        position: 'absolute',
                        top: '10%',
                        left: '6%',
                        right: '6%',
                        padding: '10px 14px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 0,
                        boxShadow: 'none',
                        textShadow: '0 2px 4px #000, 0 0 2px #000',
                        zIndex: 10,
                      }}
                    >
                      <div style={{ fontSize: '8px', color: '#FF6B00', fontWeight: 'bold', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        CHAPTER // PRODUCTION RECORD
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 900, color: '#FFFFFF', marginTop: '2px', letterSpacing: '0.02em' }}>
                        {g.title}
                      </div>
                      {g.detail && (
                        <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '2px' }}>
                          {g.detail}
                        </div>
                      )}
                    </div>
                  );
                }

                // 2. Telemetry Counter
                if (g.kind === 'counter') {
                  return (
                    <div
                      key={art.id}
                      style={{
                        position: 'absolute',
                        top: '25%',
                        left: '6%',
                        right: '6%',
                        padding: '12px 16px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 0,
                        boxShadow: 'none',
                        textShadow: '0 2px 4px #000, 0 0 2px #000',
                        zIndex: 10,
                      }}
                    >
                      <div style={{ fontSize: '8px', color: '#FF6B00', fontWeight: 'bold', letterSpacing: '0.12em' }}>
                        TELEMETRY // VERIFIED RECORD
                      </div>
                      <div style={{ fontSize: '10px', color: '#E2E8F0', marginTop: '1px' }}>
                        {g.detail || 'ELEVATION / ALTITUDE'}
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#FFFFFF', margin: '4px 0 6px', fontFamily: 'monospace' }}>
                        {g.title}
                      </div>
                      <div style={{ height: '3px', width: '100%', background: '#334155', borderRadius: 0, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: '85%', background: 'linear-gradient(90deg, #FF6B00, #FFD600)' }} />
                      </div>
                    </div>
                  );
                }

                // 3. Route Map
                if (g.kind === 'route') {
                  return (
                    <div
                      key={art.id}
                      style={{
                        position: 'absolute',
                        top: '28%',
                        left: '6%',
                        right: '6%',
                        padding: '12px 14px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 0,
                        boxShadow: 'none',
                        textShadow: '0 2px 4px #000, 0 0 2px #000',
                        zIndex: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#FF6B00', fontWeight: 'bold' }}>
                        <span>EXPEDITION TRAJECTORY</span>
                        <span style={{ color: '#94A3B8' }}>LAT // LON</span>
                      </div>
                      <svg viewBox="0 0 300 90" style={{ width: '100%', height: '70px', margin: '4px 0' }}>
                        <path d="M 30 70 Q 150 15 270 70" fill="none" stroke="#FF6B00" strokeWidth="2.5" />
                        <circle cx="30" cy="70" r="4" fill="#FF6B00" />
                        <circle cx="270" cy="70" r="4" fill="#FF6B00" />
                        <text x="30" y="85" fill="#FFF" fontSize="8" fontWeight="bold" textAnchor="middle">CRASH SITE</text>
                        <text x="270" y="85" fill="#FFF" fontSize="8" fontWeight="bold" textAnchor="middle">OUTPOST</text>
                      </svg>
                      <div style={{ fontSize: '8px', color: '#CBD5E1', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px' }}>
                        {g.title}
                      </div>
                    </div>
                  );
                }

                // 4. Free-floating badge text
                if (g.kind === 'badge') {
                  return (
                    <div
                      key={art.id}
                      style={{
                        position: 'absolute',
                        top: '22%',
                        left: '20%',
                        width: '60%',
                        padding: '8px 8px 12px 8px',
                        background: 'transparent',
                        borderRadius: 0,
                        boxShadow: 'none',
                        textShadow: '0 2px 4px #000, 0 0 2px #000',
                        transform: 'none',
                        zIndex: 12,
                      }}
                    >
                      <div style={{ marginTop: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', fontWeight: 900, color: '#FFFFFF', textTransform: 'uppercase' }}>
                          {g.title}
                        </div>
                        {g.detail && (
                          <div style={{ fontSize: '8px', color: '#EA580C', fontWeight: 'bold', marginTop: '1px' }}>
                            {g.detail}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // 5. Object spotlight with an unboxed label
                if (g.kind === 'spotlight') {
                  return (
                    <div key={art.id} style={{ position: 'absolute', inset: 0, zIndex: 12 }}>
                      <svg viewBox="0 0 360 640" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                        <ellipse cx="180" cy="360" rx="36" ry="60" fill="none" stroke="#FF6B00" strokeWidth="2" strokeDasharray="4 2" />
                        <path d="M 150 400 L 90 470" fill="none" stroke="#FF6B00" strokeWidth="1.5" />
                      </svg>
                      <div
                        style={{
                          position: 'absolute',
                          top: '72%',
                          left: '6%',
                          maxWidth: '70%',
                          padding: '6px 12px',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 0,
                          boxShadow: 'none',
                        textShadow: '0 2px 4px #000, 0 0 2px #000',
                        }}
                      >
                        <div style={{ fontSize: '10px', fontWeight: 900, color: '#FFF' }}>
                          {g.title}
                        </div>
                        {g.detail && (
                          <div style={{ fontSize: '8px', color: '#94A3B8' }}>
                            {g.detail}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // 6. Free-floating annotation
                if (g.kind === 'frame' || g.kind === 'diagram') {
                  return (
                    <div
                      key={art.id}
                      style={{
                        position: 'absolute',
                        top: '35%',
                        left: '6%',
                        right: '6%',
                        padding: '12px 14px',
                        background: 'transparent',
                        borderRadius: 0,
                        boxShadow: 'none',
                        textShadow: '0 2px 4px #000, 0 0 2px #000',
                        transform: 'none',
                        zIndex: 12,
                      }}
                    >
                      <div style={{ fontSize: '7px', color: '#475569', fontWeight: 'bold', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #CBD5E1', paddingBottom: '3px' }}>
                        HISTORICAL ARCHIVE // DISASTER INVESTIGATION
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 900, color: '#FFFFFF', marginTop: '6px', lineHeight: '1.2' }}>
                        <span>{g.title}</span>
                      </div>
                      <div style={{ height: '2px', background: '#E2E8F0', margin: '8px 0 4px' }} />
                      <div style={{ fontSize: '8px', color: '#CBD5E1' }}>
                        {g.detail || 'Verified survivor accounted for following extensive search.'}
                      </div>
                    </div>
                  );
                }

                // Default free-floating label
                return (
                  <div
                    key={art.id}
                    style={{
                      position: 'absolute',
                      top: '20%',
                      left: '8%',
                      right: '8%',
                      padding: '10px 14px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 0,
                      boxShadow: 'none',
                        textShadow: '0 2px 4px #000, 0 0 2px #000',
                      zIndex: 10,
                    }}
                  >
                    <div style={{ fontSize: '8px', color: '#FF6B00', fontWeight: 'bold', textTransform: 'uppercase' }}>
                      {g.kind}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#FFF' }}>
                      {g.title}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <span
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  color: '#9CA3AF',
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                F: {roundedFrame} / {durationInFrames}
              </span>
            </div>
          </div>
        )}

        {/* Play/Pause & Scrubber controls */}
        {controls && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              right: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(10, 15, 25, 0.88)',
              padding: '6px 12px',
              borderRadius: '8px',
              backdropFilter: 'blur(8px)',
              zIndex: 10,
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <button
              type="button"
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                background: 'none',
                border: 'none',
                color: '#FFF',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px',
              }}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <input
              type="range"
              aria-label="Video scrubber"
              min={0}
              max={durationInFrames - 1}
              value={roundedFrame}
              onChange={(e) => {
                const f = Number(e.target.value);
                setCurrentFrame(f);
                if (videoRef.current) {
                  videoRef.current.currentTime = f / fps;
                }
                if (audioRef.current) audioRef.current.currentTime = f / fps;
                trigger('seeked', { frame: f });
                trigger('timeupdate', { frame: f });
              }}
              style={{ flex: 1, accentColor: '#00E5FF', cursor: 'pointer' }}
            />
            <span
              style={{
                color: '#A0AEC0',
                fontSize: '11px',
                fontFamily: 'monospace',
                minWidth: '50px',
                textAlign: 'right',
              }}
            >
              {(roundedFrame / fps).toFixed(1)}s
            </span>
          </div>
        )}
      </div>
    );
  }
);
