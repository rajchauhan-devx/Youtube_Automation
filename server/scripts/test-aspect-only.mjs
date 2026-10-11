import { chromium } from 'playwright';

async function main() {
  const context = await chromium.launchPersistentContext('server/data/flow/profile-default', {
    headless: true,
    viewport: { width: 1366, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await context.newPage();
  await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Click "+ New project"
  const newProjBtn = page.locator('button:has-text("New project"), [aria-label*="New project" i], div:has-text("New project")').first();
  await newProjBtn.click();
  await page.waitForURL('**/project/**', { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Open settings
  const settingsBtn = page.locator('button[aria-label="Settings trigger"], .settings-trigger-button').first();
  console.log('Opening settings trigger...');
  await settingsBtn.click();
  await page.waitForTimeout(1000);

  // Click Video tab
  const videoTab = page.locator('button:has-text("Video"), [role="tab"]:has-text("Video")').first();
  console.log('Clicking Video tab...');
  await videoTab.click();
  await page.waitForTimeout(1000);

  // Inspect the aspect ratio buttons
  const aspectButtons = await page.locator('.aspect-ratio-selector button, button:has-text("9:16"), button:has-text("16:9")').all();
  console.log('Aspect ratio buttons found:', aspectButtons.length);
  for (const b of aspectButtons) {
    console.log(' - text:', (await b.innerText()).trim().replace(/\n+/g, ' '), 'html:', await b.evaluate(el => el.outerHTML));
  }

  // Click 9:16 button
  const btn916 = page.locator('button:has-text("9:16"), button:has(mat-icon:has-text("crop_9_16"))').first();
  console.log('Clicking 9:16 button...');
  await btn916.click();
  await page.waitForTimeout(1000);

  // Take screenshot of popup with 9:16 selected
  await page.screenshot({ path: 'server/shots/popup_with_9_16.png' });

  // Close popup with Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Check the settings trigger text
  const afterText = (await settingsBtn.innerText()).trim().replace(/\n+/g, ' ');
  console.log('Settings trigger text after selecting 9:16 and closing popup:');
  console.log('"', afterText, '"');
  await page.screenshot({ path: 'server/shots/trigger_with_9_16.png' });

  await context.close();
}

main().catch(console.error);
