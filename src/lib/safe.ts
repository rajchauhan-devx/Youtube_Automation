/** Shared defensive helpers — UI/logic hardening without behavior changes. */

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError')
  );
}

export function safeErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (isAbortError(error)) return 'Request cancelled';
  if (error instanceof Error && error.message?.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  if (!text || !text.trim()) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Parse a fetch Response as JSON without throwing SyntaxError on HTML/empty bodies. */
export async function parseJsonResponse<T>(res: Response, fallback: T): Promise<T> {
  try {
    const contentType = res.headers?.get?.('content-type') || '';
    const text = await res.text();
    if (!text.trim()) return fallback;
    if (!contentType.includes('json')) {
      // Server may return HTML error pages — try JSON, else keep fallback.
      return safeJsonParse<T>(text, fallback);
    }
    return safeJsonParse<T>(text, fallback);
  } catch {
    return fallback;
  }
}

export function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Clipboard copy that never throws — falls back to textarea execCommand. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy fallback
  }
  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
