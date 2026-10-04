import type { Matrix } from './math.js';

export interface LegacyCamera {
  startFrame: number;
  frames: number;
  framing: 'contain' | 'cover';
  motion: string;
  travel: number;
}

export function legacyMotion(effect: string, zoomFactor: number) {
  const aliases: Record<string, string> = {
    'zoom-in': 'push-in', 'slow-zoom-in': 'push-in', 'crash-zoom': 'push-in',
    'zoom-out': 'pull-out', 'slow-zoom-out': 'pull-out', 'drift-left': 'pan-left',
    'drift-right': 'pan-right', 'pan-up': 'rise', 'ken-burns-in': 'drift-in', 'ken-burns-out': 'drift-out',
  };
  return {
    motion: aliases[effect] || (['hold', 'pan-left', 'pan-right', 'pan-down'].includes(effect) ? effect : 'push-in'),
    travel: effect.startsWith('slow-') ? 0.04 : Math.min(0.08, Math.max(0, zoomFactor - 1)),
  };
}

const amountFor = (frames: number, travel: number) => Math.min(0.12, Math.max(0, travel), frames / 30 * 0.012);
const zoomMotions = ['push-in', 'pull-out', 'drift-in', 'drift-out'];
const panMotions = ['pan-left', 'pan-right', 'rise', 'pan-down'];

/** The same path drives FFmpeg footage and the source anchors on its graphics layer. */
export function smoothMotionFilter(motion: string, frames: number, width: number, height: number, travel = 0.06) {
  const ease = `(0.5-0.5*cos(PI*on/${Math.max(1, frames - 1)}))`;
  const amount = amountFor(frames, travel);
  let z = '1', x = 'iw/2-iw/zoom/2', y = 'ih/2-ih/zoom/2';
  if (motion === 'push-in' || motion === 'drift-in') z = `1+${amount}*${ease}`;
  if (motion === 'pull-out' || motion === 'drift-out') z = `1+${amount}*(1-${ease})`;
  if (motion === 'drift-in' || motion === 'drift-out') { x = '(iw-iw/zoom)*0.35'; y = '(ih-ih/zoom)*0.45'; }
  if (panMotions.includes(motion)) {
    z = String(1 + amount);
    if (motion === 'pan-left') x = `(1-${ease})*(iw-iw/zoom)`;
    if (motion === 'pan-right') x = `${ease}*(iw-iw/zoom)`;
    if (motion === 'rise') y = `(1-${ease})*(ih-ih/zoom)`;
    if (motion === 'pan-down') y = `${ease}*(ih-ih/zoom)`;
  }
  const sampling = motion === 'hold' ? '' : `format=gbrp,scale=${width * 4}:${height * 4}:flags=lanczos,`;
  return `${sampling}zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${width}x${height}:fps=30`;
}

export function legacySourceMatrix(camera: LegacyCamera, seconds: number, output: { width: number; height: number }, source: { width: number; height: number }): Matrix {
  const on = Math.max(0, Math.min(camera.frames - 1, Math.floor(seconds * 30 + 1e-6) - camera.startFrame));
  const ease = 0.5 - 0.5 * Math.cos(Math.PI * on / Math.max(1, camera.frames - 1));
  const amount = amountFor(camera.frames, camera.travel), motion = camera.motion;
  const zoom = zoomMotions.includes(motion) ? 1 + amount * (motion.endsWith('out') ? 1 - ease : ease) : panMotions.includes(motion) ? 1 + amount : 1;
  let x = 0.5, y = 0.5;
  if (motion === 'drift-in' || motion === 'drift-out') { x = 0.35; y = 0.45; }
  if (motion === 'pan-left') x = 1 - ease;
  if (motion === 'pan-right') x = ease;
  if (motion === 'rise') y = 1 - ease;
  if (motion === 'pan-down') y = ease;
  const fit = (camera.framing === 'cover' ? Math.max : Math.min)(output.width / source.width, output.height / source.height);
  const scale = fit * zoom;
  return [scale, 0, 0, scale,
    (output.width - source.width * fit) / 2 * zoom - (output.width * zoom - output.width) * x,
    (output.height - source.height * fit) / 2 * zoom - (output.height * zoom - output.height) * y];
}
