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
const session = 'a'.repeat(64), id = 'b'.repeat(64);
afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', location.pathname); });

function archive({ empty = false, warning = false, unknown = false, indexing = false, capture = false } = {}) {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, location.href); requests.push(url.pathname);
    const reader = unknown ? null : { build: 'fictional-reader', supportedSchemas: [1, 2, 3, 4], unsupported: warning ? 1 : 0, newerUnsupported: warning ? 1 : 0, corrupt: warning ? 2 : 0, indexing: warning || indexing, otherIssues: warning ? 1 : 0 };
    const call = { id, callId: 'fictional-call', toolName: 'edit', timestamp: 100, updated: 100, mode: 'observe', permission: 'released', execution: 'unknown', decision: 'BLOCK', assessmentStatus: 'validated', missing: [], categories: ['uncertainty'], actionPreview: { value: 'src/fictional.ts', key: 'path', shortened: false } };
    const common = { reader, issues: warning || capture ? [{ reason: 'unsafe-record', file: 'fictional.json' }] : [], captureHealth: warning || capture ? [{ writerId: 'fictional-writer', failed: 7, dropped: 8, drainTimeouts: 9 }] : [] };
    if (url.pathname === '/api/sessions') return Response.json({ ...common, sessions: [{ id: session, sessionId: 'fictional', projects: ['/fictional'], host: 'pi', contextId: 'main', timestamp: 100, started: 1, invocations: 2, categoryCounts: { uncertainty: 2, approval: 1 } }], next: url.searchParams.has('cursor') ? null : 'more-sessions' });
    if (url.pathname.includes('/invocations/')) return Response.json({ ...common, view: makeView({ callId: 'fictional-call' }) });
    return Response.json({ ...common, invocations: url.searchParams.has('cursor') || empty || url.searchParams.get('category') === 'violation' ? [] : [call], next: 'more-calls' });
  }));
  return requests;
}

test('direct filter keeps active state, reset and both pagination controls reachable without selection', async () => {
  await page.viewport(1280, 900); const requests = archive({ empty: true });
  const screen = await render(createElement(App));
  await expect.element(screen.getByText('No recorded invocations in this session.', { exact: true })).toBeVisible();
  expect(requests.some(path => path.endsWith('/groups'))).toBe(false);
  expect(screen.container.querySelectorAll('.inspection-switch')).toHaveLength(0);
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('violation');
  await expect.element(screen.getByRole('button', { name: 'Clear filter' })).toBeVisible();
  expect(screen.container.querySelector('.active-filter')?.textContent).toContain('Suspected violation');
  expect(screen.container.querySelector('.repeated-uncertainty')).toBeNull();
  expect(screen.container.querySelector('.triage-tools')?.tagName).toBe('DIV');
  await expect.element(screen.getByRole('combobox', { name: 'Finding category' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'More invocations' })).toBeVisible();
  await screen.getByRole('button', { name: 'More invocations' }).click();
  await screen.getByRole('button', { name: 'Clear filter' }).click();
  await screen.getByText('Session / archive', { exact: true }).click();
  await expect.element(screen.getByRole('button', { name: 'More sessions' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Refresh archive' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Filter projects' })).toBeVisible();
  await expect.element(screen.getByText(/Reader fictional-reader/)).toBeVisible();
  await screen.getByRole('button', { name: 'More sessions' }).click();
  expect(location.href).not.toContain('fictional()');
  expect(requests.some(path => path.endsWith('/groups'))).toBe(false);
  expect(screen.container.querySelector('.triage-tools summary')).toBeNull();
  expect(screen.container.querySelector('#finding-category option[value="uncertainty"]')?.textContent).toContain('(2)');
  expect(screen.container.querySelector('.triage-tools')?.textContent).toContain('Categories can overlap.');
});

