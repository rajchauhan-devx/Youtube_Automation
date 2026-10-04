import fs from 'fs';
import { safeSegment } from './paths.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { workspaceDir } from './workspace.js';
import { atomicJson } from './accounts.js';
import { retryFileOperation } from './file-retry.js';

function ensureDir() {
  if (!fs.existsSync(workspaceDir())) {
    fs.mkdirSync(workspaceDir(), { recursive: true });
  }
}

function filePath(name: string): string {
  if (!safeSegment(name)) throw new Error('Invalid store name');
  return path.join(workspaceDir(), `${name}.json`);
}

function read<T>(name: string): T[] {
  ensureDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  try {
    const parsed: unknown = JSON.parse(retryFileOperation(() => fs.readFileSync(fp, 'utf-8')));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (error) {
    // An inaccessible file is not an empty or corrupt store. Never overwrite
    // saved work after a persistent access failure.
    if (!(error instanceof SyntaxError)) throw error;
    // Preserve the corrupt file for recovery instead of crashing every route.
    try {
      const backup = `${fp}.corrupt-${Date.now()}`;
      fs.copyFileSync(fp, backup);
    } catch { /* backup is best-effort */ }
    return [];
  }
}

function write<T>(name: string, data: T[]): void {
  ensureDir();
  const destination = filePath(name);
  atomicJson(destination, data);
}

export const store = {
  delete(name: string): void {
    fs.rmSync(filePath(name), { force: true });
  },
  get<T>(name: string): T[] {
    return read<T>(name);
  },
  set<T>(name: string, data: T[]): void {
    write(name, data);
  },
  add<T extends { id: string }>(name: string, item: T): void {
    const items = read<T>(name);
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      items[idx] = item;
    } else {
      items.push(item);
    }
    write(name, items);
  },
  remove<T extends { id: string }>(name: string, id: string): void {
    const items = read<T>(name).filter((i) => i.id !== id);
    write(name, items);
  },
  getById<T extends { id: string }>(name: string, id: string): T | undefined {
    return read<T>(name).find((i) => i.id === id);
  },
};
