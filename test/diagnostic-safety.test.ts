import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createGuard, type OwnerEvent, type OwnerRecord } from 'tenet';
import { readArchive } from '../src/recording/archive.js';
import { validRecord } from '../src/recording/contract.js';
import { validPolicySnapshot } from '../src/decision/policy-contract.js';
import { recordedConfiguration } from '../src/recording/configuration.js';
import { recordedJudgeReport } from '../src/recording/judge.js';
import { recoverReport } from '../src/pi/report-history.js';
import { validScopedSubmission } from '../src/recording/scoped.js';

test('compiled SDK reports redact selected diagnostics without changing routing or readiness', async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet-diagnostics-'));
  const secret = 'diagnostic-selected-secret', reference = 'DIAGNOSTIC_SELECTED_REFERENCE';
  const cwd = join(root, `${reference}-${secret}\u202e`);
  const events: OwnerEvent[] = [], records: OwnerRecord[] = [], captured: unknown[] = [];
  let requests = 0;
  let requestedOrigin = '', requestedModel = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((url, init) => { requests++; requestedOrigin = String(url); requestedModel = JSON.parse(String(init?.body)).model; throw new Error('offline-provider-failure'); }) as typeof fetch;
  try {
    await mkdir(join(cwd, '.tenet'), { recursive: true, mode: 0o700 });
    await writeFile(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
    await writeFile(join(cwd, '.tenet/config.json'), JSON.stringify({ version: 2,
      judge: { protocol: 'system-one', baseUrl: 'https://custom.invalid', model: `${reference}-${secret}`,
        auth: { type: 'bearer-env', name: reference } } }), { mode: 0o600 });
    const guard = createGuard({ host: 'offline', capabilities: ['interception', 'argument-stability', 'lifecycle-invalidation'],
      env: { [reference]: secret, TENET_MODE: 'enforce', TENET_RECORDING: 'off', TENET_RECORDING_DIR: join(root, `${reference}-${secret}`) },
      controlPath: join(root, 'control.json'), bindRecording: () => (stage, data) => captured.push({ stage, data }),
      onOwnerEvent: e => events.push(e), onOwnerRecord: r => records.push(r) });
    try {
      const session = guard.openSession({ sessionId: 'safe-session', contextId: 'main' }, cwd);
      const ready = await session.ready;
      assert.equal(ready.state, 'ready'); assert.equal(ready.judge.availability, 'ready');
      assert.equal(ready.judge.requestedModel, null); assert.equal(ready.judge.provider, 'unknown');
      assert.equal(ready.configuration.sources.judge, 'project'); assert.equal(requests, 0);
      const call = { callId: 'safe-call', toolName: 'fixture-only', input: {} };
      const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 'safe-session', contextId: 'main', ...call }) });
      assert.equal(result.permission, 'blocked'); assert.equal(result.assessment.status, 'unavailable');
      assert.equal(requests, 1); assert.equal(requestedOrigin, 'https://custom.invalid/v1/systemone');
      assert.equal(requestedModel, `${reference}-${secret}`);
      await guard.close();
      for (const value of [ready, session.status(), guard.status(), events, records, captured]) {
        const output = JSON.stringify(value);
        assert.ok(!output.includes(secret)); assert.ok(!output.includes(reference)); if (value !== captured) assert.ok(!output.includes('\u202e'));
      }
    } finally { await guard.close(); }
  } finally { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }); }
});

