import React, {
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  useState,
} from 'react';
import { SceneGraphOverlay } from './SceneGraphOverlay';
import { RemotionTemplatePlayer, resolveOpenSourceTemplate } from '../../templates/open-source';

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

                // Check for Open-Source Remotion Motion Graphic Templates First!
                const dm = art.dynamicMotion;
                const templateKey = dm?.templateId || dm?.type || art.templateId || art.graphic?.templateId;
                if (templateKey && resolveOpenSourceTemplate(templateKey)) {
                  return (
                    <RemotionTemplatePlayer
                      key={art.id}
                      templateId={templateKey}
                      frame={Math.max(0, roundedFrame - art.startFrame)}
                      fps={fps}
                      width={compositionWidth}
                      height={compositionHeight}
                      durationInFrames={Math.max(1, art.endFrame - art.startFrame)}
                    />
                  );
                }

                if (dm && dm.render && dm.render.html) {
                  return (
                    <div
                      key={art.id}
                      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 25 }}
                      dangerouslySetInnerHTML={{ __html: `<style>${dm.render.css || ''}</style>${dm.render.html || ''}` }}
                    />
                  );
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

                // 1. Cinematic Title Intro
                if (g.kind === 'title') {
                  return (
                    <RemotionTemplatePlayer
                      key={art.id}
                      templateId="cinematic-title-intro"
                      frame={Math.max(0, roundedFrame - art.startFrame)}
                      fps={fps}
                      width={compositionWidth}
                      height={compositionHeight}
                      durationInFrames={Math.max(1, art.endFrame - art.startFrame)}
                    />
                  );
                }

                // 2. High-Tech Circular Gauge Progress (Zero text cards!)
                if (g.kind === 'counter') {
                  return (
                    <RemotionTemplatePlayer
                      key={art.id}
                      templateId="circular-progress"
                      frame={Math.max(0, roundedFrame - art.startFrame)}
                      fps={fps}
                      width={compositionWidth}
                      height={compositionHeight}
                      durationInFrames={Math.max(1, art.endFrame - art.startFrame)}
                    />
                  );
                }

                // 3. Audio Frequency Spectrum Waveform (Zero text cards!)
                if (g.kind === 'route') {
                  return (
                    <RemotionTemplatePlayer
                      key={art.id}
                      templateId="sound-wave"
                      frame={Math.max(0, roundedFrame - art.startFrame)}
                      fps={fps}
                      width={compositionWidth}
                      height={compositionHeight}
                      durationInFrames={Math.max(1, art.endFrame - art.startFrame)}
                    />
                  );
                }

                // 4. Notification Pop Badge (Zero text cards!)
                if (g.kind === 'badge') {
                  return (
                    <RemotionTemplatePlayer
                      key={art.id}
                      templateId="notification-pop"
                      frame={Math.max(0, roundedFrame - art.startFrame)}
                      fps={fps}
                      width={compositionWidth}
                      height={compositionHeight}
                      durationInFrames={Math.max(1, art.endFrame - art.startFrame)}
                    />
                  );
                }

                // 5. Spotlight Reveal
                if (g.kind === 'spotlight') {
                  return (
                    <RemotionTemplatePlayer
                      key={art.id}
                      templateId="spotlight-reveal"
                      frame={Math.max(0, roundedFrame - art.startFrame)}
                      fps={fps}
                      width={compositionWidth}
                      height={compositionHeight}
                      durationInFrames={Math.max(1, art.endFrame - art.startFrame)}
                    />
                  );
                }

                // 6. Area Metric Chart
                if (g.kind === 'frame' || g.kind === 'diagram') {
                  return (
                    <RemotionTemplatePlayer
                      key={art.id}
                      templateId="area-chart"
                      frame={Math.max(0, roundedFrame - art.startFrame)}
                      fps={fps}
                      width={compositionWidth}
                      height={compositionHeight}
                      durationInFrames={Math.max(1, art.endFrame - art.startFrame)}
                    />
                  );
                }

                // Documentary Composition (image layers, before/after comparison)
                if (g.kind === 'composition') {
                  const comp = g.composition;
                  const comparison = comp?.comparison;
                  const b = g.bounds || { x: 0, y: 0, width: compositionWidth, height: compositionHeight };
                  const duration = art.endFrame - art.startFrame;
                  const local = roundedFrame - art.startFrame;
                  const wipe = Math.max(0, Math.min(1, (local / Math.max(1, duration - 1) - 0.15) / 0.7));
                  const accent = project?.style?.colors?.accent || '#8bb9e8';
                  return (
                    <div
                      key={art.id}
                      style={{
                        position: 'absolute',
                        left: `${(b.x / compositionWidth) * 100}%`,
                        top: `${(b.y / compositionHeight) * 100}%`,
                        width: `${(b.width / compositionWidth) * 100}%`,
                        height: `${(b.height / compositionHeight) * 100}%`,
                        zIndex: 10,
                        overflow: 'hidden',
                      }}
                    >
                      <div data-editing-text="motion" style={{ display: 'none' }}>
                        {g.title}
                      </div>
                      {(comp?.layers || []).map((layer: any, index: number) => {
                        const asset = assets[layer.assetId];
                        const lBounds = comparison
                          ? { x: comparison.mode === 'split' ? index * 0.5 : 0, y: 0, width: comparison.mode === 'split' ? 0.5 : 1, height: 1 }
                          : layer.bounds || { x: 0, y: 0, width: 1, height: 1 };
                        const clip = comparison?.mode === 'wipe' && index === 1 ? `inset(0 ${(1 - wipe) * 100}% 0 0)` : undefined;
                        return (
                          <div
                            key={layer.id}
                            data-documentary-layer={layer.id}
                            style={{
                              position: 'absolute',
                              left: `${lBounds.x * 100}%`,
                              top: `${lBounds.y * 100}%`,
                              width: `${lBounds.width * 100}%`,
                              height: `${lBounds.height * 100}%`,
                              clipPath: clip,
                              overflow: 'hidden',
                              boxSizing: 'border-box',
                              border: comp?.treatment === 'archival' ? '2px solid #e8e0d0' : '1px solid rgba(255, 255, 255, 0.25)',
                              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                            }}
                          >
                            {asset?.url && (
                              <img
                                src={asset.url}
                                alt={layer.id}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: layer.fit || 'cover',
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                      {comparison && (
                        <>
                          <div
                            data-comparison-divider=""
                            style={{
                              position: 'absolute',
                              left: `${(comparison.mode === 'split' ? 0.5 : wipe) * 100}%`,
                              top: 0,
                              bottom: 0,
                              width: Math.max(2, compositionWidth / 500),
                              background: accent,
                              transform: 'translateX(-50%)',
                              zIndex: 15,
                            }}
                          />
                          {[comparison.beforeLabel, comparison.afterLabel].map((label: string, index: number) => label ? (
                            <div
                              key={index}
                              style={{
                                position: 'absolute',
                                top: 8,
                                ...(index === 0 ? { left: 8 } : { right: 8 }),
                                maxWidth: '45%',
                                padding: '4px 8px',
                                background: 'rgba(16, 20, 28, 0.85)',
                                color: '#fff',
                                fontSize: '11px',
                                borderRadius: 4,
                                overflowWrap: 'anywhere',
                                zIndex: 16,
                              }}
                            >
                              {label}
                            </div>
                          ) : null)}
                        </>
                      )}
                    </div>
                  );
                }

                // Default to pure visual particle explosion animation (Zero text cards!)
                return (
                  <RemotionTemplatePlayer
                    key={art.id}
                    templateId="particle-explosion"
                    frame={Math.max(0, roundedFrame - art.startFrame)}
                    fps={fps}
                    width={compositionWidth}
                    height={compositionHeight}
                    durationInFrames={Math.max(1, art.endFrame - art.startFrame)}
                  />
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
