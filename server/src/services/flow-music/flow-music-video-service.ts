import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { flowMusicDataDir, flowMusicDownloadsDir } from './flow-music-profile.js';
import { store } from '../store.js';
import { generatedDir, mediaUrl, outputDir as workspaceOutputDir } from '../workspace.js';
import { containedFile } from '../paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface SongApprovalState {
  scriptId: string;
  approved: boolean;
  approvedAt?: string;
  songUrl: string;
  trackTitle: string;
}

export interface FlowVideoJob {
  id: string;
  scriptId: string;
  state: 'idle' | 'running' | 'done' | 'error';
  stage: string;
  progress: number;
  approved: boolean;
  images: { line: string; prompt: string; filename: string; url: string }[];
  shortsVideoUrl?: string;
  longVideoUrl?: string;
  shortsPath?: string;
  longPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const approvalMap = new Map<string, SongApprovalState>();
const videoJobs = new Map<string, FlowVideoJob>();

export function getSongApproval(scriptId: string): SongApprovalState {
  const existing = approvalMap.get(scriptId);
  if (existing) return existing;

  // Check persistent store or file
  const approvalFile = path.join(flowMusicDataDir(), `approval_${scriptId}.json`);
  if (fs.existsSync(approvalFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
      approvalMap.set(scriptId, data);
      return data;
    } catch {}
  }

  return {
    scriptId,
    approved: false,
    songUrl: '',
    trackTitle: '',
  };
}

export function setSongApproval(scriptId: string, approved: boolean, songUrl = '', trackTitle = ''): SongApprovalState {
  const state: SongApprovalState = {
    scriptId,
    approved,
    approvedAt: approved ? new Date().toISOString() : undefined,
    songUrl: songUrl || `/api/flow-music/downloads/hanuman_vedic_trailer_flow_standard`,
    trackTitle: trackTitle || 'Lord Hanuman Vow // Goosebumps 🚩 (Google Flow Lyria 3.5)',
  };
  approvalMap.set(scriptId, state);

  const approvalFile = path.join(flowMusicDataDir(), `approval_${scriptId}.json`);
  fs.mkdirSync(path.dirname(approvalFile), { recursive: true });
  fs.writeFileSync(approvalFile, JSON.stringify(state, null, 2), 'utf8');

  return state;
}

export function getFlowVideoJob(jobId: string): FlowVideoJob | undefined {
  return videoJobs.get(jobId);
}

export function listFlowVideoJobs(scriptId?: string): FlowVideoJob[] {
  const all = Array.from(videoJobs.values());
  if (!scriptId) return all;
  return all.filter((j) => j.scriptId === scriptId);
}

// 8 Epic Graphic Novel Scenes corresponding to each line of dialogue & sacred Sanskrit war chants
export const HANUMAN_SCENE_DEFINITIONS = [
  {
    line: 'राम जी: "हनुमान, अगर सूर्य निकल गया तो लक्ष्मण मर जाएगा।"',
    caption: 'हनुमान, अगर सूर्य निकल गया तो लक्ष्मण मर जाएगा',
    tag: '[Dilemma Hook]',
    duration: 8,
    effect: 'zoom-in',
    prompt:
      'Digital graphic novel illustration of Lord Rama weeping beside wounded Lakshmana struck down on the epic ancient battlefield of Lanka, detailed muscular anatomy, crown and silk dhoti, dark cloudy sky with golden sunrise breaking through, dramatic atmospheric lighting, high contrast, cinematic 8k art style',
  },
  {
    line: 'हनुमान जी: "प्रभु, सूर्यदेव मेरा स्वभाव जानते हैं... जब तक जड़ी-बूटी लेकर नहीं आऊँगा, सूरज को उगने नहीं दूंगा।"',
    caption: 'प्रभु, जब तक जड़ी-बूटी नहीं लाऊंगा, सूरज को उगने नहीं दूंगा',
    tag: '[Sacred Vow]',
    duration: 10,
    effect: 'pan-up',
    prompt:
      'Digital graphic novel illustration of Lord Hanuman looking up with blazing eyes and fierce devotion, muscular structure, gold ornaments and mace Gada, dark war clouds, sunrise glow on horizon, dramatic atmospheric lighting, high contrast, cinematic 8k art style',
  },
  {
    line: 'राम जी: "हनुमान, मौत आगे बढ़ रही है..."',
    caption: 'हनुमान, मौत आगे बढ़ रही है...',
    tag: '[Rising Stakes]',
    duration: 7,
    effect: 'zoom-in',
    prompt:
      'Digital graphic novel illustration of Sri Rama holding Lakshmanas hand in agonizing grief on ancient Lanka battlefield, shadowy figures of looming death and war dust, warm fire orange tones, dramatic lighting, cinematic 8k art style',
  },
  {
    line: 'हनुमान जी: "प्रभु, आप कहते हैं मौत लक्ष्मण को खा जाएगी? मैं आपकी कसम खा के कहता हूँ... आज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!"',
    caption: 'आज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!',
    tag: '[Cosmic Roar]',
    duration: 12,
    effect: 'zoom-out',
    prompt:
      'Digital graphic novel illustration of Lord Hanuman expanding to colossal monumental form, roaring defiance at Death, blazing fiery golden aura around him, wielding heavy iron Gada with immense power, stormy lightning sky, cinematic 8k art style',
  },
  {
    line: 'राम रामं जपती...',
    caption: 'राम रामं जपती...',
    tag: '[Flight Across Ocean]',
    duration: 8,
    effect: 'pan-left',
    prompt:
      'Digital graphic novel illustration of Lord Hanuman flying at hypersonic speed through tempestuous cosmic clouds over the roaring ocean, golden lightning, glowing fiery aura, epic ancient Indian war aesthetic, cinematic 8k art style',
  },
  {
    line: 'हनुमान अतुलितबलधामम्...',
    caption: 'हनुमान अतुलितबलधामम्...',
    tag: '[Lifting Dronagiri]',
    duration: 9,
    effect: 'zoom-in',
    prompt:
      'Digital graphic novel illustration of Lord Hanuman lifting the entire glowing Dronagiri Sanjeevani mountain in one hand, celestial medicinal plants radiating emerald and gold light, dark star-filled sky, cinematic 8k art style',
  },
  {
    line: 'हनुमान महाकाल शंभोरावतारः...',
    caption: 'हनुमान महाकाल शंभोरावतारः...',
    tag: '[Mahakal Rudra Avatar]',
    duration: 10,
    effect: 'zoom-out',
    prompt:
      'Digital graphic novel illustration of Lord Hanuman in his ferocious Mahakal Rudra warrior avatar, cosmic fiery trident and gada, casting a colossal shadow over the dawn sun, solar flares, epic graphic novel style',
  },
  {
    line: 'बजरंगबली... जय श्री राम!',
    caption: 'बजरंगबली... जय श्री राम!',
    tag: '[Divine Triumph]',
    duration: 9,
    effect: 'zoom-in',
    prompt:
      'Digital graphic novel illustration of glorious sunrise over ancient Lanka, Lakshmana revived and smiling, Sri Rama embracing victorious Lord Hanuman, showers of golden petals and divine light, high contrast, cinematic 8k art style',
  },
];

async function generateSingleSceneImage(
  prompt: string,
  outputPath: string,
  seed: number,
  aspectRatio: '9:16' | '16:9' = '16:9'
): Promise<void> {
  const width = aspectRatio === '9:16' ? 1024 : 1536;
  const height = aspectRatio === '9:16' ? 1536 : 1024;

  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(35000) });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(buf));
      return;
    }
  } catch (err: any) {
    console.warn(`[Scene Image] Pollinations attempt note: ${err?.message}`);
  }

  // Backup procedural artwork synthesizer using FFmpeg if remote fetch is unavailable
  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=0x1a0a00:s=${width}x${height}:d=1`,
      '-vf',
      `drawbox=x=0:y=0:w=iw:h=ih:color=0x381800@0.8:t=fill,drawbox=x=0:y=ih*0.6:w=iw:h=ih*0.4:color=0x782800@0.6:t=fill,drawtext=text='ANCIENT DHARMA':fontcolor=0xFDE047:fontsize=${Math.round(
        height * 0.05
      )}:x=(w-text_w)/2:y=h*0.35,drawtext=text='LORD HANUMAN VOW':fontcolor=white:fontsize=${Math.round(
        height * 0.03
      )}:x=(w-text_w)/2:y=h*0.45`,
      '-vframes',
      '1',
      outputPath,
    ];
    const proc = spawn('ffmpeg', args);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg image synth failed: ${code}`))));
    proc.on('error', reject);
  });
}

