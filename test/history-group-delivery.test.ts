import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type OwnerEvent, type OwnerRecord } from 'tenet';
import { createSystemOneJudge } from '../src/decision/system-one.js';
import { readArchive } from '../src/recording/archive.js';
import { validRecord } from '../src/recording/contract.js';
import { invocationView } from '../src/inspector/view.js';
import { guardHarness } from './guard-harness.js';
import { answer, sdkAnswers } from './helpers.js';
import { expandedData } from './exact-history-fixture.js';

import { recordedSubmissions } from '../src/recording/scoped.js';

for (const mode of ['enforce', 'observe'] as const) for (const recording of ['on', 'off']) for (const pooled of [false, true]) {
  test(`compiled SDK grouped shortened ${pooled ? 'pooled' : 'inline'} history parity: ${mode}, recording ${recording}`, async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), 'group-delivery-')));
    await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep authored content local.');
    const events: OwnerEvent[] = [], records: OwnerRecord[] = [];
    const submitted: any[] = [];
    let payload: any, entered!: () => void, release!: () => void;
    const ready = new Promise<void>(r => { entered = r; }), wait = new Promise<void>(r => { release = r; });
    const guard = createGuard({ host: 'offline', env: { TENET_MODE: mode, TENET_RECORDING: recording, TENET_RECENT_EVENTS: '3', TENET_RECORDING_DIR: join(cwd, 'archive') },
      controlPath: join(cwd, 'control.json'), onOwnerEvent: e => events.push(e), onOwnerRecord: r => records.push(r),
      judge: createSystemOneJudge({ baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', auth: { type: 'bearer', token: 'synthetic-offline' }, fetch: async (_url, init) => {
        payload = JSON.parse(init!.body as string); submitted.push(payload); entered(); await wait;
        return Response.json({ model: 'offline', answers: sdkAnswers(answer(undefined, 'UNKNOWN'), 1, payload.questions) });
      } }) });
    try {
      const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd); await session.ready;
      const label = pooled ? 'complete sanitized '.repeat(25) : 'short';
      session.setHistory([
        { kind: 'tool-call', callId: 'old', toolName: 'opaque', data: 'old proposal' },
        { kind: 'tool-call', callId: 'fresh', toolName: 'unknown-name', data: { label, proposal: true } },
        { kind: 'tool-result', callId: 'old', toolName: 'opaque', data: { isError: true, text: 'old failure' } },
        { kind: 'tool-result', callId: 'fresh', toolName: 'another-name', data: { label, isError: true, text: '界'.repeat(20000) } },
      ]);
      const call = { callId: 'current', toolName: 'opaque-current', input: { reference: 'synthetic-r9' } };
      const pending = session.beforeTool({ ...call, current: () => ({ ...call, sessionId: 's', contextId: 'main' }) });
      await ready;
      const wire = JSON.stringify(payload.state);
      session.afterTool({ callId: 'late', toolName: 'another-name', content: 'late sibling contradiction', isError: true });
      assert.equal(JSON.stringify(payload.state), wire);
      assert.deepEqual(payload.state.previousToolCall, { toolName: 'unknown-name', arguments: { label, proposal: true } });
      assert.deepEqual(payload.state.proposedToolCall.arguments, call.input);
      assert.deepEqual(Object.keys(payload.state), ['rule', 'thinkingTrace', 'previousToolCall', 'proposedToolCall']);
      assert.doesNotMatch(JSON.stringify(payload), /tenetHistory|tenetExcerpt|old failure|isError|ingestion order/);
      release();
      const result = await pending;
      assert.equal(result.permission, mode === 'observe' ? 'released' : 'blocked'); assert.equal(result.execution, 'unknown');
      if (mode === 'observe') for (let i = 0; i < 200 && !events.some(e => e.type === 'assessment' && e.assessment.status === 'completed'); i++) await new Promise(r => setTimeout(r, 5));
      const completed = mode === 'observe' ? events.findLast(e => e.type === 'assessment' && e.assessment.status === 'completed') : events.findLast(e => e.type === 'permission');
      assert.ok(completed?.type === 'assessment' || completed?.type === 'permission');
      const context = (completed.type === 'assessment' ? completed.assessment : completed.result.assessment).evidenceContext!;
      assert.equal(context.selectionVersion, 'judge-input-scopes-v1');
      assert.equal(context.history, null);
      assert.equal(submitted.length, 3);
      assert.ok(submitted.slice(1).every(p => !('thinkingTrace' in p.state) && !('previousToolCall' in p.state)));
      assert.deepEqual(context, completed.report?.evidenceContext);
      for (const row of records.filter(r => ['assessment', 'decision', 'permission'].includes(r.stage) && r.data.callId === 'current')) {
        if ((row.data.evidenceContext as typeof context | undefined)?.preparation === 'completed') assert.deepEqual(row.data.evidenceContext, context);
      }
      assert.ok(Object.isFrozen(context.scopes));
      assert.equal(await guard.close(), true);
      const archive = await readArchive(join(cwd, 'archive')); assert.deepEqual(archive.issues, []);
      if (recording === 'off') assert.equal(archive.records.length, 0);
      else {
        const rows = archive.records.filter(r => r.callId === 'current');
        assert.ok(rows.every(r => r.schemaVersion === 5 && validRecord(r)));
        assert.deepEqual(recordedSubmissions(rows).filter(s => s.status === 'completed').map((s: any) => s.payload), submitted);
        const view = invocationView(rows);
        assert.deepEqual(view.evidenceContext, context); assert.equal(view.evidence, null); assert.deepEqual(view.inputScopes.map(s => s.state), submitted.map(p => p.state));
        assert.equal(view.execution, 'unknown');
        assert.equal(view.questionVersion, 'policy-rules-v9-scoped');
      }
    } finally { release(); await guard.close(); await rm(cwd, { recursive: true, force: true }); }
  });
}

test('Pi live group selection preserves failures, chronology and snapshot/archive diagnostics', async () => {
  const requests: any[] = [];
  const h = await guardHarness({ env: { TENET_RECORDING: 'on', TENET_RECENT_EVENTS: '3' },
    judge: async r => { requests.push(r); return answer(r.policy, r.action.callId === 'current' ? 'UNKNOWN' : 'PASS'); } });
  try {
    await h.start();
    await h.call('a', { attempt: 1 }); await h.assessed('a');
    await h.call('b', { attempt: 2 }); await h.assessed('b');
    await h.emit('tool_result', { toolCallId: 'a', toolName: 'opaque', content: 'a failed', isError: true });
    await h.emit('tool_result', { toolCallId: 'b', toolName: 'opaque', content: 'b failed', isError: true });
    await h.call('current', { untouched: true }); await h.assessed('current');
    const request = requests.at(-1), history = request.trajectory;
    // Live history cannot recover a call already lost before its late result.
    assert.deepEqual(history.observations.map((o: any) => [o.callId, o.origin]), [['b', 'pi-tool-call'], ['b', 'pi-tool-result']]);
    assert.equal((expandedData(history)[1]!.content as any).isError, true);
    assert.equal(history.selection.droppedEvents, 2);
    const live = h.records.find(r => r.callId === 'current' && r.stage === 'assessment');
    assert.deepEqual(live.evidenceContext, request.evidenceContext);
    await h.emit('session_shutdown');
    const archive = await readArchive(join(h.cwd, 'archive')); assert.deepEqual(archive.issues, []);
    const view = invocationView(archive.records.filter(r => r.callId === 'current'));
    assert.deepEqual(view.evidenceContext, live.evidenceContext); assert.equal(view.execution, 'unknown');
  } finally { await h.close(); }
});
