import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Detail from '../../src/Detail.svelte';
import PaneResizer from '../../src/PaneResizer.svelte';
import { makeView, recordedQuestion } from './fixtures.js';
import '../../src/style.css';
import '../../src/summary.css';

test('questions toggle between safe Rich text and exact recorded JSON', async () => {
  const screen = await render(Detail, { view: makeView() });
  await screen.getByRole('button', { name: 'View submitted questions' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Recorded instructions' }).first()).toBeVisible();
  expect(screen.container.querySelectorAll('.question-rich script, .question-rich img, .question-rich a')).toHaveLength(0);
  await screen.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect.element(screen.getByText(/"historical-test-v1"/).first()).toBeVisible();
  expect(JSON.parse(screen.container.querySelector('.question-json')!.textContent!)).toEqual(recordedQuestion);
  await screen.getByRole('button', { name: 'Rich', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Recorded instructions' }).first()).toBeVisible();
});

test('rule selection and keyboard tabs preserve shared evidence scroll and focus', async () => {
  const screen = await render(Detail, { view: makeView() });
  await screen.getByRole('button', { name: 'View shared evidence' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Evidence dock' })).toBeVisible();
  expect(document.activeElement?.id).toBe('dock-heading');
  const panel = screen.container.querySelector<HTMLElement>('#panel-Evidence')!;
  panel.style.height = '80px'; panel.scrollTop = 37;
  expect(panel.scrollTop).toBeGreaterThan(0);
  await screen.getByText(/Browse all rules/).click();
  await screen.getByRole('button', { name: /Record every file edit/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Rule at line 9' })).toBeVisible();
  expect(screen.container.querySelector('#panel-Evidence')).toBe(panel);
  expect(panel.scrollTop).toBe(37);
  await screen.getByRole('tab', { name: 'Questions' }).click();
  await expect.element(screen.getByText('second_outcome')).toBeVisible();
  await userEvent.keyboard('{ArrowRight}');
  await expect.element(screen.getByRole('tab', { name: 'Response' })).toHaveAttribute('aria-selected', 'true');
  await screen.getByRole('tab', { name: 'Evidence' }).click();
  expect(panel.scrollTop).toBe(37);
});

test('resizer clamps pointer and keyboard updates at desktop and mobile widths', async () => {
  for (const width of [1280, 390]) {
    await page.viewport(width, 844);
    const screen = await render(PaneResizer, { value: 300, min: 220, max: 460, label: 'Resize call explorer', controls: 'call-explorer' });
    const separator = screen.container.querySelector<HTMLElement>('[role="separator"]')!;
    separator.style.width = '10px'; separator.style.height = '100px';
    separator.focus();
    await userEvent.keyboard('{End}');
    expect(separator.getAttribute('aria-valuenow')).toBe('460');
    await userEvent.keyboard('{ArrowRight}');
    expect(separator.getAttribute('aria-valuenow')).toBe('460');
    await userEvent.keyboard('{Home}');
    expect(separator.getAttribute('aria-valuenow')).toBe('220');
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(separator.getAttribute('aria-valuenow')).toBe('270');
    const target = document.createElement('div');
    target.style.cssText = `position: fixed; left: ${width - 40}px; top: 80px; width: 20px; height: 20px`;
    document.body.append(target);
    await userEvent.dragAndDrop(separator, target);
    expect(separator.getAttribute('aria-valuenow')).toBe('460');
    target.remove();
    await screen.unmount();
  }
  await page.viewport(1280, 720);
});
