import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import ComparisonPreview from '../../src/shared/ComparisonPreview.svelte';

for (const width of [1000, 390]) test(`both adapters have the same safe content, order and geometry at ${width}px`, async () => {
  await page.viewport(2200, 1200);
  const screen = await render(ComparisonPreview, { panelWidth: width });
  const left = screen.container.querySelector<HTMLElement>('#standalone-preview')!;
  const right = screen.container.querySelector<HTMLElement>('#embedded-preview')!;
  await expect.element(screen.getByText(/^Comparison ready/)).toBeVisible();
  function snapshot(target: HTMLElement) {
    const common = target.querySelector<HTMLElement>('[aria-label="Common call summary"]')!;
    const box = common.getBoundingClientRect();
    const copy = common.cloneNode(true) as HTMLElement;
    for (const element of copy.querySelectorAll('[id], [aria-controls]')) {
      element.removeAttribute('id'); element.removeAttribute('aria-controls');
    }
    return {
      markup: copy.outerHTML.replace(/<!--.*?-->/gs, ''),
      layout: [common, ...common.querySelectorAll<HTMLElement>('*')].filter(el => el.checkVisibility()).map(el => {
        const r = el.getBoundingClientRect();
        return [el.tagName, ...[r.x - box.x, r.y - box.y, r.width, r.height].map(n => Math.round(n * 10) / 10)];
      }),
      calls: target.querySelector('[aria-label="Invocations"]')?.textContent,
      selected: target.querySelector('.call-row[aria-pressed="true"]')?.getAttribute('data-call-id'),
      category: target.querySelector('select')?.value,
    };
  }
  async function match() {
    await expect.poll(() => snapshot(right)).toEqual(snapshot(left));
    expect(left.querySelector('.common-summary')?.textContent).not.toContain('RAW_ACTION_SENTINEL');
    expect(right.textContent).not.toContain('RAW_ACTION_SENTINEL');
  }
  const leftUI = screen.getByRole('region', { name: 'Standalone adapter' });
  const rightUI = screen.getByRole('region', { name: 'BB adapter' });
  if (width === 390) await leftUI.getByRole('button', { name: 'Summary', exact: true }).click();
  await match();
  await leftUI.getByText('Why this assessment', { exact: true }).click();
  await leftUI.getByRole('button', { name: 'Inspect evidence confidence' }).click();
  await rightUI.getByText(/Browse all rules/).click();
  await rightUI.getByRole('button', { name: /Record every file edit/ }).click();
  await match();
  await leftUI.getByText('Probabilities and rule details', { exact: true }).click();
  await match();
  await screen.getByRole('checkbox', { name: 'Show standalone-only inspection' }).click();
  await match();
  const raw = leftUI.getByRole('region', { name: 'Standalone-only inspection' });
  await raw.getByText('Recorded action', { exact: true }).click();
  await expect.element(raw.getByText('RAW_ACTION_SENTINEL', { exact: true })).toBeVisible();
  expect(right.querySelector('[aria-label="Standalone-only inspection"]')).toBeNull();
  await expect.poll(() => snapshot(right)).toEqual(snapshot(left));
  if (width === 390) await rightUI.getByRole('button', { name: 'Calls', exact: true }).click();
  await rightUI.getByRole('combobox', { name: 'Finding category' }).selectOptions('unavailable');
  await expect.poll(() => left.querySelector('select')?.value).toBe('unavailable');
  await rightUI.getByRole('button', { name: /synthetic-failure/ }).click();
  await expect.element(leftUI.getByText('Recorded assessment: unavailable · provider-error.', { exact: true })).toBeVisible();
  await expect.element(rightUI.getByText('Recorded assessment: unavailable · provider-error.', { exact: true })).toBeVisible();
  await expect.poll(() => snapshot(right)).toEqual(snapshot(left));
  expect(left.querySelector('.common-summary')?.textContent).not.toContain('RAW_ACTION_SENTINEL');
});
