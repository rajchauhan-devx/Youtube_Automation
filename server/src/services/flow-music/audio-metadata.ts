import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { formatGeminiModel, geminiRequestTarget, getGeminiApiKey } from '../gemini.js';

export interface AudioMetadataResult {
  lyrics?: string;
  title?: string;
  artist?: string;
  duration?: number;
}

/**
 * Extracts embedded ID3 / container metadata tags (lyrics, title, artist, duration)
 * from an audio file using ffprobe.
 */
export async function extractAudioMetadata(audioPath: string): Promise<AudioMetadataResult> {
  if (!audioPath || !fs.existsSync(audioPath)) {
    return {};
  }

  return new Promise<AudioMetadataResult>((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      audioPath,
    ]);

    let stdout = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0 || !stdout) {
        return resolve({});
      }
      try {
        const parsed = JSON.parse(stdout);
        const tags = parsed?.format?.tags || {};
        const lyrics =
          tags.lyrics ||
          tags.LYRICS ||
          tags.Lyrics ||
          tags['USLT'] ||
          tags['unsyncedlyrics'] ||
          tags.comment ||
          undefined;
        const title = tags.title || tags.TITLE || tags.Title || undefined;
        const artist = tags.artist || tags.ARTIST || tags.Artist || undefined;
        const duration = Number(parsed?.format?.duration) || undefined;

        resolve({
          lyrics: lyrics ? String(lyrics).trim() : undefined,
          title: title ? String(title).trim() : undefined,
          artist: artist ? String(artist).trim() : undefined,
          duration,
        });
      } catch {
        resolve({});
      }
    });

    proc.on('error', () => {
      resolve({});
    });
  });
}

export async function extractAudioId3Lyrics(audioPath: string): Promise<string> {
  const meta = await extractAudioMetadata(audioPath);
  return meta.lyrics || '';
}

/**
 * Helper to get the MIME type for Gemini audio payloads.
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a' || ext === '.aac') return 'audio/mp4';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.flac') return 'audio/flac';
  return 'audio/mpeg';
}

/**
 * If no lyrics were provided or found in ID3 tags, transcribes the sung and spoken
 * lyrics directly from the audio using Gemini Flash so that subtitles and scenes
 * match the actual vocals verbatim.
 */
export async function transcribeAudioLyricsWithGemini(audioPath: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey || !fs.existsSync(audioPath)) {
    return '';
  }

  const stat = fs.statSync(audioPath);
  let sendPath = audioPath;
  let tempDownsampled: string | null = null;

  if (stat.size > 16 * 1024 * 1024) {
    tempDownsampled = path.join(
      os.tmpdir(),
      `transcribe_downsample_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`
    );
    await new Promise<void>((resolve) => {
      const proc = spawn('ffmpeg', [
        '-y', '-v', 'error',
        '-i', audioPath,
        '-ar', '16000',
        '-ac', '1',
        '-b:a', '64k',
        tempDownsampled!,
      ]);
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
    if (fs.existsSync(tempDownsampled) && fs.statSync(tempDownsampled).size > 1024) {
      sendPath = tempDownsampled;
    }
  }

  try {
    const model = formatGeminiModel('gemini-flash-latest');
    const target = await geminiRequestTarget(model, 'generateContent', apiKey);
    const audioBase64 = fs.readFileSync(sendPath).toString('base64');

    const prompt =
      'Listen carefully to this entire audio track and transcribe ALL spoken and sung lyrics verbatim from beginning to end in the original language and script (e.g., Devanagari Hindi for bhajans/stotrams, English for western songs). Preserve verse structure with line breaks. Do not add commentary or timestamps; return ONLY the clean lyrics text.';

    const res = await fetch(target.url, {
      method: 'POST',
      headers: target.headers,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: getMimeType(sendPath), data: audioBase64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      return '';
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidate && typeof candidate === 'string') {
      return candidate.trim();
    }
    return '';
  } catch (err) {
    console.warn('[Audio Transcription] Gemini transcription failed:', err);
    return '';
  } finally {
    if (tempDownsampled && fs.existsSync(tempDownsampled)) {
      try {
        fs.unlinkSync(tempDownsampled);
      } catch {}
    }
  }
}
