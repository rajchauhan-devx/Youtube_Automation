import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import { containedFile, safeSegment } from './paths.js';
import { FPS, planTimeline } from './timeline.js';
import { randomUUID } from 'node:crypto';
import { runMedia } from './media-process.js';
import { compositePresenter } from './presenter.js';
import { reservePresenterCaptionSpace, type PresenterSettings } from './presenter-settings.js';
import type { ScenePlan, NarrationSync } from './scene-plan.js';
import { autoEditPlan, autoMotionFilter, smoothMotionFilter, autoEditAss, autoAudioGraph, validateEditingSettings, type EditingSettings } from './auto-edit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { generatedDir, mediaUrl, currentWorkspace } from './workspace.js';
import { outputDir as workspaceOutputDir } from './workspace.js';

if (!fs.existsSync(workspaceOutputDir())) {
  fs.mkdirSync(workspaceOutputDir(), { recursive: true });
}


ffmpeg.setFfmpegPath('ffmpeg');

export interface RenderOptions {
  presenter?: PresenterSettings;
  presenterPath?: string;
  presenterSourceSize?: { width: number; height: number };
  editing?: EditingSettings;
  scriptId: string;
  imagePaths: string[];
  audioPath: string;
  duration?: number;
  resolution?: { width: number; height: number };
  zoomFactor?: number;
  transitionDuration?: number;
  timelineConfig?: {
    clips: { duration: number; transition: string; transitionDuration: number }[];
  };
  sceneAnalysis?: {
    transitions: string[];
    effects: string[];
    timings: number[];
    pacing?: string;
    mood?: string;
    colorGrade?: string;
  };
  enableSubtitles?: boolean;
  subtitlePath?: string;
  bgmPath?: string;
  bgmVolume?: number;
  ttsVolume?: number;
  colorGrade?: string;
  enableVignette?: boolean;
  enableSfx?: boolean;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

export interface RenderResult {
  outputPath: string;
  filename: string;
  duration: number;
  size: number;
}

export async function probeAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (!err && meta && meta.format && meta.format.duration) {
        resolve(meta.format.duration);
      } else {
        resolve(0);
      }
    });
  });
}

export function resolveInputPath(p: string, scriptId: string): string {
  if (!safeSegment(scriptId) || typeof p !== 'string') throw new Error('Invalid media identifier');
  if (p.startsWith('/api/')) {
    const expected = [mediaUrl(`generate/file/${scriptId}/`), mediaUrl(`tts/file/${scriptId}/`)];
    if (!expected.some(prefix => p.startsWith(prefix) && safeSegment(p.slice(prefix.length)))) throw new Error('Media must belong to this account, profile and script');
    return containedFile(generatedDir(), scriptId, p.slice(p.lastIndexOf('/') + 1));
  }
  const filename = path.basename(p);
  const target = containedFile(generatedDir(), scriptId, filename);
  // Legacy absolute paths are accepted only when they point to this script's own file.
  if (path.isAbsolute(p) && path.resolve(p) !== path.resolve(target)) throw new Error('Media must belong to this script');
  return target;
}

const VALID_XFADE_TRANSITIONS = new Set([
  'fade', 'fadeblack', 'fadewhite', 'fadegrays', 'fadeslow', 'fadefast',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'wipetl', 'wipetr', 'wipebl', 'wipebr',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'circleopen', 'circleclose', 'circlecrop',
  'dissolve', 'pixelize', 'horzopen', 'horzclose', 'vertopen', 'vertclose'
]);

const COLOR_GRADE_FILTERS: Record<string, string> = {
  'teal-orange': 'eq=contrast=1.12:saturation=1.18:brightness=-0.02,colorbalance=rs=0.06:gs=-0.01:bs=-0.05:rh=-0.04:gh=0.01:bh=0.06',
  'warm-vintage': 'eq=contrast=1.08:saturation=1.12,colorbalance=rs=0.08:gs=0.04:bs=-0.06:rh=0.04:gh=0.02:bh=-0.03',
  'vibrant': 'eq=contrast=1.15:saturation=1.35:brightness=0.01',
  'dramatic-noir': 'eq=contrast=1.22:saturation=0.85:brightness=-0.04',
  'clean': 'eq=contrast=1.05:saturation=1.08',
};

