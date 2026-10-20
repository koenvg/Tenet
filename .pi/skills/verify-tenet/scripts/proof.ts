#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { closeBrowser, launchBrowser, withInspector } from '../../../../inspector/tests/integration/fixture.js';
import { seedSessionRules, ruleSessionLink } from '../../../../inspector/tests/integration/session-rules-fixture.js';
import { openRecordedData, reveal } from '../../../../inspector/tests/ui-navigation.js';

import { fileURLToPath } from 'node:url';
import { startInspector } from '../../../../src/inspector/server.js';
import { verifyFailureIsolation } from './failure-isolation.js';

test('offline feature verification', async () => {
  const evidence = process.env.TENET_VERIFY_EVIDENCE;
  assert.ok(evidence, 'launch through run.py to isolate owner state');
  const controller = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => controller.abort(new Error(signal)));
  const report: Record<string, unknown> = { feature: ['session-rules', 'recorded-data', 'operations'], synthetic: true };
  const actions: unknown[] = [];
  report.actions = actions;
  let origin: string | undefined;
  let completed = false;

  async function archiveDigest(directory: string): Promise<string> {
    const hash = createHash('sha256');
    for (const name of (await readdir(directory, { recursive: true })).sort()) {
      const path = join(directory, name);
      if ((await lstat(path)).isFile()) hash.update(name).update(await readFile(path));
    }
    return hash.digest('hex');
  }

  try {
    await launchBrowser();
    await withInspector({ signal: controller.signal, onFinish() {} }, { start: options => startInspector({ ...options, assets: fileURLToPath(new URL('../../../../inspector/dist', import.meta.url)) }) }, 'verify-tenet', async ({ page, app, directory, open, externalRequests }) => {
      origin = app.origin;
      const statusResponse = await page.request.get('/api/status');
      assert.equal(statusResponse.status(), 200);
      const status = await statusResponse.json();
      assert.match(status.reader.build, /^tenet-reader-0\.1\.0\/assets-[a-f0-9]{12}$/);
      await expect.poll(async () => {
        const response = await (await page.request.get('/api/sessions')).json();
        return { states: response.sessions.map((s: { status: string }) => s.status).sort(), indexing: response.reader.indexing };
      }, { timeout: 10_000 }).toEqual({ states: ['clear', 'unchecked', 'unclear', 'violation'], indexing: false });
      report.doctor = { origin, archive: directory, reader: (await (await page.request.get('/api/status')).json()).reader };
      console.log(`Doctor passed for owned inspector ${origin}, ${status.reader.build}`);
      const before = await archiveDigest(directory);
      report.archiveBefore = before;
      await expect(page.getByRole('heading', { name: 'Did this session follow the rules?' })).toBeVisible();
      const row = page.getByRole('button', { name: /Ask for approval before deploying to production/ });
      await expect(row).toBeVisible();
      await writeFile(join(evidence, 'before.aria.txt'), await page.locator('body').ariaSnapshot());
      await page.screenshot({ path: join(evidence, 'before.png'), fullPage: true });

      actions.push({ action: 'click rule', name: 'Ask for approval before deploying to production.' });
      await row.click();
      const dialog = page.getByRole('dialog', { name: 'Rule details' });
      await expect(dialog).toBeVisible();
      await expect(page.locator('.rule-full-text')).toHaveText('Ask for approval before deploying to production.');
      await expect(page.locator('.rule-panel-body > .rule-status')).toHaveText('Violation found');
      await expect(page.locator('.rule-check')).toHaveCount(50);
      actions.push({ result: 'Rule details shows Violation found and 50 recorded checks' });
      await page.screenshot({ path: join(evidence, 'rule.png') });

      actions.push({ action: 'click More recorded checks' });
      await page.getByRole('button', { name: 'More recorded checks' }).click();
      await expect(page.locator('.rule-check')).toHaveCount(55);
      actions.push({ result: '55 recorded checks' });
      actions.push({ action: 'expand first View recorded action and Recorded data, then exact rule records' });
      await page.locator('.rule-action-disclosure > summary').first().click();
      await page.locator('.decision-summary').waitFor();
      await openRecordedData(page, 'Questions');
      const exact = page.getByRole('region', { name: 'Exact rule records and captured questions', exact: true });
      const params = new URL(page.url()).searchParams;
      for (const key of ['session', 'rule', 'invocation']) assert.match(params.get(key)!, /^[a-f0-9]{64}$/);
      const detail = await (await page.request.get(`/api/sessions/${params.get('session')}/invocations/${params.get('invocation')}`)).json();
      assert.deepEqual(JSON.parse((await exact.locator('pre').textContent())!), { questionVersion: detail.view.questionVersion, rules: detail.view.rules });
      await writeFile(join(evidence, 'detail.json'), JSON.stringify(detail, null, 2));
      await writeFile(join(evidence, 'after.aria.txt'), await page.locator('body').ariaSnapshot());
      await page.screenshot({ path: join(evidence, 'after.png') });
      report.selectedUrl = page.url();
      actions.push({ result: 'Exact records match public read-only detail API', url: page.url() });

      await openRecordedData(page);
      const submitted = page.getByRole('region', { name: 'Submitted evidence', exact: true });
      await expect(submitted).toContainText('Long exact recorded string.');
      const evidenceSections = submitted.locator('.evidence-section');
      const evidenceKeys: string[] = [];
      for (const section of await evidenceSections.all()) {
        const key = (await section.locator('.question-key').textContent())!.replace(/^state\./, '');
        evidenceKeys.push(key);
        assert.deepEqual(JSON.parse((await section.locator('pre').textContent())!), detail.view.evidence[key], `exact state.${key} matches public detail API`);
      }
      assert.deepEqual(evidenceKeys.sort(), Object.keys(detail.view.evidence).sort(), 'all submitted evidence fields are displayed');
      report.evidenceFieldsCompared = evidenceKeys;
      actions.push({ action: 'open Exact submitted evidence', result: 'synthetic submitted text visible' });
      await submitted.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(evidence, 'evidence.png') });
      const linked = await open(new URL(page.url()).pathname + new URL(page.url()).search);
      await expect(linked.locator('.rule-full-text')).toHaveText('Ask for approval before deploying to production.');
      assert.equal(new URL(linked.url()).search, new URL(page.url()).search, 'deep-link identity must survive navigation');
      await openRecordedData(linked);
      assert.equal(await linked.getByRole('region', { name: 'Submitted evidence', exact: true }).textContent(), await submitted.textContent());
      await reveal(linked, '.recording-details');
      await reveal(linked, '.record-identifiers');
      await expect(linked.getByRole('textbox', { name: 'Recorded invocation ID', exact: true })).toHaveValue(detail.view.identity.invocationId);
      await expect(linked.getByRole('textbox', { name: 'Recorded call ID', exact: true })).toHaveValue(detail.view.identity.callId);
      await expect(linked.getByRole('textbox', { name: 'Recorded session ID', exact: true })).toHaveValue(detail.view.identity.sessionId);
      report.reopenedIdentity = detail.view.identity;
      await linked.screenshot({ path: join(evidence, 'reopened.png') });
      await writeFile(join(evidence, 'reopened.aria.txt'), await linked.locator('body').ariaSnapshot());
      await linked.close();
      actions.push({ action: 'reopen address in independent page', result: 'same selected rule and recorded action' });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(row).toBeFocused();
      actions.push({ action: 'Escape', result: 'panel closed and focus returned to rule' });
      const workspace = page.getByRole('navigation', { name: 'Workspace' });
      const operationsButton = workspace.getByRole('button', { name: 'Operations', exact: true });
      await operationsButton.click();
      await expect(page.getByRole('heading', { name: 'Operations', exact: true })).toBeVisible();
      await expect(operationsButton).toHaveAttribute('aria-current', 'page');
      assert.equal(new URL(page.url()).search, '?view=operations');
      const operationsResponse = await page.request.get('/api/operations?window=15&offset=0');
      assert.equal(operationsResponse.status(), 200);
      const operations = await operationsResponse.json();
      assert.equal(operations.coverage, 'unknown');
      assert.equal(operations.current, null);
      assert.equal(operations.freshForMs, 0);
      assert.deepEqual(operations.runtimes, []);
      assert.deepEqual(operations.projects, []);
      assert.deepEqual(operations.requests, []);
      assert.equal(operations.total, 0);
      assert.equal(operations.next, null);
      await expect(page.getByRole('heading', { name: 'No retained requests', exact: true })).toBeVisible();
      await expect(page.locator('.op-connection')).toContainText('Current activity is unknown.');
      await expect(page.locator('.op-connection')).toContainText('0 observed runtimes');
      for (const name of ['Queued Unknown', 'Analyzing Unknown', 'Awaiting approval Unknown', 'Completed 0']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
      }
      await page.getByText('Trend data', { exact: true }).click();
      const intervals = page.getByRole('table', { name: 'Analysis time interval averages' }).locator('tbody tr');
      await expect(intervals).toHaveCount(15);
      for (const interval of await intervals.all()) {
        assert.deepEqual(await interval.locator('td').allTextContents(), ['No samples', '0', 'No samples', '0']);
      }
      await page.getByText('Coverage and retention', { exact: true }).click();
      await expect(page.locator('.op-coverage')).toContainText('Reader issues unavailable');
      report.operations = { scope: 'empty telemetry only', response: operations };
      actions.push({ action: 'open Operations, Trend data, and Coverage and retention', result: 'unknown current activity, no retained requests, and 15 intervals without samples' });
      await page.screenshot({ path: join(evidence, 'operations.png'), fullPage: true });
      await writeFile(join(evidence, 'operations.aria.txt'), await page.locator('body').ariaSnapshot());
      await workspace.getByRole('button', { name: 'Inspector', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Did this session follow the rules?' })).toBeVisible();
      report.archiveAfter = await archiveDigest(directory);
      assert.equal(report.archiveAfter, before, 'read-only review must not modify archive bytes');
      assert.deepEqual(externalRequests, [], 'no nonlocal browser requests');
      report.externalRequests = externalRequests;
    }, { base: false, seed: seedSessionRules, path: ruleSessionLink() });
    completed = true;
  } finally {
    try {
      await closeBrowser();
      if (origin) {
        await assert.rejects(fetch(`${origin}/api/status`, { signal: AbortSignal.timeout(1000) }), 'owned server must be closed');
        report.serverClosed = true;
      }
      report.passed = completed;
    } finally {
      await writeFile(join(evidence, 'proof.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
  console.log('PASS session-rules, recorded-data and empty Operations. Synthetic archive unchanged; owned inspector closed.');
});

test('failure diagnostics ignore dotenv and retain owned evidence', verifyFailureIsolation);
