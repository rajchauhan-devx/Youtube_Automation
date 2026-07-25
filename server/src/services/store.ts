import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(name: string): string {
  return path.join(DATA_DIR, `${name}.json`);
}

function read<T>(name: string): T[] {
  ensureDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return [];
  }
}

function write<T>(name: string, data: T[]): void {
  ensureDir();
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf-8');
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
