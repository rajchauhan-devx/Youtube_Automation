import fs from 'fs';
import { safeSegment } from './paths.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { workspaceDir } from './workspace.js';

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
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    throw new Error(`Cannot read ${name} storage. Restore a backup before making changes.`);
  }
}

function write<T>(name: string, data: T[]): void {
  ensureDir();
  const destination = filePath(name);
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(temporary, destination);
}

export const store = {
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
