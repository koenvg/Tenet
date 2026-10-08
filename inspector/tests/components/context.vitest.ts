import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import App from '../../src/App.js';
import { makeView } from './fixtures.js';
import '../../src/style.css';
import '../../src/summary.css';
afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', location.pathname); });
test('shared displayed context changes on filtering, more pages and late stages without replacing detail', async () => {
  await page.viewport(1280, 900);
  const session = 'a'.repeat(64), first = 'b'.repeat(64), second = 'c'.repeat(64);
  let late = false;
  const normal = { id: first, callId: 'first', invocationId: 'first', toolName: 'edit', timestamp: 2, mode: 'observe', permission: 'released', execution: 'unknown', assessmentStatus: 'completed', categories: ['uncertainty'], missing: ['execution'], failure: null, assessmentInvalid: false };
  const failed = { ...normal, id: second, callId: 'second', execution: 'failed', missing: [], categories: ['violation'] };
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, location.href);
    if (url.origin !== location.origin) throw new Error('Non-local request');
    const current = late ? { ...normal, execution: 'executed', missing: [] } : normal;
    const data = url.pathname === '/api/sessions' ? { sessions: [{ id: session, sessionId: 'fictional', projects: ['/fictional'], host: 'pi', contextId: 'main', invocations: 2, timestamp: 2, started: 1 }], next: null }
      : url.pathname === `/api/sessions/${session}` ? { invocations: url.searchParams.get('category') === 'violation' || url.searchParams.has('cursor') ? [failed] : [current], next: url.searchParams.get('category') || url.searchParams.has('cursor') ? null : 'next' }
      : url.pathname === `/api/sessions/${session}/invocations/${first}` ? { view: makeView({ callId: 'first' }) }
      : null;
    if (!data) throw new Error(`Unexpected route ${url.pathname}`);
    return Response.json({ ...data, issues: [], captureHealth: [], reader: { build: 'fictional', supportedSchemas: [4], unsupported: 0, corrupt: 0, otherIssues: 0, indexing: false } });
  }));
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  await expect.element(screen.getByText(/Displayed calls: Observe mode. Not blocked by Tenet. No tool results recorded./)).toBeVisible();
  const summary = screen.container.querySelector('.decision-summary');
  await screen.getByRole('button', { name: 'More invocations' }).click();
  await vi.waitFor(() => expect(screen.container.querySelectorAll('.call-row')).toHaveLength(2));
  expect(screen.container.querySelector('.displayed-context')).toBeNull();
  expect(screen.container.querySelectorAll('[data-list-fact="permission"]')).toHaveLength(2);
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('violation');
  await vi.waitFor(() => expect(screen.container.querySelectorAll('.call-row')).toHaveLength(1));
  expect(screen.container.querySelector('[data-list-fact="result"]')?.textContent).toContain('Failed');
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('uncertainty');
  await expect.element(screen.getByText(/No tool results recorded./)).toBeVisible();
  late = true;
  await screen.getByText('Session / archive', { exact: true }).click();
  await screen.getByRole('button', { name: 'Refresh archive' }).click();
  await vi.waitFor(() => expect(screen.container.querySelector('[data-list-fact="result"]')?.textContent).toContain('Successful'));
  expect(screen.container.querySelector('.displayed-context')?.textContent).not.toContain('No tool results recorded.');
  expect(screen.container.querySelector('.decision-summary')).toBe(summary);
  expect(screen.container.querySelector('.call-row[aria-pressed="true"] .call-id')?.textContent).toBe('first');
});
