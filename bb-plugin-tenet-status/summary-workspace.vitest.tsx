import { StrictMode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { SummaryWorkspaceMount } from './summary-workspace';
import { previewInput } from '../inspector/src/shared/preview-fixture';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('React mounts and updates safe summaries, then disposes under StrictMode without host reads', async () => {
  const fetch = vi.fn(() => { throw new Error('No transport belongs in this workspace'); });
  vi.stubGlobal('fetch', fetch);
  const actions = { selectCall: vi.fn(), filterCategory: vi.fn(), refresh: vi.fn() };
  const input = { model: structuredClone(previewInput.model), actions };
  const screen = render(<StrictMode><SummaryWorkspaceMount {...input} /></StrictMode>);
  await waitFor(() => expect(screen.getByRole('region', { name: 'Actual execution' }).textContent).toContain('Ran'));
  expect(screen.container.querySelectorAll('.tenet-summary-workspace')).toHaveLength(1);
  expect(screen.getByText('Call synthetic-pass')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh archive' }));
  expect(actions.refresh).toHaveBeenCalledOnce();
  const next = { ...input, model: { ...input.model, selected: { ...input.model.selected!, execution: 'unknown', permission: 'released' } } };
  screen.rerender(<StrictMode><SummaryWorkspaceMount {...next} /></StrictMode>);
  await waitFor(() => expect(screen.getByRole('region', { name: 'Actual execution' }).textContent).toContain('Released'));
  expect(fetch).not.toHaveBeenCalled();
  screen.unmount();
  expect(screen.container.childElementCount).toBe(0);
  expect(document.querySelector('.tenet-summary-workspace')).toBeNull();
});
