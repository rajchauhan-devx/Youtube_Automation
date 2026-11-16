import { chromium } from '../server/node_modules/playwright/index.mjs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  
  page.on('console', msg => console.log('LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Switch to Mixed Media if needed
  const mixedBtn = page.locator('button:has-text("Mixed Media"), a:has-text("Mixed Media")').first();
  if (await mixedBtn.isVisible()) {
    console.log('Clicking Mixed Media button...');
    await mixedBtn.click();
    await page.waitForTimeout(2000);
  }

  const scripts = await page.evaluate(() => {
    return (window.__getScopeScripts ? window.__getScopeScripts() : []).map(s => ({
      id: s.id,
      topic: s.topicName || s.name,
      section: s.section,
      hasAutoPilotSettings: !!s.autoPilotSettings
    }));
  });
  console.log('Scope scripts:', JSON.stringify(scripts, null, 2));

  const targetId = 'usr_4d2be8eb-9be4-4e7a-a422-72f795c0315b';
  console.log('Testing resume on', targetId);

  const evalRes = await page.evaluate((id) => {
    try {
      if (typeof window.__resumeAutoPilot !== 'function') {
        return { error: '__resumeAutoPilot is not a function' };
      }
      const res = window.__resumeAutoPilot(id);
      return { triggered: true, returnedType: typeof res, isPromise: res && typeof res.then === 'function' };
    } catch (err) {
      return { error: err.message, stack: err.stack };
    }
  }, targetId);

  console.log('Eval result:', evalRes);

  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(2000);
    const apState = await page.evaluate(() => window.__autoPilotState);
    console.log(`Poll ${i+1}: stage=${apState?.stage}, status=${apState?.statusMessage}, percent=${apState?.progressPercent}`);
  }

  await browser.close();
}

main().catch(console.error);
