import fs from 'node:fs';
import path from 'node:path';

export function safeSegment(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(value) && value.length <= 180;
}

export function containedFile(root: string, ...segments: string[]): string {
  if (!segments.every(safeSegment)) throw new Error('Invalid file identifier');
  const base = path.resolve(root);
  const target = path.resolve(base, ...segments);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('File is outside project storage');
  if (fs.existsSync(target)) {
    const realRelative = path.relative(fs.realpathSync(base), fs.realpathSync(target));
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('File link is outside project storage');
  }
  return target;
}
