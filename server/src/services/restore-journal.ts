import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { workspaceDir } from './workspace.js';
const directories = new Set(['generated', 'output', 'editing', 'editing-assets', 'voices', '.store-recovery', '.render-jobs', '.upload-jobs']);
export const backupEntryAllowed = (name: string) => directories.has(name) || /^[a-zA-Z0-9_-]+\.json$/.test(name) && !/token|secret|credential|client|api.?key|cloudflare/i.test(name) && name !== 'accounts.json';
const Transaction = z.object({ rollback: z.string().regex(/^\.before-restore-[a-f0-9-]{36}$/), staging: z.string().regex(/^\.restoring-[a-f0-9-]{36}$/), entries: z.array(z.object({ name: z.string().refine(backupEntryAllowed), hadLive: z.boolean() })) });
export function recoverPendingRestore() {
  const base = workspaceDir(), journal = path.join(base, '.restore-journal.json');
  if (!fs.existsSync(journal)) return;
  const transaction = Transaction.parse(JSON.parse(fs.readFileSync(journal, 'utf8')));
  for (const directory of [transaction.rollback, transaction.staging]) {
    const file = path.join(base, directory); if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Restore recovery cannot follow symbolic links.');
  }
  for (const entry of transaction.entries) {
    const live = path.join(base, entry.name), previous = path.join(base, transaction.rollback, entry.name);
    if (fs.existsSync(previous)) { fs.rmSync(live, { recursive: true, force: true }); fs.renameSync(previous, live); }
    else if (!entry.hadLive) fs.rmSync(live, { recursive: true, force: true });
  }
  fs.rmSync(path.join(base, transaction.staging), { recursive: true, force: true });
  fs.rmSync(journal, { force: true });
}
