// Opt-in real GPU smoke test. npm test uses short synthetic FFmpeg fixtures.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { generatePresenter, museTalkRoot } from '../dist/services/presenter.js';
import { defaultPresenter } from '../dist/services/presenter-settings.js';
import { renderVideo } from '../dist/services/video.js';
import { runMedia } from '../dist/services/media-process.js';
import { generatedDir, outputDir } from '../dist/services/workspace.js';

const id = `presenter-smoke-${randomUUID()}`;
const dir = path.join(generatedDir(), id);
const artifacts = path.resolve('artifacts/presenter');
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(artifacts, { recursive: true });
const imageArg = process.argv.indexOf('--image');
const audioArg = process.argv.indexOf('--audio');
const audioSource = audioArg >= 0 ? process.argv[audioArg + 1] : path.join(museTalkRoot(), 'samples', 'voice_test.wav');
const controller = new AbortController();
let cancelledAt;
const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15 * 60 * 1000)]);
try {
  await runMedia('ffmpeg', ['-v', 'error', '-y', '-i', audioSource, '-t', '4', '-ar', '48000', path.join(dir, 'voice.wav')], signal);
  if (imageArg >= 0) fs.copyFileSync(process.argv[imageArg + 1], path.join(dir, 'story.png'));
  else await runMedia('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=0x182C42:s=960x540', '-frames:v', '1', path.join(dir, 'story.png')], signal);
  const settings = { ...defaultPresenter(), enabled: true };
  const started = Date.now();
  const presenterPath = await generatePresenter(id, path.join(dir, 'voice.wav'), settings, signal, (stage, percent) => {
    console.log(`${percent}% ${stage}`);
    if (process.argv.includes('--cancel') && percent >= 25 && !controller.signal.aborted) { cancelledAt = Date.now(); controller.abort(); }
  });
  const repeated = await generatePresenter(id, path.join(dir, 'voice.wav'), { ...settings, widthPercent: 25 }, signal, stage => console.log(stage));
  if (repeated !== presenterPath) throw new Error('Crop-only change should reuse the presenter');
  const result = await renderVideo({ scriptId: id, imagePaths: ['story.png'], audioPath: 'voice.wav',
    resolution: { width: 960, height: 540 }, presenter: settings, presenterPath, enableVignette: false,
    colorGrade: 'none', sceneAnalysis: { effects: ['hold'], transitions: [], timings: [] }, signal });
  fs.copyFileSync(result.outputPath, path.join(artifacts, 'presenter-demo.mp4'));
  await runMedia('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', result.outputPath, '-frames:v', '1', path.join(artifacts, 'presenter-demo.jpg')], signal);
  console.log(JSON.stringify({ success: true, duration: result.duration, elapsedSeconds: (Date.now() - started) / 1000, output: path.join(artifacts, 'presenter-demo.mp4') }));
} catch (error) {
  if (process.argv.includes('--cancel') && controller.signal.aborted && /cancelled/i.test(error.message)) {
    if (Date.now() - cancelledAt > 30000) throw new Error('Cancellation took more than 30 seconds');
    if (fs.readdirSync(dir).some(name => name.startsWith('presenter-work-'))) throw new Error('Cancelled worker left its temporary directory behind');
    console.log('PASS: real presenter worker cancelled and temporary files removed');
  } else throw error;
} finally {
  for (const base of [generatedDir(), outputDir()]) {
    const target = path.resolve(base, id);
    if (path.dirname(target) !== path.resolve(base)) throw new Error('Invalid smoke-test cleanup path');
    fs.rmSync(target, { recursive: true, force: true });
  }
}