for (const collision of ['reference-path', 'value-path', 'reference-payload', 'value-payload', 'project', 'digest', 'safe'] as const) {
  test(`compiled SDK capture-on archive preserves contracts for ${collision}`, async () => {
    const root = await realpath(await mkdtemp('/tmp/tenet-safe-archive-'));
    const reference = collision === 'project' ? 'project' : 'SELECTED_REFERENCE';
    const secret = collision === 'project' ? 'project' : collision === 'digest' ? createHash('sha256').update('Rule; Keep work local.').digest('hex') : 'selected-secret-value';
    const cwd = join(root, 'work'), archiveDir = join(root, 'archive');
    const pathCollision = collision.endsWith('path');
    const content = collision.startsWith('reference') ? reference : secret;
    const policyPath = pathCollision ? join(root, content, 'TENET.md') : join(cwd, 'TENET.md');
    const originalFetch = globalThis.fetch;
    const bodies: string[] = [];
    globalThis.fetch = (async (_url, init) => { bodies.push(String(init?.body)); return new Response('', { status: 503 }); }) as typeof fetch;
    try {
      await mkdir(join(cwd, '.tenet'), { recursive: true, mode: 0o700 });
      if (pathCollision) await mkdir(join(root, content));
      await writeFile(policyPath, 'Rule; Keep work local.');
      await writeFile(join(cwd, '.tenet/config.json'), JSON.stringify({ version: 2, judge: { protocol: 'system-one',
        baseUrl: 'https://custom.invalid', model: 'safe-alias', auth: { type: 'bearer-env', name: reference } } }), { mode: 0o600 });
      const records: OwnerRecord[] = [];
      const guard = createGuard({ host: 'offline', capabilities: ['interception', 'argument-stability', 'lifecycle-invalidation'],
        env: { [reference]: secret, TENET_MODE: 'enforce', TENET_RECORDING: 'on', TENET_RECORDING_DIR: archiveDir, TENET_POLICY: policyPath },
        controlPath: join(root, 'control.json'), onOwnerRecord: record => records.push(record) });
      try {
        const session = guard.openSession({ sessionId: 'session', contextId: 'main' }, cwd);
        const ready = await session.ready;
        assert.equal(ready.state, 'ready');
        assert.equal(ready.configuration.sources.judge, 'project');
        assert.deepEqual(recordedConfiguration(ready.configuration), ready.configuration);
        const call = { callId: 'call', toolName: 'fixture', input: { text: collision.endsWith('payload') ? content + ' π' : 'safe text π' } };
        const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 'session', contextId: 'main', ...call }) });
        assert.equal(result.reason, 'provider-error'); assert.equal(bodies.length, 1);
        if (collision.endsWith('payload')) assert.ok(bodies[0]!.includes(content));
        await guard.close();
        const archive = await readArchive(archiveDir);
        assert.deepEqual(archive.issues, []);
        assert.ok(archive.records.length > 0);
        assert.ok(archive.records.every(validRecord));
        for (const record of archive.records) {
          if (record.stage === 'begin') assert.equal(validPolicySnapshot(record.data.policy), true);
          if (record.data.configuration) assert.deepEqual(recordedConfiguration(record.data.configuration), record.data.configuration);
          if (record.data.judgeReportVersion) assert.ok(recordedJudgeReport(record.data));
          const value = record.data.value as any;
          if (value?.kind === 'scope-submission') {
            assert.equal(validScopedSubmission(value), true);
            assert.equal(value.payloadBytes, Buffer.byteLength(value.payloadJson));
            assert.equal(value.stateBytes, Buffer.byteLength(JSON.stringify(JSON.parse(value.payloadJson).state)));
            assert.equal(value.payloadJson, bodies[0]);
          }
        }
        const retained = JSON.stringify(archive.records);
        if (collision !== 'project') { assert.ok(!retained.includes(reference)); assert.ok(!retained.includes(secret)); }
        if (collision === 'digest') {
          assert.ok(!JSON.stringify(records).includes(secret));
          assert.ok(records.filter(r => r.stage === 'status').every(r => validPolicySnapshot(r.data.policy)));
        }
        if (collision === 'reference-payload') assert.ok(archive.records.some(r => r.stage === 'response' && r.data.unavailable === true && r.data.reason === 'diagnostic-content-withheld'));
        if (collision === 'project') assert.ok(archive.records.some(r => (r.data.configuration as any)?.sources.judge === 'project'));
        if (collision === 'safe') {
          assert.equal(archive.records.filter(r => (r.data.value as any)?.kind === 'scope-submission').length, 2);
          assert.equal(archive.records.filter(r => r.stage === 'request').length, 1);
          assert.equal(archive.records.filter(r => r.stage === 'begin').length, 1);
        }
        if (collision !== 'safe') {
          assert.ok(archive.records.some(r => r.stage === 'response' && r.data.unavailable === true && r.data.reason === 'diagnostic-content-withheld'));
          const health = guard.status().capture;
          assert.ok(health.kind === 'local-archive' && health.dropped > 0);
        }
        assert.ok(records.filter(r => r.stage === 'permission').every(r => recoverReport({ type: 'custom', customType: 'tenet', data: { version: 4, stage: r.stage, ...r.data } })));
      } finally { await guard.close(); }
    } finally { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }); }
  });
}

test('unsafe exact recording identity omits capture with measured loss, not a rewritten cwd', async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet-safe-binding-'));
  const cwd = join(root, 'SELECTED_REFERENCE'), directory = join(root, 'archive');
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return new Response('', { status: 503 }); }) as typeof fetch;
  try {
    await mkdir(join(cwd, '.tenet'), { recursive: true, mode: 0o700 });
    await writeFile(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
    await writeFile(join(cwd, '.tenet/config.json'), JSON.stringify({ version: 2, judge: { protocol: 'system-one',
      baseUrl: 'https://custom.invalid', model: 'safe-model', auth: { type: 'bearer-env', name: 'SELECTED_REFERENCE' } } }), { mode: 0o600 });
    const guard = createGuard({ host: 'offline', env: { SELECTED_REFERENCE: 'selected-secret', TENET_MODE: 'enforce', TENET_RECORDING: 'on', TENET_RECORDING_DIR: directory },
      controlPath: join(root, 'control.json') });
    try {
      const session = guard.openSession({ sessionId: 'session', contextId: 'main' }, cwd);
      const ready = await session.ready;
      assert.equal(ready.state, 'ready'); assert.equal(ready.judge.availability, 'ready');
      assert.equal(ready.policy.reason, 'diagnostic-content-withheld'); assert.equal(ready.policy.combinedDigest, null);
      const call = { callId: 'call', toolName: 'fixture', input: {} };
      assert.equal((await session.beforeTool({ ...call, current: () => ({ sessionId: 'session', contextId: 'main', ...call }) })).reason, 'provider-error');
      assert.equal(requests, 1);
      await guard.close();
      assert.deepEqual(await readArchive(directory), { records: [], issues: [] });
      const health = guard.status().capture;
      assert.ok(health.kind === 'local-archive'); assert.equal(health.dropped, 1); assert.equal(health.written, 0);
    } finally { await guard.close(); }
  } finally { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }); }
});

