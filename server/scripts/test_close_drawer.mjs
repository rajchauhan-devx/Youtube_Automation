import { chromium } from 'playwright';
import path from 'path';

async function test() {
  const profileDir = path.resolve('data/flow/profile-default');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Click + New project
  const newProj = page.locator('button:has-text("New project"), div:has-text("New project")').first();
  await newProj.click();
  await page.waitForTimeout(4000);

  console.log('Project opened URL:', page.url());
  await page.screenshot({ path: 'scripts/before-close-drawer.png' });

  // Check drawer close button
  const closeBtn = page.locator('button:has(mat-icon:has-text("close")), button[aria-label="Close"], button.close-button').first();
  console.log('Close button count:', await closeBtn.count());
  if (await closeBtn.count() > 0) {
    console.log('Clicking close drawer button...');
    await closeBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'scripts/after-close-drawer.png' });
  }

  // Check where composer is now!
  const composers = await page.$$eval('div[contenteditable="true"]', els => els.map(e => ({
    class: e.className,
    visible: e.offsetParent !== null,
    box: e.getBoundingClientRect()
  })));
  console.log('Composers found:', composers);

  // Check settings button
  const settingsBtn = page.locator('button.settings-trigger-button, button[aria-label="Settings trigger"], button:has(mat-icon:has-text("tune"))');
  console.log('Settings button count:', await settingsBtn.count());

  await context.close();
}

test().catch(console.error);
