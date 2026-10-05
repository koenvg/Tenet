import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { tick } from 'svelte';
import { mountSummaryWorkspace } from '../../src/shared/library.svelte.js';
import { previewInput } from '../../src/shared/preview-fixture.js';
import { standaloneSummary } from '../../src/shared/standalone-adapter.js';
import { makeView } from './fixtures.js';

test('mount update and disposal leave shell styles and resources alone', async () => {
  await page.viewport(1280, 900);
  const shell = document.createElement('button');
  shell.className = 'call-row'; shell.textContent = 'Shell control';
  shell.style.cssText = 'color: rgb(12, 34, 56); padding: 3px; font-size: 17px';
  document.body.append(shell);
  const before = [getComputedStyle(shell).color, getComputedStyle(shell).padding, getComputedStyle(shell).fontSize];
  const target = document.createElement('div');
  target.style.cssText = '--foreground: rgb(210, 220, 230); --background: rgb(20, 25, 30); --muted: rgb(40, 45, 50); --border: rgb(80, 85, 90); --muted-foreground: rgb(180, 185, 190); --success: rgb(120, 220, 160)';
  document.body.append(target);
  const interval = vi.spyOn(window, 'setInterval');
  const fetch = vi.spyOn(window, 'fetch');
  const workspace = mountSummaryWorkspace(target, { model: structuredClone(previewInput.model), actions: { selectCall() {}, filterCategory() {}, refresh() {} } });
  try {
    workspace.update({ model: previewInput.model, actions: { selectCall() {}, filterCategory() {}, refresh() {} } });
    await tick();
    expect(target.querySelector('.primary-status')?.textContent).toContain('Ran');
    expect(getComputedStyle(target.querySelector('.tenet-summary-workspace')!).backgroundColor).toBe('rgb(40, 45, 50)');
    expect(getComputedStyle(target.querySelector('.tenet-summary-workspace')!).color).toBe('rgb(210, 220, 230)');
    workspace.update({ model: { ...previewInput.model, selected: null, calls: [], error: 'Synthetic scope unavailable' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } });
    await tick();
    expect(target.querySelector('.primary-status')).toBeNull();
    expect(target.querySelector('[role="alert"]')?.textContent).toBe('Synthetic scope unavailable');
    await workspace.destroy();
    workspace.update(previewInput);
    await tick();
    expect(target.childElementCount).toBe(0);
    expect(interval).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect([getComputedStyle(shell).color, getComputedStyle(shell).padding, getComputedStyle(shell).fontSize]).toEqual(before);
  } finally { await workspace.destroy(); interval.mockRestore(); fetch.mockRestore(); target.remove(); shell.remove(); }
});


test('summary updates retain open checks and rule selection only within the same call', async () => {
  await page.viewport(1280, 900);
  const target = document.createElement('div'); document.body.append(target);
  const model = { ...previewInput.model, selectedId: 'first', selected: standaloneSummary(makeView()) };
  const actions = { selectCall() {}, filterCategory() {}, refresh() {}, loadMoreRules: vi.fn() };
  const workspace = mountSummaryWorkspace(target, { model: { ...model, moreRules: true }, actions });
  try {
    await tick();
    await page.getByText('Why this assessment', { exact: true }).click();
    await page.getByText(/Browse all rules/).click();
    await page.getByRole('button', { name: /Record every file edit/ }).click();
    await page.getByRole('button', { name: 'More rules', exact: true }).click();
    expect(actions.loadMoreRules).toHaveBeenCalledOnce();
    await expect.element(page.getByRole('heading', { name: 'Rule at line 9' })).toBeVisible();
    workspace.update({ model: { ...model, selected: standaloneSummary(makeView({ execution: 'executed' })) }, actions });
    await tick();
    await expect.element(page.getByRole('heading', { name: 'Rule at line 9' })).toBeVisible();
    await expect.element(page.getByRole('region', { name: 'Actual execution' }).getByText('Ran', { exact: true })).toBeVisible();
    workspace.update({ model: { ...model, selectedId: 'second', selected: standaloneSummary(makeView({ callId: 'second' })) }, actions });
    await tick();
    expect([...target.querySelectorAll('details')].some(detail => detail.open)).toBe(false);
  } finally { await workspace.destroy(); target.remove(); }
});
