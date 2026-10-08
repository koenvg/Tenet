import type { Page } from 'playwright';

export async function reveal(page: Page, selector: string) {
  const disclosure = page.locator(selector);
  if (await disclosure.getAttribute('open') === null) await disclosure.locator(':scope > summary').click();
}

export async function openRecordedData(page: Page, section: 'Evidence' | 'Questions' = 'Evidence') {
  await reveal(page, '.recorded-disclosure');
  if (section === 'Questions') {
    await reveal(page, '.exact-rules');
    await page.getByRole('region', { name: 'Exact rule records and captured questions', exact: true }).focus();
  } else {
    await reveal(page, '.submitted-evidence-details');
    await page.getByRole('region', { name: 'Submitted evidence', exact: true }).focus();
  }
}
