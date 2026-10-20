/** A temporary provider failure, separate from an actual failed quality review. */
export class ReviewPending extends Error {
  constructor(public retryAfterSeconds: number, public completed: number, public total: number, message = 'Gemini review is temporarily rate limited') {
    super(`${message}. ${completed}/${total} review batches saved; waiting to retry.`);
  }
}

export function providerRetrySeconds(response: Response, body: any, attempt = 0, now = Date.now()) {
  const header = response.headers.get('retry-after');
  const seconds = header ? Number(header) : NaN;
  const date = header && !Number.isFinite(seconds) ? Date.parse(header) : NaN;
  const retry = body?.error?.details?.find((detail: any) => typeof detail.retryDelay === 'string')?.retryDelay;
  const provider = typeof retry === 'string' ? Number.parseFloat(retry) : NaN;
  const raw = Math.ceil(Math.max(30 * 2 ** Math.min(attempt, 4),
    Number.isFinite(seconds) ? seconds : 0, Number.isFinite(date) ? (date - now) / 1000 : 0,
    Number.isFinite(provider) ? provider : 0));
  return Math.min(300, Math.max(15, raw));
}
