import fs from 'node:fs';
import path from 'node:path';
import { flowProfileDir } from './profile.js';

export interface FlowCreditsState {
  credits: number | null;
  lastSync: string | null;
  tier: string;
  account: string;
  costPerVideo: number;
  videosRemaining: number | null;
  status: 'ok' | 'low' | 'exhausted' | 'unknown';
  source: 'flow' | 'manual' | 'estimate' | 'unknown';
  syncError?: string;
}

function creditsFilePath(): string {
  const dir = path.dirname(flowProfileDir());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'credits.json');
}

export function getFlowCreditsInfo(): FlowCreditsState {
  let saved: Partial<FlowCreditsState> = {};
  try { saved = JSON.parse(fs.readFileSync(creditsFilePath(), 'utf8')); } catch { /* Unknown is preferable to an invented balance. */ }
  const valid = typeof saved.credits === 'number' && Number.isFinite(saved.credits) && saved.credits >= 0;
  const source = ['flow', 'manual', 'estimate', 'unknown'].includes(saved.source || '') ? saved.source! : 'unknown';
  // Legacy balances were hardcoded or zeroed by generic UI warnings. They
  // cannot identify the current account or establish that it has no credits.
  const credits = valid && source !== 'unknown' ? saved.credits! : null;
  const costPerVideo = typeof saved.costPerVideo === 'number' && saved.costPerVideo > 0 ? saved.costPerVideo : 20;
  return { credits, source, costPerVideo, lastSync: source === 'unknown' ? null : saved.lastSync || null,
    account: source === 'unknown' ? '' : saved.account || '', tier: source === 'unknown' ? '' : saved.tier || '',
    videosRemaining: credits === null ? null : Math.floor(credits / costPerVideo),
    status: credits === null ? 'unknown' : credits === 0 ? 'exhausted' : credits < 50 ? 'low' : 'ok' };
}

export function updateFlowCredits(credits?: number, meta?: { account?: string; tier?: string; costPerVideo?: number; source?: FlowCreditsState['source'] }): FlowCreditsState {
  if (credits !== undefined && (!Number.isFinite(credits) || credits < 0)) throw new Error('Credits must be a nonnegative number.');
  if (meta?.costPerVideo !== undefined && (!Number.isFinite(meta.costPerVideo) || meta.costPerVideo <= 0)) throw new Error('Estimated credit cost must be positive.');
  const current = getFlowCreditsInfo();
  const switched = !!meta?.account && meta.account !== current.account;
  const updated = { credits: credits ?? (switched ? null : current.credits),
    lastSync: credits === undefined ? switched ? null : current.lastSync : new Date().toISOString(),
    tier: meta?.tier ?? (switched ? '' : current.tier), account: meta?.account ?? current.account,
    costPerVideo: meta?.costPerVideo ?? current.costPerVideo,
    source: meta?.source || (credits !== undefined ? 'manual' : switched ? 'unknown' : current.source) };
  const file = creditsFilePath(), temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(updated, null, 2), 'utf8');
  fs.renameSync(temp, file);
  return getFlowCreditsInfo();
}

export function deductFlowCredits(amount: number): FlowCreditsState {
  const current = getFlowCreditsInfo();
  if (current.credits === null) return current;
  return updateFlowCredits(Math.max(0, current.credits - amount), { source: 'estimate' });
}
