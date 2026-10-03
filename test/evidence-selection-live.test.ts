import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareEvidenceManifest } from '../eval/evidence-selection-inputs.js';

const original = JSON.parse(readFileSync(new URL('../eval/evidence-selection/report.json', import.meta.url), 'utf8'));
test('live manifest pins the original 34 payloads, labels separately, and three offline controls', () => {
  const manifest = prepareEvidenceManifest();
  assert.equal(manifest.budget, 34);
  assert.equal(manifest.entries.length, 34);
  assert.deepEqual(manifest.excluded.map(p => p.id), ['provider-unavailable', 'invalid-assessment', 'skipped-assessment']);
  assert.equal(Object.isFrozen(manifest.entries[0]!.payload.state), true);
  for (const [i, entry] of manifest.entries.entries()) {
    const pair = original.pairs[Math.floor(i / 2)];
    const side = i % 2 ? 'candidate' : 'baseline';
    assert.equal(entry.id, pair.id);
    assert.equal(entry.side, side);
    assert.deepEqual(entry.payload, pair[side].payload);
    assert.equal(entry.payloadDigest, pair[side].payloadDigest);
    assert.equal(entry.requestBytes, pair[side].requestBytes);
    assert.deepEqual(entry.expected, pair.expected);
  }
});

// Fetch is the external system seam. Replies are SDK-shaped, not injected decisions.
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEvidenceLive } from '../eval/evidence-selection-live.js';
import { answer, sdkAnswers } from './helpers.js';

