import { parseJsonResponse } from '../lib/safe';
import type { Script } from '../data';
import type {
  WritersRoomFinding,
  WritersRoomJob,
  WritersRoomOptions,
  WritersRoomPass,
  WritersRoomProgress,
} from '../../server/src/services/editorial/writers-room-types';

export type { WritersRoomFinding, WritersRoomJob, WritersRoomOptions, WritersRoomPass, WritersRoomProgress };

export function startWritersRoom(
  fetcher: typeof fetch,
  scriptId: string,
  apiKey: string,
  options: WritersRoomOptions,
  models?: { criticModel?: string; fixerModel?: string; freshEyesModel?: string },
): Promise<{ jobId: string; job: WritersRoomJob }> {
  return postJson(fetcher, '/api/writers-room/start', { scriptId, options, ...models }, apiKey);
}

export function continueWritersRoom(fetcher: typeof fetch, jobId: string, apiKey: string, additionalPasses = 2): Promise<{ jobId: string; job: WritersRoomJob }> {
  return postJson(fetcher, `/api/writers-room/continue/${encodeURIComponent(jobId)}`, { additionalPasses }, apiKey);
}

export function cancelWritersRoom(fetcher: typeof fetch, jobId: string): Promise<{ job: WritersRoomJob }> {
  return postJson(fetcher, `/api/writers-room/cancel/${encodeURIComponent(jobId)}`, {});
}

export function decideWritersRoomFinding(fetcher: typeof fetch, jobId: string, findingId: string, decision: 'accepted' | 'rejected'): Promise<{ job: WritersRoomJob }> {
  return postJson(fetcher, `/api/writers-room/decision/${encodeURIComponent(jobId)}`, { findingId, decision });
}

export function applyWritersRoom(fetcher: typeof fetch, jobId: string, force = false): Promise<{ script: Script; patch: Partial<Script> }> {
  return postJson(fetcher, `/api/writers-room/apply/${encodeURIComponent(jobId)}`, { force });
}

export async function fetchWritersRoomJob(fetcher: typeof fetch, jobId: string, signal?: AbortSignal): Promise<WritersRoomJob> {
  const response = await fetcher(`/api/writers-room/status/${encodeURIComponent(jobId)}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(await errorMessage(response, 'Could not load the Writers’ Room run'));
  const data = await parseJsonResponse<{ job?: WritersRoomJob }>(response, {});
  if (!data.job) throw new Error('The Writers’ Room run is missing from the response.');
  return data.job;
}

export async function fetchLatestWritersRoomJob(fetcher: typeof fetch, scriptId: string, signal?: AbortSignal): Promise<WritersRoomJob | null> {
  const response = await fetcher(`/api/writers-room/latest/${encodeURIComponent(scriptId)}`, { signal, cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await errorMessage(response, 'Could not load the latest Writers’ Room run'));
  const data = await parseJsonResponse<{ job?: WritersRoomJob }>(response, {});
  return data.job || null;
}

async function postJson<T>(fetcher: typeof fetch, path: string, body: unknown, apiKey = ''): Promise<T> {
  const response = await fetcher(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await errorMessage(response, `Request failed (HTTP ${response.status})`));
  return parseJsonResponse<T>(response, {} as T);
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const data = await parseJsonResponse<{ error?: string }>(response, {});
  return typeof data?.error === 'string' && data.error.trim() ? data.error : fallback;
}
