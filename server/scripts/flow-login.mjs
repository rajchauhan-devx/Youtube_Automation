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

async function main() {
  const configured = process.env.FLOW_PROFILE_DIR?.trim();
  const profileDir = configured
    ? path.isAbsolute(configured) ? configured : path.resolve(SERVER_ROOT, configured)
    : path.join(SERVER_ROOT, 'data', 'flow', 'profile-default');

  const isFresh = process.argv.includes('--fresh');
  if (isFresh) {
    console.log(`Clearing previous Google Flow profile for fresh login...`);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Could not remove profileDir:', e.message);
    }
  }
  fs.mkdirSync(profileDir, { recursive: true });

  const channel = getBrowserChannel();
  console.log(`\n======================================================`);
  console.log(` Google Flow One-Time Login Helper`);
  console.log(` Profile Directory: ${profileDir}`);
  console.log(` Browser Channel:   ${channel || 'bundled chromium'}`);
  console.log(` Fresh Session:     ${isFresh ? 'YES' : 'NO'}`);
  console.log(`======================================================\n`);
  console.log(`Opening browser window...`);
  console.log(`1. Sign in to your Google Account (with Google Flow / Pro access).`);
  console.log(`2. Verify that Google Flow studio loads.`);
  console.log(`3. When you are done, simply CLOSE the browser window.\n`);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded' });

  const creditsPath = path.join(path.dirname(profileDir), 'credits.json');

  // Monitor in background for account changes while user is browsing
  let syncing = false;
  const interval = setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      if (page.isClosed()) return;
      const snapshot = await readFlowAccount(page);
      if (snapshot) {
        fs.writeFileSync(creditsPath, JSON.stringify({ ...snapshot, source: 'flow', lastSync: new Date().toISOString(), costPerVideo: 20 }, null, 2), 'utf8');
        console.log(`[Flow] Synced ${snapshot.credits} credits for ${snapshot.account}.`);
      }
    } catch {} finally { syncing = false; }
  }, 10000);

  // Wait until user closes the browser
  await new Promise((resolve) => {
    context.on('close', () => {
      clearInterval(interval);
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
