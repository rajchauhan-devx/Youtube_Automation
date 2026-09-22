import type { ScenePlan } from './scene-plan.js';

export const EDIT_MOTIONS = ['auto', 'hold', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'rise', 'drift-in', 'drift-out'] as const;
export const EDIT_TRANSITIONS = ['auto', 'cut', 'dissolve', 'dip-black'] as const;
export interface EditingSettings {
  enabled: boolean;
  preset: 'clean' | 'cinematic' | 'documentary';
  motion: 'gentle' | 'balanced' | 'off';
  transitions: typeof EDIT_TRANSITIONS[number];
  transitionSeconds: number;
  framing: 'contain' | 'cover';
  chapterTitles: boolean;
  bookendFades: boolean;
  captionStyle: 'minimal' | 'boxed' | 'gold';
  captions: boolean;
  colorLook: 'clean' | 'warm-vintage' | 'teal-orange' | 'dramatic-noir' | 'none';
  vignette: boolean;
  captionWords: number;
  voicePolish: boolean;
  musicDucking: boolean;
  chapterSound: boolean;
  grain: boolean;
  sharpen: boolean;
  letterbox: boolean;
  quality: 'standard' | 'high';
  overrides: Record<string, { motion?: typeof EDIT_MOTIONS[number]; transition?: typeof EDIT_TRANSITIONS[number] }>;
}

export function editingPreset(preset: EditingSettings['preset'] = 'clean'): EditingSettings {
  return { enabled: true, preset, motion: 'gentle', transitions: 'auto', transitionSeconds: preset === 'cinematic' ? 0.5 : 0.35,
    framing: 'contain', chapterTitles: false, bookendFades: true, captionStyle: preset === 'cinematic' ? 'gold' : preset === 'documentary' ? 'boxed' : 'minimal',
    captions: true, colorLook: preset === 'cinematic' ? 'warm-vintage' : 'clean', vignette: preset === 'cinematic',
    captionWords: 8, voicePolish: true, musicDucking: true, chapterSound: false, grain: false, sharpen: false,
    letterbox: false, quality: 'high', overrides: {} };
}

export function validateEditingSettings(value: unknown): EditingSettings {
  const s = value as EditingSettings;
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('Invalid automatic editing settings.');
  for (const [key, choices] of Object.entries({ preset: ['clean', 'cinematic', 'documentary'], motion: ['gentle', 'balanced', 'off'], transitions: EDIT_TRANSITIONS,
    framing: ['contain', 'cover'], captionStyle: ['minimal', 'boxed', 'gold'], colorLook: ['clean', 'warm-vintage', 'teal-orange', 'dramatic-noir', 'none'], quality: ['standard', 'high'] })) {
    if (!choices.includes((s as any)[key])) throw new Error(`Invalid editing setting: ${key}.`);
  }
  for (const key of ['enabled', 'chapterTitles', 'bookendFades', 'voicePolish', 'musicDucking', 'chapterSound', 'grain', 'sharpen', 'letterbox', 'captions', 'vignette']) {
    if (typeof (s as any)[key] !== 'boolean') throw new Error(`Invalid editing toggle: ${key}.`);
  }
  if (!Number.isFinite(s.transitionSeconds) || s.transitionSeconds < 0.15 || s.transitionSeconds > 0.8 || !Number.isInteger(s.captionWords) || s.captionWords < 4 || s.captionWords > 12) throw new Error('Transition length or caption size is out of range.');
  if (!s.overrides || typeof s.overrides !== 'object' || Array.isArray(s.overrides) || Object.keys(s.overrides).length > 160) throw new Error('Invalid scene overrides.');
  for (const [id, override] of Object.entries(s.overrides)) {
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(id) || !override || typeof override !== 'object' ||
      (override.motion !== undefined && !EDIT_MOTIONS.includes(override.motion)) || (override.transition !== undefined && !EDIT_TRANSITIONS.includes(override.transition))) throw new Error('Invalid scene editing override.');
  }
  return s;
}

export function autoEditPlan(plan: ScenePlan, settings: EditingSettings) {
  const motions = ['push-in', 'pan-right', 'pull-out', 'pan-left', 'rise'] as const;
  return plan.scenes.map((scene, index) => {
    const chapterStart = index === 0 || scene.chapter !== plan.scenes[index - 1].chapter;
    const override = settings.overrides[scene.id];
    const autoMotion = settings.motion === 'off' || scene.role === 'cta' ? 'hold' : motions[index % motions.length];
    const motion = scene.mediaType === 'video' ? 'source' : settings.motion === 'off' ? 'hold' : override?.motion && override.motion !== 'auto' ? override.motion : autoMotion;
    const selected = override?.transition && override.transition !== 'auto' ? override.transition : settings.transitions;
    const transition = index === 0 ? 'cut' : selected !== 'auto' ? selected : chapterStart ? 'dip-black' :
      settings.preset === 'documentary' || (scene.mediaType === 'video' && settings.preset !== 'cinematic') ? 'cut' : index % 3 === 0 ? 'cut' : 'dissolve';
    // Chapter names are editing metadata only; never burn labels such as
    // "Chapter 1" or "Block 2" over the video.
    return { sceneId: scene.id, motion, transition, chapterStart, title: '' };
  });
}

/** A smooth, absolute-frame camera path; no accumulated zoom or duration-dependent speed. */
export function autoMotionFilter(motion: string, frames: number, width: number, height: number, strength: EditingSettings['motion']) {
  return smoothMotionFilter(strength === 'off' ? 'hold' : motion, frames, width, height, strength === 'balanced' ? 0.08 : 0.04);
}

/** Supersample the still before moving the camera. Zoompan rounds crop coordinates
 * to integers; 4x RGB sampling limits that rounding to a quarter output pixel and
 * avoids chroma-subsampling jumps. Frame-zero and the final frame share one path. */
