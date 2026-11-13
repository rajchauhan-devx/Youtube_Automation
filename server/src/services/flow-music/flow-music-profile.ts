import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FlowMusicAccount } from './flow-music-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..', '..');

export function flowMusicDataDir(): string {
  const configured = process.env.FLOW_MUSIC_DATA_DIR?.trim();
  const dir = configured
    ? (path.isAbsolute(configured) ? configured : path.resolve(SERVER_ROOT, configured))
    : path.join(SERVER_ROOT, 'data', 'flow-music');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function flowMusicProfileDir(): string {
  const dir = path.join(flowMusicDataDir(), 'profile-default');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function flowMusicDownloadsDir(): string {
  const dir = path.join(flowMusicDataDir(), 'downloads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getBrowserChannel(): string | undefined {
  if (process.env.FLOW_BROWSER_CHANNEL) {
    return process.env.FLOW_BROWSER_CHANNEL;
  }
  if (process.platform === 'win32') {
    const edgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    if (edgePaths.some((p) => fs.existsSync(p))) {
      return 'msedge';
    }
  }
  return undefined;
}

export function cleanLockFiles(dir: string): void {
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
  for (const f of lockFiles) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {}
  }
}

export function getFlowMusicAccount(): FlowMusicAccount {
  const accountFile = path.join(flowMusicDataDir(), 'account.json');
  if (fs.existsSync(accountFile)) {
    try {
      return JSON.parse(fs.readFileSync(accountFile, 'utf8'));
    } catch {}
  }

  // Fallback to flow credits.json if user has already signed in to Google Flow video
  const flowCreditsFile = path.join(SERVER_ROOT, 'data', 'flow', 'credits.json');
  if (fs.existsSync(flowCreditsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(flowCreditsFile, 'utf8'));
      if (data?.account) {
        return {
          account: data.account,
          tier: data.tier || 'Google AI',
          status: 'ok',
          lastSync: data.lastSync || new Date().toISOString(),
          credits: data.credits ?? null,
        };
      }
    } catch {}
  }

  return {
    account: '',
    status: 'auth_required',
  };
}

export function saveFlowMusicAccount(account: Partial<FlowMusicAccount>): FlowMusicAccount {
  const current = getFlowMusicAccount();
  const updated: FlowMusicAccount = {
    ...current,
    ...account,
    lastSync: new Date().toISOString(),
  };
  const accountFile = path.join(flowMusicDataDir(), 'account.json');
  fs.writeFileSync(accountFile, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}