for (const unknown of [false, true]) test(`short archive state keeps exact recording issues reachable on mobile, unknown=${unknown}`, async () => {
  await page.viewport(390, 1000); archive({ warning: true, unknown });
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(screen.container.querySelector('.session-picker')?.hasAttribute('open')).toBe(false);
  await expect.element(screen.getByText(unknown ? 'Coverage unknown · capture issues' : 'Partial archive · capture issues', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('.recording-issues')?.hasAttribute('open')).toBe(false);
  await expect.element(screen.getByText(/7 failed writes or snapshots/)).not.toBeVisible();
  await screen.getByText('Recording issues', { exact: true }).click();
  await expect.element(screen.getByText(/7 failed writes or snapshots, 8 dropped stages, 9 drain timeouts. Writer fictional-writer/)).toBeVisible();
  await expect.element(screen.getByText(unknown ? /Reader compatibility is unknown/ : /Reader coverage: 1 unsupported/)).toBeVisible();
  expect(screen.container.querySelector('.issues-body')?.textContent).toContain('not per call');
  expect(screen.container.querySelector('.issues-body')?.textContent).toContain('They may include other sessions. Zero counters do not prove complete capture.');
  expect(screen.container.querySelector('.issues-body')?.textContent).toContain('1 recording file issues. 1 writers reporting recording issues.');
  expect(screen.container.querySelector('.issues-body')?.textContent).toContain('Their contents are not read.');
  expect(screen.container.querySelector('.issues-body')?.textContent).toContain('A rebuild alone does not update a running reader.');
  await screen.getByText('Recording issues', { exact: true }).click();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
  await screen.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls', exact: true }).click();
  await expect.element(screen.getByRole('navigation', { name: 'Invocations' }).getByRole('button').nth(0)).toBeVisible();
  await expect.element(screen.getByRole('combobox', { name: 'Finding category' })).toBeVisible();
});


for (const [options, state, hasIssues] of [
  [{ empty: true }, 'Supported records', false],
  [{ empty: true, unknown: true }, 'Coverage unknown', true],
  [{ empty: true, indexing: true }, 'Indexing archive', true],
  [{ empty: true, capture: true }, 'Capture issues', true],
] as const) test(`empty archive state is truthful and independent of selection: ${state}`, async () => {
  await page.viewport(390, 844); archive(options);
  const screen = await render(createElement(App));
  await expect.element(screen.getByText(state, { exact: true })).toBeVisible();
  expect(screen.container.querySelectorAll('.recording-issues')).toHaveLength(hasIssues ? 1 : 0);
  expect(screen.container.querySelector('.session-picker')?.hasAttribute('open')).toBe(false);
  expect(screen.container.querySelector('.inspection .invocation')).toBeNull();
  if (hasIssues) {
    await screen.getByText('Recording issues', { exact: true }).click();
    expect(screen.container.querySelector('.issues-body')?.textContent).toContain('A rebuild alone does not update a running reader.');
    if (state === 'Indexing archive') expect(screen.container.querySelector('.reader-coverage')?.textContent).toContain('indexing is still in progress');
    if (state === 'Capture issues') expect(screen.container.querySelector('.reader-coverage')?.textContent).toContain('0 unsupported schema records');
  }
});

test('commands and files lead compact call rows while tool names, times and exact previews remain available', async () => {
  await page.viewport(1340, 1318); archive();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  const row = screen.container.querySelector<HTMLElement>('.call-row')!;
  expect(row.querySelector('.call-copy')?.firstElementChild?.className).toBe('call-preview');
  expect(row.querySelector('.call-top')?.textContent).toContain('Edit file');
  expect(row.querySelector('.call-preview-value')?.textContent).toBe('src/fictional.ts');
  expect(getComputedStyle(row.querySelector('.call-preview-value')!).fontSize).toBe('14px');
  expect(getComputedStyle(row.querySelector('.call-top strong')!).fontSize).toBe('12px');
  expect(row.getBoundingClientRect().height).toBeLessThan(180);
  const tools = screen.container.querySelector('.triage-tools')!;
  expect(tools.querySelectorAll('details, summary')).toHaveLength(0);
  expect(screen.container.querySelector('.repeated-uncertainty')).toBeNull();
  expect(tools.compareDocumentPosition(screen.container.querySelector('.call-list')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
