export interface PresenterSettings {
  enabled: boolean;
  avatarId: string;
  style: 'card' | 'green-screen' | 'transparent';
  widthPercent: number;
  bottomPercent: number;
  marginPercent: number;
  crop: { x: number; y: number; width: number; height: number };
  silenceGate: boolean;
  silenceThresholdDb: number;
}

export const defaultPresenter = (): PresenterSettings => ({
  enabled: false, avatarId: 'avatar_005', style: 'card', widthPercent: 24,
  bottomPercent: 18, marginPercent: 2.5,
  crop: { x: 32, y: 2, width: 40, height: 67 },
  silenceGate: true, silenceThresholdDb: -40,
});

export function validatePresenter(value: unknown): PresenterSettings {
  const p = value as PresenterSettings;
  const range = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (!p || typeof p !== 'object' || typeof p.enabled !== 'boolean' ||
    typeof p.avatarId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(p.avatarId) ||
    !['card', 'green-screen', 'transparent'].includes(p.style) || !range(p.widthPercent, 10, 40) ||
    !range(p.bottomPercent, 0, 30) || !range(p.marginPercent, 0, 10) ||
    typeof p.silenceGate !== 'boolean' || !range(p.silenceThresholdDb, -55, -25) ||
    !p.crop || !range(p.crop.x, 0, 90) || !range(p.crop.y, 0, 90) ||
    !range(p.crop.width, 10, 100) || !range(p.crop.height, 10, 100) ||
    p.crop.x + p.crop.width > 100 || p.crop.y + p.crop.height > 100) {
    throw new Error('Invalid presenter settings. Check the crop and size.');
  }
  return { enabled: p.enabled, avatarId: p.avatarId, style: p.style, widthPercent: p.widthPercent,
    bottomPercent: p.bottomPercent, marginPercent: p.marginPercent, crop: { ...p.crop },
    silenceGate: p.silenceGate, silenceThresholdDb: p.silenceThresholdDb };
}

/** Bounded overlay geometry, shared by the editor preview and FFmpeg. */
export function presenterGeometry(p: PresenterSettings, width: number, height: number, sourceWidth: number, sourceHeight: number) {
  const aspect = sourceWidth * p.crop.width / (sourceHeight * p.crop.height);
  const w = Math.max(2, Math.floor(Math.min(width * p.widthPercent / 100, height * 0.6 * aspect) / 2) * 2);
  const h = Math.max(2, Math.floor(w / aspect / 2) * 2);
  return { width: w, height: h, right: Math.round(width * p.marginPercent / 100), bottom: Math.round(height * p.bottomPercent / 100) };
}

/** Keep captions horizontally centered, with their bottom edge above the avatar. */
export function presenterCaptionLayout(p: PresenterSettings, width: number, height: number, sourceWidth: number, sourceHeight: number) {
  const avatar = presenterGeometry(p, width, height, sourceWidth, sourceHeight);
  return { bottom: avatar.bottom + avatar.height + Math.ceil(height * 0.02), side: Math.ceil(width * 0.05) };
}

export function reservePresenterCaptionSpace(ass: string, p?: PresenterSettings,
  sourceSize = { width: 1920, height: 1080 }, outputSize?: { width: number; height: number }): string {
  if (!p?.enabled) return ass;
  const width = Number(ass.match(/PlayResX:\s*(\d+)/)?.[1] || 1920);
  const height = Number(ass.match(/PlayResY:\s*(\d+)/)?.[1] || 1080);
  const canvas = outputSize || { width, height };
  const layout = presenterCaptionLayout(p, canvas.width, canvas.height, sourceSize.width, sourceSize.height);
  const side = Math.ceil(layout.side * width / canvas.width);
  const bottom = Math.ceil(layout.bottom * height / canvas.height);
  let inStyles = false, format: string[] = [];
  return ass.split('\n').map(line => {
    if (line.startsWith('[')) inStyles = line.startsWith('[V4+ Styles]');
    if (inStyles && line.startsWith('Format:')) format = line.slice(7).split(',').map(s => s.trim());
    if (inStyles && line.startsWith('Style:')) {
      const fields = line.slice(6).trim().split(',');
      for (const [key, value] of [['MarginL', side], ['MarginR', side], ['MarginV', bottom], ['Alignment', 2]] as const) {
        const index = format.indexOf(key);
        if (index >= 0) fields[index] = String(value);
      }
      return 'Style: ' + fields.join(',');
    }
    return line;
  }).join('\n');
}