function buildZoompanExpression(effect: string, frameCount: number, width: number, height: number, zoomFactor: number): string {
  const aliases: Record<string, string> = {
    'zoom-in': 'push-in', 'slow-zoom-in': 'push-in', 'crash-zoom': 'push-in',
    'zoom-out': 'pull-out', 'slow-zoom-out': 'pull-out', 'drift-left': 'pan-left',
    'drift-right': 'pan-right', 'pan-up': 'rise', 'ken-burns-in': 'drift-in', 'ken-burns-out': 'drift-out',
  };
  const motion = aliases[effect] || (['hold', 'pan-left', 'pan-right', 'pan-down'].includes(effect) ? effect : 'push-in');
  return smoothMotionFilter(motion, frameCount, width, height, effect.startsWith('slow-') ? 0.04 : Math.min(0.08, Math.max(0, zoomFactor - 1)));
}
export function buildFilterComplex(opts: RenderOptions, resolvedImages: string[]): string {
  const { resolution = { width: 1080, height: 1920 }, zoomFactor = 1.15, transitionDuration: defaultTransitionDuration = 0.5 } = opts;
  const { width, height } = resolution;
  const numImages = resolvedImages.length;

  if (numImages === 0) throw new Error('No images provided for rendering');

  const totalVideoDuration = opts.duration || 30;

  const sa = opts.sceneAnalysis;
  const tc = opts.timelineConfig;
  if (tc && tc.clips.length !== numImages) throw new Error('Timeline scene count must match images');
  const weights = sa?.timings?.length === numImages && sa.timings.every(t => Number.isFinite(t) && t > 0)
    ? sa.timings : resolvedImages.map(() => 1);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const clips = tc?.clips ?? weights.map((weight, i) => ({
    duration: totalVideoDuration * weight / weightSum,
    transition: sa?.transitions?.[i] || 'fade',
    transitionDuration: defaultTransitionDuration,
  }));
  const plan = planTimeline(clips, totalVideoDuration);
  const filterParts: string[] = [];
  let lastLabel = 'zoomed0';
  resolvedImages.forEach((_, i) => {
    const clip = plan[i];
    const motion = buildZoompanExpression(sa?.effects?.[i] || 'zoom-in', clip.frames, width, height, zoomFactor);
    filterParts.push(`[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,${motion},trim=end_frame=${clip.frames},settb=AVTB,setpts=PTS-STARTPTS[zoomed${i}]`);
    if (i === 0) return;
    const previous = plan[i - 1];
    const label = `blend${i}`;
    if (previous.overlap === 0) {
      filterParts.push(`[${lastLabel}][zoomed${i}]concat=n=2:v=1:a=0[${label}]`);
    } else {
      const transition = VALID_XFADE_TRANSITIONS.has(previous.transition) ? previous.transition : 'fade';
      filterParts.push(`[${lastLabel}][zoomed${i}]xfade=transition=${transition}:duration=${previous.overlap}:offset=${clip.startFrame / FPS}[${label}]`);
    }
    lastLabel = label;
  });

  // Base video post-processing: Color grading + Vignette
  const postFilters: string[] = ['setpts=PTS-STARTPTS'];

  // Color grade
  const colorGradeKey = (opts.colorGrade || sa?.colorGrade || 'teal-orange').toLowerCase();
  if (COLOR_GRADE_FILTERS[colorGradeKey]) {
    postFilters.push(COLOR_GRADE_FILTERS[colorGradeKey]);
  }

  // Vignette shading
  if (opts.enableVignette !== false) {
    postFilters.push('vignette=PI/4');
  }

  // Subtitles
  if (opts.enableSubtitles && opts.subtitlePath && fs.existsSync(opts.subtitlePath)) {
    const cleanSubPath = path.resolve(opts.subtitlePath).replace(/\\/g, '/').replace(/:/g, '\\:');
    postFilters.push(`ass='${cleanSubPath}'`);
  }

  // Final video output node [v]
  filterParts.push(`[${lastLabel}]trim=duration=${totalVideoDuration},${postFilters.join(',')}[v]`);

  // Handle audio filter complex (Voice + BGM)
  const hasBgm = Boolean(opts.bgmPath && fs.existsSync(opts.bgmPath));
  const voiceIndex = numImages;
  const ttsVol = (opts.ttsVolume ?? 1.0).toFixed(2);

  if (hasBgm && opts.bgmPath) {
    const bgmIndex = voiceIndex + 1;
    const bgmVol = (opts.bgmVolume ?? 0.15).toFixed(2);

    filterParts.push(`[${voiceIndex}:a]volume=${ttsVol}[voice]`);
    // The input is infinitely looped by renderVideo. Trim the repeated stream to
    // the narration length so short music beds cover the whole video and long
    // ones finish exactly with it.
    filterParts.push(`[${bgmIndex}:a]atrim=duration=${totalVideoDuration},asetpts=PTS-STARTPTS,volume=${bgmVol},afade=t=in:d=${Math.min(1, totalVideoDuration / 4)},afade=t=out:st=${Math.max(0, totalVideoDuration - 1.5)}:d=${Math.min(1.5, totalVideoDuration)}[bgm]`);
    filterParts.push(`[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a]`);
  } else {
    filterParts.push(`[${voiceIndex}:a]volume=${ttsVol}[a]`);
  }

  return filterParts.join(';');
}

