import fs from 'node:fs';
import path from 'node:path';
import { flowDownloadsDir, type StepLog } from './jobs.js';
import { flowProfileDir } from './profile.js';

// Live Google Flow worker (unofficial browser automation).
//
// Hard rules, learned from the public Flow tooling (gflow-cli / flow-py):
// - Generation endpoints sit behind reCAPTCHA Enterprise: only REAL UI button
//   clicks produce valid tokens. Never replay captured HTTP directly.
// - One profile = one writer (Chromium profile lock). The job queue enforces it.
// - System Chrome / headed context beats bundled Chromium for Google sign-in
//   (G12 bot-block). Headless generation is attempted first; reCAPTCHA-style
//   failures surface as RECAPTCHA_BLOCKED with a headed-retry hint.
// - Every step takes a screenshot. Failures are classified, never swallowed.

export type OverseerCode =
  | 'AUTH_EXPIRED'
  | 'PROFILE_LOCKED'
  | 'CLARIFICATION'
  | 'CREDIT_DIALOG'
  | 'BUDGET_BLOCKED'
  | 'RECAPTCHA_BLOCKED'
  | 'TIMEOUT'
  | 'UI_CHANGED'
  | 'CANCELLED'
  | 'UNKNOWN';

const STEP_TIMEOUT_MS = 90_000;
const GENERATION_TIMEOUT_MS = 10 * 60_000;

