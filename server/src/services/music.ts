import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MUSIC_DIR = path.join(__dirname, '..', '..', 'assets', 'music');

if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

export interface MusicTrack {
  id: string;
  name: string;
  mood: string;
  path: string;
  duration?: number;
}

const DEFAULT_TRACKS: { id: string; name: string; mood: string; synthExpr: string }[] = [
  {
    id: 'cinematic-pulse',
    name: 'Cinematic Ambient Pulse',
    mood: 'cinematic',
    synthExpr: 'sin(2*PI*65*t)*0.15+sin(2*PI*130*t)*0.1+sin(2*PI*195*t)*0.06',
  },
  {
    id: 'epic-drive',
    name: 'Epic Motivation Bed',
    mood: 'epic',
    synthExpr: 'sin(2*PI*82*t)*0.15+sin(2*PI*164*t)*0.12+sin(2*PI*246*t)*0.08',
  },
  {
    id: 'lofi-chill',
    name: 'Lo-Fi Chill Vibe',
    mood: 'calm',
    synthExpr: 'sin(2*PI*110*t)*0.12+sin(2*PI*146*t)*0.08+sin(2*PI*220*t)*0.06',
  },
  {
    id: 'upbeat-groove',
    name: 'Upbeat Energy Pulse',
    mood: 'upbeat',
    synthExpr: 'sin(2*PI*130*t)*0.15+sin(2*PI*195*t)*0.1+sin(2*PI*260*t)*0.08',
  },
];

export async function ensureDefaultMusicTracks(): Promise<void> {
  for (const track of DEFAULT_TRACKS) {
    const filePath = path.join(MUSIC_DIR, `${track.id}.mp3`);
    if (!fs.existsSync(filePath)) {
      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('ffmpeg', [
            '-f', 'lavfi',
            '-i', `aevalsrc=${track.synthExpr}:s=44100`,
            '-t', '45',
            '-c:a', 'libmp3lame',
            '-b:a', '128k',
            '-y',
            filePath,
          ]);
          proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Failed to generate default music: code ${code}`));
          });
          proc.on('error', reject);
        });
      } catch (err) {
        console.warn(`Could not generate synthetic track ${track.id}:`, err);
      }
    }
  }
}

export function listMusicTracks(): MusicTrack[] {
  if (!fs.existsSync(MUSIC_DIR)) return [];

  const files = fs.readdirSync(MUSIC_DIR).filter((f) => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.m4a'));
  const tracks: MusicTrack[] = [];

  for (const file of files) {
    const ext = path.extname(file);
    const id = path.basename(file, ext);
    const matched = DEFAULT_TRACKS.find((t) => t.id === id);

    tracks.push({
      id,
      name: matched ? matched.name : id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      mood: matched ? matched.mood : 'neutral',
      path: path.join(MUSIC_DIR, file),
    });
  }

  return tracks;
}

export function resolveMusicTrack(moodOrId?: string): string | null {
  const tracks = listMusicTracks();
  if (tracks.length === 0) return null;

  if (!moodOrId || moodOrId === 'auto' || moodOrId === 'none') {
    return null;
  }

  // 1. Direct ID match
  const byId = tracks.find((t) => t.id.toLowerCase() === moodOrId.toLowerCase());
  if (byId) return byId.path;

  // 2. Mood match
  const byMood = tracks.find((t) => t.mood.toLowerCase() === moodOrId.toLowerCase());
  if (byMood) return byMood.path;

  // 3. Fallback to first available track
  return tracks[0].path;
}
