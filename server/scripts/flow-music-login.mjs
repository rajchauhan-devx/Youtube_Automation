import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

async function extractAccountEmail(page) {
  try {
    // 1. Check account button or Google avatar
    const accountBtn = page.locator('button[aria-label*="Google Account:"], [aria-label*="@gmail.com"], [data-email]').first();
    if (await accountBtn.count()) {
      const label = (await accountBtn.getAttribute('aria-label')) || (await accountBtn.getAttribute('data-email')) || '';
      const match = label.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      if (match) return match[0];
    }

    // 2. Check profile avatar or menu in Flow / MusicFX
    const profileImg = page.locator('img[alt*="@"], img[aria-label*="@"]').first();
    if (await profileImg.count()) {
      const text = (await profileImg.getAttribute('alt')) || (await profileImg.getAttribute('aria-label')) || '';
      const match = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      if (match) return match[0];
    }

    // 3. Check page cookies or local storage
    const cookies = await page.context().cookies();
    for (const c of cookies) {
      if (c.name.includes('ACCOUNT_CHOOSER') || c.name.includes('user')) {
        const decoded = decodeURIComponent(c.value);
        const match = decoded.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
        if (match) return match[0];
      }
    }
  } catch {}
  return null;
}

async function main() {
  const dataDir = path.join(SERVER_ROOT, 'data', 'flow-music');
  const profileDir = path.join(dataDir, 'profile-default');
  fs.mkdirSync(dataDir, { recursive: true });

  const pidFile = path.join(dataDir, 'login.pid');
  try {
    fs.writeFileSync(pidFile, String(process.pid), 'utf8');
  } catch {}

  const accountFile = path.join(dataDir, 'account.json');
  const isFresh = process.argv.includes('--fresh');

  if (isFresh) {
    console.log(`[Google Flow Music] Clearing previous session for fresh account switch...`);
    try {
      fs.writeFileSync(
        accountFile,
        JSON.stringify({ account: '', status: 'auth_required', lastSync: new Date().toISOString() }, null, 2),
        'utf8'
      );
    } catch {}
    wipeDirectoryContents(profileDir);
  }

  fs.mkdirSync(profileDir, { recursive: true });
  cleanLockFiles(profileDir);

  const channel = getBrowserChannel();
  console.log(`\n======================================================`);
  console.log(` Google Flow Music Login & Account Switcher`);
  console.log(` Profile Directory: ${profileDir}`);
  console.log(` Browser Channel:   ${channel || 'bundled chromium'}`);
  console.log(` Fresh Switch:      ${isFresh ? 'YES' : 'NO'}`);
  console.log(` PID:               ${process.pid}`);
  console.log(`======================================================\n`);
  console.log(`Opening browser window...`);
  console.log(`1. Sign in to your Google Account (or select your account).`);
  console.log(`2. Verify that Google Flow Music / MusicFX loads.`);
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
      timeout: 20000,
    });
  } catch (launchErr) {
    console.warn(`Launch with channel "${channel}" failed: ${launchErr.message}. Falling back to default Chromium...`);
    cleanLockFiles(profileDir);
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: null,
      args: launchArgs,
      timeout: 20000,
    });
  }

  const page = context.pages()[0] || (await context.newPage());
  try {
    await page.bringToFront();
  } catch {}

  let activeAccount = '';
  try {
    if (fs.existsSync(accountFile)) {
      const parsed = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
      activeAccount = parsed.account || '';
    }
  } catch {}

  const targetUrl = isFresh
    ? 'https://www.flowmusic.app/'
    : (activeAccount
        ? `https://www.flowmusic.app/?authuser=${encodeURIComponent(activeAccount)}`
        : 'https://www.flowmusic.app/');

  console.log(`Navigating to ${targetUrl}...`);
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  } catch (navErr) {
    console.warn(`Navigation notice: ${navErr.message}`);
  }

  // Periodic account sync while browser is open
  let syncing = false;
  const interval = setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      if (page.isClosed()) return;
      const detectedEmail = await extractAccountEmail(page);
      if (detectedEmail && detectedEmail !== activeAccount) {
        activeAccount = detectedEmail;
        fs.writeFileSync(
          accountFile,
          JSON.stringify({
            account: detectedEmail,
            tier: 'Google AI',
            status: 'ok',
            lastSync: new Date().toISOString(),
          }, null, 2),
          'utf8'
        );
        console.log(`[Google Flow Music] Detected and saved active account: ${detectedEmail}`);
      }
    } catch {} finally {
      syncing = false;
    }
  }, 3000);

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

  console.log(`\nBrowser closed! Your Google Flow Music session has been saved.`);
}

main().catch((err) => {
  console.error('[Google Flow Music] Login helper error:', err.message);
  process.exit(1);
});
