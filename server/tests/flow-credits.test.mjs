import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-credits-'));
process.env.FLOW_PROFILE_DIR = path.join(dir, 'profile');
const { getFlowCreditsInfo, updateFlowCredits, deductFlowCredits } = await import('../dist/services/flow/credits.js');
const { parseFlowCreditLabel, isInsufficientCreditWarning } = await import('../scripts/flow-account.mjs');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
test('only an explicit Account details balance is parsed; promotions and output costs are not balances', () => {
  assert.equal(parseFlowCreditLabel('12 Google Flow credits'), 12);
  assert.equal(parseFlowCreditLabel('1,234 Google Flow credits'), 1234);
  assert.equal(parseFlowCreditLabel('0 Google Flow credits'), 0);
  for (const text of ['50 additional Flow credits daily', '20 credits / video', '800', '12 credits']) assert.equal(parseFlowCreditLabel(text), null);
  assert.equal(isInsufficientCreditWarning('This prompt uses an unsupported aspect ratio.'), false);
  assert.equal(isInsufficientCreditWarning('warning'), false);
  assert.equal(isInsufficientCreditWarning('Insufficient credits'), true);
  assert.equal(isInsufficientCreditWarning('You do not have enough credits'), true);
  assert.equal(isInsufficientCreditWarning('Not enough AI credits'), true);
});
test('missing and legacy balances are unknown rather than fabricated or treated as proof of zero', () => {
  assert.equal(getFlowCreditsInfo().credits, null);
  assert.equal(getFlowCreditsInfo().account, '');
  fs.writeFileSync(path.join(dir, 'credits.json'), JSON.stringify({ credits: 0, account: 'old@example.com', tier: 'PRO' }));
  assert.equal(getFlowCreditsInfo().credits, null);
  assert.equal(getFlowCreditsInfo().status, 'unknown');
});
test('real balance, account switching, manual estimates and deductions keep their provenance', () => {
  const synced = updateFlowCredits(12, { source: 'flow', account: 'active@example.com', tier: 'PRO' });
  assert.equal(synced.credits, 12); assert.equal(synced.source, 'flow'); assert.equal(synced.status, 'low');
  assert.equal(updateFlowCredits(undefined, { account: 'other@example.com' }).credits, null);
  assert.equal(updateFlowCredits(100, { account: 'other@example.com' }).source, 'manual');
  const estimated = deductFlowCredits(20);
  assert.equal(estimated.credits, 80); assert.equal(estimated.source, 'estimate');
  assert.throws(() => updateFlowCredits(-1), /nonnegative/);
  assert.throws(() => updateFlowCredits(NaN), /nonnegative/);
  assert.equal(getFlowCreditsInfo().credits, 80);
});
