import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SFX_DIR = path.join(__dirname, '..', '..', 'assets', 'sfx');

if (!fs.existsSync(SFX_DIR)) {
  fs.mkdirSync(SFX_DIR, { recursive: true });
}

interface SfxDefinition {
  filename: string;
  args: string[];
}

const SFX_REGISTRY: Record<string, SfxDefinition> = {
  whoosh: {
    filename: 'whoosh.mp3',
    args: [
      '-f', 'lavfi',
      '-i', 'aevalsrc=random(0)*0.4:s=44100',
      '-t', '0.5',
      '-af', 'highpass=f=200,lowpass=f=3000,volume=3.0,afade=t=in:ss=0:d=0.2,afade=t=out:st=0.3:d=0.2',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-y',
    ],
  },
  sub_impact: {
    filename: 'sub_impact.mp3',
    args: [
      '-f', 'lavfi',
      '-i', 'aevalsrc=sin(2*PI*55*exp(-2.5*t)*t)*0.7+sin(2*PI*110*exp(-4*t)*t)*0.35:s=44100',
      '-t', '0.85',
      '-af', 'volume=2.5,afade=t=out:st=0.3:d=0.55',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-y',
    ],
  },
  impact: {
    filename: 'impact.mp3',
    args: [
      '-f', 'lavfi',
      '-i', 'aevalsrc=sin(2*PI*60*exp(-2.5*t)*t)*0.6+sin(2*PI*120*exp(-4*t)*t)*0.3:s=44100',
      '-t', '1.2',
      '-af', 'volume=2.5,afade=t=out:st=0.4:d=0.8',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-y',
    ],
  },
  paper_slide: {
    filename: 'paper_slide.mp3',
    args: [
      '-f', 'lavfi',
      '-i', 'aevalsrc=random(0)*0.5:s=44100',
      '-t', '0.35',
      '-af', 'highpass=f=400,lowpass=f=3500,volume=2.5,afade=t=in:ss=0:d=0.06,afade=t=out:st=0.18:d=0.17',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-y',
    ],
  },
  shutter_click: {
    filename: 'shutter_click.mp3',
    args: [
      '-f', 'lavfi',
      '-i', 'aevalsrc=(exp(-120*t)*sin(2*PI*2400*t)+if(gt(t\\,0.06)\\,exp(-100*(t-0.06))*sin(2*PI*1200*t)\\,0))*0.8:s=44100',
      '-t', '0.22',
      '-af', 'volume=2.2,afade=t=out:st=0.14:d=0.08',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-y',
    ],
  },
  hud_ping: {
    filename: 'hud_ping.mp3',
    args: [
      '-f', 'lavfi',
      '-i', 'aevalsrc=(sin(2*PI*987*t)+0.5*sin(2*PI*1974*t))*exp(-7*t)*0.7:s=44100',
      '-t', '0.45',
      '-af', 'volume=2.0,afade=t=out:st=0.25:d=0.2',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-y',
    ],
  },
  telemetry_ticker: {
    filename: 'telemetry_ticker.mp3',
    args: [
      '-f', 'lavfi',
      '-i', 'aevalsrc=sin(2*PI*1500*t)*exp(-50*mod(t\\,0.04))*0.7:s=44100',
      '-t', '0.55',
      '-af', 'volume=2.2,afade=t=out:st=0.4:d=0.15',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-y',
    ],
  },
  teletype_chatter: {
    filename: 'teletype_chatter.mp3',
    args: [
      '-f', 'lavfi',
      '-i', 'aevalsrc=(random(0)*0.35+sin(2*PI*880*t)*0.3)*exp(-40*mod(t\\,0.05)):s=44100',
      '-t', '0.55',
      '-af', 'highpass=f=500,volume=2.5,afade=t=out:st=0.4:d=0.15',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-y',
    ],
  },
};

export async function ensureDefaultSfx(): Promise<void> {
  for (const [key, def] of Object.entries(SFX_REGISTRY)) {
    const filePath = path.join(SFX_DIR, def.filename);
    if (!fs.existsSync(filePath)) {
      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('ffmpeg', [...def.args, filePath]);
          proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`SFX ${key} gen exit ${code}`))));
          proc.on('error', reject);
        });
      } catch (e) {
        console.warn(`Failed to generate SFX "${key}":`, e);
      }
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

/**
 * Resolves the appropriate sound effect file path for a given motion graphic kind.
 */
export function resolveSfxForGraphicKind(kind?: string, title?: string, detail?: string): string | null {
  if (!kind || kind === 'caption') return null;

  if (kind === 'counter') {
    const p = path.join(SFX_DIR, 'telemetry_ticker.mp3');
    return fs.existsSync(p) ? p : null;
  }

  if (kind === 'badge' || kind === 'lower-third') {
    const p = path.join(SFX_DIR, 'shutter_click.mp3');
    return fs.existsSync(p) ? p : null;
  }

  if (kind === 'frame' || kind === 'diagram') {
    if (/radio|recording|voice|air traffic|call|transcript|monitor|teletype/i.test(detail || title || '')) {
      const p = path.join(SFX_DIR, 'teletype_chatter.mp3');
      return fs.existsSync(p) ? p : null;
    }
    const p = path.join(SFX_DIR, 'paper_slide.mp3');
    return fs.existsSync(p) ? p : null;
  }

  if (kind === 'spotlight' || kind === 'route') {
    const p = path.join(SFX_DIR, 'hud_ping.mp3');
    return fs.existsSync(p) ? p : null;
  }

  if (kind === 'title') {
    const p = path.join(SFX_DIR, 'sub_impact.mp3');
    if (fs.existsSync(p)) return p;
    const fallback = path.join(SFX_DIR, 'impact.mp3');
    return fs.existsSync(fallback) ? fallback : null;
  }

  return null;
}