export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  const { scriptId, imagePaths, audioPath } = opts;

  const outputDir = containedFile(workspaceOutputDir(), scriptId);
  fs.mkdirSync(outputDir, { recursive: true });

  const resolvedImages = imagePaths.map((p) => resolveInputPath(p, scriptId));
  const resolvedAudio = resolveInputPath(audioPath, scriptId);

  const missingImage = resolvedImages.find((p) => !fs.existsSync(p));
  if (missingImage) {
    throw new Error(`Image file not found: ${missingImage}`);
  }
  if (!fs.existsSync(resolvedAudio)) {
    throw new Error(`Audio file not found: ${resolvedAudio}`);
  }

  // Automatically probe exact narration audio duration to ensure full audio coverage
  const audioDuration = await probeAudioDuration(resolvedAudio);
  if (!Number.isFinite(audioDuration) || audioDuration <= 0) throw new Error('Cannot measure narration duration; check the audio file and ffprobe');
  const duration = audioDuration;
  opts.duration = duration;

  const hasBgm = Boolean(opts.bgmPath && fs.existsSync(opts.bgmPath));

  const filename = `final_${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, filename);
  const temporaryPath = outputPath.replace(/\.mp4$/, '.partial.mp4');

  const filterComplex = buildFilterComplex(opts, resolvedImages);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    if (opts.signal?.aborted) { reject(new Error('Render cancelled')); return; }
    const cancel = () => { cmd.kill('SIGKILL'); };
    opts.signal?.addEventListener('abort', cancel, { once: true });
    const cleanup = () => opts.signal?.removeEventListener('abort', cancel);

    resolvedImages.forEach((imgPath) => {
      cmd.input(imgPath);
    });
    cmd.input(resolvedAudio);

    if (hasBgm && opts.bgmPath) {
      cmd.input(opts.bgmPath).inputOptions(['-stream_loop', '-1']);
    }

    const outputOptions = [
      '-map', '[v]',
      '-map', '[a]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-t', String(duration),
      '-r', String(FPS),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
    ];

    cmd
      .complexFilter(filterComplex)
      .outputOptions(outputOptions)
      .output(temporaryPath)
      .on('start', (cmdline) => {
        if (opts.signal?.aborted) cancel();
        console.log(`FFmpeg started: ${cmdline}`);
      })
      .on('progress', (progress) => {
        if (progress.percent && opts.onProgress) {
          opts.onProgress(Math.min(99, Math.max(1, Math.round(progress.percent))));
        }
      })
      .on('end', async () => {
        try {
        if (opts.signal?.aborted) {
          fs.rmSync(temporaryPath, { force: true });
          reject(new Error('Render cancelled'));
          return;
        }
        if (opts.presenter?.enabled && opts.presenterPath) {
          opts.onProgress?.(95);
          await compositePresenter(temporaryPath, opts.presenterPath, opts.presenter, opts.resolution?.width || 1080, opts.resolution?.height || 1920, duration, opts.signal);
        }
        fs.renameSync(temporaryPath, outputPath);
        const stats = fs.statSync(outputPath);
        if (opts.onProgress) opts.onProgress(100);
        resolve({
          outputPath,
          filename,
          duration,
          size: stats.size,
        });
        } catch (error) { fs.rmSync(temporaryPath, { force: true }); reject(error); }
        finally { cleanup(); }
      })
      .on('error', (err) => {
        cleanup();
        fs.rmSync(temporaryPath, { force: true });
        console.error('FFmpeg error:', err.message);
        reject(new Error(`Video rendering failed: ${err.message}`));
      })
      .run();
  });
}

export async function renderLongVideo(opts: RenderOptions, scenePlan: ScenePlan, sync: NarrationSync): Promise<RenderResult> {
  const editing = opts.editing?.enabled ? validateEditingSettings(opts.editing) : undefined;
  const decisions = editing ? autoEditPlan(scenePlan, editing) : undefined;
  const dir = getOutputDir(opts.scriptId);
  fs.mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  const work = containedFile(dir, `render-${id}`);
  fs.mkdirSync(work);
  const filename = `final_${id}.mp4`;
  const outputPath = containedFile(dir, filename);
  const partial = containedFile(dir, `final_${id}.partial.mp4`);
  const duration = sync.totalSamples / sync.sampleRate;
  const width = opts.resolution?.width || 1920;
  const height = opts.resolution?.height || 1080;
  const time = (seconds: number) => {
    const centiseconds = Math.round(seconds * 100);
    return `${Math.floor(centiseconds / 360000)}:${String(Math.floor(centiseconds / 6000) % 60).padStart(2, '0')}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
  };
  try {
    const files: string[] = [];
    let presenterSourceSize = opts.presenterSourceSize;
    if (opts.presenter?.enabled && opts.presenterPath && !presenterSourceSize) {
      const metadata = JSON.parse(await runMedia('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', opts.presenterPath], opts.signal));
      presenterSourceSize = metadata.streams[0];
    }
    for (let i = 0; i < scenePlan.scenes.length; i++) {
      opts.signal?.throwIfAborted();
      const timing = sync.scenes[i];
      const start = Math.round(timing.startSample * FPS / sync.sampleRate);
      const end = i === sync.scenes.length - 1 ? Math.ceil(timing.endSample * FPS / sync.sampleRate) : Math.round(timing.endSample * FPS / sync.sampleRate);
      const frames = end - start;
      if (frames < 1) throw new Error('A narration scene is too short for one video frame.');
      let videoTiming = '';
      if (scenePlan.scenes[i].mediaType === 'video') {
        const sourceDuration = await probeAudioDuration(resolveInputPath(opts.imagePaths[i], opts.scriptId));
        const targetDuration = frames / FPS;
        if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error(`Scene ${scenePlan.scenes[i].id}: cannot measure video duration.`);
        // Trim longer footage; slow shorter footage by at most 20%, then hold
        // the final frame for at most two seconds. Never repeat an action.
        const stretch = Math.min(1.25, Math.max(1, targetDuration / sourceDuration));
        if (targetDuration > sourceDuration * stretch + 2 + 1 / FPS) throw new Error(`Scene ${scenePlan.scenes[i].id}: ${sourceDuration.toFixed(1)}s of footage cannot cover ${targetDuration.toFixed(1)}s of narration naturally. Import a longer clip for this scene. Narration was not cut.`);
        videoTiming = `setpts=(PTS-STARTPTS)*${stretch}`;
      }
      const fitVideo = (framing: string) => `${videoTiming},${framing},setsar=1,fps=${FPS},tpad=stop_mode=clone:stop_duration=2.1,trim=duration=${frames / FPS}`;
      let filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,${buildZoompanExpression(opts.sceneAnalysis?.effects?.[i] || 'zoom-in', frames, width, height, opts.zoomFactor ?? 1.1)}`;
      if (scenePlan.scenes[i].mediaType === 'video') {
        filter = fitVideo(`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`);
      }
      if (editing && decisions) {
        const framing = editing.framing === 'cover' ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}` : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
        filter = scenePlan.scenes[i].mediaType === 'video'
          ? fitVideo(framing)
          : `${framing},setsar=1,${autoMotionFilter(decisions[i].motion, frames, width, height, editing.motion)}`;
      }
      const grade = editing?.colorLook ?? opts.colorGrade;
      if (grade && COLOR_GRADE_FILTERS[grade]) filter += `,${COLOR_GRADE_FILTERS[grade]}`;
      if (editing ? editing.vignette : opts.enableVignette) filter += editing ? ',vignette=PI/8' : ',vignette=PI/5';
      if (editing && decisions) {
        if (editing.sharpen) filter += ',unsharp=5:5:0.25:5:5:0';
        if (editing.grain) filter += ',noise=alls=2:allf=t+u';
        const clean = `clean-${i}.mp4`;
        const file = `scene-${i}.mp4`;
        const length = frames / FPS;
        await runMedia('ffmpeg', ['-v', 'error', '-y', '-i', resolveInputPath(opts.imagePaths[i], opts.scriptId), '-vf', filter,
          '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', editing.quality === 'high' ? '18' : '21', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-threads', '2', clean], opts.signal, work);
        const transitionLength = Math.min(editing.transitionSeconds, length / 3);
        const post: string[] = [];
        if ((i === 0 && editing.bookendFades) || decisions[i].transition === 'dip-black') post.push(`fade=t=in:st=0:d=${transitionLength}`);
        if ((i === scenePlan.scenes.length - 1 && editing.bookendFades) || decisions[i + 1]?.transition === 'dip-black') post.push(`fade=t=out:st=${length - transitionLength}:d=${transitionLength}`);
        if (editing.letterbox) {
          const bar = Math.round(height * 0.065);
          post.push(`drawbox=x=0:y=0:w=iw:h=${bar}:color=black:t=fill`, `drawbox=x=0:y=ih-${bar}:w=iw:h=${bar}:color=black:t=fill`);
        }
        if (editing.captions && opts.enableSubtitles !== false) {
          fs.writeFileSync(containedFile(work, `polish-${i}.ass`), reservePresenterCaptionSpace(autoEditAss(scenePlan.scenes[i].narration, length, '', width, height, editing, true), opts.presenter, presenterSourceSize));
          post.push(`subtitles=polish-${i}.ass`);
        }
        post.push('format=yuv420p');
        const sceneArgs = ['-v', 'error', '-y', '-i', clean];
        if (i > 0 && decisions[i].transition === 'dissolve') {
          // Blend the prior clean final frame into the incoming scene. No overlapping
          // timeline segments, stolen video frames, caption ghosts or audio shifts.
          sceneArgs.push('-loop', '1', '-framerate', String(FPS), '-i', 'previous-tail.png', '-filter_complex_threads', '1', '-filter_complex',
            `[1:v]trim=duration=${transitionLength},settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[tail];[0:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[current];[tail][current]xfade=transition=fade:duration=${transitionLength}:offset=0,${post.join(',')}[v]`, '-map', '[v]');
        } else sceneArgs.push('-vf', post.join(','));
        sceneArgs.push('-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', editing.quality === 'high' ? '19' : '23', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-threads', '2', file);
        await runMedia('ffmpeg', sceneArgs, opts.signal, work);
        if (decisions[i + 1]?.transition === 'dissolve') await runMedia('ffmpeg', ['-v', 'error', '-y', '-sseof', String(-1 / FPS), '-i', clean, '-frames:v', '1', '-update', '1', 'previous-tail.png'], opts.signal, work);
        fs.rmSync(containedFile(work, clean), { force: true });
        files.push(`file '${file}'`);
        opts.onProgress?.(Math.round(90 * (i + 1) / scenePlan.scenes.length));
        continue;
      }
      if (opts.enableSubtitles) {
        const caption = scenePlan.scenes[i].narration.replace(/[{}\\\r\n]/g, ' ');
        const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Nirmala UI,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,0,0,0,0,100,100,0,0,1,2,0,2,96,96,60,1\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\nDialogue: 0,0:00:00.00,${time(frames / FPS)},Default,,0,0,0,,${caption}\n`;
        fs.writeFileSync(containedFile(work, `caption-${i}.ass`), reservePresenterCaptionSpace(ass, opts.presenter, presenterSourceSize));
        filter += `,subtitles=caption-${i}.ass`;
      }
      const file = `scene-${i}.mp4`;
      await runMedia('ffmpeg', ['-v', 'error', '-y', '-i', resolveInputPath(opts.imagePaths[i], opts.scriptId), '-vf', filter,
        '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-threads', '2', file], opts.signal, work);
      files.push(`file '${file}'`);
      opts.onProgress?.(Math.round(90 * (i + 1) / scenePlan.scenes.length));
    }
    fs.writeFileSync(containedFile(work, 'concat.txt'), files.join('\n'));
    const args = ['-v', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', 'concat.txt', '-i', resolveInputPath(opts.audioPath, opts.scriptId)];
    const voiceVolume = opts.ttsVolume ?? 1;
    if (editing && decisions) {
      if (opts.bgmPath) args.push('-stream_loop', '-1', '-i', opts.bgmPath);
      const chapterTimes = decisions.flatMap((decision, i) => i > 0 && decision.chapterStart ? [sync.scenes[i].startSample / sync.sampleRate] : []);
      args.push('-filter_complex', autoAudioGraph(editing, duration, voiceVolume, opts.bgmVolume ?? 0.12, Boolean(opts.bgmPath), chapterTimes));
    } else if (opts.bgmPath) {
      args.push('-stream_loop', '-1', '-i', opts.bgmPath, '-filter_complex', `[1:a]volume=${voiceVolume}[voice];[2:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=${opts.bgmVolume ?? 0.15},afade=t=in:d=${Math.min(1, duration / 4)},afade=t=out:st=${Math.max(0, duration - 1.5)}:d=${Math.min(1.5, duration)}[music];[voice][music]amix=inputs=2:duration=first:normalize=0[a]`);
    } else args.push('-filter_complex', `[1:a]volume=${voiceVolume}[a]`);
    args.push('-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(duration), '-movflags', '+faststart', partial);
    await runMedia('ffmpeg', args, opts.signal, work);
    if (opts.presenter?.enabled && opts.presenterPath) {
      opts.onProgress?.(95);
      await compositePresenter(partial, opts.presenterPath, opts.presenter, width, height, duration, opts.signal);
    }
    opts.signal?.throwIfAborted();
    const probe = JSON.parse(await runMedia('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', partial], opts.signal));
    for (const type of ['video', 'audio']) {
      const stream = probe.streams.find((stream: any) => stream.codec_type === type);
      if (!stream || !Number.isFinite(Number(stream.duration)) || Math.abs(Number(stream.duration) - duration) > 1 / FPS + 0.001) throw new Error(`Rendered ${type} duration does not match narration. Output was not published.`);
    }
    fs.renameSync(partial, outputPath);
    return { outputPath, filename, duration, size: fs.statSync(outputPath).size };
  } finally {
    fs.rmSync(partial, { force: true });
    fs.rmSync(containedFile(dir, `render-${id}`), { recursive: true, force: true });
  }
}

export function getOutputDir(scriptId: string): string {
  return containedFile(workspaceOutputDir(), scriptId);
}

export function getVideoUrl(scriptId: string, filename: string): string {
  return mediaUrl(`render/file/${scriptId}/${filename}`);
}

export function serveVideoFile(scriptId: string, filename: string): string | null {
  if (!safeSegment(scriptId) || !safeSegment(filename) || !filename.endsWith('.mp4') || filename.endsWith('.partial.mp4')) return null;
  const filePath = containedFile(workspaceOutputDir(), scriptId, filename);
  return fs.existsSync(filePath) ? filePath : null;
}
