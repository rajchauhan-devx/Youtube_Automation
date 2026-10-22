type RenderReview = {
  status: string;
  summary: string;
  findings: { severity: string; category: string; detail: string }[];
};

export function hasCaptionBlocker(review?: RenderReview): boolean {
  return review?.status === 'blocked' && review.findings.some(finding =>
    finding.severity === 'blocker' && /caption|subtitle/i.test(`${finding.category} ${finding.detail}`));
}

export function reviewBlockerMessage(review: RenderReview): string {
  const blockers = review.findings.filter(finding => finding.severity === 'blocker');
  return `Final review needs attention: ${blockers.length ? blockers.map(finding => `${finding.category}: ${finding.detail}`).join('\n') : review.summary}`;
}

/** Retry only temporary transport/provider failures, never quality blockers. */
export async function waitForRenderedReview<T>(options: {
  scriptId: string; videoFilename: string; apiKey: string; signal: AbortSignal;
  checkPause: () => Promise<void>;
  status: (message: string) => void;
  fetcher: typeof fetch; // Must be the account/profile-scoped client.
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<T> {
  const sleep = options.sleep || ((ms, signal) => new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  }));
  let failures = 0;
  for (;;) {
    options.signal.throwIfAborted();
    await options.checkPause();
    let response: Response;
    try {
    response = await options.fetcher('/api/retention/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.apiKey ? { 'x-api-key': options.apiKey } : {}) },
      body: JSON.stringify({ scriptId: options.scriptId, videoFilename: options.videoFilename }), signal: options.signal,
    });
    } catch (error) {
      options.signal.throwIfAborted();
      if (!(error instanceof TypeError)) throw error;
      response = Response.json({ error: 'Review connection interrupted', retryable: true }, { status: 503 });
    }
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data as T;
    if (!(response.status === 429 && data.retryable) && ![502, 503, 504].includes(response.status))
      throw new Error(data.error || `Final review failed (HTTP ${response.status})`);
    const seconds = Math.max(30 * 2 ** Math.min(failures++, 4), Number(data.retryAfterSeconds) || Number(response.headers.get('retry-after')) || 0);
    // A countdown keeps the run visibly active and responds promptly to Pause/Cancel.
    for (let remaining = Math.ceil(seconds); remaining > 0; remaining--) {
      options.signal.throwIfAborted();
      await options.checkPause();
      options.status(`Final review waiting for Gemini (${remaining}s). ${data.completedBatches || 0}/${data.totalBatches || '?'} batches saved; retrying automatically.`);
      await sleep(1000, options.signal);
    }
  }
}
