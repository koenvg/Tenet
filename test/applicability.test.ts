import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GuardRuntime, type Call } from '../src/runtime/guard.js';
import type { ActionFacts, ActionResolver } from '../src/runtime/resolved-action.js';
import { argumentDigest } from '../src/decision/evidence.js';
import { answer } from './helpers.js';

const capabilities = { host: 'fixture', version: '1', profile: 'test', interception: true,
  resultCorrelation: true, lifecycleInvalidation: true, argumentStability: true, trustedApproval: true, limitations: [] };

async function run(options: { profile?: string; semantics?: 'file-read' | 'file-edit' | 'execute'; stale?: boolean; forged?: boolean; low?: boolean; warn?: boolean; integrity?: boolean; selection?: 'FAIL' | 'APPROVAL_REQUIRED' | 'UNKNOWN'; unsupported?: boolean; rule?: string; compound?: boolean; partial?: boolean; approved?: boolean } = {}) {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-applicability-')));
  await writeFile(join(cwd, 'TENET.md'), `Rule; ${options.warn ? 'WARN' : 'BLOCK'}; ${options.rule ?? 'Never create a commit.'}`);
  let facts: ActionFacts;
  const resolver: ActionResolver = { id: 'fixture', version: '1', semantics: ['file-read', 'file-edit', 'execute'],
    resolve: async ({ binding }) => facts = { version: 1, binding, integration: { id: 'fixture', version: '1' }, resolverState: 'current', coverage: options.partial ? 'partial' : 'complete', limitations: [],
      operations: [{ id: 'op-1', semantics: options.semantics ?? 'file-read', resources: [{ requested: 'README.md', resolved: join(cwd, 'README.md'), identity: 'revision-1', relation: 'direct' }], content: [], before: '', after: '}' },
        ...(options.compound ? [{ id: 'commit', semantics: 'execute' as const, resources: [], content: [{ role: 'executed' as const, value: 'git commit' }] }] : [])] },
    revalidate: async () => options.stale ? null : facts };
  const events: { stage: string; data: any }[] = [];
  const archive: { stage: string; data: any }[] = [];
  const env = { TENET_MODE: 'enforce', ...(options.profile ? { TENET_ASSESSMENT_PROFILE: options.profile } : {}) };
  const runtime = new GuardRuntime({ env, actionResolver: options.unsupported ? undefined : resolver,
    activation: { read: () => 'on', refresh: () => 'on' }, emit: (stage, data, archive) => events.push({ stage, data: { ...data, ...archive } }),
    bindRecording: () => (stage, data) => archive.push({ stage, data }),
    judge: async request => {
      const baseline = answer(request.policy);
      const rule: any = baseline.rules[0]!;
      if (options.selection) {
        rule.outcome = { choice: options.selection, probabilities: { PASS: 0, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 0, [options.selection]: 1, NOT_APPLICABLE: 0 } };
      } else {
        rule.outcome = { choice: 'NOT_APPLICABLE', probabilities: { PASS: options.low ? 0.11 : 0, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 0, NOT_APPLICABLE: options.low ? 0.89 : 1 } };
        rule.evidence = null;
        rule.factReferences = { digest: options.forged ? 'forged' : argumentDigest(request.resolvedAction), operationIds: ['op-1'] };
      }
      if (options.integrity) baseline.rules[1]!.outcome = { choice: 'FAIL', probabilities: { PASS: 0, APPROVAL_REQUIRED: 0, FAIL: 1, UNKNOWN: 0 } };
      return { ...baseline, profile: 'applicability-v1' };
    },
  }, capabilities);
  try {
    // Changing the caller's environment must not switch profiles after construction.
    env.TENET_ASSESSMENT_PROFILE = 'legacy';
    const identity = { host: 'fixture', sessionId: 's', contextId: 'c' };
    await runtime.start(identity, cwd);
    const input = { ...identity, cwd, callId: 'call', toolName: 'read', input: { file: 'README.md' } };
    const call: Call = { ...input, current: () => input, ...(options.approved ? { approve: async () => 'approved' as const } : {}) };
    const result = await runtime.call(call);
    return { result, events, archive };
  } finally { runtime.shutdown(); await rm(cwd, { recursive: true, force: true }); }
}

for (const semantics of ['file-read', 'file-edit'] as const) test(`complete ${semantics} can omit evidence confidence`, async () => {
  const { result, events, archive } = await run({ profile: 'applicability-v1', semantics });
  assert.equal(result, undefined);
  assert.ok(archive.some(e => e.stage === 'begin'));
  assert.ok(archive.every(e => e.data.profile === 'applicability-v1'));
  const assessment = events.find(e => e.stage === 'assessment')!.data;
  assert.equal(assessment.profile, 'applicability-v1');
  assert.equal(assessment.assessment.rules[0].evidence, null);
  const contribution = events.find(e => e.stage === 'decision')!.data.contributions[0];
  assert.equal(contribution.evidenceGate, 'not-applicable');
  assert.equal(contribution.evidenceThreshold, null);
});
for (const option of ['stale', 'forged', 'low', 'unsupported', 'integrity'] as const) test(`${option} cannot obtain an exemption`, async () => {
  assert.ok((await run({ profile: 'applicability-v1', [option]: true })).result?.block);
});
test('execution remains unresolved even if a model selects NOT_APPLICABLE', async () => {
  assert.ok((await run({ profile: 'applicability-v1', semantics: 'execute' })).result?.block);
});
test('WARN retains advisory semantics for unsupported applicability', async () => {
  assert.equal((await run({ profile: 'applicability-v1', unsupported: true, warn: true })).result, undefined);
});
for (const selection of ['FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED'] as const) test(`${selection} still prevents release without approval`, async () => {
  assert.ok((await run({ profile: 'applicability-v1', selection })).result?.block);
});
test('compound edit and commit cannot inherit the edit exemption', async () => {
  assert.ok((await run({ profile: 'applicability-v1', semantics: 'file-edit', compound: true })).result?.block);
});
test('partial facts cannot obtain an exemption', async () => {
  assert.ok((await run({ profile: 'applicability-v1', partial: true })).result?.block);
});
test('a rule prohibiting reading remains enforceable for a read', async () => {
  assert.ok((await run({ profile: 'applicability-v1', rule: 'Never read README.md.', selection: 'FAIL' })).result?.block);
});
test('an actual commit cannot be cleared by approval under an unconditional rule', async () => {
  assert.ok((await run({ profile: 'applicability-v1', semantics: 'execute', selection: 'FAIL', approved: true })).result?.block);
});
test('an explicit approval rule can release only after invocation-local confirmation', async () => {
  const options = { profile: 'applicability-v1', rule: 'Publish only with confirmation.', selection: 'APPROVAL_REQUIRED' as const };
  assert.ok((await run(options)).result?.block);
  assert.equal((await run({ ...options, approved: true })).result, undefined);
});

test('applicability is the only default contract without an opt-in', async () => {
  const { result, archive } = await run();
  assert.equal(result, undefined);
  assert.ok(archive.every(e => e.data.profile === 'applicability-v1'));
});
test('an obsolete legacy environment value cannot select a different evaluator', async () => {
  assert.equal((await run({ profile: 'legacy' })).result, undefined);
});