export function smoothMotionFilter(motion: string, frames: number, width: number, height: number, travel = 0.06) {
  const ease = `(0.5-0.5*cos(PI*on/${Math.max(1, frames - 1)}))`;
  const amount = Math.min(0.12, Math.max(0, travel), frames / 30 * 0.012);
  let z = '1', x = 'iw/2-iw/zoom/2', y = 'ih/2-ih/zoom/2';
  if (motion === 'push-in' || motion === 'drift-in') z = `1+${amount}*${ease}`;
  if (motion === 'pull-out' || motion === 'drift-out') z = `1+${amount}*(1-${ease})`;
  if (motion === 'drift-in' || motion === 'drift-out') { x = '(iw-iw/zoom)*0.35'; y = '(ih-ih/zoom)*0.45'; }
  if (['pan-left', 'pan-right', 'rise', 'pan-down'].includes(motion)) {
    z = String(1 + amount);
    if (motion === 'pan-left') x = `(1-${ease})*(iw-iw/zoom)`;
    if (motion === 'pan-right') x = `${ease}*(iw-iw/zoom)`;
    if (motion === 'rise') y = `(1-${ease})*(ih-ih/zoom)`;
    if (motion === 'pan-down') y = `${ease}*(ih-ih/zoom)`;
  }
  const sampling = motion === 'hold' ? '' : `format=gbrp,scale=${width * 4}:${height * 4}:flags=lanczos,`;
  return `${sampling}zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${width}x${height}:fps=30`;
}

const assTime = (seconds: number) => {
  const value = Math.round(seconds * 100);
  return `${Math.floor(value / 360000)}:${String(Math.floor(value / 6000) % 60).padStart(2, '0')}:${String(Math.floor(value / 100) % 60).padStart(2, '0')}.${String(value % 100).padStart(2, '0')}`;
};
const safeText = (text: string) => text.replace(/[{}\\\r\n]/g, ' ').trim();
export function captionPhrases(text: string, wordsPerPhrase: number) {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  const phrases: string[] = [];
  let phrase: string[] = [];
  for (const word of words) {
    phrase.push(word);
    if (phrase.length >= wordsPerPhrase || (phrase.length >= 4 && /[.!?।]$/.test(word))) { phrases.push(phrase.join(' ')); phrase = []; }
  }
  if (phrase.length) phrases.push(phrase.join(' '));
  return phrases;
}

export function autoEditAss(narration: string, duration: number, _title: string, width: number, height: number, settings: EditingSettings, captions: boolean) {
  const size = Math.max(14, Math.round(height * 0.037));
  const margin = Math.round(width * 0.09), bottom = Math.round(height * (settings.letterbox ? 0.13 : 0.075));
  const color = settings.captionStyle === 'gold' ? '&H008CDDF5' : '&H00FFFFFF';
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Caption,Nirmala UI,${size},${color},${color},&H00141414,&H90141414,0,0,0,0,100,100,0,0,${settings.captionStyle === 'boxed' ? 3 : 1},${Math.max(1, height / 540)},0,2,${margin},${margin},${bottom},1\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  const lines: string[] = [];
  if (captions) {
    const phrases = captionPhrases(narration, settings.captionWords);
    const total = phrases.reduce((sum, phrase) => sum + phrase.length, 0);
    let cursor = 0;
    for (const phrase of phrases) {
      const end = cursor + duration * phrase.length / Math.max(1, total);
      lines.push(`Dialogue: 0,${assTime(cursor)},${assTime(end)},Caption,,0,0,0,,{\\fad(80,80)}${phrase}`);
      cursor = end;
    }
  }
  return header + lines.join('\n') + '\n';
}

export function autoAudioGraph(settings: EditingSettings, duration: number, voiceVolume: number, musicVolume: number, hasMusic: boolean, chapterTimes: number[]) {
  const chain = settings.voicePolish ? 'highpass=f=70,lowpass=f=14000,acompressor=threshold=0.125:ratio=2:attack=15:release=180:makeup=1.4,' : '';
  const parts = [`[1:a]aresample=48000,${chain}volume=${voiceVolume}[voice]`];
  let mix = 'voice';
  if (hasMusic) {
    parts.push(`[2:a]aresample=48000,atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=${musicVolume},afade=t=in:d=${Math.min(1, duration / 4)},afade=t=out:st=${Math.max(0, duration - 1.5)}:d=${Math.min(1.5, duration)}[bed]`);
    if (settings.musicDucking) {
      parts.push('[voice]asplit=2[narration][sidechain]', '[bed][sidechain]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=350:makeup=1[ducked]', '[narration][ducked]amix=inputs=2:duration=first:normalize=0[mix]');
    } else parts.push('[voice][bed]amix=inputs=2:duration=first:normalize=0[mix]');
    mix = 'mix';
  }
  if (settings.chapterSound && chapterTimes.length) {
    chapterTimes.forEach((time, index) => parts.push(`aevalsrc=0.045*sin(2*PI*180*t)*exp(-12*t):s=48000:d=0.4,afade=t=in:d=0.015,afade=t=out:st=0.2:d=0.2,adelay=${Math.round(time * 1000)}:all=1[cue${index}]`));
    parts.push(`[${mix}]${chapterTimes.map((_, index) => `[cue${index}]`).join('')}amix=inputs=${chapterTimes.length + 1}:duration=first:normalize=0[cues]`);
    mix = 'cues';
  }
  parts.push(`[${mix}]${settings.voicePolish ? 'loudnorm=I=-16:TP=-1.5:LRA=11,' : ''}aresample=48000,alimiter=limit=0.891:level=0:latency=1,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[a]`);
  return parts.join(';');
}
