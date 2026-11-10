import { GOOGLE_TTS_REVISION, synthesizeGoogleTts } from './google-tts.js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { atomicJson } from './accounts.js';
import { generatedDir, mediaUrl, workspaceKey, currentWorkspace } from './workspace.js';
import { containedFile } from './paths.js';
import { store } from './store.js';
import { generateTTS, resolveTtsProvider, ttsProviderName } from './omnivoice.js';
import { probeHasAudio, resolveInputPath } from './video.js';
import { runMedia } from './media-process.js';
import { writeNarrationMetadata } from './editing/media.js';
import { normalizeNarration, spokenText, syncScenePlanNarration, validateScenePlan, validateSync, type ScenePlan, type NarrationSync } from './scene-plan.js';
import {
  isConversationalScript,
  hasSpeakerDialogueTags,
  extractSpeakerName,
  resolveChannelKey,
  resolveCharacterVoice,
  getOrCreateScriptVoiceSession,
  CharacterVoiceSession,
  type DialogueTurn,
} from './conversational-tts.js';

export const planHash = (plan: ScenePlan) => createHash('sha256').update(JSON.stringify(validateScenePlan(plan))).digest('hex');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type VoiceOptions = Omit<Parameters<typeof generateTTS>[0], 'text'>;
interface Job { status: 'running' | 'done' | 'error'; completed: number; total: number; error?: string; result?: any; controller: AbortController; finished: Promise<void> }
const jobs = new Map<string, Job>();
export const narrationBusy = () => [...jobs.values()].some(job => job.status === 'running');
export function narrationStatus(id: string) {
  const job = jobs.get(workspaceKey(id));
  if (!job) return { status: 'idle', completed: 0, total: 0 };
  const { controller, finished, ...state } = job;
  return state;
}
export async function cancelNarration(id: string) {
  const key = workspaceKey(id);
  const job = jobs.get(key);
  if (job) { job.controller.abort(); await job.finished; jobs.delete(key); }
}

export function assertNarrationCurrent(script: any, audioFilename: string): NarrationSync {
  const plan = validateScenePlan(script?.scenePlan);
  const file = containedFile(generatedDir(), script.id, `${audioFilename}.sync.json`);
  if (!fs.existsSync(file)) throw new Error('Generate synchronized narration in Audio Generation first.');
  const sync = JSON.parse(fs.readFileSync(file, 'utf8')) as NarrationSync & { audioHash: string };
  if (sync.timingMode !== 'narration') throw new Error('Regenerate narration to replace the old fixed-duration timing with speech-aligned scenes.');
  validateSync(plan, sync);
  if (sync.planHash !== planHash(plan) || normalizeNarration(script.narration || '') !== normalizeNarration(spokenText(plan))) throw new Error('The scene plan or narration changed. Regenerate synchronized narration.');
  const audio = containedFile(generatedDir(), script.id, audioFilename);
  if (!fs.existsSync(audio) || createHash('sha256').update(fs.readFileSync(audio)).digest('hex') !== sync.audioHash) throw new Error('The narration audio changed. Regenerate synchronized narration.');
  return sync;
}

