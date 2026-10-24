import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EditingProject } from '@tubeflow/editing-contracts';
import { assetFile, assetRecord, objectHash, projectDir } from './repository.js';
import { ensureDefaultSfx, resolveSfxForGraphicKind } from '../sfx.js';
import { runMedia } from '../media-process.js';

export const MOTION_AUDIO_VERSION = 'motion-audio-2';
export interface MotionSoundEvent { path: string; startSample: number; trimSamples: number; gainDb: number; duration: number }

/** Persisted graph cues are authoritative. An empty cue list deliberately means silence. */
export async function motionSoundEvents(project: EditingProject, enabled?: boolean): Promise<MotionSoundEvent[]> {
  const level = project.settings?.soundDesign || 'off';
  if (enabled === false || (enabled === undefined && level === 'off')) return [];
  const attenuation = { off: -18, subtle: -18, balanced: -12, expressive: -8 }[level];
  await ensureDefaultSfx();
  const events: MotionSoundEvent[] = [];
  for (const art of project.artifacts.filter(a => a.enabled).sort((a,b) => a.startFrame-b.startFrame)) {
    if (art.sceneGraph) {
      for (const cue of art.sceneGraph.soundCues) {
        if (cue.assetId === project.inputs.audioAssetId) throw new Error(`Sound cue ${cue.id} references narration instead of a sound effect`);
        const record = assetRecord(cue.assetId);
        if (!record.mime.startsWith('audio/')) throw new Error(`Sound cue ${cue.id} is not an audio asset`);
        const sample = Math.round((art.startFrame+cue.localFrame)*48000/project.inputs.fps-(cue.transientOffsetMs||0)*48);
        events.push({path:assetFile(cue.assetId),startSample:Math.max(0,sample),trimSamples:Math.max(0,-sample),gainDb:Math.min(-6,cue.gainDb+attenuation),duration:Math.min(record.duration||1.2,(project.inputs.durationFrames-art.startFrame-cue.localFrame)/project.inputs.fps+0.2)});
      }
    } else if (art.graphic && art.graphic.kind !== 'caption') {
      const file=resolveSfxForGraphicKind(art.graphic.kind,art.graphic.title,art.graphic.detail);
      if (file) events.push({path:file,startSample:Math.round(art.startFrame*48000/project.inputs.fps),trimSamples:0,gainDb:attenuation,duration:1.2});
    }
  }
  return events;
}

/** Sample-based placement and a narration-controlled effects bus, shared by both export paths. */
export function motionAudioFilter(events: MotionSoundEvent[], baseIndex: number, firstEffectIndex: number, duration: number): string[] {
  const filters = [`[${baseIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,apad,atrim=duration=${duration}${events.length?' ,asplit=2[voice][control]':'[a]'}`];
  if (!events.length) return filters;
  events.forEach((e,i)=>{
    const fadeStart=Math.max(0,e.duration-0.08);
    filters.push(`[${firstEffectIndex+i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=start_sample=${e.trimSamples}:duration=${e.duration},asetpts=PTS-STARTPTS,volume=${e.gainDb}dB,afade=t=in:d=0.005,afade=t=out:st=${fadeStart}:d=0.08,adelay=${e.startSample}S:all=1,apad,atrim=duration=${duration}[cue${i}]`);
  });
  filters.push(`${events.map((_,i)=>`[cue${i}]`).join('')}amix=inputs=${events.length}:duration=longest:normalize=0[effects]`);
  filters.push('[effects][control]sidechaincompress=threshold=0.04:ratio=6:attack=8:release=180[ducked]');
  filters.push(`[voice][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=0:latency=1,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[a]`);
  return filters;
}

export async function prepareMotionAudio(project: EditingProject, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const events = await motionSoundEvents(project);
  const key=objectHash({version:MOTION_AUDIO_VERSION,audio:assetRecord(project.inputs.audioAssetId).hash,events:events.map(e=>({...e,hash:objectHash(fs.readFileSync(e.path))})),duration:project.inputs.durationFrames/project.inputs.fps});
  const dir=path.join(projectDir(project.id),'audio-cache');fs.mkdirSync(dir,{recursive:true});
  const output=path.join(dir,`${key}.wav`);if(fs.existsSync(output))return output;
  const pending=path.join(dir,`${key}-${randomUUID()}.partial.wav`);
  try {
    await runMedia('ffmpeg',['-v','error','-y','-i',assetFile(project.inputs.audioAssetId),...events.flatMap(e=>['-i',e.path]),'-filter_complex',motionAudioFilter(events,0,1,project.inputs.durationFrames/project.inputs.fps).join(';'),'-map','[a]','-c:a','pcm_s16le','-ar','48000',pending],signal);
    signal.throwIfAborted();fs.renameSync(pending,output);return output;
  } finally { fs.rmSync(pending,{force:true}); }
}
