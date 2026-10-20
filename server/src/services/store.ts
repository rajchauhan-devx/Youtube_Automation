import fs from 'fs';
import { safeSegment } from './paths.js';
import path from 'path';
import { createHash } from 'node:crypto';
import { workspaceDir } from './workspace.js';
import { atomicJson } from './accounts.js';
import { retryFileOperation } from './file-retry.js';
import { recoverPendingRestore } from './restore-journal.js';

function ensureDir() {
  if (!fs.existsSync(workspaceDir())) {
    fs.mkdirSync(workspaceDir(), { recursive: true });
  }
  recoverPendingRestore();
}

function filePath(name: string): string {
  if (!safeSegment(name)) throw new Error('Invalid store name');
  return path.join(workspaceDir(), `${name}.json`);
}
export class StoreCorruptionError extends Error {
  readonly code = 'STORE_CORRUPT';
  readonly status = 409;
  constructor(public storeName: string) { super(`Saved ${storeName} data is damaged. Writes are blocked. Open Profile → Backups & recovery to restore a verified copy.`); }
}
function validateArray(name: string, raw: string): unknown[] {
  try { const value: unknown = JSON.parse(raw); if (Array.isArray(value)) return value; } catch { /* Reject damaged data. */ }
  throw new StoreCorruptionError(name);
}
function preserveCorrupt(name: string, raw: string) {
  const hash = createHash('sha256').update(raw).digest('hex');
  const file = path.join(workspaceDir(), '.store-recovery', `${name}.corrupt-${hash}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, raw, { mode: 0o600, flag: 'wx' });
}

function read<T>(name: string): T[] {
  ensureDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  const raw = retryFileOperation(() => fs.readFileSync(fp, 'utf-8'));
  try { return validateArray(name, raw) as T[]; }
  catch (error) { preserveCorrupt(name, raw); throw error; }
}

function write<T>(name: string, data: T[]): void {
  ensureDir();
  const destination = filePath(name);
  if (!Array.isArray(data)) throw new Error('Store data must be an array');
  if (fs.existsSync(destination)) {
    const previous = read<unknown>(name); // Never replace an unreadable store.
    atomicJson(path.join(workspaceDir(), '.store-recovery', `${name}.previous-good.json`), previous);
  }
  atomicJson(destination, data);
  atomicJson(path.join(workspaceDir(), '.store-recovery', `${name}.last-good.json`), data);
}

export function storeRecoveryStatus() {
  ensureDir();
  return fs.readdirSync(workspaceDir()).filter(file => file.endsWith('.json') && safeSegment(file.slice(0, -5))).flatMap(file => {
    const name = file.slice(0, -5), lastGood = path.join(workspaceDir(), '.store-recovery', `${name}.last-good.json`);
    // Only stores written through this module have a recovery snapshot. Include damaged scripts on first run.
    if (name !== 'scripts' && !fs.existsSync(lastGood)) return [];
    let damaged = false, canRestore = false;
    try { read(name); } catch (error) { if (!(error instanceof StoreCorruptionError)) throw error; damaged = true; }
    if (fs.existsSync(lastGood)) { try { validateArray(name, fs.readFileSync(lastGood, 'utf8')); canRestore = true; } catch { /* Do not advertise an invalid snapshot. */ } }
    return [{ name, damaged, canRestore }];
  });
}
export function restoreStore(name: string) {
  const destination = filePath(name), snapshot = path.join(workspaceDir(), '.store-recovery', `${name}.last-good.json`);
  const data = validateArray(name, fs.readFileSync(snapshot, 'utf8'));
  if (fs.existsSync(destination)) preserveCorrupt(name, fs.readFileSync(destination, 'utf8'));
  atomicJson(destination, data);
  return { name, restored: data.length };
}

export const store = {
  delete(name: string): void {
    if (fs.existsSync(filePath(name))) read(name);
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
