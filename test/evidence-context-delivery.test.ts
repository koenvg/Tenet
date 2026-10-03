import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type OwnerEvent, type ActionResolver, type ActionFacts, type OwnerRecord } from 'tenet';
import { readArchive } from '../src/recording/archive.js';
import { invocationView } from '../src/inspector/view.js';
import { answer } from './helpers.js';
import { guardHarness } from './guard-harness.js';

import { expandedData } from './exact-history-fixture.js';
function resolver(coverage: 'partial' | 'complete'): ActionResolver {
  let facts: ActionFacts;
  return { id: 'offline', version: '1', semantics: ['file-read'], resolve: async ({ binding }) => (facts = {
    version: 1, binding, integration: { id: 'offline', version: '1' }, resolverState: 'fixed', coverage,
    operations: [{ id: 'one', semantics: 'file-read', resources: [{ requested: 'authored', resolved: '/synthetic/authored', identity: 'revision', relation: 'direct' }], content: [] }], limitations: [],
  }), revalidate: async () => facts };
}
for (const mode of ['enforce', 'observe'] as const) for (const recording of ['on', 'off']) {
  for (const coverage of ['unsupported', 'partial', 'complete'] as const) {
    test(`compiled SDK finalized parity: ${mode}, recording ${recording}, ${coverage}`, async () => {
      const cwd = await realpath(await mkdtemp(join(tmpdir(), 'coverage-sdk-')));
      await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep authored data local.');
      const events: OwnerEvent[] = [], records: OwnerRecord[] = [];
      let captured: any;
      let release!: () => void;
      const wait = new Promise<void>(resolve => { release = resolve; });
      const guard = createGuard({ host: 'offline', actionResolver: coverage === 'unsupported' ? undefined : resolver(coverage),
        judge: async r => { captured = r; if (mode === 'observe') await wait; return answer(r.policy, 'UNKNOWN'); },
        env: { TENET_MODE: mode, TENET_RECORDING: recording, TENET_RECORDING_DIR: join(cwd, 'archive') }, controlPath: join(cwd, 'control.json'),
        onOwnerRecord: r => records.push(r), onOwnerEvent: e => { events.push(e); if (e.type === 'assessment' && e.assessment.status !== 'pending') throw new Error('listener fails offline'); } });
      try {
        const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd); await session.ready;
        const label = 'complete sanitized label '.repeat(24);
        session.setHistory([
          { kind: 'tool-call', callId: 'old-call', toolName: 'unknown-name', timestamp: 1, data: { token: 'canary', label, text: 'HEAD ' + '界🙂'.repeat(10000) + ' TAIL' } },
          { kind: 'tool-result', callId: 'old-result', toolName: 'other-name', timestamp: 2, data: { token: 'canary', label, text: 'AbCd│HEAD ' + '界🙂'.repeat(10000) + ' TAIL' } },
        ]);
        const call = { callId: 'c', toolName: 'unknown-name', input: { password: 'canary', value: 1 } };
        const result = await session.beforeTool({ ...call, current: () => ({ ...call, sessionId: 's', contextId: 'main' }) });
        assert.equal(result.permission, mode === 'observe' ? 'released' : 'blocked');
        assert.equal(result.execution, 'unknown');
        if (mode === 'observe') {
          assert.equal(result.assessment.status, 'pending');
          assert.equal(result.assessment.evidenceContext?.history, null);
          session.afterTool({ callId: 'c', toolName: call.toolName, content: 'later sibling result' });
          release();
          for (let i = 0; i < 200 && !events.some(e => e.type === 'assessment' && e.assessment.status === 'completed'); i++) await new Promise(r => setTimeout(r, 5));
        }
        const event = mode === 'observe' ? events.findLast(e => e.type === 'assessment' && e.assessment.status === 'completed') : events.findLast(e => e.type === 'permission');
        assert.ok(event && (event.type === 'assessment' || event.type === 'permission'));
        const details = event.type === 'assessment' ? event.assessment : event.result.assessment;
        assert.deepEqual(details.evidenceContext, captured.evidenceContext);
        assert.deepEqual(event.report?.evidenceContext, captured.evidenceContext);
        assert.equal(details.evidenceContext?.resolution.status, coverage === 'unsupported' ? coverage : `authenticated-${coverage}`);
        assert.equal(details.evidenceContext?.history?.retainedEvents, 2);
        assert.equal(details.evidenceContext?.history?.shortenedEvents, 2);
        assert.ok(details.evidenceContext!.history!.exactCompactedBytes > 0);
        assert.deepEqual(captured.trajectory.values, { v0: label });
        assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content.label), [label, label]);
        assert.ok(expandedData(captured.trajectory).every((data: any) => Buffer.byteLength(JSON.stringify(data)) <= 2048));
        assert.equal(details.evidenceContext?.history?.maxHistoryBytes, 8192);
        assert.ok((details.evidenceContext?.history?.retainedBytes ?? Infinity) <= 8192);
        assert.ok(Buffer.byteLength(JSON.stringify(captured.trajectory.observations[0].data)) <= 2048);
        assert.ok(Object.isFrozen(details.evidenceContext));
        assert.ok(Object.isFrozen(details.evidenceContext?.history));
        const live = records.filter(r => ['assessment', 'decision'].includes(r.stage));
        assert.equal(live.length, 2);
        for (const row of live) assert.deepEqual(row.data.evidenceContext, captured.evidenceContext);
        await guard.close();
        const archive = await readArchive(join(cwd, 'archive'));
        if (recording === 'off') assert.equal(archive.records.length, 0);
        else {
          assert.deepEqual(archive.issues, []);
          assert.ok(archive.records.every(r => r.schemaVersion === 4));
          assert.deepEqual(invocationView(archive.records).evidenceContext, captured.evidenceContext);
          for (const row of archive.records.filter(r => ['assessment', 'decision'].includes(r.stage))) assert.deepEqual(row.data.evidenceContext, captured.evidenceContext);
        }
        assert.ok(!JSON.stringify([events, records, archive]).includes('canary'));
      } finally { release(); await guard.close(); await rm(cwd, { recursive: true, force: true }); }
    });
  }
}
for (const recording of ['on', 'off']) test(`Pi live report preserves coverage with recording ${recording}`, async () => {
  const h = await guardHarness({ env: { TENET_RECORDING: recording }, judge: async r => answer(r.policy, r.action.callId === 'older' ? 'PASS' : 'UNKNOWN') });
  try {
    await h.start(); await h.call('older'); await h.assessed('older');
    await h.emit('tool_result', { toolCallId: 'older', toolName: 'edit', content: '界'.repeat(15000), isError: false });
    await h.call(); await h.assessed();
    const assessment = h.records.find(r => r.stage === 'assessment' && r.callId === 'c');
    const decision = h.records.find(r => r.stage === 'decision' && r.callId === 'c');
    assert.equal(assessment.evidenceContext.resolution.status, 'unsupported');
    assert.equal(assessment.evidenceContext.history.shortenedEvents, 1);
    assert.equal(assessment.evidenceContext.history.exactCompactedBytes, 0);
    assert.deepEqual(decision.evidenceContext, assessment.evidenceContext);
    const archived = await readArchive(join(h.cwd, 'archive'));
    if (recording === 'on') {
      await h.emit('session_shutdown');
      const rows = (await readArchive(join(h.cwd, 'archive'))).records;
      assert.deepEqual(invocationView(rows.filter(row => row.callId === 'c')).evidenceContext, assessment.evidenceContext);
    } else assert.equal(archived.records.length, 0);
  } finally { await h.close(); }
});