// One normalized PCM segment per scene. Integer sample offsets survive chapter joins exactly.
export async function assembleNarration(plan: ScenePlan, options: VoiceOptions, signal: AbortSignal,
  progress: (completed: number) => void, synthesize = generateTTS, maxDurationSeconds = 3600) {
  validateScenePlan(plan);
  if (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0 || maxDurationSeconds > 3600) throw new Error('Invalid episode duration limit.');
  const dir = containedFile(generatedDir(), options.scriptId);
  fs.mkdirSync(dir, { recursive: true });
  const cache = containedFile(dir, 'scene-audio-cache');
  fs.mkdirSync(cache, { recursive: true });
  const runId = randomUUID();
  const raw = containedFile(dir, `joined-${runId}.pcm`);
  const filename = `narration_${options.language}_${runId}.wav`;
  const output = containedFile(dir, filename);
  const partial = containedFile(dir, `narration-${runId}.partial.wav`);
  const sync: NarrationSync = { version: 1, timingMode: 'narration', planHash: planHash(plan), sampleRate: 48000, totalSamples: 0, scenes: [] };
  fs.writeFileSync(raw, Buffer.alloc(0));

  const script = store.getById<any>('scripts', options.scriptId);
  const isConv = isConversationalScript(script) || options.conversational === true;
  const channelKey = resolveChannelKey(currentWorkspace().accountId);
  const allTurns: DialogueTurn[] = [];
  const voiceSession = getOrCreateScriptVoiceSession(options.scriptId, {
    language: options.language,
    channelKey,
    defaultVoice: options.voice,
  });

  try {
    for (let i = 0; i < plan.scenes.length; i++) {
      const scene = plan.scenes[i];
      signal.throwIfAborted();
      const sceneSpeaker = scene.speaker || (scene.narration ? extractSpeakerName(scene.narration) : undefined);
      let sceneText = scene.narration;
      if (isConv && sceneSpeaker && !hasSpeakerDialogueTags(sceneText)) {
        sceneText = `[${sceneSpeaker}]: ${sceneText}`;
      }

      const cast = isConv ? voiceSession.getVoice(sceneSpeaker || "Narrator") : undefined;
      const provider = resolveTtsProvider(options.provider);

      if (provider === 'flow') {
        let videoFile = null;
        const imgItem = script?.generatedImages?.find((img: any) => img.index === i);
        if (imgItem?.url) {
          try {
            const resolved = resolveInputPath(imgItem.url, options.scriptId);
            if (fs.existsSync(resolved) && (await probeHasAudio(resolved))) {
              videoFile = resolved;
            }
          } catch {}
        }
        if (!videoFile && fs.existsSync(dir)) {
          const candidates = fs.readdirSync(dir).filter(f => (f.startsWith(`import_${i}_`) || f.startsWith(`scene-${i}.`)) && f.endsWith('.mp4'));
          for (const cand of candidates) {
            const resolved = path.join(dir, cand);
            if (await probeHasAudio(resolved)) {
              videoFile = resolved;
              break;
            }
          }
        }
        const tempPcm = containedFile(cache, `flow-scene-${i}-${runId}.pcm`);
        if (!videoFile) {
          // Graceful Self-Healing Fallback: If Flow video is missing (e.g. credit exhaustion or Flow error),
          // synthesize speech with Google Chirp 3 HD character voice and create an animated clip from the scene keyframe
          try {
            const rawSpoken = sceneText.replace(/^\s*\[[^\]]+\]\s*[:—–-]?\s*/, '').replace(/^[\"'\s]+|[\"'\s]+$/g, '').trim();
            const charCast = isConv ? voiceSession.getVoice(sceneSpeaker || 'Character') : undefined;
            const ttsAudio = await synthesizeGoogleTts(rawSpoken, charCast?.voiceId || 'hi-IN-Chirp3-HD-Fenrir', options.language as 'en' | 'hi', charCast?.speed || 1.0);
            const tempWav = containedFile(cache, `flow-fallback-${i}-${runId}.wav`);
            fs.writeFileSync(tempWav, ttsAudio);

            let imageSource: string | null = null;
            if (imgItem?.url) {
              const resImg = resolveInputPath(imgItem.url, options.scriptId);
              if (fs.existsSync(resImg) && (resImg.endsWith('.png') || resImg.endsWith('.jpg'))) imageSource = resImg;
            }
            if (!imageSource && fs.existsSync(dir)) {
              const imgCand = fs.readdirSync(dir).find(f => (f.startsWith(`image-${String(i).padStart(2, '0')}-`) || f.startsWith(`image-${i}-`)) && (f.endsWith('.png') || f.endsWith('.jpg')));
              if (imgCand) imageSource = path.join(dir, imgCand);
            }

            if (imageSource) {
              const fallbackMp4 = containedFile(dir, `import_${i}_auto_fallback_${runId.slice(0, 8)}.mp4`);
              await runMedia('ffmpeg', [
                '-v', 'error', '-y',
                '-loop', '1', '-i', imageSource,
                '-i', tempWav,
                '-filter_complex', '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p[v];[1:a]apad=whole_dur=7.93,volume=1.0[a]',
                '-map', '[v]', '-map', '[a]',
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
                '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
                '-t', '7.93', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                fallbackMp4
              ], signal);
              fs.rmSync(tempWav, { force: true });
              if (fs.existsSync(fallbackMp4) && (await probeHasAudio(fallbackMp4))) {
                videoFile = fallbackMp4;
              }
            } else {
              await runMedia('ffmpeg', ['-v', 'error', '-y', '-i', tempWav, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 's16le', tempPcm], signal);
              fs.rmSync(tempWav, { force: true });
            }
          } catch (fallbackErr) {
            console.warn(`[Flow Audio] Auto fallback for scene ${i + 1} failed:`, fallbackErr);
          }
        }
        if (!videoFile && !fs.existsSync(tempPcm)) {
          throw new Error(`Scene ${i + 1} (${scene.id}) has no Google Flow video clip with audio. Generate or import your Google Flow video clips in the Media tab first.`);
        }

        try {
          signal.throwIfAborted();
          if (videoFile) {
            await runMedia('ffmpeg', ['-v', 'error', '-y', '-i', videoFile, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 's16le', tempPcm], signal);
          }
          let bytes = fs.readFileSync(tempPcm);
          if (bytes.length < 3200 || bytes.length % 2 !== 0) {
            throw new Error(`Scene ${scene.id} video audio is too short or invalid.`);
          }
          if (i === plan.scenes.length - 1) {
            // Append a 1.0s clean silent tail buffer to the final scene
            // so concluding words reverberate cleanly and are never cut off prematurely
            const tailSamples = Math.round(48000 * 1.0);
            const tailBuffer = Buffer.alloc(tailSamples * 2);
            bytes = Buffer.concat([bytes, tailBuffer]);
          }
          const startSample = sync.totalSamples;
          const sceneSamples = bytes.length / 2;
          sync.totalSamples += sceneSamples;
          sync.scenes.push({ sceneId: scene.id, startSample, endSample: sync.totalSamples });
          fs.appendFileSync(raw, bytes);

          const startSec = startSample / 48000;
          const durationSec = sceneSamples / 48000;
          const effectiveSpeaker = sceneSpeaker || 'Character';
          allTurns.push({
            speaker: effectiveSpeaker,
            text: sceneText.replace(/^\s*\[[^\]]+\]\s*[:—–-]\s*/, '').trim(),
            voiceId: 'flow-native',
            speed: 1.0,
            startSec,
            endSec: startSec + durationSec,
            durationSec,
          });
        } finally {
          fs.rmSync(tempPcm, { force: true });
        }
        progress(sync.scenes.length);
        continue;
      }
      const key = hash({ version: 4, provider: ttsProviderName(provider),
        voiceId: cast?.voiceId,
        synthesis: provider === 'google' ? GOOGLE_TTS_REVISION : undefined,
        options, text: sceneText, speaker: sceneSpeaker, conversational: isConv });
      const pcm = containedFile(cache, `${key}.pcm`);
      const meta = `${pcm}.json`;
      let valid = false;
      if (fs.existsSync(pcm) && fs.existsSync(meta)) {
        const bytes = fs.readFileSync(pcm);
        try { valid = JSON.parse(fs.readFileSync(meta, 'utf8')).hash === hash(bytes.toString('base64')) && bytes.length >= 3200 && bytes.length % 2 === 0; } catch { /* regenerate corrupt cache */ }
      }
      if (!valid) {
        const audio = await synthesize({
          ...options,
          text: sceneText,
          conversational: isConv,
          speaker: sceneSpeaker,
          scriptId: options.scriptId,
        });
        const source = containedFile(dir, audio.filename);
        const temp = `${pcm}.partial`;
        try {
          signal.throwIfAborted();
          await runMedia('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 's16le', temp], signal);
          const bytes = fs.readFileSync(temp);
          if (bytes.length < 3200 || bytes.length % 2) throw new Error(`Scene ${scene.id} produced empty or invalid audio.`);
          fs.renameSync(temp, pcm);
          atomicJson(meta, { hash: hash(bytes.toString('base64')) });
        } finally { fs.rmSync(temp, { force: true }); fs.rmSync(source, { force: true }); }
      }
      signal.throwIfAborted();
      // Planned durations describe source assets, never the length of spoken audio.
      const bytes = fs.readFileSync(pcm);
      const startSample = sync.totalSamples;
      // Natural 350ms acoustic breath pause between scene narration cuts
      const pauseSamples = Math.round(48000 * 0.35);
      const pauseBuffer = Buffer.alloc(pauseSamples * 2);
      const sceneSamples = (bytes.length / 2) + pauseSamples;
      sync.totalSamples += sceneSamples;
      if (sync.totalSamples > 48000 * maxDurationSeconds) throw new Error(`Episode exceeds its ${maxDurationSeconds / 60}-minute maximum at scene ${scene.id}. Shorten the scene plan and generate again. No speech was cut.`);
      sync.scenes.push({ sceneId: scene.id, startSample, endSample: sync.totalSamples });
      fs.appendFileSync(raw, Buffer.concat([bytes, pauseBuffer]));

      if (isConv) {
        const startSec = startSample / 48000;
        const durationSec = (bytes.length / 2) / 48000;
        const effectiveSpeaker = sceneSpeaker || 'Narrator';
        const cast = voiceSession.getVoice(effectiveSpeaker);
        allTurns.push({
          speaker: effectiveSpeaker,
          text: sceneText.replace(/^\s*\[[^\]]+\]\s*[:—–-]\s*/, '').trim(),
          voiceId: cast.voiceId,
          speed: cast.speed,
          startSec,
          endSec: startSec + durationSec,
          durationSec,
        });
      }

      progress(sync.scenes.length);
    }
    validateSync(plan, sync);
    // Broadcast mastering so joined scenes match ElevenLabs loudness: even
    // level, gentle glue, no clipping. Previously raw PCM was muxed as-is so
    // quiet clones stayed quiet and hot clones clipped.
    await runMedia('ffmpeg', ['-v', 'error', '-y', '-f', 's16le', '-ar', '48000', '-ac', '1', '-i', raw, '-af', 'highpass=f=70,lowpass=f=14000,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.891', '-ar', '48000', '-c:a', 'pcm_s16le', partial], signal);
    signal.throwIfAborted();
    fs.renameSync(partial, output);
    atomicJson(`${output}.sync.json`, { ...sync, audioHash: createHash('sha256').update(fs.readFileSync(output)).digest('hex') });
    if (isConv && allTurns.length > 0) {
      atomicJson(output.replace(/\.wav$/i, '.turns.json'), { turns: allTurns, durationSec: sync.totalSamples / 48000 });
    }
    writeNarrationMetadata(output, spokenText(plan), options.language);
    return {
      filename,
      url: mediaUrl(`generate/file/${options.scriptId}/${filename}`),
      language: options.language,
      voice: options.voice,
      provider: resolveTtsProvider(options.provider),
      sync,
      narrationText: spokenText(plan),
      turns: isConv ? allTurns : undefined,
    };
  } catch (error) {
    fs.rmSync(output, { force: true }); fs.rmSync(`${output}.sync.json`, { force: true });
    throw error;
  } finally { fs.rmSync(raw, { force: true }); fs.rmSync(partial, { force: true }); }
}

