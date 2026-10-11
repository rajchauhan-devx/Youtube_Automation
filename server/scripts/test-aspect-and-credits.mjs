import { chromium } from 'playwright';

async function main() {
  const context = await chromium.launchPersistentContext('server/data/flow/profile-default', {
    headless: true,
    viewport: { width: 1366, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await context.newPage();

  // Log all network requests and responses to find credits/quota API
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('google') && (url.includes('credit') || url.includes('user') || url.includes('account') || url.includes('batch') || url.includes('flow') || url.includes('aisandbox') || url.includes('quota'))) {
      try {
        const text = await res.text();
        if (text.includes('credit') || text.includes('balance') || text.includes('subscription') || text.includes('tier') || text.includes('quota')) {
          console.log('[CREDIT-RELATED RES]', res.status(), url.slice(0, 100));
          // Print snippet
          console.log('   Snippet:', text.slice(0, 300));
        }
      } catch {}
    }
  });

  await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Check PRO button or account menu on home page
  const proBtn = page.locator('button:has-text("PRO"), [aria-label*="Account" i], [aria-label*="Google Account" i]').first();
  console.log('Found PRO / Account button:', await proBtn.count());
  if ((await proBtn.count()) > 0) {
    console.log('Clicking PRO / Account button...');
    await proBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'server/shots/account_pro_popup.png' });
    const popupTexts = await page.locator('[role="menu"], [role="dialog"], mat-menu, .cdk-overlay-pane').allInnerTexts().catch(() => []);
    console.log('Popup texts on PRO click:', popupTexts);
  }

  // Now open or create a project to test 9:16 selector
  console.log('\n--- TESTING 9:16 ASPECT RATIO SELECTION ---');
  const newProjBtn = page.locator('text=New project').first();
  await newProjBtn.click();
  await page.waitForURL('**/project/**', { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Open settings
  const settingsBtn = page.locator('button[aria-label="Settings trigger"], .settings-trigger-button').first();
  await settingsBtn.click();
  await page.waitForTimeout(1000);

  // Click Video tab
  const videoTab = page.locator('button:has-text("Video"), [role="tab"]:has-text("Video")').first();
  await videoTab.click();
  await page.waitForTimeout(1000);

  // Dump all buttons in the popup to see exact 9:16 selector
  const popupButtons = await page.locator('.cdk-overlay-pane button').all();
  console.log(`Found ${popupButtons.length} buttons in settings popup:`);
  for (const b of popupButtons) {
    const text = (await b.innerText().catch(() => '')).trim().replace(/\n+/g, ' ');
    const html = await b.evaluate(el => el.outerHTML);
    console.log(`   Button: text="${text}" | html=${html.slice(0, 120)}`);
  }

  // Try clicking 9:16
  const btn916 = page.locator('.cdk-overlay-pane button:has-text("9:16"), button:has-text("crop_9_16")').first();
  console.log('Found 9:16 button:', await btn916.count());
  await btn916.click();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'server/shots/after_9_16_click.png' });

  // Close popup
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Check what the settings trigger button text says now
  const triggerText = await settingsBtn.innerText();
  console.log('Settings trigger text after 9:16 selection:', triggerText.replace(/\n+/g, ' '));
  await page.screenshot({ path: 'server/shots/trigger_after_9_16.png' });

  await context.close();
}

main().catch(console.error);
