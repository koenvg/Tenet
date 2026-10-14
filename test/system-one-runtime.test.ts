import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createGuard } from '../dist/sdk/index.js';
import { createSystemOneJudge } from '../src/decision/system-one.js';
import { answer, sdkAnswers } from './helpers.js';

const selections = [
  { baseUrl: 'https://judge.example', model: 'hosted-alias', auth: { type: 'bearer', token: 'selected-transport-secret' } },
  { baseUrl: 'http://127.0.0.1:18091', model: 'kev-latest', auth: { type: 'none' } },
] as const;
const identity = { sessionId: 'fixture', contextId: 'main' };
const capabilities = ['interception', 'argument-stability', 'lifecycle-invalidation', 'trusted-approval'] as const;
const call = (callId = 'call') => ({ callId, toolName: 'fixture-only', input: { text: 'inert action data' } });
async function project(work: (cwd: string) => Promise<void>) {
  const cwd = await realpath(await mkdtemp('/tmp/tenet-system-one-'));
  try { await writeFile(join(cwd, 'TENET.md'), 'Rule; Keep work local.'); await work(cwd); }
  finally { await rm(cwd, { recursive: true, force: true }); }
}

for (const selection of selections) for (const mode of ['observe', 'enforce'] as const)
  for (const outcome of ['PASS', 'FAIL', 'APPROVAL_REQUIRED', 'partial-failure'] as const)
    test(`${selection.model} compiled SDK ${mode}/${outcome} preserves permission and complete-assessment gates`, async () => project(async cwd => {
      let calls = 0, approvals = 0, completed!: (event: any) => void;
      const terminal = new Promise<any>(resolve => { completed = resolve; });
      const records: any[] = [];
      const guard = createGuard({ host: 'offline-fixture', capabilities,
        env: { TENET_MODE: mode, TENET_RECORDING: 'off', TYPESAFE_API_KEY: 'ambient-must-not-be-used' },
        controlPath: join(cwd, 'control.json'), judgeIdentity: { requestedModel: selection.model },
        bindRecording: () => (stage, data) => records.push({ stage, data }),
        onOwnerEvent: event => { if (event.type === 'assessment' && event.assessment.status !== 'pending') completed(event); },
        createJudge: () => createSystemOneJudge({ ...selection, fetch: async (url, init) => {
          calls++; assert.equal(url, selection.baseUrl + '/v1/systemone');
          const body = JSON.parse(init!.body as string);
          if (outcome === 'partial-failure' && calls === 2) return new Response('private-provider-error', { status: 503 });
          return Response.json({ model: 'returned-alias', answers: sdkAnswers(answer(undefined, outcome === 'partial-failure' ? 'PASS' : outcome), 1, body.questions) });
        } }),
      });
      try {
        const session = guard.openSession(identity, cwd); assert.equal((await session.ready).state, 'ready');
        assert.equal(calls, 0);
        const captured = call();
        const result = await session.beforeTool({ ...captured, current: () => ({ ...identity, ...captured }),
          approve: async request => { approvals++; assert.equal(await request.valid(), true); return 'approved'; } });
        const assessment = mode === 'observe' ? (await terminal).assessment : result.assessment;
        assert.equal(result.permission, mode === 'observe' || outcome === 'PASS' || outcome === 'APPROVAL_REQUIRED' ? 'released' : 'blocked');
        assert.equal(approvals, mode === 'enforce' && outcome === 'APPROVAL_REQUIRED' ? 1 : 0);
        assert.equal(assessment.status, outcome === 'partial-failure' ? 'unavailable' : 'completed');
        assert.equal(assessment.wouldDecision, outcome === 'partial-failure' ? undefined : outcome === 'PASS' ? 'ALLOW' : outcome === 'FAIL' ? 'BLOCK' : 'ASK');
        assert.equal(calls, outcome === 'partial-failure' ? 2 : 3);
        assert.equal(result.execution, 'unknown');
        if (outcome === 'partial-failure') {
          assert.ok(!records.some(record => record.stage === 'validation' && record.data.valid));
          assert.equal(records.find(record => record.stage === 'assessment').data.assessment, null);
          assert.equal(records.find(record => record.stage === 'assessment').data.returnedModel, undefined);
        }
        assert.doesNotMatch(JSON.stringify({ records, assessment, result }), /private-provider-error|selected-transport-secret|ambient-must-not-be-used/);
      } finally { await guard.close(); }
    }));

for (const selection of selections) test(`${selection.model} approval remains exact-call and invocation-local`, async () => project(async cwd => {
  let approvals = 0;
  const guard = createGuard({ host: 'offline-fixture', capabilities, env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' },
    controlPath: join(cwd, 'control.json'), judge: createSystemOneJudge({ ...selection, fetch: async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      return Response.json({ model: 'returned-alias', answers: sdkAnswers(answer(undefined, 'APPROVAL_REQUIRED'), 1, body.questions) });
    } }) });
  try {
    const session = guard.openSession(identity, cwd); await session.ready;
    for (const id of ['first', 'second']) {
      const captured = call(id);
      const result = await session.beforeTool({ ...captured, current: () => ({ ...identity, ...captured }),
        approve: async request => { approvals++; assert.equal(await request.valid(), true); return 'approved'; } });
      assert.equal(result.permission, 'released'); assert.equal(result.assessment.wouldDecision, 'ASK');
    }
    assert.equal(approvals, 2);
    const captured = call('changed'); let current = { ...identity, ...captured };
    const changed = await session.beforeTool({ ...captured, current: () => current,
      approve: async () => { current = { ...current, input: { text: 'changed action data' } }; return 'approved'; } });
    assert.equal(changed.permission, 'blocked'); assert.equal(changed.execution, 'unknown');
  } finally { await guard.close(); }
}));

for (const selection of selections) test(`${selection.model} off/dormant/pre-aborted sessions make no factory or fetch calls`, async () => project(async cwd => {
  let constructions = 0, calls = 0;
  const guard = createGuard({ host: 'offline-fixture', env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' },
    controlPath: join(cwd, 'control.json'), createJudge: () => {
      constructions++; return createSystemOneJudge({ ...selection, fetch: async () => { calls++; throw new Error('must not call'); } });
    } });
  try {
    const session = guard.openSession(identity, cwd); await session.ready;
    await guard.setActivation('off');
    const captured = call('off');
    assert.equal((await session.beforeTool({ ...captured, current: () => ({ ...identity, ...captured }) })).bypassReason, 'off');
    await guard.setActivation('on');
    const controller = new AbortController(); controller.abort();
    assert.equal((await session.beforeTool({ ...captured, signal: controller.signal, current: () => ({ ...identity, ...captured }) })).permission, 'blocked');
    const dormant = join(cwd, 'dormant'); await mkdir(dormant);
    const other = guard.openSession({ sessionId: 'dormant', contextId: 'main' }, dormant);
    assert.equal((await other.ready).state, 'dormant');
    const dormantCall = call('dormant');
    assert.equal((await other.beforeTool({ ...dormantCall, current: () => ({ sessionId: 'dormant', contextId: 'main', ...dormantCall }) })).bypassReason, 'dormant');
    assert.equal(constructions, 0); assert.equal(calls, 0);
  } finally { await guard.close(); }
}));
