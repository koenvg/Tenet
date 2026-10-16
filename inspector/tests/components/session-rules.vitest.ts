import { createElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import App from '../../src/App.js';
import { makeView } from './fixtures.js';
import '../../src/style.css';
import '../../src/components.css';
import '../../src/summary.css';

const session = 'a'.repeat(64), rule = 'b'.repeat(64), invocation = 'c'.repeat(64), revision = 'd'.repeat(64);
const coverage = { capture: 'best-effort', indexing: false, incomplete: false, reasons: [], omittedRules: 0, omittedChecks: 0, diagnostics: [], omittedDiagnostics: 0 };
const summary = { status: 'clear', inventory: { state: 'known', rules: 1, unchecked: 0 }, ruleCoverage: coverage };
const item = { id: rule, declarationId: 'historical', policyIdentity: 'historical-version', builtin: false, origin: null, declarationRevision: revision, wordingConflict: false, preview: 'Do not publish secrets.', status: 'clear', checks: 1, unassessedObservations: 0, timestamp: 100, representative: { invocation, revision } };
const common = { reader: { build: 'fixture', supportedSchemas: [5], unsupported: 0, newerUnsupported: 0, corrupt: 0, indexing: false, otherIssues: 0 }, issues: [], captureHealth: [], next: null };
afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', location.pathname); });

function fixture() {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, location.href); requests.push(url.pathname);
    expect(url.origin).toBe(location.origin);
    const data = url.pathname === '/api/sessions' ? { sessions: [{ ...summary, id: session, revision, projects: ['/fixture'], timestamp: 100, started: 100, sessionId: 'fixture', host: 'pi', contextId: 'main' }] }
      : url.pathname.endsWith('/checks') ? { ...summary, session, rule, revision, items: [{ id: invocation, invocation, callId: 'exact', callIdOmitted: false, timestamp: 100, status: 'clear', outcome: 'PASS', gates: [], trusted: true, reason: 'recorded-pass', profile: 'legacy', questionVersion: 'historical-v1', inputVersion: null }] }
      : url.pathname.endsWith('/rules') ? { ...summary, session, revision, items: [item] }
      : url.pathname.endsWith(`/rules/${rule}`) ? { ...summary, session, revision, rule: item, wording: { state: 'available', text: 'Do not publish secrets. <script>inert()</script>' } }
      : url.pathname.includes('/invocations/') ? { view: makeView({ callId: 'exact' }) }
      : { invocations: [] };
    return Response.json({ ...common, ...data });
  }));
  return requests;
}

test('rule-first session opens a native panel from the row SVG and reads exact actions lazily', async () => {
  await page.viewport(1280, 900);
  const requests = fixture();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('heading', { name: 'Did this session follow the rules?' })).toBeVisible();
  const row = screen.getByRole('button', { name: /Do not publish secrets/ });
  await expect.element(row).toBeVisible();
  expect(requests.some(path => path.includes('/invocations/'))).toBe(false);
  (row.element().querySelector('svg') as SVGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await expect.element(screen.getByRole('dialog', { name: 'Rule details' })).toBeVisible();
  await expect.element(screen.getByText('Do not publish secrets. <script>inert()</script>', { exact: true })).toBeVisible();
  expect(document.querySelector('dialog script')).toBeNull();
  expect(requests.some(path => path.includes('/invocations/'))).toBe(false);
  await screen.getByText('View recorded action', { exact: true }).click();
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(requests.filter(path => path.includes('/invocations/'))).toEqual([`/api/sessions/${session}/invocations/${invocation}`]);
  await screen.getByRole('button', { name: 'Close', exact: true }).click();
  expect(screen.container.querySelector<HTMLDialogElement>('dialog')?.open).toBe(false);
  expect(document.activeElement).toBe(row.element());
  expect(location.search).not.toContain('rule=');
  expect(location.search).not.toContain('invocation=');
});
