import type { CustomElementSpec } from '@tubeflow/editing-contracts';

/** Stateless evaluation makes seeking, preview and export identical. */
export function customValue(element: CustomElementSpec, property: string, progress: number, fallback: number) {
  const track = element.tracks.find(t => t.property === property);
  if (!track) return fallback;
  const keys = track.keyframes;
  if (progress <= keys[0].at) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    if (progress <= keys[i].at) {
      const a = keys[i - 1], b = keys[i];
      let t = (progress - a.at) / (b.at - a.at);
      if (b.easing === 'smooth') t = t * t * (3 - 2 * t);
      return a.value + (b.value - a.value) * t;
    }
  }
  return keys[keys.length - 1].value;
}

