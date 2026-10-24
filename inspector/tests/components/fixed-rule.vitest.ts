import { createElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import App from '../../src/App.js';
import FixedRule from '../../src/FixedRule.js';
import { createArchiveNavigation } from '../../src/archive-navigation.js';
import type { SelectedSessionRule } from '../../../src/inspector/session-rules-model.js';
import { session, other, rule } from './rule-ui-fixture.js';
import { fixedRuleFixture as fixture, fixedWording as wording } from './fixed-rule-fixture.js';
import '../../src/style.css';
import '../../src/components.css';
import '../../src/summary.css';

afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', location.pathname); });

for (const recorded of [
  { state: 'available', text: 'Recorded wording sentinel. <script>inert()</script>' },
  { state: 'unavailable', reason: 'source-unavailable-or-changed' },
] as const) test(`the fixed rule row uses ${recorded.state} recorded wording without reconstruction`, async () => {
  const f = fixture(), navigation = createArchiveNavigation();
  const selected = { ...f.fixedData(new URL(`/api/sessions/${session}/rules/${rule}`, location.href)), wording: recorded } as SelectedSessionRule;
  const archive = { ...navigation.getSnapshot(), ...navigation, selected, fixedRule: { kind: 'ready' as const, revision: selected.revision, rule } };
  const screen = await render(createElement(FixedRule, { archive }));
  await expect.element(screen.getByRole('heading', { name: 'Rules', exact: true })).toBeVisible();
  if (recorded.state === 'available') {
    await expect.element(screen.getByText('Recorded wording sentinel. <script>inert()</script>', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('No violations found in recorded checks', { exact: true })).toBeVisible();
    expect(document.querySelector('.fixed-rule-text script')).toBeNull();
  } else {
    expect(document.querySelector('.fixed-rule-row')).toBeNull();
    expect(document.querySelector('.fixed-rule-text')).toBeNull();
  }
});
test('bare fixed-rule entry waits for an explicit Pi session and replaces the general list', async () => {
  history.replaceState(null, '', '?view=fixed-rule');
  const f = fixture();
  const screen = await render(createElement(App));
  await expect.element(screen.getByText('Choose a Pi session to review this rule.', { exact: true })).toBeVisible();
  expect(new URL(location.href).searchParams.has('session')).toBe(false);
  await screen.getByRole('button', { name: /Session Choose a session/ }).click();
  await screen.getByRole('radio').first().click();
  await expect.element(screen.getByText(wording, { exact: true })).toBeVisible();
  await expect.element(screen.getByText('No violations found in recorded checks', { exact: true })).toBeVisible();
  expect(document.querySelector('.rule-list-section')).toBeNull();
  expect(document.querySelector('.rule-session-outcome')).toBeNull();
  expect(f.requests.filter(r => r.url.pathname.includes('/invocations/'))).toEqual([]);
  expect(new URL(location.href).searchParams.get('session')).toBe(session);
  await screen.getByRole('button', { name: 'Back to all rules' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Did this session follow the rules?' })).toBeVisible();
});

for (const qualified of [false, true]) for (const recovery of ['manual', 'poll'] as const) test(`mounted ${qualified ? 'qualified' : 'bare'} fixed URL recovers initial metadata failure through ${recovery} refresh`, async () => {
  let poll!: () => Promise<void>;
  vi.stubGlobal('setInterval', vi.fn(callback => { poll = callback; return 1; }));
  const search = `?view=fixed-rule${qualified ? `&session=${other}` : ''}`;
  history.replaceState(null, '', search);
  const f = fixture();
  f.intercept(url => Promise.resolve(url.pathname === '/api/sessions' ? new Response('{}', { status: 503 }) : Response.json(f.fixedData(url))));
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Archive request failed: 503. Try refreshing.');
  await expect.element(screen.getByRole('button', { name: 'Back to all rules' })).toBeVisible();
  expect(document.querySelector('.rule-list-section')).toBeNull();
  expect(document.querySelector('.fixed-rule-row')).toBeNull();
  expect(location.search).toBe(search);

  f.intercept(url => Promise.resolve(Response.json(f.fixedData(url))));
  if (recovery === 'manual') {
    await screen.getByText('Recording issues and archive controls', { exact: true }).click();
    await screen.getByRole('button', { name: 'Refresh archive', exact: true }).click();
  } else await poll();
  if (qualified) {
    await expect.element(screen.getByText('Do not directly use write/edit tools. Delegate those actions.', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('No violations found in recorded checks', { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: /Session second/ })).toBeVisible();
  } else {
    await expect.element(screen.getByText('Choose a Pi session to review this rule.', { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: /Session Choose a session/ })).toBeVisible();
    expect(document.querySelector('.fixed-rule-row')).toBeNull();
  }
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector('.rule-list-section')).toBeNull();
  expect(location.search).toBe(search);
});

for (const [status, label] of [['clear', 'No violations found in recorded checks'], ['violation', 'Violation found in recorded check'], ['unclear', 'Unclear'], ['unchecked', 'Not checked']] as const) test(`fixed presentation retains recorded ${status} and lazy tool fields without success ticks`, async () => {
  history.replaceState(null, '', `?view=fixed-rule&session=${session}`);
  const f = fixture({ status });
  const screen = await render(createElement(App));
  await expect.poll(() => document.querySelector('.fixed-rule-row > summary .fixed-finding')?.textContent).toBe(label);
  expect(document.querySelector('.rule-session-toggle .rule-status')).toBeNull();
  expect(document.querySelector('.fixed-rule-view .rule-status')).toBeNull();
  expect(f.requests.filter(r => r.url.pathname.includes('/invocations/'))).toEqual([]);
  await screen.getByText(wording, { exact: true }).click();
  if (status === 'unchecked') {
    await expect.element(screen.getByText('No recorded checks of this rule.', { exact: true })).toBeVisible();
  } else {
    await screen.getByText('Recorded tool fields', { exact: true }).click();
    await expect.element(screen.getByText('delegate', { exact: true })).toBeVisible();
    expect(f.requests.filter(r => r.url.pathname.includes('/invocations/')).map(r => r.url.pathname)).toEqual([`/api/sessions/${session}/invocations/${'c'.repeat(64)}`]);
    await expect.element(screen.getByText('unknown', { exact: true })).toBeVisible();
  }
});

test('ordinary startup remains convenient but the labelled entry deliberately selects that session', async () => {
  fixture();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('heading', { name: 'Did this session follow the rules?' })).toBeVisible();
  await expect.poll(() => new URL(location.href).searchParams.get('session')).toBe(session);
  await screen.getByRole('button', { name: "Review this session's delegation rule" }).click();
  await expect.element(screen.getByText(wording, { exact: true })).toBeVisible();
  expect(new URL(location.href).searchParams.get('view')).toBe('fixed-rule');
  await screen.getByText(wording, { exact: true }).click();
  await screen.getByRole('button', { name: 'Open full rule details' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Rule details' })).toBeVisible();
  expect(new URL(location.href).searchParams.get('rule')).toBe(rule);
});

test('missing recording stays unavailable rather than becoming unchecked', async () => {
  history.replaceState(null, '', `?view=fixed-rule&session=${session}`);
  const f = fixture();
  f.intercept(url => Promise.resolve(url.pathname.endsWith('/rules') ? new Response('{}', { status: 404 }) : Response.json(f.fixedData(url))));
  const screen = await render(createElement(App));
  await expect.element(screen.getByText('Recording not found. Refresh the archive or choose another session.', { exact: true }).first()).toBeVisible();
  expect(document.querySelector('.fixed-rule-row')).toBeNull();
});

test('pending tool fields stay not loaded, then absent recorded fields stay Not recorded', async () => {
  history.replaceState(null, '', `?view=fixed-rule&session=${session}`);
  const f = fixture(); let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  f.intercept(url => url.pathname.includes('/invocations/') ? held : Promise.resolve(Response.json(f.fixedData(url))));
  const screen = await render(createElement(App));
  await screen.getByText(wording, { exact: true }).click();
  await screen.getByText('Recorded tool fields', { exact: true }).click();
  await expect.element(screen.getByText('Not loaded', { exact: true })).toBeVisible();
  const data = f.fixedData(new URL(`/api/sessions/${session}/invocations/${'c'.repeat(64)}`, location.href)) as any;
  release(Response.json({ ...data, view: { ...data.view, identity: null, missing: ['permission', 'execution'] } }));
  await expect.poll(() => document.querySelector('.fixed-fields dd')?.textContent).toBe('Not recorded');
  await expect.element(screen.getByText('Missing recorded stages: permission, execution.', { exact: true })).toBeVisible();
  expect([...document.querySelectorAll('.fixed-fields dd')].map(el => el.textContent)).toEqual(['Not recorded', 'Not recorded', 'Not recorded', 'Not recorded', 'Not recorded', 'Not recorded']);
});

test('recorded coverage diagnostics open the existing exact Inspector destination', async () => {
  history.replaceState(null, '', `?view=fixed-rule&session=${session}`);
  const f = fixture();
  f.intercept(url => {
    const value = f.fixedData(url) as any;
    return Promise.resolve(Response.json({ ...value, ruleCoverage: { ...value.ruleCoverage, diagnostics: [{ id: 'missing', kind: 'missing-recorded-integrity', invocation: 'c'.repeat(64) }] } }));
  });
  const screen = await render(createElement(App));
  await expect.element(screen.getByText(wording, { exact: true })).toBeVisible();
  await screen.getByText('Recorded integrity diagnostics', { exact: true }).click();
  await screen.getByRole('button', { name: 'View recorded action', exact: true }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Recorded action' })).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(new URL(location.href).searchParams.get('view')).toBeNull();
});