function shotsDir(jobId: string): string {
  const dir = path.join(flowProfileDir(), '..', 'shots', jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function shot(page: { screenshot: (opts: { path: string }) => Promise<unknown> }, dir: string, name: string): Promise<string> {
  const file = path.join(dir, `${name}.png`);
  try {
    await page.screenshot({ path: file });
    return file;
  } catch {
    return '';
  }
}

export function classifyFailure(message: string, url: string): OverseerCode {
  const text = `${message} ${url}`.toLowerCase();
  if (/accounts\.google|signin\/rejected|choose an account|session expired/i.test(text)) return 'AUTH_EXPIRED';
  if (/profile.*(in use|locked)|singletonlock|user data directory is already in use|could not remove old devtools/i.test(text)) return 'PROFILE_LOCKED';
  if (/recaptcha|unusual traffic|try again later|automated queries/i.test(text)) return 'RECAPTCHA_BLOCKED';
  if (/credit|billing|payment|quota|out of credits/i.test(text)) return 'CREDIT_DIALOG';
  if (/clarif|could you|which.*prefer|what.*mean/i.test(text)) return 'CLARIFICATION';
  if (/timeout|timed out|waiting for/i.test(text)) return 'TIMEOUT';
  if (/selector|locator|element.*not found|detached|ui_changed/i.test(text)) return 'UI_CHANGED';
  return 'UNKNOWN';
}

export function recoveryHint(code: OverseerCode): string {
  switch (code) {
    case 'AUTH_EXPIRED': return 'GET /api/flow/login-hint, sign in once in the headed profile, then retry the job (idempotent: same prompt will not double-bill a completed render).';
    case 'PROFILE_LOCKED': return 'Close the manual Flow/Chrome window that is still open on this profile, then retry. One profile = one writer.';
    case 'CLARIFICATION': return 'Flow asked a question instead of generating (usually an invalid model/duration combo). Dry-run first, then retry with the wrapped prompt.';
    case 'CREDIT_DIALOG': return 'A credit confirmation appeared. Approve manually in the profile browser once, or lower the model to Lite/Fast.';
    case 'BUDGET_BLOCKED': return 'Episode credit budget would be exceeded. Raise FLOW_CREDIT_BUDGET_PER_EPISODE or use Lite.';
    case 'RECAPTCHA_BLOCKED': return 'Google challenged the automation. Retry headed (FLOW_HEADLESS=false) once; if it persists, generate that scene manually this round.';
    case 'TIMEOUT': return 'Render exceeded 10 minutes. Use resume: re-post the identical job — a completed render returns the file instead of re-billing.';
    case 'UI_CHANGED': return 'Flow changed its markup. Open the saved screenshot, update SELECTORS in worker.ts, and retry. Nothing was charged if no render started.';
    case 'CANCELLED': return 'Cancelled by user.';
    default: return 'See the step log + screenshot and retry. Report the step name if it repeats.';
  }
}

// Selectors are role/placeholder-first (resilient) with CSS fallback (brittle).
// Update here — never scatter ad-hoc selectors through the steps.
const SELECTORS = {
  composer: [
    '[aria-label*="prompt" i]',
    'textarea[placeholder*="prompt" i]',
    'div[contenteditable="true"]',
    'textarea',
  ],
  generateButton: [
    'button:has-text("Generate")',
    'button:has-text("Create")',
    '[aria-label*="generate" i]',
  ],
  downloadButton: [
    'button:has-text("Download")',
    'a:has-text("Download")',
    '[aria-label*="download" i]',
  ],
};

async function clickFirst(
  page: {
    locator: (sel: string) => {
      first: () => { click: (opts?: object) => Promise<void>; fill: (v: string) => Promise<void>; count: () => Promise<number> };
    };
  },
  selectors: string[],
  action: 'click' | 'fill',
  value?: string,
): Promise<string> {
  let lastError = '';
  for (const sel of selectors) {
    try {
      const target = page.locator(sel).first();
      if ((await target.count()) === 0) continue;
      if (action === 'click') await target.click({ timeout: STEP_TIMEOUT_MS });
      else await target.fill(value || '');
      return sel;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`UI_CHANGED: no working selector (${selectors.join(' | ')}). Last: ${lastError}`);
}

export interface LiveRunInput {
  jobId: string;
  promptWrapped: string;
  projectUrl: string;
  aspect: 'portrait' | 'landscape';
  signal: AbortSignal;
  onStage: (stage: string, progress: number, detail?: string) => void;
  logStep: (entry: StepLog) => void;
}

export async function runLiveGeneration(input: LiveRunInput): Promise<{ filePath: string; bytes: number }> {
  const { chromium } = await import('playwright');
  const headless = (process.env.FLOW_HEADLESS || 'true').toLowerCase() !== 'false';
  const dir = shotsDir(input.jobId);
  const fail = async (step: string, error: unknown, url: string): Promise<never> => {
    const code = input.signal.aborted ? 'CANCELLED' : classifyFailure(error instanceof Error ? error.message : String(error), url);
    const err = new Error(`${code}: ${error instanceof Error ? error.message : String(error)} — ${recoveryHint(code)}`);
    (err as { overseerCode?: OverseerCode }).overseerCode = code;
    input.logStep({ step: `${step}:failed`, at: new Date().toISOString(), detail: code });
    throw err;
  };

  let context: { pages: () => unknown[]; newPage: () => Promise<unknown>; close: () => Promise<unknown> } | undefined;
  try {
    input.onStage('Opening Flow in persistent profile', 5);
    context = (await chromium.launchPersistentContext(flowProfileDir(), {
      headless,
      viewport: { width: 1366, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
      timeout: STEP_TIMEOUT_MS,
    })) as unknown as typeof context;
    if (!context) throw new Error('UI_CHANGED: browser context failed to launch.');
    const page = (await context.newPage()) as unknown as {
      goto: (url: string, opts?: object) => Promise<unknown>;
      url: () => string;
      locator: (sel: string) => { first: () => { click: (o?: object) => Promise<void>; fill: (v: string) => Promise<void>; count: () => Promise<number> } };
      screenshot: (opts: { path: string }) => Promise<unknown>;
      waitForEvent: (name: string, opts?: object) => Promise<unknown>;
      waitForTimeout: (ms: number) => Promise<unknown>;
      close: () => Promise<unknown>;
    };
    input.signal.throwIfAborted();
    try {
      await page.goto(input.projectUrl, { timeout: STEP_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    } catch (error) {
      await shot(page, dir, 'open-failed');
      return fail('open', error, '');
    }
    input.logStep({ step: 'open', at: new Date().toISOString(), shot: await shot(page, dir, 'open') });
    if (/accounts\.google|signin\/rejected/i.test(page.url())) {
      await shot(page, dir, 'auth-expired');
      return fail('open', new Error('Google sign-in required in this profile.'), page.url());
    }

    input.onStage('Pasting scene prompt', 15);
    input.signal.throwIfAborted();
    try {
      await clickFirst(page, SELECTORS.composer, 'fill', input.promptWrapped);
    } catch (error) {
      await shot(page, dir, 'paste-failed');
      return fail('paste', error, page.url());
    }
    input.logStep({ step: 'paste', at: new Date().toISOString(), shot: await shot(page, dir, 'paste') });

    input.onStage('Starting generation (real click, 0 automation bypass)', 25);
    input.signal.throwIfAborted();
    try {
      await clickFirst(page, SELECTORS.generateButton, 'click');
    } catch (error) {
      await shot(page, dir, 'generate-failed');
      return fail('generate', error, page.url());
    }
    input.logStep({ step: 'generate-click', at: new Date().toISOString(), shot: await shot(page, dir, 'generate-click') });

    input.onStage('Rendering in Flow (up to 10 min) — poll, no re-click', 45);
    const deadline = Date.now() + GENERATION_TIMEOUT_MS;
    let downloadPath = '';
    while (Date.now() < deadline) {
      input.signal.throwIfAborted();
      try {
        const dl = (await Promise.race([
          page.waitForEvent('download', { timeout: 30_000 }).catch(() => null),
          (async () => {
            await page.waitForTimeout(30_000);
            return null;
          })(),
        ])) as { path?: () => Promise<string>; saveAs?: (p: string) => Promise<void> } | null;
        if (dl) {
          const out = path.join(flowDownloadsDir(), `${input.jobId}.mp4`);
          if (dl.saveAs) await dl.saveAs(out);
          else if (dl.path) fs.copyFileSync(await dl.path(), out);
          downloadPath = out;
          break;
        }
      } catch (error) {
        await shot(page, dir, 'poll-failed');
        return fail('poll', error, page.url());
      }
      // Fallback: an explicit Download button appeared for a finished render.
      try {
        const btn = page.locator(SELECTORS.downloadButton.join(', ')).first();
        if ((await btn.count()) > 0) {
          const waiting = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null) as Promise<{ saveAs?: (p: string) => Promise<void>; path?: () => Promise<string> } | null>;
          await btn.click({ timeout: 15_000 });
          const dl = await waiting;
          if (dl) {
            const out = path.join(flowDownloadsDir(), `${input.jobId}.mp4`);
            if (dl.saveAs) await dl.saveAs(out);
            else if (dl.path) fs.copyFileSync(await dl.path(), out);
            downloadPath = out;
            break;
          }
        }
      } catch {
        // Keep polling until the deadline; missing button is not failure yet.
      }
      input.onStage('Rendering in Flow (up to 10 min) — poll, no re-click', Math.min(90, 45 + Math.round(((GENERATION_TIMEOUT_MS - (deadline - Date.now())) / GENERATION_TIMEOUT_MS) * 45)));
    }
    if (!downloadPath) {
      await shot(page, dir, 'timeout');
      return fail('download', new Error(`No downloadable render within ${GENERATION_TIMEOUT_MS / 60000} minutes.`), page.url());
    }
    input.logStep({ step: 'download', at: new Date().toISOString(), shot: await shot(page, dir, 'download') });
    const bytes = fs.statSync(downloadPath).size;
    if (bytes < 10_000) throw new Error(`UI_CHANGED: downloaded file is suspiciously small (${bytes} bytes).`);
    return { filePath: downloadPath, bytes };
  } finally {
    try {
      await context?.close();
    } catch {
      // Profile lock must always release, even after failures.
    }
  }
}
