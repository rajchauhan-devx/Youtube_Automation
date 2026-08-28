import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SFX_DIR = path.join(__dirname, '..', '..', 'assets', 'sfx');

if (!fs.existsSync(SFX_DIR)) {
  fs.mkdirSync(SFX_DIR, { recursive: true });
}

export async function ensureDefaultSfx(): Promise<void> {
  const whooshPath = path.join(SFX_DIR, 'whoosh.mp3');
  const impactPath = path.join(SFX_DIR, 'impact.mp3');

  // Generate synthetic whoosh if missing (0.5s dynamic bandpass white noise sweep)
  if (!fs.existsSync(whooshPath)) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', [
          '-f', 'lavfi',
          '-i', 'aevalsrc=random(0)*0.4:s=44100',
          '-t', '0.5',
          '-af', 'highpass=f=200,lowpass=f=3000,volume=3.0,afade=t=in:ss=0:d=0.2,afade=t=out:st=0.3:d=0.2',
          '-c:a', 'libmp3lame',
          '-b:a', '128k',
          '-y',
          whooshPath,
        ]);
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Whoosh SFX gen exit ${code}`))));
        proc.on('error', reject);
      });
    } catch (e) {
      console.warn('Failed to generate whoosh SFX:', e);
    }
  }

  // Generate synthetic impact if missing (1.2s sub-bass boom)
  if (!fs.existsSync(impactPath)) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', [
          '-f', 'lavfi',
          '-i', 'aevalsrc=sin(2*PI*60*exp(-2.5*t)*t)*0.6+sin(2*PI*120*exp(-4*t)*t)*0.3:s=44100',
          '-t', '1.2',
          '-af', 'volume=2.5,afade=t=out:st=0.4:d=0.8',
          '-c:a', 'libmp3lame',
          '-b:a', '128k',
          '-y',
          impactPath,
        ]);
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Impact SFX gen exit ${code}`))));
        proc.on('error', reject);
      });
    } catch (e) {
      console.warn('Failed to generate impact SFX:', e);
    }
  }
}

export function getWhooshSfxPath(): string | null {
  const p = path.join(SFX_DIR, 'whoosh.mp3');
  return fs.existsSync(p) ? p : null;
}

export function getImpactSfxPath(): string | null {
  const p = path.join(SFX_DIR, 'impact.mp3');
  return fs.existsSync(p) ? p : null;
}
