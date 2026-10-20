import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { workspaceDir } from './workspace.js';
import { safeSegment } from './paths.js';
import { atomicJson } from './accounts.js';

const owner = randomUUID();
const Record = z.object({ version: z.literal(1), owner: z.string(), scriptId: z.string(),
  status: z.enum(['running', 'done', 'error', 'interrupted', 'cancelled']), progress: z.number().min(0).max(100),
  request: z.record(z.string(), z.unknown()), revision: z.string().optional(), stage: z.string().optional(), error: z.string().optional(),
  updatedAt: z.string(), outputFilename: z.string().optional(),
});
export type PersistentRenderJob = z.infer<typeof Record>;
const fileFor = (id: string) => {
  if (!safeSegment(id)) throw new Error('Invalid render script ID');
  return path.join(workspaceDir(), '.render-jobs', `${id}.json`);
};
export function saveRenderJob(job: Omit<PersistentRenderJob, 'version' | 'owner' | 'updatedAt'>) {
  const record = Record.parse({ ...job, version: 1, owner, updatedAt: new Date().toISOString() });
  atomicJson(fileFor(job.scriptId), record); return record;
}
export function readRenderJob(scriptId: string): PersistentRenderJob | undefined {
  const file = fileFor(scriptId);
  if (!fs.existsSync(file)) return;
  const record = Record.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (record.scriptId !== scriptId) throw new Error('Render job identity mismatch');
  if (record.status === 'running' && record.owner !== owner) {
    return saveRenderJob({ ...record, status: 'interrupted', error: 'The server restarted during this render. Restart the saved render to continue.', stage: 'Interrupted' });
  }
  return record;
}
export function removeRenderJob(scriptId: string) { fs.rmSync(fileFor(scriptId), { force: true }); }
export function renderJobsRunning() {
  const directory = path.join(workspaceDir(), '.render-jobs');
  return fs.existsSync(directory) && fs.readdirSync(directory).filter(file => file.endsWith('.json')).some(file => readRenderJob(file.slice(0, -5))?.status === 'running');
}
