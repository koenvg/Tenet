import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createGuard, type GuardOptions, type RecordingSink } from '../src/sdk/index.js';
import { JudgeFailure } from '../src/decision/contracts.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { answer, policy } from './helpers.js';
import { readArchive } from '../src/recording/archive.js';
import { SCHEMA_VERSION } from '../src/recording/contract.js';
import { QUESTION_VERSION } from '../src/decision/assessment-shape.js';

const status = (provider: 'typesafe' | 'injected', requestedModel: string | null, availability = 'ready') => ({
  provider, requestedModel, availability, connectivity: 'unverified',
  ...(availability === 'unavailable' ? { reason: 'missing-credentials' } : {}),
});
async function fixture(options: Partial<GuardOptions> = {}) {
  const cwd = await realpath(await mkdtemp('/tmp/tenet-identity-'));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
  const records: { stage: string; data: Record<string, unknown> }[] = [];
  const sink: RecordingSink = (stage, data) => records.push({ stage, data });
  const guard = createGuard({ host: 'offline', capabilities: ['interception', 'argument-stability', 'lifecycle-invalidation'],
    env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off', TENET_JUDGE_DEADLINE_MS: '30' },
    controlPath: join(cwd, 'private', 'control.json'), bindRecording: () => sink, ...options });
  const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd);
  const call = { callId: 'c', toolName: 'fixture-only', input: {} };
  return { guard, session, records, before: () => session.beforeTool({ ...call,
    current: () => ({ sessionId: 's', contextId: 'main', ...call }) }),
    close: async () => { await guard.close(); await rm(cwd, { recursive: true, force: true }); } };
}

test('TypeSafe readiness is local and missing credentials do not construct a client', async () => {
  for (const key of [undefined, 'offline-not-valid']) {
    const h = await fixture({ env: { TENET_RECORDING: 'off', TYPESAFE_API_KEY: key } });
    try {
      assert.deepEqual(h.guard.status().judge, status('typesafe', 'jev-latest', key ? 'ready' : 'unavailable'));
      assert.deepEqual((await h.session.ready).judge, h.guard.status().judge);
      assert.equal(h.session.status().state, key ? 'ready' : 'unavailable');
      assert.equal(h.records.length, 0);
    } finally { await h.close(); }
  }
});

for (const explicit of [false, true]) {
  test(`injected factory is lazy and requested identity is ${explicit ? 'explicit' : 'unknown'}`, async () => {
    let constructions = 0;
    const identity = { requestedModel: 'custom-requested' };
    const h = await fixture({ createJudge: () => { constructions++; return async r => answer(r.policy); },
      ...(explicit ? { judgeIdentity: identity } : {}) });
    try {
      identity.requestedModel = 'changed-after-startup';
      const expected = status('injected', explicit ? 'custom-requested' : null);
      assert.deepEqual(h.guard.status().judge, expected);
      assert.deepEqual((await h.session.ready).judge, expected);
      assert.equal(constructions, 0);
      assert.equal((await h.before()).assessment.status, 'completed');
      assert.equal(constructions, 1);
      const record = h.records.find(r => r.stage === 'assessment')!.data;
      assert.equal(record.requestedModel, expected.requestedModel);
      assert.equal(record.requestedProvider, 'injected');
      assert.equal((record.assessment as { model: string }).model, answer(policy).model);
    } finally { await h.close(); }
  });
}

for (const reason of ['provider-error', 'invalid-response', 'timeout', 'cancelled'] as const) {
  for (const explicit of [false, true]) {
    test(`failure ${reason} retains ${explicit ? 'explicit' : 'unknown'} requested identity without a returned model`, async () => {
      const h = await fixture({ judge: async () => { throw new JudgeFailure(reason); },
        ...(explicit ? { judgeIdentity: { requestedModel: 'custom-requested' } } : {}) });
      try {
        await h.session.ready;
        assert.equal((await h.before()).assessment.status, 'unavailable');
        const record = h.records.find(r => r.stage === 'assessment')!.data;
        assert.equal(record.requestedModel, explicit ? 'custom-requested' : null);
        assert.equal(record.requestedProvider, 'injected');
        assert.equal(record.assessment, null);
        assert.equal(record.model, undefined);
        assert.equal(record.returnedModel, undefined);
      } finally { await h.close(); }
    });
  }
}