for (const failure of ['provider', 'invalid', 'capacity'] as const) test(`compiled SDK unavailable ${failure} retains only known coverage with recording off`, async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'coverage-unavailable-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep authored data local.');
  const events: OwnerEvent[] = [];
  const guard = createGuard({ host: 'offline', env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off', ...(failure === 'capacity' ? { TENET_EVIDENCE_MAX_BYTES: '1' } : {}) },
    judge: async () => { if (failure === 'invalid') return {}; throw new Error('offline provider failure'); }, controlPath: join(cwd, 'control.json'), onOwnerEvent: e => events.push(e) });
  try {
    const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd); await session.ready;
    const call = { callId: 'c', toolName: 'Unknown', input: {} };
    const result = await session.beforeTool({ ...call, current: () => ({ ...call, sessionId: 's', contextId: 'main' }) });
    assert.equal(result.permission, 'blocked'); assert.equal(result.assessment.status, 'unavailable');
    assert.equal(result.assessment.wouldDecision, undefined); assert.deepEqual(result.assessment.diagnostics, []);
    const context = result.assessment.evidenceContext!;
    assert.equal(context.resolution.status, 'unsupported');
    assert.equal(context.preparation, failure === 'capacity' ? 'unavailable' : 'completed');
    assert.equal(context.history === null, failure === 'capacity');
    const event = events.find(e => e.type === 'permission');
    assert.ok(event && event.type === 'permission');
    assert.deepEqual(event.report?.evidenceContext, context);
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});

for (const recording of ['on', 'off']) test(`compiled SDK delivers retained content gaps with recording ${recording}`, async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'coverage-content-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep authored data local.');
  const events: OwnerEvent[] = [], records: OwnerRecord[] = [];
  let captured: any;
  const guard = createGuard({ host: 'offline', env: { TENET_MODE: 'enforce', TENET_RECORDING: recording, TENET_RECORDING_DIR: join(cwd, 'archive') },
    controlPath: join(cwd, 'control.json'), judge: async request => { captured = request; return answer(request.policy, 'UNKNOWN'); },
    onOwnerEvent: e => events.push(e), onOwnerRecord: r => records.push(r) });
  try {
    const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd); await session.ready;
    session.setHistory([
      { kind: 'tool-result', callId: 'missing', toolName: 'opaque', timestamp: 0, data: undefined },
      { kind: 'tool-result', callId: 'image', toolName: 'opaque', timestamp: 0, data: { type: 'image', data: 'offline' } },
      { kind: 'tool-result', callId: 'nested', toolName: 'opaque', timestamp: 0, data: { value: undefined } },
    ]);
    const call = { callId: 'current', toolName: 'opaque', input: {} };
    const result = await session.beforeTool({ ...call, current: () => ({ ...call, sessionId: 's', contextId: 'main' }) });
    const context = result.assessment.evidenceContext!;
    assert.equal(context.history?.retainedEvents, 3); assert.equal(context.history?.omittedEvents, 0);
    assert.ok(context.history?.limitations.includes('metadata-unavailable'));
    assert.ok(context.history?.limitations.includes('unsupported-image'));
    assert.deepEqual(context, captured.evidenceContext);
    const event = events.findLast(e => e.type === 'permission');
    assert.ok(event?.type === 'permission');
    assert.deepEqual(event.report?.evidenceContext, context);
    for (const row of records.filter(r => ['assessment', 'decision', 'permission'].includes(r.stage))) assert.deepEqual(row.data.evidenceContext, context);
    assert.equal(await guard.close(), true);
    const archive = await readArchive(join(cwd, 'archive'));
    if (recording === 'off') assert.equal(archive.records.length, 0);
    else {
      assert.deepEqual(archive.issues, []);
      assert.deepEqual(invocationView(archive.records).evidenceContext, context);
    }
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});
