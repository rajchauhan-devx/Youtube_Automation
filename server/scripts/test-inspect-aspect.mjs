import { chromium } from 'playwright';

async function main() {
  const context = await chromium.launchPersistentContext('server/data/flow/profile-default', { headless: true });
  const page = await context.newPage();
  await page.goto('https://flow.google.com/project/5ee9f271-d155-4e58-a4e0-4b41c7aebb7f', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const settingsBtn = page.locator('button[aria-label="Settings trigger"]').first();
  await settingsBtn.click();
  await page.waitForTimeout(1000);

  const videoTab = page.locator('button:has-text("Video")').first();
  await videoTab.click();
  await page.waitForTimeout(1000);

  // List all buttons in the popup
  const allBtns = await page.locator('.cdk-overlay-pane button').all();
  console.log('Total buttons in popup:', allBtns.length);
  for (const b of allBtns) {
    const text = (await b.innerText().catch(() => '')).trim().replace(/\n+/g, ' ');
    const html = await b.evaluate(el => el.outerHTML);
    console.log(`Button text="${text}"`);
    console.log(`       html=${html}\n`);
  }

  // Now click 9:16
  const target916 = page.locator('.cdk-overlay-pane button').filter({ hasText: '9:16' }).first();
  console.log('Clicking target 9:16 button...');
  await target916.click();
  await page.waitForTimeout(1000);

  // Close popup
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  console.log('FINAL TRIGGER TEXT:', (await settingsBtn.innerText()).replace(/\n+/g, ' '));
  await page.screenshot({ path: 'server/shots/final_aspect_verification.png' });

  await context.close();
}

main().catch(console.error);
