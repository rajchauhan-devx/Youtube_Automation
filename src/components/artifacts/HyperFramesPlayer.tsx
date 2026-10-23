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
        trigger('seeked', { frame: clamped });
        trigger('timeupdate', { frame: clamped });
      },
      play: () => {
        setIsPlaying(true);
        videoRef.current?.play().catch(() => {});
      },
      pause: () => {
        setIsPlaying(false);
        videoRef.current?.pause();
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
          let next = prev + delta * fps;
          if (next > maxFrame) {
            if (loop) {
              next = inFrame;
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
            {sceneImageUrl ? (
              <img
                src={sceneImageUrl}
                alt="Scene background"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
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
                  return <SceneGraphOverlay key={art.id} graph={art.sceneGraph} scale={1} />;
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

                // 1. Chapter Title Card (Top)
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
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.94) 0%, rgba(30, 41, 59, 0.94) 100%)',
                        border: '1px solid rgba(255, 107, 0, 0.6)',
                        borderRadius: '6px',
                        boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
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
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.94) 0%, rgba(30, 41, 59, 0.94) 100%)',
                        border: '1px solid rgba(255, 107, 0, 0.5)',
                        borderRadius: '6px',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
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
                      <div style={{ height: '3px', width: '100%', background: '#334155', borderRadius: '2px', overflow: 'hidden' }}>
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
                        background: 'rgba(15, 23, 42, 0.92)',
                        border: '1px solid rgba(255, 107, 0, 0.5)',
                        borderRadius: '6px',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
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

                // 4. Polaroid Badge (3D Tilted Photo Card)
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
                        background: '#FDFBF7',
                        borderRadius: '3px',
                        boxShadow: '0 12px 35px rgba(0,0,0,0.85)',
                        transform: 'rotate(-4deg)',
                        zIndex: 12,
                      }}
                    >
                      <div style={{ width: '30px', height: '10px', background: 'rgba(255,255,255,0.75)', position: 'absolute', top: -5, left: '38%', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                      <div style={{ width: '100%', height: '140px', background: '#334155', borderRadius: '2px', overflow: 'hidden' }}>
                        <img src={sceneImageUrl} alt="Badge" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ marginTop: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', fontWeight: 900, color: '#0F172A', textTransform: 'uppercase' }}>
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

                // 5. Object Spotlight (Reticle + Leader line + Card)
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
                          background: 'rgba(15, 23, 42, 0.94)',
                          border: '1px solid #FF6B00',
                          borderRadius: '4px',
                          boxShadow: '0 6px 20px rgba(0,0,0,0.8)',
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

                // 6. Newspaper / Archival Clipping
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
                        background: '#FDFBF7',
                        borderRadius: '2px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
                        transform: 'rotate(1.5deg)',
                        zIndex: 12,
                      }}
                    >
                      <div style={{ fontSize: '7px', color: '#475569', fontWeight: 'bold', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #CBD5E1', paddingBottom: '3px' }}>
                        HISTORICAL ARCHIVE // DISASTER INVESTIGATION
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', marginTop: '6px', lineHeight: '1.2' }}>
                        <span style={{ backgroundColor: '#FFD600', padding: '1px 4px' }}>{g.title}</span>
                      </div>
                      <div style={{ height: '2px', background: '#E2E8F0', margin: '8px 0 4px' }} />
                      <div style={{ fontSize: '8px', color: '#64748B' }}>
                        {g.detail || 'Verified survivor accounted for following extensive search.'}
                      </div>
                    </div>
                  );
                }

                // Default Fallback Card
                return (
                  <div
                    key={art.id}
                    style={{
                      position: 'absolute',
                      top: '20%',
                      left: '8%',
                      right: '8%',
                      padding: '10px 14px',
                      background: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(255, 107, 0, 0.5)',
                      borderRadius: '6px',
                      boxShadow: '0 6px 20px rgba(0,0,0,0.7)',
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
              min={0}
              max={durationInFrames - 1}
              value={roundedFrame}
              onChange={(e) => {
                const f = Number(e.target.value);
                setCurrentFrame(f);
                if (videoRef.current) {
                  videoRef.current.currentTime = f / fps;
                }
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
