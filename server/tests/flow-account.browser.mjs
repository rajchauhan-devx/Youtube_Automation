import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFlowAccount } from '../scripts/flow-account.mjs';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<div>old-account@example.com · 50 additional Flow credits daily</div>
    <button aria-label="Google Account: Current User (current@example.com)">Account</button>
    <div aria-label="PRO tier">PRO</div>
    <button aria-label="Account details" onclick="document.getElementById('panel').hidden=false">Details</button>
    <div id="panel" hidden><button aria-label="Close account panel" onclick="document.getElementById('panel').hidden=true">Close</button>
    <a aria-label="12 Google Flow credits" href="https://accounts.google.com/AccountChooser?Email=current%40example.com">12 Google Flow credits</a></div>`);
  assert.deepEqual(await readFlowAccount(page), { credits: 12, account: 'current@example.com', tier: 'PRO' });
  assert.equal(await page.locator('#panel').isVisible(), false);
  await page.setContent('<div>50 additional Flow credits daily</div>');
  assert.equal(await readFlowAccount(page), null);
  console.log('Flow account browser checks passed: actual account panel balance, account identity, closed panel, and no promotional balances.');
} finally { await browser.close(); }
