import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { store } from './store.js';
import { currentWorkspace } from './workspace.js';

export function renderRevision(scriptId: string): string | undefined {
  const script = store.getById<any>('scripts', scriptId);
  if (!script || (script.enableSubtitles === undefined && !script.presenter && (currentWorkspace().profile === 'shorts' || !script?.scenePlan))) return undefined;
  return createHash('sha256').update(JSON.stringify({ plan: script.scenePlan, narration: script.narration, editing: script.editing,
    presenter: script.presenter,
    enableSubtitles: script.enableSubtitles,
    presenterLayoutVersion: script.presenter?.enabled ? 2 : undefined,
    mix: { bgmTrack: script.timelineConfig?.bgmTrack, bgmVolume: script.timelineConfig?.bgmVolume, ttsVolume: script.timelineConfig?.ttsVolume ?? script.ttsVolume, music: script.timelineConfig?.bgmTrack === 'ai' ? script.generatedMusic?.filename : undefined },
    audio: script.generatedAudio?.[0]?.filename, images: script.generatedImages?.map((image: any) => [image.index, image.url, image.prompt, image.status, image.mediaType, image.duration]) })).digest('hex');
}
export function isCurrentRender(scriptId: string, videoPath: string): boolean {
  const revision = renderRevision(scriptId);
  if (!revision) return true; // Existing Shorts and legacy files keep their existing behavior.
  try { return JSON.parse(fs.readFileSync(`${videoPath}.json`, 'utf8')).revision === revision; } catch { return false; }
}
