import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { workspaceDir } from './workspace.js';
import { atomicJson } from './accounts.js';

export class UploadConflict extends Error {
  readonly status = 409;
  constructor(public code: string, message: string) { super(message); }
}
const Journal = z.object({ version: z.literal(1), id: z.string().regex(/^[a-f0-9]{64}$/), scriptId: z.string(), videoFilename: z.string(),
  channelId: z.string(), pid: z.number().int(), owner: z.string(), status: z.enum(['prepared', 'sending', 'uncertain', 'completed', 'failed']),
  startedAt: z.string(), updatedAt: z.string(), result: z.record(z.string(), z.unknown()).optional(), error: z.string().optional(),
});
const owner = randomUUID();
export async function videoContentHash(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; } };
export async function claimUpload(file: string, scriptId: string, channelId: string) {
  const content = await videoContentHash(file), id = createHash('sha256').update(`${channelId}:${content}`).digest('hex');
  const directory = path.join(workspaceDir(), '.upload-jobs'), journalFile = path.join(directory, `${id}.json`), lock = `${journalFile}.lock`;
  fs.mkdirSync(directory, { recursive: true });
  let previous = fs.existsSync(journalFile) ? Journal.parse(JSON.parse(fs.readFileSync(journalFile, 'utf8'))) : undefined;
  if (previous?.status === 'completed' && previous.result) return { id, replay: previous.result };
  if (previous && ['sending', 'uncertain'].includes(previous.status)) {
    throw new UploadConflict(alive(previous.pid) && previous.status === 'sending' ? 'UPLOAD_ACTIVE' : 'UPLOAD_OUTCOME_UNKNOWN',
      'This render already has an upload in progress or awaiting reconciliation. Check its upload status before retrying.');
  }
  try { fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, owner }), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const holder = JSON.parse(fs.readFileSync(lock, 'utf8')) as { pid: number };
    if (alive(holder.pid)) throw new UploadConflict('UPLOAD_ACTIVE', 'This render is already being uploaded. Wait for that upload to finish.');
    fs.rmSync(lock); // A prepared request never sent media and can safely be reclaimed.
    return claimUpload(file, scriptId, channelId);
  }
  // Re-read after exclusive acquisition so completed requests cannot be repeated.
  previous = fs.existsSync(journalFile) ? Journal.parse(JSON.parse(fs.readFileSync(journalFile, 'utf8'))) : undefined;
  if (previous?.status === 'completed' && previous.result) { fs.rmSync(lock, { force: true }); return { id, replay: previous.result }; }
  if (previous && ['sending', 'uncertain'].includes(previous.status)) { fs.rmSync(lock, { force: true }); throw new UploadConflict('UPLOAD_OUTCOME_UNKNOWN', 'Reconcile the previous upload before retrying this render.'); }
  let record = Journal.parse({ version: 1, id, scriptId, videoFilename: path.basename(file), channelId, pid: process.pid, owner, status: 'prepared', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const write = () => atomicJson(journalFile, { ...record, updatedAt: new Date().toISOString() });
  try { write(); } catch (error) { fs.rmSync(lock, { force: true }); throw error; }
  return { id, replay: undefined,
    sending() { record = { ...record, status: 'sending' }; write(); },
    complete(result: Record<string, unknown>) { const complete = { ...record, status: 'completed' as const, result, updatedAt: new Date().toISOString() }; atomicJson(journalFile, complete); record = complete; fs.rmSync(lock, { force: true }); },
    fail(error: unknown) {
      if (record.status === 'completed') return;
      record = { ...record, status: record.status === 'sending' ? 'uncertain' : 'failed', error: error instanceof Error ? error.message : 'Upload failed' };
      try { write(); } finally { fs.rmSync(lock, { force: true }); }
    },
  };
}
export function uploadStatus(scriptId: string) {
  const directory = path.join(workspaceDir(), '.upload-jobs');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(file => file.endsWith('.json')).map(file => Journal.parse(JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))))
    .filter(record => record.scriptId === scriptId).map(record => ({ id: record.id, scriptId: record.scriptId, videoFilename: record.videoFilename, channelId: record.channelId,
      startedAt: record.startedAt, error: record.error, result: record.result,
      status: record.status === 'sending' && (!alive(record.pid) || !fs.existsSync(path.join(directory, `${record.id}.json.lock`))) ? 'uncertain' : record.status }));
}
export function reconcileUpload(id: string, channelId: string, result: Record<string, unknown>) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid upload ID');
  const file = path.join(workspaceDir(), '.upload-jobs', `${id}.json`), record = Journal.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (record.channelId !== channelId || !['sending', 'uncertain'].includes(record.status)) throw new Error('This upload cannot be reconciled for the connected channel.');
  if (record.status === 'sending' && alive(record.pid) && fs.existsSync(`${file}.lock`)) throw new UploadConflict('UPLOAD_ACTIVE', 'Wait for the active upload to finish before reconciling.');
  atomicJson(file, { ...record, status: 'completed', result, updatedAt: new Date().toISOString() });
  fs.rmSync(`${file}.lock`, { force: true });
  return { scriptId: record.scriptId, videoFilename: record.videoFilename, startedAt: record.startedAt };
}
export function retryUncertainUpload(id: string, channelId: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid upload ID');
  const file = path.join(workspaceDir(), '.upload-jobs', `${id}.json`), record = Journal.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (record.channelId !== channelId || !['sending', 'uncertain'].includes(record.status)) throw new Error('This upload is not awaiting reconciliation.');
  if (record.status === 'sending' && alive(record.pid) && fs.existsSync(`${file}.lock`)) throw new UploadConflict('UPLOAD_ACTIVE', 'The original upload is still active.');
  atomicJson(path.join(workspaceDir(), '.upload-jobs/history', `${id}-${randomUUID()}.json`), record);
  atomicJson(file, { ...record, status: 'failed', error: 'User checked YouTube Studio and confirmed no uploaded video exists.', updatedAt: new Date().toISOString() });
  fs.rmSync(`${file}.lock`, { force: true });
}
