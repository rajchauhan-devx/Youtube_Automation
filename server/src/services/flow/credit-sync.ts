import type { Page } from 'playwright';
import { readFlowAccount } from '../../../scripts/flow-account.mjs';
import { flowProfileDir } from './profile.js';
import { getFlowCreditsInfo, updateFlowCredits, type FlowCreditsState } from './credits.js';

export async function syncFlowAccountPage(page: Page): Promise<FlowCreditsState | null> {
  const current = getFlowCreditsInfo();
  const snapshot = await readFlowAccount(page);
  if (!snapshot) return null;

  // Protect against account reversion!
  // If an active account is configured and snapshot reveals a different account:
  if (current.account && snapshot.account && current.account.toLowerCase() !== snapshot.account.toLowerCase()) {
    console.warn(`[Flow Sync] Account mismatch: page loaded ${snapshot.account}, but active account is ${current.account}. Preserving active account.`);
    return {
      ...current,
      syncError: `Browser is signed into ${snapshot.account}, but active account is ${current.account}. Please switch to ${current.account} in Flow.`,
    };
  }

  return updateFlowCredits(snapshot.credits, { ...snapshot, source: 'flow' });
}

let pending: Promise<FlowCreditsState> | undefined;
export function syncFlowCredits(): Promise<FlowCreditsState> {
  return pending ??= refresh().finally(() => { pending = undefined; });
}

async function refresh(): Promise<FlowCreditsState> {
  let context;
  try {
    const { flowJobsBusy } = await import('./jobs.js');
    if (flowJobsBusy()) return { ...getFlowCreditsInfo(), syncError: 'Flow is generating. Its balance will refresh when the job finishes.' };
    const { isFlowLoginActive } = await import('../../routes/flow.js');
    if (isFlowLoginActive()) return { ...getFlowCreditsInfo(), syncError: 'Browser login window is currently open. Please complete sign-in and close the browser.' };

    const current = getFlowCreditsInfo();
    const { chromium } = await import('playwright');
    context = await chromium.launchPersistentContext(flowProfileDir(), {
      headless: true,
      channel: process.env.FLOW_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
      viewport: { width: 1280, height: 800 },
      timeout: 10000,
    });
    const page = context.pages()[0] || await context.newPage();
    const targetUrl = current.account
      ? `https://flow.google.com/?authuser=${encodeURIComponent(current.account)}`
      : 'https://flow.google.com/';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.getByRole('button', { name: 'Account details', exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    const result = await syncFlowAccountPage(page);
    if (!result) throw new Error('Flow did not show a readable account balance. Open Flow and sign in, then sync again.');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Flow balance could not be refreshed.';
    return {
      ...getFlowCreditsInfo(),
      syncError: /SingletonLock|user data directory.*in use|ProcessSingleton/i.test(message)
        ? 'The Flow browser is open. Close it, then Sync; the login helper also syncs while open.'
        : message.slice(0, 350),
    };
  } finally {
    await context?.close().catch(() => {});
  }
}
