import { autoEditAss, editingPreset, type EditingSettings } from './auto-edit.js';
import type { ScenePlan, NarrationSync } from './scene-plan.js';

const parseTime = (value: string) => value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
function assTime(seconds: number) {
  const value = Math.round(seconds * 100);
  return `${Math.floor(value / 360000)}:${String(Math.floor(value / 6000) % 60).padStart(2, '0')}:${String(Math.floor(value / 100) % 60).padStart(2, '0')}.${String(value % 100).padStart(2, '0')}`;
}
/** Preserve scene-relative caption phrasing/style on a single final timeline. */
export function synchronizedCaptionAss(plan: ScenePlan, sync: NarrationSync, width: number, height: number, settings?: EditingSettings) {
  let header = '', events: string[] = [];
  plan.scenes.forEach((scene, i) => {
    const timing = sync.scenes[i];
    if (!timing) throw new Error('Caption timing is missing a narration scene.');
    const start = Math.round(timing.startSample / sync.sampleRate * 30) / 30;
    const end = i === plan.scenes.length - 1 ? sync.totalSamples / sync.sampleRate : Math.round(timing.endSample / sync.sampleRate * 30) / 30;
    const ass = autoEditAss(scene.narration, end - start, '', width, height, settings || editingPreset('documentary'), true);
    if (!header) {
      header = ass.split('Dialogue:')[0];
      if (height > width) header = header.replace(/^Style: Caption,[^\r\n]+/m, line => {
        const fields = line.split(',');
        fields[19] = String(Math.round(width * 0.08));
        fields[20] = String(Math.round(width * 0.16));
        return fields.join(',');
      });
    }
    for (const line of ass.split('\n').filter(line => line.startsWith('Dialogue:'))) {
      const fields = line.split(',');
      fields[1] = assTime(start + parseTime(fields[1])); fields[2] = assTime(Math.min(end, start + parseTime(fields[2])));
      events.push(fields.join(','));
    }
  });
  return header + events.join('\n') + '\n';
}
