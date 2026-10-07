import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { act } from 'react';
const tick = () => act(async () => {});
import { mountSummaryWorkspace } from '../../src/shared/library.js';
import { rulesSyntheticRead } from '../../../bb-plugin-tenet-status/rules.preview-fixture.js';
for (const [viewport, width] of [[390, 390], [1280, 390], [1280, 1000]]) test(`rule paging and keyboard access in ${width}px container at ${viewport}px`, async () => {
  await page.viewport(viewport!, 900);
  const target = document.createElement('div'); target.style.width = `${width}px`; target.style.maxWidth = '100%'; document.body.append(target);
  let selection: { callId?: string; ruleCursor?: string } = {};
  let workspace: ReturnType<typeof mountSummaryWorkspace>;
  function input() {
    const data = rulesSyntheticRead(selection);
    return { model: { calls: data.calls, selected: data.selected, selectedId: data.selectedId!, category: '' as const, coverage: 'Offline rule fixture.', loading: false, error: '', moreRules: !!data.selected?.rulePage?.next },
      actions: { selectCall(id: string) { selection = { callId: id }; workspace.update(input()); }, filterCategory() {}, refresh() {},
        loadMoreRules() { selection = { callId: data.selectedId!, ruleCursor: data.selected!.rulePage!.next! }; workspace.update(input()); },
        restartRules() { delete selection.ruleCursor; workspace.update(input()); } } };
  }
  workspace = mountSummaryWorkspace(target, input());
  try {
    await tick();
    if (width! < 650) await page.getByRole('button', { name: 'Summary', exact: true }).click();
    await page.getByText('Why this assessment', { exact: true }).click();
    await page.getByText(/Browse all rules/).click();
    await expect.element(page.getByText('Recorded rules 1–16 of 19. At most 16 rules per page.')).toBeVisible();
    expect(target.querySelectorAll('.rule-row')).toHaveLength(16);
    expect((window as any).archiveExecuted).toBeUndefined(); expect(target.querySelector('script')).toBeNull();
    await page.getByRole('button', { name: /Line 2/ }).click();
    await expect.element(page.getByText(/Rule text truncated to 2,048/)).toBeVisible();
    await page.getByRole('button', { name: /Line 3/ }).click();
    await expect.element(page.getByText('No rule text snapshot recorded. Missing text is not a pass.')).toBeVisible();
    const more = [...target.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'More rules')!;
    more.focus(); expect(document.activeElement).toBe(more);
    await userEvent.keyboard('{Enter}');
    await expect.element(page.getByText('Recorded rules 17–19 of 19. At most 16 rules per page.')).toBeVisible();
    expect(target.querySelectorAll('.rule-row')).toHaveLength(3);
    await page.getByRole('button', { name: /Built-in integrity/ }).click();
    await expect.element(page.getByRole('heading', { name: 'Built-in integrity' })).toBeVisible();
    [...target.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'First rule page')!.focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(page.getByText('Recorded rules 1–16 of 19. At most 16 rules per page.')).toBeVisible();
    expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  } finally { await workspace.destroy(); expect(target.childElementCount).toBe(0); target.remove(); }
});
