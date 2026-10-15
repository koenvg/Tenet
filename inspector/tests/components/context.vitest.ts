import { createElement, useState } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import PrivateCallExplorer from '../../src/PrivateCallExplorer.js';
import Detail from '../../src/Detail.js';
import type { InvocationSummary } from '../../../src/inspector/archive-index.js';
import type { FindingCategory } from '../../../src/decision/finding-triage.js';
import { makeView } from './fixtures.js';
import '../../src/style.css';
import '../../src/summary.css';

test('private explorer retains displayed-call context semantics for its direct consumers', async () => {
  await page.viewport(1280, 900);
  const first = 'b'.repeat(64), second = 'c'.repeat(64);
  const normal = { id: first, callId: 'first', invocationId: 'first', toolName: 'edit', timestamp: 2, mode: 'observe', permission: 'released', execution: 'unknown', assessmentStatus: 'completed', categories: ['uncertainty'], missing: ['execution'], failure: null, assessmentInvalid: false } as InvocationSummary;
  const failed = { ...normal, id: second, callId: 'second', execution: 'failed', missing: [], categories: ['violation'] } as InvocationSummary;
  const view = makeView({ callId: 'first' });
  function Consumer() {
    const [category, setCategory] = useState<FindingCategory | ''>(''), [more, setMore] = useState(false), [late, setLate] = useState(false);
    const current = late ? { ...normal, execution: 'executed', missing: [] } as InvocationSummary : normal;
    const calls = category === 'violation' ? [failed] : category === 'uncertainty' ? [current] : more ? [current, failed] : [current];
    return createElement('div', null, createElement(PrivateCallExplorer, { calls, selectedId: first, category, loading: false, more: !more, selectCall: () => {}, filterCategory: setCategory, loadMore: () => setMore(true) }), createElement('button', { onClick: () => setLate(true) }, 'Receive late stage'), createElement(Detail, { view }));
  }
  const screen = await render(createElement(Consumer));
  await expect.element(screen.getByText(/Displayed calls: Observe mode. Not blocked by Tenet. No tool results recorded./)).toBeVisible();
  const summary = screen.container.querySelector('.decision-summary');
  await screen.getByRole('button', { name: 'More invocations' }).click();
  expect(screen.container.querySelectorAll('.call-row')).toHaveLength(2);
  expect(screen.container.querySelector('.displayed-context')).toBeNull();
  expect(screen.container.querySelectorAll('[data-list-fact="permission"]')).toHaveLength(2);
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('violation');
  expect(screen.container.querySelectorAll('.call-row')).toHaveLength(1);
  expect(screen.container.querySelector('[data-list-fact="result"]')?.textContent).toContain('Failed');
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('uncertainty');
  await expect.element(screen.getByText(/No tool results recorded./)).toBeVisible();
  await screen.getByRole('button', { name: 'Receive late stage' }).click();
  expect(screen.container.querySelector('[data-list-fact="result"]')?.textContent).toContain('Successful');
  expect(screen.container.querySelector('.displayed-context')?.textContent).not.toContain('No tool results recorded.');
  expect(screen.container.querySelector('.decision-summary')).toBe(summary);
  expect(screen.container.querySelector('.call-row[aria-pressed="true"] .call-id')?.textContent).toBe('first');
});