test('judge takes precedence over factory; no requested identity is inferred from its response', async () => {
  const h = await fixture({ judge: async r => answer(r.policy), createJudge: () => { throw new Error('must not construct'); } });
  try { await h.session.ready; assert.equal((await h.before()).assessment.status, 'completed');
    assert.equal(h.records.find(r => r.stage === 'assessment')!.data.requestedModel, null);
  } finally { await h.close(); }
});

test('direct decide injection also defaults to unknown requested identity', async () => {
  const result = await decide({ policy, action: captureAction({ sessionId: 's', callId: 'c', toolName: 'fixture', arguments: {} }),
    cwd: '/fixture', judge: async r => answer(r.policy) });
  assert.equal(result.requestedModel, null);
  assert.equal(result.requestedProvider, 'injected');
  assert.equal(result.assessment?.model, answer(policy).model);
});

test('real deadline and factory-construction failures retain requested identity', async () => {
  for (const kind of ['timeout', 'factory-error']) {
    const h = await fixture({ judgeIdentity: { requestedModel: 'explicit-alias' },
      createJudge: () => { if (kind === 'factory-error') throw new Error('secret-provider-error'); return async () => new Promise(() => {}); } });
    try {
      await h.session.ready;
      assert.equal((await h.before()).reason, kind === 'timeout' ? 'timeout' : 'provider-error');
      const record = h.records.find(r => r.stage === 'assessment')!.data;
      assert.equal(record.requestedModel, 'explicit-alias');
      assert.equal(record.assessment, null);
      assert.ok(!JSON.stringify(h.records).includes('secret-provider-error'));
    } finally { await h.close(); }
  }
});

test('identity validation is bounded and default TypeSafe ignores injected metadata', async () => {
  for (const requestedModel of ['', '   ', 'a'.repeat(257), 'alias\nwith-control']) {
    assert.throws(() => createGuard({ host: 'offline', env: { TENET_RECORDING: 'off' },
      judge: async () => ({}), judgeIdentity: { requestedModel } }), /invalid-judge-identity/);
  }
  const h = await fixture({ judgeIdentity: { requestedModel: 'ignored-for-typesafe' } });
  try { assert.equal(h.guard.status().judge.requestedModel, 'jev-latest'); }
  finally { await h.close(); }
});

test('current archives preserve unknown requested identity and only validated returned identity', async () => {
  const directory = await realpath(await mkdtemp('/tmp/tenet-identity-archive-'));
  try {
    for (const fail of [false, true]) {
      const h = await fixture({ bindRecording: undefined,
        env: { TENET_MODE: 'enforce', TENET_RECORDING: 'on', TENET_RECORDING_DIR: directory },
        judge: async request => { if (fail) throw new JudgeFailure('provider-error'); return answer(request.policy); } });
      try { await h.session.ready; await h.before(); await h.guard.close(); }
      finally { await h.close(); }
    }
    const archive = await readArchive(directory);
    assert.deepEqual(archive.issues, []);
    const assessments = archive.records.filter(record => record.stage === 'assessment');
    assert.equal(assessments.length, 2);
    for (const record of assessments) {
      assert.equal(record.schemaVersion, SCHEMA_VERSION);
      assert.equal(record.data.requestedModel, null);
      assert.equal(record.data.requestedProvider, 'injected');
      assert.equal(record.data.questionVersion, QUESTION_VERSION);
    }
    assert.equal(assessments.filter(record => record.data.assessment === null).length, 1);
    assert.equal((assessments.find(record => record.data.assessment !== null)!.data.assessment as { model: string }).model, 'jev-offline');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
