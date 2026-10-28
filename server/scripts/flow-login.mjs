import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { readFlowAccount } from './flow-account.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

function getBrowserChannel() {
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

function cleanLockFiles(dir) {
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
  for (const f of lockFiles) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {}
  }
}

function wipeDirectoryContents(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  } catch {}
  // Fallback: delete files individually
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        fs.rmSync(full, { recursive: true, force: true });
      } catch {}
    }
  } catch {}
}

async function main() {
  const configured = process.env.FLOW_PROFILE_DIR?.trim();
  const profileDir = configured
    ? path.isAbsolute(configured) ? configured : path.resolve(SERVER_ROOT, configured)
    : path.join(SERVER_ROOT, 'data', 'flow', 'profile-default');

  const dataDir = path.dirname(profileDir);
  fs.mkdirSync(dataDir, { recursive: true });

  const pidFile = path.join(dataDir, 'login.pid');
  try {
    fs.writeFileSync(pidFile, String(process.pid), 'utf8');
  } catch {}

  const creditsPath = path.join(dataDir, 'credits.json');
  const isFresh = process.argv.includes('--fresh');

  if (isFresh) {
    console.log(`Clearing previous Google Flow profile and credentials for fresh login...`);
    // Reset credits.json so old account is immediately cleared
    try {
      const blankCredits = {
        credits: null,
        account: '',
        tier: '',
        source: 'unknown',
        costPerVideo: 20,
        lastSync: null,
      };
      fs.writeFileSync(creditsPath, JSON.stringify(blankCredits, null, 2), 'utf8');
    } catch (e) {
      console.warn('Could not reset credits.json:', e.message);
    }
    wipeDirectoryContents(profileDir);
  }

  fs.mkdirSync(profileDir, { recursive: true });
  cleanLockFiles(profileDir);

  const channel = getBrowserChannel();
  console.log(`\n======================================================`);
  console.log(` Google Flow One-Time Login Helper`);
  console.log(` Profile Directory: ${profileDir}`);
  console.log(` Browser Channel:   ${channel || 'bundled chromium'}`);
  console.log(` Fresh Session:     ${isFresh ? 'YES' : 'NO'}`);
  console.log(` PID:               ${process.pid}`);
  console.log(`======================================================\n`);
  console.log(`Opening browser window...`);
  console.log(`1. Sign in to your Google Account (with Google Flow / Pro access).`);
  console.log(`2. Verify that Google Flow studio loads.`);
  console.log(`3. When you are done, simply CLOSE the browser window.\n`);

  const launchArgs = [
    '--start-maximized',
    '--disable-blink-features=AutomationControlled',
    '--no-default-browser-check',
  ];

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel,
      headless: false,
      viewport: null,
      args: launchArgs,
      timeout: 15000,
    });
  } catch (launchErr) {
    console.warn(`Launch with channel "${channel}" failed: ${launchErr.message}. Falling back to default Chromium...`);
    cleanLockFiles(profileDir);
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: null,
      args: launchArgs,
      timeout: 15000,
    });
  }

  const page = context.pages()[0] || (await context.newPage());
  try {
    await page.bringToFront();
  } catch {}

  let activeAccount = '';
  try {
    if (fs.existsSync(creditsPath)) {
      const parsed = JSON.parse(fs.readFileSync(creditsPath, 'utf8'));
      activeAccount = parsed.account || '';
    }
  } catch {}

  const targetUrl = isFresh
    ? 'https://accounts.google.com/ServiceLogin?service=wise&passive=1209600&continue=https%3A%2F%2Fflow.google.com%2F'
    : (activeAccount
        ? `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(activeAccount)}&continue=${encodeURIComponent('https://flow.google.com/')}`
        : 'https://flow.google.com/');

  console.log(`Navigating to ${targetUrl}...`);
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (navErr) {
    console.warn(`Initial navigation notice: ${navErr.message}`);
  }

  // Monitor in background for account changes while user is browsing
  let syncing = false;
  const interval = setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      if (page.isClosed()) return;
      const url = page.url();
      // Only sync if user has actually reached flow.google.com
      if (!url.includes('flow.google.com')) return;
      const snapshot = await readFlowAccount(page);
      if (snapshot && snapshot.account) {
        fs.writeFileSync(
          creditsPath,
          JSON.stringify({ ...snapshot, source: 'flow', lastSync: new Date().toISOString(), costPerVideo: 20 }, null, 2),
          'utf8'
        );
        console.log(`[Flow] Synced ${snapshot.credits} credits for ${snapshot.account}.`);
      }
    } catch {} finally {
      syncing = false;
    }
  }, 4000);

  // Wait until user closes the browser
  await new Promise((resolve) => {
    context.on('close', () => {
      clearInterval(interval);
      try {
        fs.unlinkSync(pidFile);
      } catch {}
      resolve();
    });
  });

  console.log(`\nBrowser closed! Your Google Flow session has been saved.`);
  console.log(`You can now run automated video generation on this PC!\n`);
}

main().catch((err) => {
  console.error('Login helper error:', err.message);
  process.exit(1);
});
