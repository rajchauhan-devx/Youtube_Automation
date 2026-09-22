export const FPS = 30;

export interface TimingClip {
  duration: number;
  transition: string;
  transitionDuration: number;
}

/** Scene durations are narration spans; transitions extend the outgoing source. */
export function planTimeline(clips: TimingClip[], audioDuration: number) {
  if (!Number.isFinite(audioDuration) || audioDuration <= 0 || !clips.length) {
    throw new Error('A readable narration and at least one scene are required');
  }
  for (const clip of clips) {
    if (!Number.isFinite(clip.duration) || clip.duration < 1 / FPS ||
        !Number.isFinite(clip.transitionDuration) || clip.transitionDuration < 0) {
      throw new Error('Scene durations must be positive and transitions cannot be negative');
    }
  }
  const total = clips.reduce((sum, clip) => sum + clip.duration, 0);
  if (Math.abs(total - audioDuration) > 1 / FPS + 0.001) {
    throw new Error('Timeline does not match narration. Use Fit timing to narration in the editor.');
  }
  let elapsed = 0;
  return clips.map((clip, i) => {
    const startFrame = Math.round(elapsed * FPS);
    elapsed += clip.duration;
    const endFrame = i === clips.length - 1 ? Math.ceil(audioDuration * FPS) : Math.round(elapsed * FPS);
    const next = clips[i + 1];
    const overlapFrames = !next || clip.transition === 'none' ? 0 : Math.max(0, Math.floor(
      Math.min(clip.transitionDuration, clip.duration * 0.4, next.duration * 0.4) * FPS,
    ));
    return { startFrame, endFrame, frames: endFrame - startFrame + overlapFrames,
      overlap: overlapFrames / FPS, transition: clip.transition };
  });
}
