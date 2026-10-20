import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ROOT_DATA, currentWorkspace, workspaceDir, workspaceKey } from './workspace.js';
import { atomicJson } from './accounts.js';
import { renderJobsRunning } from './render-jobs.js';
import { maintenanceOperations as operations, workspaceMaintenance, workspaceRequestsActive } from './workspace-activity.js';
import { narrationBusy } from './long-narration.js';
import { localMusicBusy } from './local-music.js';
import { flowJobsBusy } from './flow/jobs.js';
import { backupEntryAllowed as allowedTop, recoverPendingRestore } from './restore-journal.js';

const validPath = (name: string) => !path.isAbsolute(name) && !name.includes('\\') && name.split('/').every(part => part !== '..' && part !== '.' && part.length > 0) && allowedTop(name.split('/')[0]);
const Manifest = z.object({ version: z.literal(1), id: z.string().uuid(), accountId: z.string(), profile: z.enum(['shorts', 'long', 'mixed']),
  createdAt: z.string(), files: z.array(z.object({ path: z.string().refine(validPath), bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })).max(100000),
});
type BackupManifest = z.infer<typeof Manifest>;
const root = () => path.join(ROOT_DATA, '.workspace-backups', currentWorkspace().accountId, currentWorkspace().profile);
const hashFile = async (file: string) => {
  const hash = createHash('sha256'); for await (const chunk of fs.createReadStream(file)) hash.update(chunk); return hash.digest('hex');
};
function inventory(base = workspaceDir()) {
  const files: { path: string; bytes: number; modified: number; changed: number }[] = [];
  const visit = (relative: string) => {
    const file = path.join(base, relative), stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error('Backups cannot include symbolic links.');
    if (stat.isDirectory()) { for (const entry of fs.readdirSync(file).sort()) visit(`${relative}/${entry}`); return; }
    if (!stat.isFile() || /\.tmp$|\.lock$|\.partial\.|\.corrupt-/.test(relative)) return;
    files.push({ path: relative, bytes: stat.size, modified: stat.mtimeMs, changed: stat.ctimeMs });
  };
  if (fs.existsSync(base)) for (const name of fs.readdirSync(base).sort().filter(allowedTop)) visit(name);
  return files;
}
export const workspaceFingerprint = () => createHash('sha256').update(JSON.stringify(inventory())).digest('hex');
export function assertRecoveryIdle() {
  recoverPendingRestore();
  if (workspaceMaintenance() || workspaceRequestsActive() || renderJobsRunning() || narrationBusy() || localMusicBusy() || flowJobsBusy()) throw new Error('Wait for active generation, uploads, renders or recovery operations to finish.');
  const jobs = path.join(workspaceDir(), 'editing', 'jobs');
  if (fs.existsSync(jobs) && fs.readdirSync(jobs).filter(file => file.endsWith('.json')).some(file => ['running', 'queued', 'cancel_requested'].includes(JSON.parse(fs.readFileSync(path.join(jobs, file), 'utf8')).state))) throw new Error('Wait for active motion graphics jobs to finish.');
}
function manifestFor(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new Error('Invalid backup ID');
  const manifest = Manifest.parse(JSON.parse(fs.readFileSync(path.join(root(), id, 'manifest.json'), 'utf8')));
  const scope = currentWorkspace();
  if (manifest.id !== id || manifest.accountId !== scope.accountId || manifest.profile !== scope.profile || new Set(manifest.files.map(file => file.path)).size !== manifest.files.length) throw new Error('Backup identity mismatch.');
  return manifest;
}
export function listWorkspaceBackups() {
  if (!fs.existsSync(root())) return [];
  return fs.readdirSync(root()).filter(id => z.string().uuid().safeParse(id).success).flatMap(id => {
    try { const m = manifestFor(id); return [{ id, createdAt: m.createdAt, files: m.files.length, bytes: m.files.reduce((total, file) => total + file.bytes, 0) }]; }
    catch { return []; }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function createWorkspaceBackup() {
  assertRecoveryIdle(); const key = workspaceKey('maintenance'); operations.add(key);
  const id = randomUUID(), staging = path.join(root(), `.creating-${id}`);
  try {
    const before = workspaceFingerprint(), source = inventory(), files: BackupManifest['files'] = [];
    for (const entry of source) {
      const input = path.join(workspaceDir(), entry.path), output = path.join(staging, 'files', entry.path);
      if (entry.path.endsWith('.json')) JSON.parse(fs.readFileSync(input, 'utf8'));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      await fs.promises.copyFile(input, output, fs.constants.COPYFILE_FICLONE);
      files.push({ path: entry.path, bytes: entry.bytes, sha256: await hashFile(output) });
    }
    if (workspaceFingerprint() !== before) throw new Error('Workspace files changed during backup. Finish active generation and try again.');
    const manifest = Manifest.parse({ version: 1, id, ...currentWorkspace(), createdAt: new Date().toISOString(), files });
    atomicJson(path.join(staging, 'manifest.json'), manifest);
    fs.renameSync(staging, path.join(root(), id));
    return { id, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), createdAt: manifest.createdAt };
  } finally { fs.rmSync(staging, { recursive: true, force: true }); operations.delete(key); }
}
export async function restoreWorkspaceBackup(id: string, expectedFingerprint: string) {
  assertRecoveryIdle(); const key = workspaceKey('maintenance'); operations.add(key);
  const staging = path.join(workspaceDir(), `.restoring-${randomUUID()}`), rollback = path.join(workspaceDir(), `.before-restore-${randomUUID()}`);
  try {
    const manifest = manifestFor(id);
    if (workspaceFingerprint() !== expectedFingerprint) throw new Error('The workspace changed. Refresh recovery status before restoring.');
    for (const entry of manifest.files) {
      const input = path.join(root(), id, 'files', entry.path), output = path.join(staging, entry.path);
      const relative = path.relative(fs.realpathSync(path.join(root(), id, 'files')), fs.realpathSync(input));
      if (relative.startsWith('..') || path.isAbsolute(relative) || fs.lstatSync(input).isSymbolicLink() || fs.statSync(input).size !== entry.bytes || await hashFile(input) !== entry.sha256) throw new Error(`Backup verification failed: ${entry.path}`);
      if (entry.path.endsWith('.json')) JSON.parse(fs.readFileSync(input, 'utf8'));
      fs.mkdirSync(path.dirname(output), { recursive: true }); await fs.promises.copyFile(input, output, fs.constants.COPYFILE_FICLONE);
    }
    if (workspaceFingerprint() !== expectedFingerprint) throw new Error('Workspace files changed during verification. Restore was cancelled.');
    // External uploads cannot be undone by restoring an older local project.
    const liveLedger = path.join(workspaceDir(), '.upload-jobs');
    if (fs.existsSync(liveLedger)) {
      fs.mkdirSync(path.join(staging, '.upload-jobs'), { recursive: true });
      for (const file of fs.readdirSync(liveLedger).filter(file => /^[a-f0-9]{64}\.json$/.test(file))) fs.copyFileSync(path.join(liveLedger, file), path.join(staging, '.upload-jobs', file));
    }
    fs.mkdirSync(rollback, { recursive: true });
    const names = new Set([...fs.readdirSync(workspaceDir()).filter(allowedTop), ...manifest.files.map(file => file.path.split('/')[0])]);
    const journal = path.join(workspaceDir(), '.restore-journal.json');
    atomicJson(journal, { rollback: path.basename(rollback), staging: path.basename(staging), entries: [...names].map(name => ({ name, hadLive: fs.existsSync(path.join(workspaceDir(), name)) })) });
    try {
      for (const name of names) {
        const live = path.join(workspaceDir(), name), replacement = path.join(staging, name);
        if (fs.existsSync(live)) fs.renameSync(live, path.join(rollback, name));
        if (fs.existsSync(replacement)) fs.renameSync(replacement, live);
      }
    } catch (error) {
      recoverPendingRestore();
      throw error;
    }
    fs.rmSync(journal, { force: true });
    return { id, restored: manifest.files.length, previousCopy: path.basename(rollback) };
  } finally { fs.rmSync(staging, { recursive: true, force: true }); operations.delete(key); }
}
