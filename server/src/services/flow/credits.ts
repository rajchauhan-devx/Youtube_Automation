import fs from 'node:fs';
import path from 'node:path';
import { flowProfileDir } from './profile.js';

export interface FlowCreditsState {
  credits: number;
  lastSync: string;
  tier: string;
  account: string;
  costPerVideo: number;
  videosRemaining: number;
  status: 'ok' | 'low' | 'exhausted';
}

function creditsFilePath(): string {
  const dir = path.join(flowProfileDir(), '..');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'credits.json');
}

export function getFlowCreditsInfo(): FlowCreditsState {
  const filePath = creditsFilePath();
  let state = {
    credits: 812, // Verified initial balance from Google Flow PRO account
    lastSync: new Date().toISOString(),
    tier: 'PRO',
    account: 'zrajchauhan3@gmail.com',
    costPerVideo: 12,
  };

  if (fs.existsSync(filePath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      state = { ...state, ...saved };
    } catch {
      // Use defaults if parse fails
    }
  } else {
    try {
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
    } catch {}
  }

  const videosRemaining = Math.max(0, Math.floor(state.credits / state.costPerVideo));
  const status: 'ok' | 'low' | 'exhausted' =
    state.credits < state.costPerVideo ? 'exhausted' : state.credits < 50 ? 'low' : 'ok';

  return {
    ...state,
    videosRemaining,
    status,
  };
}

export function updateFlowCredits(credits?: number, meta?: { account?: string; tier?: string; costPerVideo?: number }): FlowCreditsState {
  const current = getFlowCreditsInfo();
  const updated = {
    credits: typeof credits === 'number' && !isNaN(credits) ? credits : current.credits,
    lastSync: new Date().toISOString(),
    tier: meta?.tier || current.tier,
    account: meta?.account || current.account,
    costPerVideo: meta?.costPerVideo || current.costPerVideo,
  };

  try {
    fs.writeFileSync(creditsFilePath(), JSON.stringify(updated, null, 2), 'utf8');
  } catch {}

  return getFlowCreditsInfo();
}

export function deductFlowCredits(amount: number = 12): FlowCreditsState {
  const current = getFlowCreditsInfo();
  const nextCredits = Math.max(0, current.credits - amount);
  return updateFlowCredits(nextCredits);
}
