export async function apiPost(path: string, body: unknown, apiKey: string, fetcher: typeof fetch = fetch) {
  const res = await fetcher(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export function getApiKey(): string {
  return localStorage.getItem('openrouter_key') || '';
}
