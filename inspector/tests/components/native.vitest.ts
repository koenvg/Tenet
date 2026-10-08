import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import Detail from "../../src/Detail.js";
import { makeView } from './fixtures.js';
import '../../src/style.css';
import '../../src/summary.css';

function nativeView() {
  const view = makeView();
  view.judge = { provider: 'apus-llamacpp', requestedModel: 'recorded-apus-alias', returnedModel: null, experimental: true };
  view.native = { contract: { version: 'apus-recording-v1', renderingVersion: 'jev.dynamic.prompt.v2',
    rendererRevision: '7389d774472c9e29ddc84fffb392951f0f25de74', protocolVersion: 'llamacpp-b11118-choice-v1' },
    snapshots: [{ untrusted: true, omittedFields: 2, bytes: 120, truncated: false, value: { kind: 'native-response', raw: { tokens_cached: 7, timings: { predicted_n: 1 } } } }, { untrusted: true, unavailable: true }],
    requests: [{ question: 'first_outcome', mapping: { A: 'PASS', B: 'FAIL' }, labelIds: { A: 32, B: 33 },
      nativeRequest: { model: 'recorded-apus-alias', prompt: [1, 2], n_predict: 1 }, chat: '<script>window.nativeHostile = true</script>' }],
    responses: [{ kind: 'native-response', question: 'first_outcome', raw: { tokens_cached: 7, timings: { predicted_n: 1 } } }],
    metadata: [], deterministic: [{ question: 'first_facts', derivation: 'sole-allowed-facts-selector', answer: { choice: 'NONE', probabilities: { NONE: 1 } }, modelConfidence: false, authenticatedCoverage: false }],
    omissions: [{ untrusted: true, unavailable: true }], failureCategory: 'candidate-missing' };
  return view;
}

test('APUS metadata and deterministic provenance are readable under Details at desktop and narrow widths', async () => {
  for (const width of [1280, 390]) {
    await page.viewport(width, 844);
    const screen = await render(createElement(Detail, { view: nativeView() }));
    screen.container.style.containerType = 'inline-size';
    await screen.getByText('Recorded data', { exact: true }).click();
    await screen.getByText('Recording and coverage', { exact: true }).click();
    screen.getByText('apus-llamacpp experimental', { exact: true }).element().scrollIntoView();
    await expect.element(screen.getByText('apus-llamacpp experimental', { exact: true })).toBeVisible();
    screen.getByText('recorded-apus-alias', { exact: true }).element().scrollIntoView();
    await expect.element(screen.getByText('recorded-apus-alias', { exact: true })).toBeVisible();
    screen.getByText('not recorded; no complete returned assessment', { exact: true }).element().scrollIntoView();
    await expect.element(screen.getByText('not recorded; no complete returned assessment', { exact: true })).toBeVisible();
    await screen.getByText('Native scoring mappings', { exact: true }).click();
    screen.getByText(/first_facts: deterministic NONE/).element().scrollIntoView();
    await expect.element(screen.getByText(/first_facts: deterministic NONE/)).toBeVisible();
    screen.getByText(/Not model confidence or authenticated coverage/).element().scrollIntoView();
    await expect.element(screen.getByText(/Not model confidence or authenticated coverage/)).toBeVisible();
    expect(screen.container.querySelector('.native-mappings')!.textContent).toContain('A → PASS');
    expect(screen.container.querySelector('.native-mappings')!.textContent).toContain('B → FAIL');
    expect(screen.container.querySelector('.recording-details')!.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    await screen.unmount();
  }
  await page.viewport(1280, 720);
});

test('Response shows all native exchanges and omission markers, with native HTML inert', async () => {
  const screen = await render(createElement(Detail, { view: nativeView() }));
  await screen.getByText('Recorded data', { exact: true }).click();
  await screen.getByText('Application response and validation', { exact: true }).click();
  await screen.getByText('Recorded native exchanges', { exact: true }).click();
  expect(screen.container.querySelector('.recorded-response')!.textContent).toContain('tokens_cached');
  expect(screen.container.querySelector('.recorded-response')!.textContent).toContain('predicted_n');
  expect(screen.container.querySelector('.recorded-response')!.textContent).toContain('unavailable');
  expect(screen.container.querySelector('.recorded-response script')).toBeNull();
});

test('historical metadata is not labelled as APUS or filled from current settings', async () => {
  const screen = await render(createElement(Detail, { view: makeView() }));
  screen.container.style.containerType = 'inline-size';
  await screen.getByText('Recorded data', { exact: true }).click();
  await screen.getByText('Recording and coverage', { exact: true }).click();
  screen.getByText('Provider not recorded', { exact: true }).element().scrollIntoView();
  await expect.element(screen.getByText('Provider not recorded', { exact: true })).toBeVisible();
  expect(screen.container.textContent).not.toContain('experimental');
  expect(screen.container.querySelector('.native-mappings')).toBeNull();
});
