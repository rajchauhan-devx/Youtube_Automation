/** Inspect the decoded PCM, rather than accepting silence or padded short clips. */
export function inspectVoiceReference(wav: Buffer): { durationSeconds: number } {
  let sampleRate = 0;
  let samples: Buffer | undefined;
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV recording.');
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > wav.length) throw new Error('Incomplete WAV recording.');
    const type = wav.toString('ascii', offset, offset + 4);
    if (type === 'fmt ' && size >= 16) {
      if (wav.readUInt16LE(start) !== 1 || wav.readUInt16LE(start + 2) !== 1 || wav.readUInt16LE(start + 14) !== 16) throw new Error('Expected mono PCM audio.');
      sampleRate = wav.readUInt32LE(start + 4);
    }
    if (type === 'data') samples = wav.subarray(start, start + size);
    offset = start + size + size % 2;
  }
  if (!sampleRate || !samples || samples.length % 2) throw new Error('Recording contains no valid audio.');
  const durationSeconds = samples.length / 2 / sampleRate;
  if (durationSeconds < 6) throw new Error('Use at least 6 seconds of clear speech; 8–12 seconds in the selected language works well.');
  const count = Math.min(samples.length / 2, sampleRate * 10);
  const frameSize = Math.max(1, Math.round(sampleRate * 0.02));
  let clipped = 0;
  let peak = 0;
  const levels: number[] = [];
  for (let start = 0; start < count; start += frameSize) {
    let sum = 0;
    const end = Math.min(start + frameSize, count);
    for (let i = start; i < end; i++) {
      const sample = samples.readInt16LE(i * 2) / 32768;
      peak = Math.max(peak, Math.abs(sample));
      if (Math.abs(sample) >= 0.998) clipped++;
      sum += sample * sample;
    }
    levels.push(Math.sqrt(sum / (end - start)));
  }
  const activeSeconds = levels.filter(level => level > Math.max(0.001, peak * 0.01)).length * 0.02;
  if (peak < 0.01 || activeSeconds < 3) throw new Error('The opening needs at least 3 seconds of audible speech. Remove long silences and re-record at a clear level.');
  if (clipped / count > 0.005) throw new Error('The recording is clipped or distorted. Lower the microphone level and record again.');
  return { durationSeconds };
}