test('known guard-wide credentials protect two project owner records and live statuses without rerouting', async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet-safe-projects-'));
  const secret = 'b-selected-secret', reference = 'B_SELECTED_REFERENCE';
  const a = join(root, secret, 'a'), b = join(root, 'b');
  const events: OwnerEvent[] = [], records: OwnerRecord[] = [];
  const originalFetch = globalThis.fetch;
  const outbound: { url: string; model: string; auth: string | null }[] = [];
  globalThis.fetch = (async (url, init) => { outbound.push({ url: String(url), model: JSON.parse(String(init?.body)).model,
    auth: new Headers(init?.headers).get('Authorization') }); return new Response('', { status: 503 }); }) as typeof fetch;
  try {
    for (const [cwd, model, name] of [[a, `a-${secret}`, 'A_KEY'], [b, 'b-model', reference]]) {
      await mkdir(join(cwd!, '.tenet'), { recursive: true, mode: 0o700 });
      await writeFile(join(cwd!, 'TENET.md'), `Rule; Keep ${cwd === a ? secret : 'work'} local.`);
      await writeFile(join(cwd!, '.tenet/config.json'), JSON.stringify({ version: 2, judge: { protocol: 'system-one',
        baseUrl: cwd === a ? 'https://a.invalid' : 'https://b.invalid', model, auth: { type: 'bearer-env', name } } }), { mode: 0o600 });
    }
    const guard = createGuard({ host: 'offline', capabilities: ['interception', 'argument-stability', 'lifecycle-invalidation'],
      env: { A_KEY: 'a-selected-secret', [reference]: secret, TENET_MODE: 'enforce', TENET_RECORDING: 'off' },
      controlPath: join(root, 'control.json'), onOwnerEvent: e => events.push(e), onOwnerRecord: r => records.push(r) });
    try {
      const sa = guard.openSession({ sessionId: 'a-session', contextId: 'main' }, a);
      const sb = guard.openSession({ sessionId: 'b-session', contextId: 'main' }, b);
      await Promise.all([sa.ready, sb.ready]);
      await writeFile(join(b, '.tenet/config.json'), '{}');
      for (const [session, id] of [[sa, 'a-session'], [sb, 'b-session']] as const) {
        const call = { callId: id, toolName: 'fixture', input: {} };
        const result = await session.beforeTool({ ...call, current: () => ({ sessionId: id, contextId: 'main', ...call }) });
        assert.equal(result.reason, 'provider-error');
      }
      const finalRecords = records.filter(r => r.stage !== 'status');
      for (const value of [sa.status(), guard.status(), events, records]) assert.ok(!JSON.stringify(value).includes(secret));
      assert.equal(sa.status().judge.provider, 'unknown'); assert.equal(sa.status().judge.availability, 'ready');
      assert.equal(guard.status().projects[0]!.judge.provider, 'unknown');
      assert.equal(records.filter(r => r.stage === 'status').length, 2);
      for (const record of records.filter(r => r.stage === 'status')) assert.equal(validPolicySnapshot(record.data.policy), true);
      assert.equal(finalRecords.filter(r => r.stage === 'permission').length, 2);
      assert.equal(events.filter(e => e.type === 'permission').length, 2);
      for (const event of events) {
        if (event.type === 'permission' && event.report) {
          assert.equal(event.report.configuration?.sources.judge, 'project');
          assert.ok(recordedJudgeReport({ ...event.report }));
        }
      }
      for (const record of finalRecords.filter(r => r.stage === 'permission')) {
        const recovered = recoverReport({ type: 'custom', customType: 'tenet', data: { version: 4, stage: record.stage, ...record.data } });
        assert.ok(recovered); assert.equal(recovered.configuration?.sources.judge, 'project');
      }
      assert.deepEqual(outbound, [
        { url: 'https://a.invalid/v1/systemone', model: `a-${secret}`, auth: 'Bearer a-selected-secret' },
        { url: 'https://b.invalid/v1/systemone', model: 'b-model', auth: `Bearer ${secret}` },
      ]);
    } finally { await guard.close(); }
  } finally { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }); }
});
