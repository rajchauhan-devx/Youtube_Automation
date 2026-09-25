import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { atomicJson } from './accounts.js';
import { generatedDir, mediaUrl, workspaceKey } from './workspace.js';
import { containedFile } from './paths.js';
import { store } from './store.js';
import { generateTTS, TTS_PROVIDER_NAME } from './omnivoice.js';
import { runMedia } from './media-process.js';
import { writeNarrationMetadata } from './editing/media.js';
import { normalizeNarration, spokenText, validateScenePlan, validateSync, type ScenePlan, type NarrationSync } from './scene-plan.js';

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
  try {
    for (const scene of plan.scenes) {
      signal.throwIfAborted();
      const key = hash({ version: 2, provider: TTS_PROVIDER_NAME, options, text: scene.narration });
      const pcm = containedFile(cache, `${key}.pcm`);
      const meta = `${pcm}.json`;
      let valid = false;
      if (fs.existsSync(pcm) && fs.existsSync(meta)) {
        const bytes = fs.readFileSync(pcm);
        try { valid = JSON.parse(fs.readFileSync(meta, 'utf8')).hash === hash(bytes.toString('base64')) && bytes.length >= 3200 && bytes.length % 2 === 0; } catch { /* regenerate corrupt cache */ }
      }
      if (!valid) {
        const audio = await synthesize({ ...options, text: scene.narration });
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
      sync.totalSamples += bytes.length / 2;
      if (sync.totalSamples > 48000 * maxDurationSeconds) throw new Error(`Episode exceeds its ${maxDurationSeconds / 60}-minute maximum at scene ${scene.id}. Shorten the scene plan and generate again. No speech was cut.`);
      sync.scenes.push({ sceneId: scene.id, startSample, endSample: sync.totalSamples });
      fs.appendFileSync(raw, bytes);
      progress(sync.scenes.length);
    }
    validateSync(plan, sync);
    await runMedia('ffmpeg', ['-v', 'error', '-y', '-f', 's16le', '-ar', '48000', '-ac', '1', '-i', raw, '-c:a', 'pcm_s16le', partial], signal);
    signal.throwIfAborted();
    fs.renameSync(partial, output);
    atomicJson(`${output}.sync.json`, { ...sync, audioHash: createHash('sha256').update(fs.readFileSync(output)).digest('hex') });
    writeNarrationMetadata(output, spokenText(plan), options.language);
    return { filename, url: mediaUrl(`generate/file/${options.scriptId}/${filename}`), language: options.language, voice: options.voice, sync, narrationText: spokenText(plan) };
  } catch (error) {
    fs.rmSync(output, { force: true }); fs.rmSync(`${output}.sync.json`, { force: true });
    throw error;
  } finally { fs.rmSync(raw, { force: true }); fs.rmSync(partial, { force: true }); }
}

export function startNarration(options: VoiceOptions, synthesize = generateTTS) {
  if ([...jobs.values()].some(job => job.status === 'running')) throw new Error('A synchronized narration job is already running. Wait or cancel it first.');
  const script = store.getById<any>('scripts', options.scriptId);
  const plan = validateScenePlan(script?.scenePlan);
  if (normalizeNarration(script.narration || '') !== normalizeNarration(spokenText(plan))) throw new Error('Narration differs from the scene map. Extract the updated Long Video response first.');
  if (options.language === 'en' && /[\u0900-\u097F]/.test(spokenText(plan))) throw new Error('This scene map contains Hindi narration. Select a Hindi voice; changing voice language does not translate the script.');
  const fingerprint = planHash(plan);
  store.add('scripts', { ...script, generatedAudio: [], timelineConfig: undefined, youtubeExport: undefined });
  const controller = new AbortController();
  let finish!: () => void;
  const job: Job = { status: 'running', completed: 0, total: plan.scenes.length, controller, finished: new Promise(resolve => { finish = resolve; }) };
  jobs.set(workspaceKey(options.scriptId), job);
  void assembleNarration(plan, options, controller.signal, count => { job.completed = count; }, synthesize, script.maxDurationSeconds ?? 3600)
    .then(result => {
      controller.signal.throwIfAborted();
      const current = store.getById<any>('scripts', options.scriptId);
      if (!current || planHash(current.scenePlan) !== fingerprint || normalizeNarration(current.narration || '') !== normalizeNarration(spokenText(plan))) throw new Error('Script changed during narration generation. Extract it and try again.');
      const updated = { ...current, generatedAudio: [result], timelineConfig: undefined, youtubeExport: undefined };
      store.add('scripts', updated);
      job.result = result;
      job.status = 'done';
    })
    .catch(error => { job.status = 'error'; job.error = controller.signal.aborted ? 'Generation cancelled. Completed scenes are saved; Generate resumes them.' : error.message; })
    .finally(finish);
}
