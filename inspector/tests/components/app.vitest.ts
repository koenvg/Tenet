import { createElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import App from '../../src/App.js';
import { ruleUIFixture, session, invocation, older, rule } from './rule-ui-fixture.js';
import '../../src/style.css';
import '../../src/components.css';
import '../../src/summary.css';
afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', location.pathname); });

for (const [status, label] of [['clear', 'No violations found'], ['violation', 'Violation found'], ['unclear', 'Unclear'], ['unchecked', 'Not checked']] as const) test(`server-derived ${status} stays distinct in trigger, picker and rules`, async () => {
  ruleUIFixture({ status });
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('button', { name: new RegExp(`Do not publish secrets. ${label}`) })).toBeVisible();
  expect(screen.container.querySelector('.rule-session-outcome')?.textContent).toContain(label);
  expect(screen.container.querySelector('.rule-session-toggle')?.textContent).toContain(label);
  await screen.getByRole('button', { name: /^Session / }).click();
  await expect.element(screen.getByRole('radio').nth(0)).toBeVisible();
  expect(screen.container.querySelector('.rule-session-option')?.textContent).toContain(label);
  expect(screen.container.querySelector('.rule-session-option')?.textContent).toContain(status === 'unchecked' ? '1 rule not checked' : '0 rules not checked');
});

test('fresh visits never select an action; full wording and checks are confined to the panel', async () => {
  const f = ruleUIFixture({ checks: 2 });
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('button', { name: /Do not publish secrets/ })).toBeVisible();
  expect(location.search).toBe(`?session=${session}`);
  expect(f.requests.some(r => r.url.pathname.includes('/invocations/'))).toBe(false);
  expect(screen.container.querySelector('.invocation')).toBeNull();
  await screen.getByRole('button', { name: /Do not publish secrets/ }).click();
  await expect.element(screen.getByText('Do not publish secrets. <script>inert()</script>', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('dialog script')).toBeNull();
  expect(screen.container.querySelectorAll('.rule-check')).toHaveLength(2);
  await screen.getByText('View recorded action', { exact: true }).nth(1).click();
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(location.search).toContain(`invocation=${older}`);
  expect(f.requests.filter(r => r.url.pathname.includes('/invocations/')).map(r => r.url.pathname)).toEqual([`/api/sessions/${session}/invocations/${older}`]);
});

test('unknown inventory has no invented denominator and unavailable wording never uses the preview', async () => {
  ruleUIFixture({ unknown: true, unavailable: true, status: 'unclear' });
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('button', { name: /Do not publish secrets/ })).toBeVisible();
  expect(screen.container.querySelector('.rule-session-context')?.textContent).toBe("Based on this session's recorded checks.");
  expect(screen.container.querySelector('.rule-session-outcome')?.textContent).toContain('Rule inventory unknown');
  await screen.getByRole('button', { name: /Do not publish secrets/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Exact recorded wording unavailable' })).toBeVisible();
  expect(screen.container.querySelector('.rule-panel-body')?.textContent).toContain('source-unavailable-or-changed');
  expect(screen.container.querySelector('.rule-panel-body')?.textContent).not.toContain('Do not publish secrets.');
  expect(screen.container.querySelector('.rule-panel-body')?.textContent).toContain('assessment-unavailable');
});

test('unchecked declarations have zero checks and no fabricated actions', async () => {
  const f = ruleUIFixture({ status: 'unchecked' });
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('button', { name: /Do not publish secrets/ })).toBeVisible();
  await screen.getByRole('button', { name: /Do not publish secrets/ }).click();
  await expect.element(screen.getByText('No recorded checks of this rule.', { exact: true })).toBeVisible();
  expect(screen.container.querySelectorAll('.rule-check')).toHaveLength(0);
  expect(f.requests.some(r => r.url.pathname.includes('/invocations/'))).toBe(false);
});

test('old exact invocation deep links remain available without a rule association', async () => {
  history.replaceState(null, '', `?session=${session}&invocation=${invocation}`);
  const f = ruleUIFixture();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(screen.container.querySelector('dialog')?.open).toBe(true);
  expect(screen.container.querySelector('#rule-panel-heading')?.textContent).toBe('Recorded action');
  expect(f.requests.filter(r => r.url.pathname.includes('/invocations/')).map(r => r.url.pathname)).toEqual([`/api/sessions/${session}/invocations/${invocation}`]);
  expect(location.search).not.toContain('rule=');
  await screen.getByRole('button', { name: 'Close', exact: true }).click();
  expect(location.search).toBe(`?session=${session}`);
});

test('rule links restore exact associations rather than newest actions', async () => {
  history.replaceState(null, '', `?session=${session}&rule=${rule}&invocation=${older}`);
  ruleUIFixture({ checks: 2 });
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(screen.container.querySelector('.decision-title')?.textContent).toContain('older');
  expect(location.search).toContain(`rule=${rule}`);
  expect(location.search).toContain(`invocation=${older}`);
});
