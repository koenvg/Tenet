import type { Page } from 'playwright';

export async function reveal(page: Page, selector: string) {
  const disclosure = page.locator(selector);
  if (await disclosure.getAttribute('open') === null) await disclosure.locator(':scope > summary').click();
}

export async function openEvidence(page: Page, tab: 'Evidence' | 'Questions' = 'Evidence') {
  await reveal(page, '.evidence-disclosure');
  await page.getByRole('tab', { name: tab, exact: true }).click();
}