const storage = () => realpathSync(mkdtempSync(join(tmpdir(), 'tenet29-test-')));
function passReply(body: any) {
  const answers = sdkAnswers(answer(body.state.policy));
  const labels = Object.keys(body.questions.rule_0_facts.criteria);
  answers.rule_0_facts.probabilities = Object.fromEntries(labels.map(label => [label, label === 'NONE' ? 1 : 0]));
  return { model: 'jev-offline-returned', answers, usage: { input_tokens: 12, output_tokens: 2 } };
}
test('campaign rejects missing authorization or credentials before transport or output reservation', async () => {
  const root = storage(); let calls = 0;
  const fetch = async () => { calls++; throw Error('must not send'); };
  try {
    await assert.rejects(runEvidenceLive({ storage: root, authorized: false, apiKey: 'offline', fetch }));
    await assert.rejects(runEvidenceLive({ storage: root, authorized: true, apiKey: '', fetch }));
    assert.equal(calls, 0);
    assert.equal(readFileSync(new URL('../eval/evidence-selection/report.json', import.meta.url), 'utf8'), JSON.stringify(original, null, 2) + '\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('campaign submits all original sides once sequentially and reports production replies against authored labels', async () => {
  const root = storage(); let active = 0, calls = 0;
  const manifest = prepareEvidenceManifest();
  try {
    const result = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'offline-test', fetch: async (url, init) => {
      assert.equal(active++, 0);
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.body, JSON.stringify(manifest.entries[calls++]!.payload));
      assert.equal(new Headers(init?.headers).has('X-TypeSafe-Retry-Count'), false);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return Response.json(passReply(JSON.parse(init!.body as string)));
    } });
    assert.equal(calls, 34);
    assert.equal(result.accounting.spent, 34);
    assert.equal(result.accounting.unspent, 0);
    assert.equal(result.pairs.length, 17);
    assert.equal(result.excludedOfflineControls.length, 3);
    assert.equal(result.summaries.baseline.allowsAgainstAuthoredProtection.denominator, 16);
    assert.equal(result.summaries.candidate.allowsAgainstAuthoredProtection.numerator, 16);
    assert.equal(result.summaries.candidate.benignBlocks.numerator, 0);
    assert.equal(result.semanticSafety, 'not-established');
    assert.equal(result.fixtureActionsExecuted, false);
    assert.equal(result.pairs[0]!.baseline.returnedModel, 'jev-offline-returned');
    assert.deepEqual(result.pairs[0]!.baseline.returnedUsage, { input_tokens: 12, output_tokens: 2 });
    assert.ok(result.pairs[0]!.baseline.providerLatencyMs! >= 0);
    const before = calls;
    await assert.rejects(runEvidenceLive({ storage: root, authorized: true, apiKey: 'offline', fetch: async () => { calls++; return Response.json({}); } }));
    assert.equal(calls, before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { runEvidenceLiveCli } from '../eval/evidence-selection-live-cli.js';
test('separate CLI rejects missing gates, bad flags and arbitrary scope before any provider call', async () => {
  const root = storage(); let calls = 0;
  const env = { TYPESAFE_API_KEY: 'offline', BB_THREAD_STORAGE: root };
  try {
    for (const args of [[], ['--live'], ['--authorize-evidence-disclosure'], ['--live', '--live'],
      ['--live', '--authorize-evidence-disclosure', '--execute'],
      ['--live', '--authorize-evidence-disclosure', '--output', '/tmp/report'],
      ['--live', '--authorize-evidence-disclosure', '--model', 'other']]) {
      await assert.rejects(runEvidenceLiveCli(args, env, async () => { calls++; return Response.json({}); }));
    }
    await assert.rejects(runEvidenceLiveCli(['--live', '--authorize-evidence-disclosure'], { ...env, TYPESAFE_API_KEY: '' }, async () => { calls++; return Response.json({}); }));
    assert.equal(calls, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('supported fact replies remain visible for both script-only cases without semantic unsafe labels', async () => {
  const root = storage(); let calls = 0;
  const manifest = prepareEvidenceManifest();
  try {
    const report = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async (_url, init) => {
      const entry = manifest.entries[calls++]!, body = JSON.parse(init!.body as string);
      const raw = passReply(body);
      if (['forged-facts', 'stale-facts'].includes(entry.id)) {
        const digest = Object.keys(body.questions.rule_0_facts.criteria).find(k => k !== 'NONE')!;
        const outcome = raw.answers.rule_0_outcome;
        outcome.choice = 'NOT_APPLICABLE';
        outcome.probabilities = Object.fromEntries(Object.keys(outcome.probabilities).map(k => [k, k === 'NOT_APPLICABLE' ? 1 : 0]));
        raw.answers.rule_0_facts.choice = digest;
        raw.answers.rule_0_facts.probabilities = { NONE: 0, [digest]: 1 };
      }
      return Response.json(raw);
    } });
    for (const id of ['forged-facts', 'stale-facts']) {
      const pair = report.pairs.find(p => p.id === id)!;
      assert.equal(pair.expected.decision, 'BLOCK');
      for (const side of ['baseline', 'candidate'] as const) {
        assert.equal(pair[side].status, 'assessed');
        assert.equal(pair[side].decision, 'ALLOW');
        assert.equal(pair[side].gate!.assessment!.rules[0]!.applicabilitySupported, true);
      }
    }
    assert.equal(report.summaries.candidate.allowsAgainstAuthoredProtection.numerator, 16);
    assert.equal(report.summaries.candidate.decisionDisagreementWithAuthoredLabel.numerator, 16);
    assert.equal(report.semanticSafety, 'not-established');
    assert.match(report.metricDefinitions.allowsAgainstAuthoredProtection, /Not demonstrated unsafe/);
    assert.ok(!JSON.stringify(report).includes('"unsafeAllow"'));
    assert.match(readFileSync(join(root, 'tenet29-live/report.md'), 'utf8').split('\n')[2]!, /not demonstrated unsafe/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('real gates expose FAIL, UNKNOWN, ASK, integrity and invalid replies without dropping any row', async () => {
  const root = storage(); let calls = 0;
  const manifest = prepareEvidenceManifest();
  try {
    const report = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async (_url, init) => {
      const entry = manifest.entries[calls++]!, body = JSON.parse(init!.body as string);
      if (entry.id === 'exact-inspection') return Response.json({ model: 'jev-returned' });
      const raw = passReply(body);
      delete (raw as any).usage;
      const choice = entry.id === 'approval' ? 'APPROVAL_REQUIRED' : entry.id === 'read-prohibited' ? 'FAIL' : 'UNKNOWN';
      const outcome = raw.answers.rule_0_outcome;
      outcome.choice = choice;
      outcome.probabilities = Object.fromEntries(Object.keys(outcome.probabilities).map(k => [k, k === choice ? 1 : 0]));
      if (entry.id === 'policy-mutation') {
        const integrity = raw.answers.rule_1_outcome;
        integrity.choice = 'FAIL'; integrity.probabilities = { PASS: 0, FAIL: 1, UNKNOWN: 0, APPROVAL_REQUIRED: 0 };
      }
      return Response.json(raw);
    } });
    assert.equal(calls, 34);
    assert.equal(report.accounting.failed, 2);
    assert.equal(report.pairs[0]!.baseline.status, 'invalid');
    assert.equal(report.pairs[0]!.baseline.observeWouldDecision, null);
    assert.deepEqual(report.pairs[0]!.baseline.gate!.diagnostics, []);
    assert.equal(report.pairs[0]!.baseline.decision, 'BLOCK');
    assert.equal(report.pairs[0]!.baseline.returnedUsage, null);
    const approval = report.pairs.find(p => p.id === 'approval')!;
    assert.equal(approval.candidate.decision, 'ASK');
    assert.equal(approval.candidate.enforcePermission, 'blocked-no-owner-approval');
    assert.equal(report.pairs.find(p => p.id === 'policy-mutation')!.candidate.gate!.reason, 'policy-integrity');
    assert.equal(report.pairs.find(p => p.id === 'read-prohibited')!.baseline.gate!.reason, 'rule-failed');
    assert.equal(report.summaries.candidate.uncertaintyOnlyBlocks.denominator, 17);
    assert.equal(report.summaries.candidate.authoredProtectedUnassessed.denominator, 16);
    assert.equal(report.pairs.length, 17);
    assert.ok(report.pairs.every(p => p.baseline.execution === 'not-executed' && p.candidate.execution === 'not-executed'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('HTTP rejection stops once with fixed partial counts and never saves private error text', async () => {
  for (const [status, stop] of [[401, 'authentication-rejection'], [403, 'authentication-rejection'], [429, 'quota-rejection'], [400, 'configuration-rejection'], [302, 'redirect-rejection']] as const) {
    const root = storage(); let calls = 0;
    try {
      const report = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async (_url, init) => {
        calls++; assert.equal(init?.redirect, 'error');
        return new Response('private-error-unit-auth-value', { status, headers: { location: 'https://outside.example.invalid' } });
      } });
      assert.equal(calls, 1);
      assert.equal(report.stopReason, stop);
      assert.equal(report.accounting.spent, 1);
      assert.equal(report.accounting.unspent, 33);
      assert.equal(report.pairs[0]!.candidate.status, 'unattempted');
      assert.equal(report.pairs.length, 17);
      assert.equal(report.summaries.baseline.validated.denominator, 17);
      const journal = readFileSync(join(root, 'tenet29-live/attempts.jsonl'), 'utf8');
      assert.ok(!journal.includes('private-error'));
      assert.ok(!JSON.stringify(report).includes('unit-auth-value'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('503 has no retry or replacement and remains a failed original request', async () => {
  const root = storage(); let calls = 0;
  try {
    const report = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async (_url, init) => {
      calls++;
      return calls === 1 ? new Response('private-error', { status: 503 }) : Response.json(passReply(JSON.parse(init!.body as string)));
    } });
    assert.equal(calls, 34);
    assert.equal(report.accounting.failed, 1);
    assert.equal(report.accounting.spent, 34);
    assert.equal(report.pairs[0]!.baseline.status, 'unavailable');
    assert.equal(report.pairs[0]!.baseline.observeWouldDecision, null);
    assert.equal(report.pairs[0]!.baseline.returnedModel, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('ambiguous transport is spent, stops the campaign, and cannot be re-entered', async () => {
  const root = storage(); let calls = 0;
  try {
    const report = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async () => { calls++; throw Error('lost-connection-private-error'); } });
    assert.equal(calls, 1);
    assert.equal(report.stopReason, 'transport-ambiguous');
    assert.equal(report.accounting.spent, 1);
    assert.equal(report.accounting.ambiguous, 1);
    assert.equal(report.accounting.unspent, 33);
    await assert.rejects(runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async () => { calls++; return Response.json({}); } }));
    assert.equal(calls, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { EvidenceCampaign } from '../eval/evidence-selection-campaign.js';
test('durable campaign refuses unsafe storage, existing outputs and more than 34 or duplicate intents', async () => {
  const root = storage(); let calls = 0;
  const options = { authorized: true, apiKey: 'unit-auth-value', fetch: async () => { calls++; return Response.json({}); } };
  try {
    const alias = join(root, 'alias'); symlinkSync(root, alias);
    await assert.rejects(runEvidenceLive({ ...options, storage: alias }));
    mkdirSync(join(root, 'tenet29-live'));
    await assert.rejects(runEvidenceLive({ ...options, storage: root }));
    assert.equal(calls, 0);
    rmSync(join(root, 'tenet29-live'), { recursive: true });
    const manifest = prepareEvidenceManifest(), campaign = new EvidenceCampaign(root, manifest);
    try {
      for (const entry of manifest.entries) {
        campaign.dispatch(entry);
        assert.throws(() => campaign.dispatch(entry));
        campaign.complete(entry, { status: 'offline-test' });
      }
      assert.throws(() => campaign.dispatch(manifest.entries[0]!));
      const intents = readFileSync(join(root, 'tenet29-live/attempts.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(l => l.stage === 'dispatch-intent');
      assert.equal(intents.length, 34);
      assert.equal(intents[33].payloadDigest, manifest.entries[33]!.payloadDigest);
    } finally { campaign.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dispatch intent and partial report exist before Fetch and journal failure prevents another request', async () => {
  const root = storage(); let calls = 0;
  try {
    await assert.rejects(runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async (_url, init) => {
      calls++;
      const journal = readFileSync(join(root, 'tenet29-live/attempts.jsonl'), 'utf8');
      assert.equal(JSON.parse(journal.trim()).stage, 'dispatch-intent');
      const report = JSON.parse(readFileSync(join(root, 'tenet29-live/report.json'), 'utf8'));
      assert.equal(report.accounting.spent, 1);
      assert.equal(report.accounting.ambiguous, 1);
      unlinkSync(join(root, 'tenet29-live/attempts.jsonl'));
      return Response.json(passReply(JSON.parse(init!.body as string)));
    } }));
    assert.equal(calls, 1);
    assert.ok(readFileSync(join(root, 'tenet29-live/manifest.json'), 'utf8').includes('TENET-29-bdc51955-34'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('interrupted request consumes one intent and stops before the next request', async () => {
  for (const kind of ['cancelled', 'timeout'] as const) {
    const root = storage(); let calls = 0;
    const controller = new AbortController();
    try {
      const report = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', signal: controller.signal, fetch: async (_url, init) => {
        calls++;
        if (kind === 'cancelled') setTimeout(() => controller.abort(), 5);
        return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(Error('aborted')), { once: true }));
      } });
      assert.equal(calls, 1);
      assert.equal(report.stopReason, kind);
      assert.equal(report.accounting.spent, 1);
      assert.equal(report.accounting.unspent, 33);
      assert.equal(report.thresholds.deadlineMs, 2500);
      assert.equal(report.pairs[0]!.candidate.status, 'unattempted');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('programmatic campaign rejects arbitrary payload or configuration scope before Fetch', async () => {
  const root = storage(); let calls = 0;
  try {
    await assert.rejects(runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async () => { calls++; return Response.json({}); }, payload: { real: 'forbidden' } } as any));
    assert.equal(calls, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('manifest refuses byte drift without touching frozen artifacts', () => {
  assert.throws(() => (prepareEvidenceManifest as any)(() => Buffer.from('tampered fixture bytes')));
});

test('replacing the durable journal stops after the first request instead of writing to a detached file', async () => {
  const root = storage(); let calls = 0;
  try {
    await assert.rejects(runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async (_url, init) => {
      calls++;
      const path = join(root, 'tenet29-live/attempts.jsonl');
      unlinkSync(path); writeFileSync(path, '');
      return Response.json(passReply(JSON.parse(init!.body as string)));
    } }));
    assert.equal(calls, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('returned missing metadata and credential echoes are never inferred or written into reports', async () => {
  const root = storage(); let calls = 0;
  try {
    const report = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async (_url, init) => {
      calls++;
      const raw = passReply(JSON.parse(init!.body as string));
      const malicious = { ...raw, model: calls === 1 ? undefined : raw.model,
        usage: { input_tokens: 12, output_tokens: 2, 'unit-auth-value': 'unit-auth-value', secret: 'unit-auth-value' },
        unexpected: 'unit-auth-value' };
      return Response.json(malicious);
    } });
    assert.equal(calls, 34);
    assert.equal(report.pairs[0]!.baseline.status, 'invalid');
    assert.equal(report.pairs[0]!.baseline.returnedModel, null);
    assert.ok(!JSON.stringify(report).includes('unit-auth-value'));
    assert.ok(!readFileSync(join(root, 'tenet29-live/attempts.jsonl'), 'utf8').includes('unit-auth-value'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('R1: body-transfer failures after success or error headers consume one ambiguous attempt and stop', async () => {
  for (const status of [200, 503]) {
    const root = storage(); let calls = 0;
    try {
      const report = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async () => {
        calls++;
        return new Response(new ReadableStream({
          start(controller) { controller.enqueue(new TextEncoder().encode('{"model":')); },
          pull(controller) { controller.error(Error('synthetic-body-socket-closure')); },
        }), { status });
      } });
      assert.equal(calls, 1);
      assert.equal(report.stopReason, 'transport-ambiguous');
      assert.equal(report.accounting.spent, 1);
      assert.equal(report.accounting.ambiguous, 1);
      assert.equal(report.accounting.failed, 0);
      assert.equal(report.accounting.unspent, 33);
      assert.equal(report.pairs[0]!.baseline.httpStatus, status);
      assert.equal(report.pairs[0]!.candidate.status, 'unattempted');
      const saved = JSON.parse(readFileSync(join(root, 'tenet29-live/report.json'), 'utf8'));
      assert.equal(saved.accounting.ambiguous, 1);
      assert.equal(saved.pairs.length, 17);
      const journal = readFileSync(join(root, 'tenet29-live/attempts.jsonl'), 'utf8');
      assert.equal(journal.trim().split('\n').filter(l => JSON.parse(l).stage === 'dispatch-intent').length, 1);
      assert.ok(!journal.includes('synthetic-body-socket-closure'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('R2: opposing paired gate changes and unfinished pairs stay visible with fixed denominator 17', async () => {
  const root = storage(); let calls = 0;
  const choices = ['FAIL', 'UNKNOWN', 'UNKNOWN', 'FAIL', 'PASS', 'FAIL', 'FAIL', 'PASS', 'PASS'];
  try {
    const report = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', fetch: async (_url, init) => {
      const index = calls++;
      if (index === 9) return new Response('private-error', { status: 401 });
      const raw = passReply(JSON.parse(init!.body as string));
      const outcome = raw.answers.rule_0_outcome;
      outcome.choice = choices[index]!;
      outcome.probabilities = Object.fromEntries(Object.keys(outcome.probabilities).map(k => [k, k === outcome.choice ? 1 : 0]));
      return Response.json(raw);
    } });
    assert.equal(calls, 10);
    assert.equal(report.summaries.baseline.selectedFail.numerator, 2);
    assert.equal(report.summaries.candidate.selectedFail.numerator, 2);
    assert.equal(report.summaries.baseline.uncertaintyOnlyBlocks.numerator, 1);
    assert.equal(report.summaries.candidate.uncertaintyOnlyBlocks.numerator, 1);
    const paired = report.pairedChanges;
    assert.deepEqual(paired.bothValidated, { numerator: 4, denominator: 17 });
    assert.deepEqual(paired.unavailablePairs, { numerator: 13, denominator: 17 });
    assert.deepEqual(paired.decisionChanged, { numerator: 2, denominator: 17 });
    assert.deepEqual(paired.outcomeChanged, { numerator: 4, denominator: 17 });
    assert.deepEqual(paired.selectedFailChanged, { numerator: 4, denominator: 17 });
    assert.deepEqual(paired.uncertaintyChanged, { numerator: 2, denominator: 17 });
    assert.deepEqual(paired.selectedFailToUncertainty, { numerator: 1, denominator: 17 });
    assert.deepEqual(paired.uncertaintyToSelectedFail, { numerator: 1, denominator: 17 });
    const first = report.pairs[0]!.changes;
    assert.equal(first.decisionTransition, 'BLOCK -> BLOCK');
    assert.equal(first.selectedFailToUncertainty, true);
    assert.equal(first.outcomeTransitions![0]!.baseline, 'FAIL');
    assert.equal(first.outcomeTransitions![0]!.candidate, 'UNKNOWN');
    assert.equal(report.pairs[1]!.changes.uncertaintyToSelectedFail, true);
    for (const pair of report.pairs.slice(4)) {
      assert.equal(pair.changes.available, false);
      assert.equal(pair.changes.selectedFailChanged, null);
    }
    const markdown = readFileSync(join(root, 'tenet29-live/report.md'), 'utf8');
    assert.match(markdown, /selectedFailToUncertainty.*1\/17/);
    assert.match(markdown, /unavailablePairs.*13\/17/);
    assert.match(markdown, /FAIL -> UNKNOWN/);
    assert.equal(report.pairs.length, 17);
    assert.equal(report.semanticAccuracy, 'not-established');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('R1: cancellation during body transfer leaves response metadata unknown and stops at one spent intent', async () => {
  const root = storage(); let calls = 0;
  const controller = new AbortController();
  try {
    const report = await runEvidenceLive({ storage: root, authorized: true, apiKey: 'unit-auth-value', signal: controller.signal, fetch: async (_url, init) => {
      calls++;
      return new Response(new ReadableStream({ start(body) {
        body.enqueue(new TextEncoder().encode('{"model":"incomplete'));
        init?.signal?.addEventListener('abort', () => body.error(Error('synthetic-cancelled-body')), { once: true });
        setTimeout(() => controller.abort(), 5);
      } }), { status: 200 });
    } });
    assert.equal(calls, 1);
    assert.equal(report.stopReason, 'cancelled');
    assert.equal(report.accounting.spent, 1);
    assert.equal(report.accounting.ambiguous, 1);
    assert.equal(report.accounting.unspent, 33);
    assert.equal(report.pairs[0]!.baseline.returnedModel, null);
    assert.equal(report.pairs[0]!.baseline.returnedUsage, null);
    assert.equal(report.pairs[0]!.baseline.response, null);
    assert.equal(report.pairs[0]!.candidate.status, 'unattempted');
    assert.equal(report.pairedChanges.unavailablePairs.numerator, 17);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
