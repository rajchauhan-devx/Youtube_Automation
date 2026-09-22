import fs from 'node:fs';
import path from 'node:path';
import { containedFile } from './paths.js';

/** Remove published renders and their metadata, never source media or in-flight files. */
export function removePreviousRenders(directory: string) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.mp4') || entry.name.endsWith('.partial.mp4')) continue;
    const video = containedFile(path.resolve(directory), entry.name);
    fs.rmSync(video, { force: true });
    fs.rmSync(`${video}.json`, { force: true });
  }
}
