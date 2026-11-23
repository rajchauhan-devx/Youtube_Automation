import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMedia } from './media-process.js';

export const VOICE_CLEANUP_FILTER = 'highpass=f=80,agate=threshold=0.015:ratio=2:range=0.05,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000';

/**
 * Applies broadcast audio cleanup to raw TTS voice output:
 * 1. highpass=f=80: removes low-end mic rumble and sub-bass thumps.
 * 2. agate: gentle noise gate to suppress harsh breathing/gasping sounds between clauses.
 * 3. loudnorm=I=-14:TP=-1.5:LRA=11: standardizes YouTube integrated loudness (-14 LUFS) with true peak protection (-1.5 dBTP).
 * 4. aresample=48000: standardizes high-fidelity sample rate for video compositing.
 */
export async function cleanVoiceAudioFile(inputPath: string, outputPath: string, signal?: AbortSignal): Promise<void> {
  const tmpOutput = `${outputPath}.tmp.wav`;
  try {
    await runMedia('ffmpeg', [
      '-v', 'error',
      '-y',
      '-i', inputPath,
      '-af', VOICE_CLEANUP_FILTER,
      '-ar', '48000',
      '-c:a', 'pcm_s16le',
      tmpOutput,
    ], signal);

    if (fs.existsSync(tmpOutput) && fs.statSync(tmpOutput).size > 1000) {
      fs.renameSync(tmpOutput, outputPath);
    } else {
      // Fallback: copy original if filter produced empty file
      fs.copyFileSync(inputPath, outputPath);
    }
  } finally {
    if (fs.existsSync(tmpOutput)) {
      try { fs.rmSync(tmpOutput, { force: true }); } catch {}
    }
  }
}

export async function cleanVoiceAudioBuffer(inputBuffer: Buffer, ext: 'wav' | 'mp3' = 'wav', signal?: AbortSignal): Promise<Buffer> {
  if (!inputBuffer || inputBuffer.length < 500) return inputBuffer;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-cleanup-'));
  const inFile = path.join(tmpDir, `raw.${ext}`);
  const outFile = path.join(tmpDir, `cleaned.${ext}`);

  try {
    fs.writeFileSync(inFile, inputBuffer);
    const audioCodec = ext === 'mp3' ? 'libmp3lame' : 'pcm_s16le';
    const extraArgs = ext === 'mp3' ? ['-b:a', '192k'] : [];

    await runMedia('ffmpeg', [
      '-v', 'error',
      '-y',
      '-i', inFile,
      '-af', VOICE_CLEANUP_FILTER,
      '-ar', '48000',
      '-c:a', audioCodec,
      ...extraArgs,
      outFile,
    ], signal);

    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 500) {
      return fs.readFileSync(outFile);
    }
    return inputBuffer;
  } catch (err) {
    console.warn('[Voice Cleanup] FFmpeg audio cleanup warning, using raw audio:', err);
    return inputBuffer;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
