import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { workspaceDir } from './workspace.js';
import { safeSegment } from './paths.js';
import { atomicJson } from './accounts.js';
import type { WritersRoomJob } from './editorial/writers-room-types.js';

const owner = randomUUID();

const directory = () => path.join(workspaceDir(), '.writers-room');

function fileFor(id: string): string {
  if (!safeSegment(id)) throw new Error('Invalid Writers’ Room job ID');
  return path.join(directory(), `${id}.json`);
}

export function saveWritersRoomJob(job: WritersRoomJob): WritersRoomJob {
  const record: WritersRoomJob = { ...job, version: 1, owner, updatedAt: new Date().toISOString() };
  atomicJson(fileFor(job.id), record);
  return record;
}

export function readWritersRoomJob(id: string): WritersRoomJob | undefined {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return undefined;
  const job = JSON.parse(fs.readFileSync(file, 'utf8')) as WritersRoomJob;
  if (!job || job.version !== 1 || job.id !== id || job.scriptId === undefined) throw new Error('Writers’ Room job identity mismatch');
  if ((job.status === 'running' || job.status === 'queued') && job.owner !== owner) {
    job.status = 'interrupted';
    job.error = 'The server restarted during this Writers’ Room run. Continue the run or start a new one.';
    job.updatedAt = new Date().toISOString();
    atomicJson(file, job);
  }
  return job;
}

export function listWritersRoomJobs(scriptId?: string): WritersRoomJob[] {
  if (!fs.existsSync(directory())) return [];
  return fs.readdirSync(directory())
    .filter(file => file.endsWith('.json'))
    .flatMap(file => {
      try {
        const job = readWritersRoomJob(file.slice(0, -5));
        return job && (!scriptId || job.scriptId === scriptId) ? [job] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function latestWritersRoomJob(scriptId: string): WritersRoomJob | undefined {
  return listWritersRoomJobs(scriptId)[0];
}

export function removeWritersRoomJob(id: string): void {
  fs.rmSync(fileFor(id), { force: true });
}

export function createWritersRoomJob(input: {
  scriptId: string;
  request: WritersRoomJob['request'];
}): WritersRoomJob {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: randomUUID(),
    scriptId: input.scriptId,
    owner,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    request: input.request,
    progress: {
      pass: 0,
      totalPasses: input.request.options.maxPasses || 3,
      phase: 'critics',
      message: 'Queued for the Writers’ Room.',
      percent: 0,
      criticStatus: {},
    },
    passes: [],
    decisions: {},
    findings: [],
    cancelRequested: false,
  };
}

export function writersRoomJobActive(job: WritersRoomJob | undefined): boolean {
  return Boolean(job && (job.status === 'queued' || job.status === 'running'));
}
