import { parseJsonResponse, isAbortError } from '../lib/safe';

export async function apiPost<T = any>(path: string, body: unknown, apiKey: string, fetcher: typeof fetch = fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetcher(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(error instanceof Error ? error.message : 'Request failed — check the server connection');
  }
  if (!res.ok) {
    const data = await parseJsonResponse<{ error?: string }>(res, {});
    const detail = typeof data?.error === 'string' && data.error.trim() ? data.error : `Request failed (HTTP ${res.status})`;
    throw new Error(detail);
  }
  return parseJsonResponse<T>(res, {} as T);
}

export function getApiKey(): string {
  return localStorage.getItem('openrouter_key') || '';
}