export function startNarration(options: VoiceOptions, synthesize = generateTTS) {
  if ([...jobs.values()].some(job => job.status === 'running')) throw new Error('A synchronized narration job is already running. Wait or cancel it first.');
  const script = store.getById<any>('scripts', options.scriptId);
  let plan = validateScenePlan(script?.scenePlan);
  if (script?.narration && normalizeNarration(script.narration) !== normalizeNarration(spokenText(plan))) {
    plan = validateScenePlan(syncScenePlanNarration(plan, script.narration));
  }
  if (options.language === 'en' && /[\u0900-\u097F]/.test(spokenText(plan))) throw new Error('This scene map contains Hindi narration. Select a Hindi voice; changing voice language does not translate the script.');
  const fingerprint = planHash(plan);
  const syncedNarration = spokenText(plan);
  store.add('scripts', { ...script, scenePlan: plan, narration: syncedNarration, extractedScript: syncedNarration, generatedAudio: [], timelineConfig: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined });
  const controller = new AbortController();
  let finish!: () => void;
  const job: Job = { status: 'running', completed: 0, total: plan.scenes.length, controller, finished: new Promise(resolve => { finish = resolve; }) };
  jobs.set(workspaceKey(options.scriptId), job);
  void assembleNarration(plan, options, controller.signal, count => { job.completed = count; }, synthesize, script.maxDurationSeconds ?? 3600)
    .then(result => {
      controller.signal.throwIfAborted();
      const current = store.getById<any>('scripts', options.scriptId);
      if (!current || planHash(current.scenePlan) !== fingerprint || normalizeNarration(current.narration || '') !== normalizeNarration(spokenText(plan))) throw new Error('Script changed during narration generation. Extract it and try again.');
      const updated = { ...current, generatedAudio: [result], timelineConfig: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined };
      store.add('scripts', updated);
      job.result = result;
      job.status = 'done';
    })
    .catch(error => { job.status = 'error'; job.error = controller.signal.aborted ? 'Generation cancelled. Completed scenes are saved; Generate resumes them.' : error.message; })
    .finally(finish);
}
