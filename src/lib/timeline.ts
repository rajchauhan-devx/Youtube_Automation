import type { TimelineConfig, Script } from '../data';
import { validateScenePlan, validateSync, normalizeNarration, spokenText } from '../../server/src/services/scene-plan';

export function longVideoTimeline(script: Script): TimelineConfig {
  const plan = validateScenePlan(script.scenePlan);
  const audio = script.generatedAudio?.[0];
  if (!audio?.sync || !audio.url) throw new Error('Generate synchronized narration in Audio Generation first.');
  validateSync(plan, audio.sync);
  if (normalizeNarration(script.narration || '') !== normalizeNarration(spokenText(plan))) throw new Error('Narration changed. Extract the scene map and regenerate audio.');
  const sync = audio.sync;
  const clips = plan.scenes.map((scene, i) => {
    const image = script.generatedImages?.find(image => image.index === i);
    if (!image?.url || image.status !== 'done' || image.prompt !== scene.imagePrompt) throw new Error(`Generate the current image for scene ${scene.id} before rendering.`);
    if ((image.mediaType || 'image') !== (scene.mediaType || 'image')) throw new Error(`Import the correct media type for scene ${scene.id}.`);
    return { id: scene.id, imageUrl: image.url, mediaType: scene.mediaType || 'image', prompt: scene.imagePrompt, duration: (sync.scenes[i].endSample - sync.scenes[i].startSample) / sync.sampleRate,
      transition: 'none' as const, transitionDuration: 0, caption: scene.narration };
  });
  return { ...script.timelineConfig, clips, audioUrl: audio.url, totalDuration: sync.totalSamples / sync.sampleRate,
    resolution: { width: 1920, height: 1080 }, zoomFactor: script.timelineConfig?.zoomFactor ?? 1.1 };
}

export function fitTimeline(timeline: TimelineConfig, duration: number): TimelineConfig {
  const total = timeline.clips.reduce((sum, clip) => sum + clip.duration, 0);
  if (!Number.isFinite(duration) || duration <= 0 || total <= 0) return timeline;
  const clips = timeline.clips.map(clip => ({ ...clip, duration: clip.duration * duration / total }));
  return { ...timeline, clips, totalDuration: duration };
}
