export interface XkiroModel {
  id: string;
  name: string;
  badge: string;
  maxOutputTokens?: number;
}

let cached: { expires: number; models: XkiroModel[] } | undefined;
let pending: Promise<XkiroModel[]> | undefined;

/** Public chat catalog only. Never substitute a guessed or stale model list. */
export async function getXkiroModels(): Promise<XkiroModel[]> {
  if (cached && cached.expires > Date.now()) return cached.models;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch('https://api.xkiro.com/v1/models', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Could not load Xkiro models. Try again shortly.');
    const body = await response.json();
    if (!Array.isArray(body.data)) throw new Error('Xkiro returned an invalid model catalog.');
    const models: XkiroModel[] = [];
    const seen = new Set<string>();
    for (const item of body.data) {
      if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:/-]+$/.test(item.id)
        || (item.modality && item.modality !== 'chat') || seen.has(item.id)) continue;
      seen.add(item.id);
      models.push({ id: `xkiro/${item.id}`, name: typeof item.display_name === 'string' ? item.display_name : item.id,
        badge: ['free', 'paid', 'premium'].includes(item.access_tier) ? item.access_tier : 'Chat',
        ...(Number.isInteger(item.max_output_tokens) && item.max_output_tokens > 0 ? { maxOutputTokens: item.max_output_tokens } : {}) });
    }
    cached = { expires: Date.now() + 180000, models };
    return models;
  })();
  try { return await pending; } finally { pending = undefined; }
}
