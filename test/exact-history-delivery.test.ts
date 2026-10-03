import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type OwnerEvent } from 'tenet';
import { createJevJudge } from '../src/decision/jev.js';
import { readArchive } from '../src/recording/archive.js';
import { invocationView } from '../src/inspector/view.js';
import { validRecord } from '../src/recording/contract.js';
import { guardHarness } from './guard-harness.js';
import { answer, sdkAnswers } from './helpers.js';
import { expandedData } from './exact-history-fixture.js';

// Both judges remain pending while a sibling completes and late results arrive.
// Nothing dispatches an authored tool action.
test('compiled SDK concurrent sibling completions preserve snapshot-local pools and session isolation', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'exact-sdk-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep authored data local.');
  const requests: any[] = [], events: OwnerEvent[] = [];
  const releases = new Map<string, () => void>();
  const guard = createGuard({ host: 'offline', env: { TENET_MODE: 'observe', TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control.json'),
    onOwnerEvent: event => events.push(event), judge: async request => {
      requests.push(request);
      await new Promise<void>(resolve => releases.set(request.action.callId, resolve));
      return answer(request.policy, 'UNKNOWN');
    } });
  try {
    const one = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd);
    const two = guard.openSession({ sessionId: 'two', contextId: 'main' }, cwd);
    await Promise.all([one.ready, two.ready]);
    for (const [session, label] of [[one, 'first'], [two, 'second']] as const) session.setHistory([0, 1].map(i => ({
      kind: 'tool-result', callId: `old-${i}`, toolName: 'opaque', timestamp: i, data: { text: label.repeat(150), token: 'canary' },
    })));
    for (const [session, id] of [[one, 'one'], [two, 'two']] as const) {
      const call = { callId: id, toolName: 'opaque', input: {} };
      const result = await session.beforeTool({ ...call, current: () => ({ ...call, sessionId: id, contextId: 'main' }) });
      assert.equal(result.permission, 'released'); assert.equal(result.execution, 'unknown'); assert.equal(result.assessment.status, 'pending');
    }
    for (let i = 0; i < 200 && releases.size < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(releases.size, 2);
    const wires = requests.map(request => JSON.stringify(request.trajectory));
    assert.deepEqual(requests.map(request => request.trajectory.values), [{ v0: 'first'.repeat(150) }, { v0: 'second'.repeat(150) }]);
    releases.get('two')!();
    two.afterTool({ callId: 'two', toolName: 'opaque', content: 'late sibling'.repeat(100) });
    one.setHistory([{ kind: 'tool-result', callId: 'replacement', toolName: 'opaque', data: 'new history'.repeat(100) }]);
    releases.get('one')!();
    for (let i = 0; i < 200 && events.filter(event => event.type === 'assessment' && event.assessment.status === 'completed').length < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
    const completed = events.filter(event => event.type === 'assessment' && event.assessment.status === 'completed');
    assert.equal(completed.length, 2);
    assert.deepEqual(requests.map(request => JSON.stringify(request.trajectory)), wires);
    for (const event of completed) {
      assert.ok(event.type === 'assessment');
      const request = requests.find(request => request.action.callId === event.callId);
      assert.deepEqual(event.assessment.evidenceContext, request.evidenceContext);
      assert.deepEqual(event.report?.evidenceContext, request.evidenceContext);
      const context = event.assessment.evidenceContext!;
      assert.ok(context.selectionVersion === 'bounded-history-v2' && context.history);
      assert.ok(context.history.exactCompactedBytes > 0);
      assert.equal(event.assessment.evidenceContext!.history!.shortenedEvents, 0);
      assert.equal(event.assessment.evidenceContext!.resolution.status, 'unsupported');
      assert.ok(Object.isFrozen(request.trajectory.values));
      assert.deepEqual(expandedData(request.trajectory).map((data: any) => data.content.text), Array(2).fill(request.action.sessionId === 'one' ? 'first'.repeat(150) : 'second'.repeat(150)));
    }
    assert.doesNotMatch(JSON.stringify([requests, events]), /canary/);
  } finally { for (const release of releases.values()) release(); await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});

test('Pi live reports and schema-4 archive/inspector expose exactly submitted pooling and generic instructions', async () => {
  const submitted: any[] = [];
  const h = await guardHarness({ env: { TENET_RECORDING: 'on' }, createJudge: () => createJevJudge({ apiKey: 'synthetic-offline',
    fetch: async (_url, init) => {
      const payload = JSON.parse(init!.body as string); submitted.push(payload);
      return Response.json({ model: 'offline', answers: sdkAnswers(answer(payload.state.policy, submitted.length < 3 ? 'PASS' : 'UNKNOWN')) });
    } }) });
  try {
    const text = 'complete sanitized history '.repeat(35);
    await h.start();
    for (const id of ['a', 'b']) { await h.call(id, { text, token: 'canary' }); await h.assessed(id); }
    await h.call('current', {}); await h.assessed('current');
    const payload = submitted.at(-1);
    assert.deepEqual(payload.state.trajectory.values, { v0: text });
    const instructions = payload.questions.rule_0_outcome.instructions;
    assert.match(instructions, /state\.trajectory\.values/);
    assert.match(instructions, /tenetHistory/);
    assert.match(instructions, /literal/);
    assert.match(instructions, /excerpt.*inline/i);
    assert.ok(!Object.hasOwn(payload.state, 'evidenceContext'));
    const live = h.records.find(record => record.stage === 'assessment' && record.callId === 'current');
    assert.ok(live.evidenceContext.history.exactCompactedBytes > 0);
    assert.equal(live.evidenceContext.history.shortenedEvents, 0);
    assert.equal(live.evidenceContext.resolution.status, 'unsupported');
    await h.emit('session_shutdown');
    const archive = await readArchive(join(h.cwd, 'archive'));
    assert.deepEqual(archive.issues, []);
    const records = archive.records.filter(record => record.callId === 'current');
    assert.ok(records.every(record => record.schemaVersion === 4 && validRecord(record)));
    const request = records.find(record => record.stage === 'request')!;
    assert.deepEqual(request.data.payload, payload);
    assert.equal(request.data.selectionVersion, 'bounded-history-v2');
    const view = invocationView(records);
    assert.deepEqual(view.evidence, payload.state);
    assert.deepEqual(view.evidenceContext, live.evidenceContext);
    assert.equal(view.questionVersion, 'policy-rules-v7-ordinary-evidence');
    assert.equal(view.execution, 'unknown');
    assert.doesNotMatch(JSON.stringify([submitted, archive, h.records]), /canary/);
    const wire = JSON.stringify(records); invocationView(records); assert.equal(JSON.stringify(records), wire);
  } finally { await h.close(); }
});


test('compiled SDK and archives report zero savings and no new loss for structurally ineligible references', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'exact-boundary-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep authored data local.');
  const events: OwnerEvent[] = []; let captured: any;
  const guard = createGuard({ host: 'offline', env: { TENET_MODE: 'enforce', TENET_RECORDING: 'on', TENET_RECORDING_DIR: join(cwd, 'archive') },
    controlPath: join(cwd, 'control.json'), onOwnerEvent: event => events.push(event), judge: async request => { captured = request; return answer(request.policy, 'UNKNOWN'); } });
  try {
    let data: any = 'boundary complete'.repeat(20);
    for (let i = 0; i < 64; i++) data = { a: data };
    const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd); await session.ready;
    session.setHistory([0, 1].map(i => ({ kind: 'tool-result', callId: String(i), toolName: 'opaque', timestamp: i, data })));
    const call = { callId: 'current', toolName: 'opaque', input: {} };
    const result = await session.beforeTool({ ...call, current: () => ({ ...call, sessionId: 's', contextId: 'main' }) });
    assert.equal(result.permission, 'blocked'); assert.equal(result.execution, 'unknown');
    assert.equal(captured.trajectory.values, undefined);
    assert.equal(result.assessment.evidenceContext!.history!.exactCompactedBytes, 0);
    assert.equal(result.assessment.evidenceContext!.history!.shortenedEvents, 0);
    assert.equal(result.assessment.evidenceContext!.history!.omittedEvents, 0);
    assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [data, data]);
    const event = events.findLast(event => event.type === 'permission'); assert.ok(event?.type === 'permission');
    assert.deepEqual(event.report?.evidenceContext, captured.evidenceContext);
    assert.equal(await guard.close(), true);
    const archive = await readArchive(join(cwd, 'archive')); assert.deepEqual(archive.issues, []);
    const view = invocationView(archive.records); assert.deepEqual(view.evidenceContext, captured.evidenceContext);
    for (const record of archive.records.filter(record => ['assessment', 'decision', 'permission'].includes(record.stage))) assert.deepEqual(record.data.evidenceContext, captured.evidenceContext);
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});
