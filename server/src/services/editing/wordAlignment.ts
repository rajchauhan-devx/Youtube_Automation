import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Alignment, type EditingProject, type AlignmentResult } from '@tubeflow/editing-contracts';
import { runMedia } from '../media-process.js';
import { assetFile } from './repository.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const script = path.join(root, 'services/alignment/align.py');
export const alignmentPython = () => process.env.ALIGNMENT_PYTHON || path.join(root, 'services/alignment/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
let health: { at: number; result: Promise<{ ready: boolean; message: string }> } | undefined;
export function wordAlignmentStatus() {
  if (health && Date.now() - health.at < 30000) return health.result;
  const result = (async () => {
    if (!fs.existsSync(alignmentPython())) return { ready: false, message: 'Install local speech alignment with npm run setup:alignment.' };
    try { await runMedia(alignmentPython(), [script, '--health'], AbortSignal.timeout(20000)); return { ready: true, message: 'Local speech alignment ready (English and Hindi).' }; }
    catch { return { ready: false, message: 'Local speech alignment is unavailable. Run npm run setup:alignment or set ALIGNMENT_PYTHON.' }; }
  })();
  health = { at: Date.now(), result }; return result;
}
const Output = z.object({ provider: z.literal('whisperx'), version: z.string(), words: z.array(z.object({ word: z.string(), start: z.number().nonnegative(), end: z.number().positive(), score: z.number().min(0).max(1) })).min(1).max(20000) });
const normalized = (text: string) => text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
export function measuredTokens(project: EditingProject, output: unknown): AlignmentResult {
  const measured = Output.parse(output), expected = [...project.inputs.narrationText.matchAll(/\S+/gu)];
  if (measured.words.length !== expected.length) throw new Error('Speech alignment did not measure every narration word. The previous timing is preserved.');
  let previous = 0;
  const tokens = expected.map((match, i) => {
    const word = measured.words[i];
    if (normalized(match[0]) !== normalized(word.word) || word.start < previous || word.end <= word.start || word.end > project.alignment.duration + 0.001 || word.score < 0.1) throw new Error(`Speech alignment could not confidently time narration word ${i + 1}. The previous timing is preserved.`);
    previous = word.end;
    return { id: `word-${i}`, text: match[0], startOffset: match.index!, endOffset: match.index! + match[0].length, start: word.start, end: word.end,
      confidence: word.score, evidence: 'Measured phoneme alignment of the supplied narration against its selected audio' };
  });
  return Alignment.parse({ ...project.alignment, mode: 'word', provider: measured.provider, version: measured.version, tokens });
}
export async function measureWords(project: EditingProject, signal: AbortSignal) {
  const status = await wordAlignmentStatus(); if (!status.ready) throw new Error(status.message);
  if (!project.inputs.sceneTiming.length && project.alignment.duration > 60) throw new Error('Generate synchronized scene narration before aligning audio longer than one minute.');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-word-alignment-'));
  try {
    const file = path.join(temporary, 'input.json');
    fs.writeFileSync(file, JSON.stringify({ audioPath: assetFile(project.inputs.audioAssetId), language: project.inputs.language, device: process.env.ALIGNMENT_DEVICE || 'cpu',
      modelDir: process.env.ALIGNMENT_MODEL_DIR || path.join(root, 'artifacts/alignment-models'),
      segments: project.inputs.sceneTiming.length ? project.inputs.sceneTiming.map(scene => ({ text: scene.text.replace(/\s+/gu, ' '), start: scene.start, end: scene.end }))
        : [{ text: project.inputs.narrationText.replace(/\s+/gu, ' '), start: 0, end: project.alignment.duration }] }), { mode: 0o600 });
    const result = await runMedia(alignmentPython(), [script, file], AbortSignal.any([signal, AbortSignal.timeout(30 * 60 * 1000)]));
    return measuredTokens(project, JSON.parse(result));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