function runFFmpegCommand(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-600)}`));
    });
    proc.on('error', reject);
  });
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function buildShortsAssSubtitles(scenes: typeof HANUMAN_SCENE_DEFINITIONS, totalDur: number, filePath: string): void {
  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Banner,Georgia,54,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1,2,8,20,20,420,1',
    'Style: Caption,Nirmala UI,60,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,3,5,40,40,0,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,0:00:00.00,${formatAssTime(totalDur)},Banner,,0,0,0,,Goosebumps 🚩`,
  ];

  const highlights = [
    '{\\c&H00FFFFFF&}राम जी: {\\c&H00D4FF&}हनुमान{\\c&H00FFFFFF&}, अगर\\N{\\c&H00D4FF&}सूर्य निकल गया{\\c&H00FFFFFF&} तो लक्ष्मण {\\c&H00D4FF&}मर जाएगा',
    '{\\c&H00FFFFFF&}प्रभु, सूर्यदेव मेरा {\\c&H00D4FF&}स्वभाव{\\c&H00FFFFFF&} जानते हैं...\\Nजब तक जड़ी-बूटी नहीं लाऊंगा, {\\c&H00D4FF&}सूरज को उगने नहीं दूंगा!',
    '{\\c&H00FFFFFF&}राम जी: "हनुमान, {\\c&H00D4FF&}मौत आगे बढ़ रही है..."',
    '{\\c&H00D4FF&}मैं आपकी कसम{\\c&H00FFFFFF&} खा के कहता हूँ...\\Nआज {\\c&H00D4FF&}मौत को ही मार दूंगा!{\\c&H00FFFFFF&}\\Nदुनिया में कभी कोई {\\c&H00D4FF&}मरेगा नहीं!',
    '{\\c&H00D4FF&}राम रामं जपती...{\\c&H00FFFFFF&}',
    '{\\c&H00FFFFFF&}हनुमान {\\c&H00D4FF&}अतुलितबलधामम्...{\\c&H00FFFFFF&}',
    '{\\c&H00FFFFFF&}हनुमान {\\c&H00D4FF&}महाकाल शंभोरावतारः...{\\c&H00FFFFFF&}',
    '{\\c&H00D4FF&}बजरंगबली... {\\c&H00FFFFFF&}जय श्री राम! 🚩',
  ];

  let currentTime = 0;
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = sc.duration || 9;
    const startTime = currentTime;
    const endTime = currentTime + dur;
    currentTime = endTime;

    const text = highlights[i] || sc.caption;
    lines.push(`Dialogue: 1,${formatAssTime(startTime)},${formatAssTime(endTime)},Caption,,0,0,0,,${text}`);
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function buildLongAssSubtitles(scenes: typeof HANUMAN_SCENE_DEFINITIONS, totalDur: number, filePath: string): void {
  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: LongCaption,Nirmala UI,46,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,3,2,60,60,80,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const highlights = [
    '{\\c&H00FFFFFF&}राम जी: {\\c&H00D4FF&}हनुमान{\\c&H00FFFFFF&}, अगर {\\c&H00D4FF&}सूर्य निकल गया{\\c&H00FFFFFF&} तो लक्ष्मण {\\c&H00D4FF&}मर जाएगा',
    '{\\c&H00FFFFFF&}हनुमान जी: "प्रभु, सूर्यदेव मेरा स्वभाव जानते हैं... जब तक जड़ी-बूटी नहीं लाऊंगा, {\\c&H00D4FF&}सूरज को उगने नहीं दूंगा!{\\c&H00FFFFFF&}"',
    '{\\c&H00FFFFFF&}राम जी: "हनुमान, {\\c&H00D4FF&}मौत आगे बढ़ रही है..."',
    '{\\c&H00D4FF&}मैं आपकी कसम खा के कहता हूँ... आज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!{\\c&H00FFFFFF&}',
    '{\\c&H00D4FF&}राम रामं जपती...{\\c&H00FFFFFF&}',
    '{\\c&H00FFFFFF&}हनुमान {\\c&H00D4FF&}अतुलितबलधामम्...{\\c&H00FFFFFF&}',
    '{\\c&H00FFFFFF&}हनुमान {\\c&H00D4FF&}महाकाल शंभोरावतारः...{\\c&H00FFFFFF&}',
    '{\\c&H00D4FF&}बजरंगबली... जय श्री राम! 🚩{\\c&H00FFFFFF&}',
  ];

  let currentTime = 0;
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = sc.duration || 9;
    const startTime = currentTime;
    const endTime = currentTime + dur;
    currentTime = endTime;

    const text = highlights[i] || sc.caption;
    lines.push(`Dialogue: 1,${formatAssTime(startTime)},${formatAssTime(endTime)},LongCaption,,0,0,0,,${text}`);
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

/**
 * Start the full multi-image and dual-format video generation pipeline.
 * Gated strictly by song approval.
 */
export async function startFlowVideoPipeline(scriptId: string): Promise<FlowVideoJob> {
  const approval = getSongApproval(scriptId);
  if (!approval.approved) {
    throw new Error('Song must be approved first! Please listen to the track and click "Approve Song" before starting video production.');
  }

  const jobId = `fv_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const job: FlowVideoJob = {
    id: jobId,
    scriptId,
    state: 'running',
    stage: 'Initializing multi-line graphic novel pipeline',
    progress: 5,
    approved: true,
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  videoJobs.set(jobId, job);

  // Background async execution
  void (async () => {
    const downloadsDir = flowMusicDownloadsDir();
    const outDir = path.join(downloadsDir, 'videos');
    fs.mkdirSync(outDir, { recursive: true });

    // 1. Locate approved audio file
    let audioPath = path.join(downloadsDir, 'hanuman_vedic_trailer_flow_standard.mp3');
    if (!fs.existsSync(audioPath)) {
      audioPath = path.join(downloadsDir, 'hanuman_vedic_trailer_flow.mp3');
    }
    if (!fs.existsSync(audioPath)) {
      throw new Error('Approved Google Flow Music audio track not found on disk.');
    }

    // 2. Generate multiple images based on each line
    job.stage = 'Generating multi-scene graphic novel illustrations for each dialogue line';
    job.progress = 15;
    job.updatedAt = new Date().toISOString();

    const imageFiles: string[] = [];
    const scenes = HANUMAN_SCENE_DEFINITIONS;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const imgFilename = `${jobId}_scene_${i}.jpg`;
      const imgPath = path.join(outDir, imgFilename);

      job.stage = `Generating Scene ${i + 1}/${scenes.length}: ${scene.line.slice(0, 40)}...`;
      job.progress = 15 + Math.round((i / scenes.length) * 35);
      job.updatedAt = new Date().toISOString();

      const seed = 1008 + i * 42;
      await generateSingleSceneImage(scene.prompt, imgPath, seed, '16:9');
      imageFiles.push(imgPath);

      job.images.push({
        line: scene.line,
        prompt: scene.prompt,
        filename: imgFilename,
        url: `/api/flow-music/videos/${imgFilename}`,
      });
    }

    const totalDur = scenes.reduce((acc, s) => acc + (s.duration || 9), 0);

    // 3. Render Shorts Video (9:16 vertical - 1080x1920) matching reference video edit
    // Centered 16:9 letterbox on pure black background, "Goosebumps 🚩" top banner, and kinetic Devanagari typography
    job.stage = 'Rendering 9:16 Shorts Video with "Goosebumps 🚩" letterbox banner & kinetic text';
    job.progress = 55;
    job.updatedAt = new Date().toISOString();

    const shortsFilename = `${jobId}_shorts_goosebumps.mp4`;
    const shortsPath = path.join(outDir, shortsFilename);

    const shortsAssPath = path.join(outDir, `${jobId}_shorts.ass`);
    buildShortsAssSubtitles(scenes, totalDur, shortsAssPath);
    const cleanShortsAss = shortsAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    const shortsClipList: string[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const sc = scenes[i];
      const clipFile = path.join(outDir, `${jobId}_shorts_clip_${i}.mp4`);
      const dur = sc.duration || 9;
      const numFrames = dur * 30;

      // 2.5D Ken Burns zoompan inside 1080x608 letterbox, overlayed at y=656 on 1080x1920 black canvas
      const zoomExpr = i % 2 === 0
        ? `'min(zoom+0.0006,1.15)'`
        : `'max(1.15-0.0006*on,1.0)'`;

      const filter = [
        `color=c=black:s=1080x1920:d=${dur}[bg]`,
        `[0:v]scale=1280:720:force_original_aspect_ratio=increase,zoompan=z=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${numFrames}:s=1080x608:fps=30,eq=contrast=1.14:saturation=1.22:brightness=-0.01[fg]`,
        `[bg][fg]overlay=0:656[out]`,
      ].join(';');

      await runFFmpegCommand([
        '-y',
        '-loop', '1',
        '-framerate', '30',
        '-t', String(dur),
        '-i', imageFiles[i],
        '-filter_complex', filter,
        '-map', '[out]',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-t', String(dur),
        clipFile,
      ]);
      shortsClipList.push(clipFile);
    }

    const shortsConcatTxt = path.join(outDir, `${jobId}_concat_shorts.txt`);
    fs.writeFileSync(shortsConcatTxt, shortsClipList.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'));

    const uncaptionedShortsPath = path.join(outDir, `${jobId}_shorts_raw.mp4`);
    await runFFmpegCommand([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', shortsConcatTxt,
      '-c:v', 'copy',
      uncaptionedShortsPath,
    ]);

    // Burn kinetic Devanagari & "Goosebumps 🚩" banner onto compiled video with approved Flow Music
    await runFFmpegCommand([
      '-y',
      '-i', uncaptionedShortsPath,
      '-i', audioPath,
      '-vf', `ass='${cleanShortsAss}'`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      shortsPath,
    ]);

    job.shortsPath = shortsPath;
    job.shortsVideoUrl = `/api/flow-music/videos/${shortsFilename}`;

    // Clean up temporary scene clips
    shortsClipList.forEach((c) => {
      try { fs.unlinkSync(c); } catch {}
    });
    try { fs.unlinkSync(shortsConcatTxt); } catch {}
    try { fs.unlinkSync(uncaptionedShortsPath); } catch {}
    try { fs.unlinkSync(shortsAssPath); } catch {}

    // 4. Render Long Video (16:9 widescreen - 1920x1080)
    job.stage = 'Rendering 16:9 Long Video in cinematic widescreen presentation';
    job.progress = 80;
    job.updatedAt = new Date().toISOString();

    const longFilename = `${jobId}_long_cinematic.mp4`;
    const longPath = path.join(outDir, longFilename);

    const longAssPath = path.join(outDir, `${jobId}_long.ass`);
    buildLongAssSubtitles(scenes, totalDur, longAssPath);
    const cleanLongAss = longAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    const lWidth = 1920;
    const lHeight = 1080;
    const longClipList: string[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const sc = scenes[i];
      const clipFile = path.join(outDir, `${jobId}_long_clip_${i}.mp4`);
      const dur = sc.duration || 9;
      const numFrames = dur * 30;

      const zoomExpr = i % 2 === 0
        ? `'min(zoom+0.0006,1.15)'`
        : `'max(1.15-0.0006*on,1.0)'`;

      const filter = [
        `scale=2048:1152:force_original_aspect_ratio=increase`,
        `zoompan=z=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${numFrames}:s=${lWidth}x${lHeight}:fps=30`,
        `eq=contrast=1.14:saturation=1.22:brightness=-0.02`,
        `colorbalance=rs=0.07:gs=0.01:bs=-0.05`,
        `vignette=PI/4`,
        `format=yuv420p`,
      ].join(',');

      await runFFmpegCommand([
        '-y',
        '-loop', '1',
        '-framerate', '30',
        '-t', String(dur),
        '-i', imageFiles[i],
        '-vf', filter,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-t', String(dur),
        clipFile,
      ]);
      longClipList.push(clipFile);
    }

    const longConcatTxt = path.join(outDir, `${jobId}_concat_long.txt`);
    fs.writeFileSync(longConcatTxt, longClipList.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'));

    const uncaptionedLongPath = path.join(outDir, `${jobId}_long_raw.mp4`);
    await runFFmpegCommand([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', longConcatTxt,
      '-c:v', 'copy',
      uncaptionedLongPath,
    ]);

    // Burn widescreen Devanagari subtitles & audio
    await runFFmpegCommand([
      '-y',
      '-i', uncaptionedLongPath,
      '-i', audioPath,
      '-vf', `ass='${cleanLongAss}'`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      longPath,
    ]);

    job.longPath = longPath;
    job.longVideoUrl = `/api/flow-music/videos/${longFilename}`;

    // Clean up temporary long clips
    longClipList.forEach((c) => {
      try { fs.unlinkSync(c); } catch {}
    });
    try { fs.unlinkSync(longConcatTxt); } catch {}
    try { fs.unlinkSync(uncaptionedLongPath); } catch {}
    try { fs.unlinkSync(longAssPath); } catch {}

    // Copy to persistent named files
    const persistentShorts = path.join(outDir, 'dharma_hanuman_shorts_final.mp4');
    const persistentLong = path.join(outDir, 'dharma_hanuman_long_final.mp4');
    fs.copyFileSync(shortsPath, persistentShorts);
    fs.copyFileSync(longPath, persistentLong);

    // 5. Also copy to script workspace output if script exists
    try {
      const script = store.getById<any>('scripts', scriptId);
      if (script) {
        const scriptOutDir = containedFile(workspaceOutputDir(), scriptId, '');
        fs.mkdirSync(scriptOutDir, { recursive: true });
        fs.copyFileSync(shortsPath, path.join(scriptOutDir, 'flow_shorts_final.mp4'));
        fs.copyFileSync(longPath, path.join(scriptOutDir, 'flow_long_final.mp4'));
      }
    } catch {}

    // Complete job
    job.state = 'done';
    job.stage = 'Final Shorts (9:16) & Long (16:9) videos created successfully!';
    job.progress = 100;
    job.updatedAt = new Date().toISOString();
  })().catch((err: any) => {
    job.state = 'error';
    job.stage = 'Video pipeline failed';
    job.error = err?.message || 'Unknown error during multi-scene video rendering';
    job.updatedAt = new Date().toISOString();
  });

  return job;
}
