import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findServerRoot(): string {
  // Works both in dev (src/...) and production builds (dist/...).
  let dir = path.resolve(__dirname, '..', '..');
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..');
}
const SERVER_ROOT = findServerRoot();

export interface FlowStatus {
  installed: boolean;
  browsersInstalled: boolean;
  profileReady: boolean;
  profileDir: string;
  projectUrl: string;
  headless: boolean;
  creditBudgetPerEpisode: number;
  maxJobs: number;
  note: string;
}

export function flowProfileDir(): string {
  const configured = process.env.FLOW_PROFILE_DIR?.trim();
  const dir = configured
    ? path.isAbsolute(configured) ? configured : path.resolve(SERVER_ROOT, configured)
    : path.join(SERVER_ROOT, 'data', 'flow', 'profile-default');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function playwrightResolvable(): boolean {
  try {
    import.meta.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}

async function chromiumPresent(): Promise<boolean> {
  try {
    const { chromium } = await import('playwright');
    const exe = chromium.executablePath();
    return Boolean(exe) && fs.existsSync(exe);
  } catch {
    return false;
  }
}

function profileHasSession(dir: string): boolean {
  // Playwright persistent contexts store cookies/storage in the profile dir.
  // Any of these markers means a previous headed login ran here.
  const markers = ['storageState.json', 'Default/Cookies', 'Default/Network/Cookies', 'Cookies'];
  return markers.some((marker) => fs.existsSync(path.join(dir, marker)));
}

export async function flowStatus(): Promise<FlowStatus> {
  const profileDir = flowProfileDir();
  const installed = playwrightResolvable();
  const browsersInstalled = installed ? await chromiumPresent() : false;
  const profileReady = profileHasSession(profileDir);
  const note = !installed
    ? 'Playwright package is not installed. Run npm install in server/, then npx playwright install chromium.'
    : !browsersInstalled
      ? 'Browsers are not downloaded. Run: npx playwright install chromium --with-deps (Windows: without --with-deps).'
      : !profileReady
        ? 'Open a headed browser once with this profile dir, sign in to Google, open Flow, then keep the profile. No password is ever stored by TubeFlow.'
        : 'Ready for single-scene Flow jobs.';
  return {
    installed,
    browsersInstalled,
    profileReady,
    profileDir,
    projectUrl: process.env.FLOW_PROJECT_URL || 'https://labs.google/fx/tools/flow',
    headless: (process.env.FLOW_HEADLESS || 'true').toLowerCase() !== 'false',
    creditBudgetPerEpisode: Number.parseInt(process.env.FLOW_CREDIT_BUDGET_PER_EPISODE || '320', 10),
    maxJobs: Math.max(1, Number.parseInt(process.env.FLOW_MAX_JOBS || '1', 10)),
    note,
  };
}

export function flowLoginSteps(): { profileDir: string; projectUrl: string; steps: string[] } {
  return {
    profileDir: flowProfileDir(),
    projectUrl: process.env.FLOW_PROJECT_URL || 'https://labs.google/fx/tools/flow',
    steps: [
      'Launch Chromium with the profile dir above (headed).',
      'Sign in to your Google account and solve any 2FA/CAPTCHA yourself.',
      'Open the Flow project URL and click "Sign in to Flow" (separate sign-in).',
      'Close the browser. Future jobs reuse this profile headlessly.',
      'Never run two jobs on the same profile at once (Chromium profile lock).',
    ],
  };
}
