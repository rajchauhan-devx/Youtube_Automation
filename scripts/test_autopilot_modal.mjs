import { chromium } from '../server/node_modules/playwright/index.mjs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  
  page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[PAGE ERROR]', err.message));

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  
  await page.evaluate(() => {
    const state = { channelId: 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab', section: 'shorts', tab: 'preview', selectedScriptId: 'usr_d01557ac-2510-4b84-9bd3-eff090cb82dc' };
    localStorage.setItem('tubeflow:v1', JSON.stringify(state));
    localStorage.setItem('tubeflow:v1:acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab', JSON.stringify(state));
  });
  
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const apBtn = page.locator('button:has-text("Run Auto-Pilot")').first();
  await apBtn.click();
  await page.waitForTimeout(2000);
  
  const form = page.locator('form');
  const formCount = await form.count();
  console.log('Form count:', formCount);

  const modalSubmit = page.locator('.fixed form button[type="submit"]');
  console.log('Modal submit text:', await modalSubmit.innerText());
  console.log('Modal submit isEnabled:', await modalSubmit.isEnabled());
  const modalText = await page.locator('.fixed').first().innerText();
  console.log('Modal text snippet:', modalText.slice(0, 400));

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
