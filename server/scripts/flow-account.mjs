// Shared by the headed login helper and server worker. Only the Account details
// balance is authoritative; promotional daily credits and generation costs are not.
export function parseFlowCreditLabel(label) {
  const match = /^\s*([\d,]+)\s+Google Flow credits\s*$/i.exec(label);
  if (!match) return null;
  const value = Number(match[1].replaceAll(',', ''));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function isInsufficientCreditWarning(text) {
  return /(?:insufficient|not enough|out of|no remaining|do not have enough)\s+(?:Google Flow\s+|AI\s+)?credits|(?:credits|balance)\s+(?:are\s+|is\s+)?(?:insufficient|exhausted)|need\s+(?:more|additional)\s+(?:AI\s+)?credits/i.test(text);
}

export async function readFlowAccount(page) {
  const balance = page.getByRole('link', { name: /^[\d,]+ Google Flow credits$/i }).first();
  let opened = false;
  try {
    if (!await balance.isVisible()) {
      const account = page.getByRole('button', { name: 'Account details', exact: true });
      if (!await account.isVisible()) return null;
      await account.click({ timeout: 3000 }); opened = true;
    }
    await balance.waitFor({ state: 'visible', timeout: 4000 });
    const label = await balance.getAttribute('aria-label') || await balance.innerText();
    const credits = parseFlowCreditLabel(label);
    if (credits === null) return null;
    const accountButton = page.getByRole('button', { name: /^Google Account:/ }).first();
    const accountLabel = await accountButton.count() ? await accountButton.getAttribute('aria-label') : '';
    // A credit link's Email query identifies the actual balance owner, not a
    // random account tile left elsewhere in the page.
    const href = await balance.getAttribute('href');
    const account = href ? new URL(href, page.url()).searchParams.get('Email') || '' : '';
    const email = account || accountLabel?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
    if (!email) return null;
    const tierLabel = page.locator('[aria-label$=" tier"]').first();
    const tier = await tierLabel.count() ? await tierLabel.getAttribute('aria-label') : null;
    return { credits, account: email, tier: tier?.replace(/ tier$/i, '') || '' };
  } finally {
    if (opened) await page.getByRole('button', { name: 'Close account panel', exact: true }).click({ timeout: 1000 }).catch(() => {});
  }
}
