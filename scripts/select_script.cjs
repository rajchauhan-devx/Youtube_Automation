const { chromium } = require('../server/node_modules/playwright');

async function selectScript() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Click on the Ramayana script card
  const card = page.locator('button:has-text("Short — Ramayana Conversational Dialogue")');
  console.log('Card found:', await card.count());
  await card.click();
  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: 'scratch/script_selected.png' });
  console.log('Saved scratch/script_selected.png');

  // Look for Run / Auto-Pilot button
  const runBtn = page.locator('button:has-text("Run Script"), button:has-text("Auto-Pilot"), button:has-text("Run Auto-Pilot")');
  console.log('Run buttons found:', await runBtn.allInnerTexts());

  await browser.close();
}

selectScript().catch(console.error);
