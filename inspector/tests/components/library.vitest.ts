import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { tick } from 'svelte';
import { mountSummaryWorkspace } from '../../src/shared/library.svelte.js';
import { previewInput } from '../../src/shared/preview-fixture.js';

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
    expect(getComputedStyle(target.querySelector('.tenet-summary-workspace')!).backgroundColor).toBe('rgb(20, 25, 30)');
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
