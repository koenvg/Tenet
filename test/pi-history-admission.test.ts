import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { JudgeRequest } from '../src/decision/contracts.js';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';
import { nativeHistory } from '../src/pi/history.js';
import { readArchive } from '../src/recording/archive.js';
import { invocationView } from '../src/inspector/view.js';
import { join } from 'node:path';

// Exercise registerGuard's actual native adapter and the compiled SDK request boundary.
// These synthetic hooks never dispatch the authored action.
for (const recording of ['off', 'on']) test(`Pi recovery bounds combined branch and block slots before translation or payload access with recording ${recording}`, async () => {
  let request: JudgeRequest | undefined;
  let excludedReads = 0;
  const h = await guardHarness({ env: { TENET_MODE: 'enforce', TENET_RECORDING: recording }, judge: async captured => {
    request = captured;
    return answer(captured.policy);
  } });
  try {
    const content: unknown[] = Array.from({ length: 5000 }, () => ({ type: 'text', text: 'non-tool block' }));
    Object.defineProperty(content, '0', { enumerable: true, get() {
      excludedReads++;
      return { type: 'toolCall', id: 'eligible', name: 'opaque', arguments: 'outside-work-window' };
    } });
    h.branch.push(
      { type: 'message', message: { role: 'assistant', content } },
      { type: 'message', message: { role: 'toolResult', toolCallId: 'eligible', toolName: 'opaque', content: 'late failure', isError: true } },
      { type: 'custom', customType: 'tenet', data: { stage: 'permission', sessionId: 's', callId: 'eligible', mode: 'enforce', wouldDecision: 'ALLOW' } },
    );
    await h.start();
    await h.call('current');
    assert.equal(excludedReads, 0, 'the excluded block prefix must not be read even to identify older calls');
    assert.ok(request);
    assert.deepEqual(request.trajectory!.observations.map(o => [o.origin, o.callId]), [['host-tool-result', 'eligible']]);
    assert.ok(request.trajectory!.selection!.priorOmittedEvents >= 907);
    assert.ok(request.trajectory!.limitations.includes('history-admission-window'));
    assert.equal(request.action.callId, 'current');
    const live = h.records.filter(row => row.callId === 'current' && ['assessment', 'decision', 'permission'].includes(row.stage));
    for (const row of live) assert.deepEqual(row.evidenceContext, request.evidenceContext);
    await h.emit('session_shutdown');
    const archive = await readArchive(join(h.cwd, 'archive'));
    assert.deepEqual(archive.issues, []);
    if (recording === 'off') assert.equal(archive.records.length, 0);
    else {
      const rows = archive.records.filter(row => row.callId === 'current' && ['assessment', 'decision', 'permission'].includes(row.stage));
      assert.equal(rows.length, 3);
      for (const row of rows) assert.deepEqual(row.data.evidenceContext, request.evidenceContext);
      assert.deepEqual(invocationView(rows).evidenceContext, request.evidenceContext);
    }
  } finally { await h.close(); }
});


test('Pi zero-history recovery uses the frozen SDK configuration without reading message/block fields', async () => {
  let reads = 0;
  let request: JudgeRequest | undefined;
  const env = { TENET_MODE: 'enforce', TENET_RECENT_EVENTS: '0' };
  const h = await guardHarness({ env, judge: async captured => { request = captured; return answer(captured.policy, 'UNKNOWN'); } });
  try {
    const message = Object.defineProperty({}, 'content', { get() { reads++; throw new Error('zero-history payload'); } });
    h.branch.push({ type: 'message', message });
    h.env.TENET_RECENT_EVENTS = '12';
    await h.start();
    await h.call('current');
    assert.equal(reads, 0);
    assert.deepEqual(request!.trajectory!.observations, []);
    assert.ok(request!.trajectory!.selection!.droppedEvents >= 1);
    assert.equal(request!.trajectory!.selection!.priorOmittedEvents, 0);
    assert.ok(!request!.trajectory!.limitations.includes('history-admission-window'));
  } finally { await h.close(); }
});


test('registerGuard cannot recover a result using assessed IDs outside its bounded branch window, even with no eligible output', async () => {
  let slots = 0, traversed = 0;
  let request: JudgeRequest | undefined;
  const h = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge: async captured => { request = captured; return answer(captured.policy, 'UNKNOWN'); } });
  try {
    h.branch.push({ type: 'custom', customType: 'tenet', data: {
      stage: 'permission', mode: 'enforce', sessionId: 's', callId: 'old', wouldDecision: 'ALLOW',
    } });
    for (let i = 1; i < 4999; i++) h.branch.push({ type: 'other' });
    h.branch.push({ type: 'message', message: { role: 'toolResult', toolCallId: 'old', toolName: 'opaque',
      content: new Proxy({}, { ownKeys() { traversed++; throw new Error('ineligible result'); } }), isError: false } });
    const tracked = new Proxy(h.branch, { getOwnPropertyDescriptor(target, key) {
      if (/^\d+$/.test(String(key))) slots++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    } });
    h.ctx.sessionManager.getBranch = () => tracked;
    await h.start();
    assert.equal(slots, 4096);
    const veto = await h.call('current');
    assert.ok(veto?.block);
    assert.equal(traversed, 0);
    assert.deepEqual(request!.trajectory!.observations, []);
    assert.ok(request!.trajectory!.selection!.priorOmittedEvents >= 904);
    assert.ok(request!.trajectory!.limitations.includes('history-admission-window'));
    assert.ok(request!.trajectory!.limitations.includes('host-reported-capture-slots-not-tool-event-counts'));
    assert.equal(request!.evidenceContext?.resolution.status, 'unsupported');
  } finally { await h.close(); }
});

for (const recording of ['off', 'on']) test(`Pi actual recovery batches only assessed same-session groups and finalizes live/archive capture diagnostics with recording ${recording}`, async () => {
  let request: JudgeRequest | undefined;
  let traversed = 0;
  const ineligiblePayload = new Proxy({}, { ownKeys() { traversed++; throw new Error('ineligible payload'); } });
  const h = await guardHarness({ env: { TENET_MODE: 'enforce', TENET_RECENT_EVENTS: '3', TENET_RECORDING: recording },
    judge: async captured => { request = captured; return answer(captured.policy, 'UNKNOWN'); } });
  try {
    const ids = ['a', 'b', 'c', 'unassessed', 'other-session', 'decision-only', 'approval-only', 'pending'];
    h.branch.push({ type: 'message', message: { role: 'assistant', content: ids.map(id => ({
      type: 'toolCall', id, name: 'opaque', arguments: ['a', 'b', 'c'].includes(id) ? `${id} proposed` : ineligiblePayload,
    })) } });
    for (const id of ids) h.branch.push({ type: 'message', message: { role: 'toolResult', toolCallId: id, toolName: 'opaque',
      content: ['a', 'b', 'c'].includes(id) ? `${id} failed` : ineligiblePayload, isError: true } });
    for (const callId of ['a', 'b', 'c']) h.branch.push({ type: 'custom', customType: 'tenet', data: {
      stage: 'assessment-status', status: 'completed', mode: 'enforce', sessionId: 's', callId,
    } });
    for (const [callId, stage, sessionId, status] of [
      ['other-session', 'assessment-status', 'elsewhere', 'completed'], ['decision-only', 'decision', 's', 'completed'],
      ['approval-only', 'approval', 's', 'completed'], ['pending', 'assessment-status', 's', 'pending'],
    ]) h.branch.push({ type: 'custom', customType: 'tenet', data: { stage, mode: 'enforce', sessionId, status, callId,
      decision: 'ALLOW', wouldDecision: 'ALLOW', consent: 'owner-only-canary' } });
    // A rejected message data descriptor is one known source-slot loss, not a result.
    const rejected = Object.defineProperty({}, 'role', { get() { traversed++; throw new Error('message getter'); } });
    h.branch.push({ type: 'message', message: rejected });
    await h.start();
    const veto = await h.call('current');
    assert.ok(veto?.block);
    assert.equal(traversed, 0);
    assert.deepEqual(request!.trajectory!.observations.map(o => [o.callId, o.origin]), [['c', 'host-tool-call'], ['c', 'host-tool-result']]);
    assert.equal(request!.trajectory!.selection!.droppedEvents, 4);
    assert.equal(request!.trajectory!.selection!.priorOmittedEvents, 1);
    assert.equal(request!.trajectory!.omitted, 5);
    assert.ok(request!.trajectory!.limitations.includes('host-reported-capture-slots-not-tool-event-counts'));
    assert.doesNotMatch(JSON.stringify(request), /owner-only-canary|other-session|decision-only|approval-only|unassessed|pending/);
    const live = h.records.filter(row => row.callId === 'current' && ['assessment', 'decision', 'permission'].includes(row.stage));
    assert.equal(live.length, 3);
    for (const row of live) assert.deepEqual(row.evidenceContext, request!.evidenceContext);
    await h.emit('session_shutdown');
    const archive = await readArchive(join(h.cwd, 'archive'));
    assert.deepEqual(archive.issues, []);
    if (recording === 'off') assert.equal(archive.records.length, 0);
    else {
      const rows = archive.records.filter(row => row.callId === 'current' && ['assessment', 'decision', 'permission'].includes(row.stage));
      assert.equal(rows.length, 3);
      for (const row of rows) { assert.equal(row.schemaVersion, 4); assert.deepEqual(row.data.evidenceContext, request!.evidenceContext); }
      assert.deepEqual(invocationView(rows).evidenceContext, request!.evidenceContext);
    }
  } finally { await h.close(); }
});

test('actual native adapter does not inspect excluded branch slots or use assessed IDs outside its shared window', () => {
  let reads = 0;
  const assessed = { type: 'custom', customType: 'tenet', data: { stage: 'permission', mode: 'enforce', sessionId: 's', callId: 'x', wouldDecision: 'ALLOW' } };
  const result = { type: 'message', message: { role: 'toolResult', toolCallId: 'x', toolName: 'opaque', content: 'late failure', isError: true } };
  const branch: unknown[] = Array.from({ length: 4097 }, () => ({ type: 'other' }));
  Object.defineProperty(branch, '0', { configurable: true, get() { reads++; throw new Error('excluded branch'); } });
  branch[4095] = result; branch[4096] = assessed;
  const limits = { recentEvents: 12, maxBytes: 24576 };
  const orphan = nativeHistory('s', branch, limits);
  assert.equal(reads, 0);
  assert.deepEqual(orphan.history, [{ kind: 'tool-result', callId: 'x', toolName: 'opaque', timestamp: null,
    data: { content: 'late failure', details: undefined, isError: true } }]);
  assert.deepEqual(orphan.capture, { priorOmittedEvents: 1, admissionLimited: true });
  Object.defineProperty(branch, '0', { value: assessed });
  branch[4096] = { type: 'other' };
  const ineligible = nativeHistory('s', branch, limits);
  assert.deepEqual(ineligible.history, []);
  assert.deepEqual(ineligible.capture, { priorOmittedEvents: 1, admissionLimited: true });
  let slots = 0;
  const zeroBranch = new Proxy(branch, { getOwnPropertyDescriptor(target, key) {
    if (/^\d+$/.test(String(key))) slots++;
    return Reflect.getOwnPropertyDescriptor(target, key);
  } });
  const zero = nativeHistory('s', zeroBranch, { ...limits, recentEvents: 0 });
  assert.equal(slots, 0);
  assert.equal(zero.history.length, 4097);
  assert.deepEqual(zero.capture, { priorOmittedEvents: 0, admissionLimited: false });
});


test('actual native adapter rejects branch, entry and message getters without interpreting them as tool evidence', () => {
  let reads = 0;
  const entries: unknown[] = [undefined,
    Object.defineProperty({}, 'type', { get() { reads++; throw new Error('entry getter'); } }),
    { type: 'message', message: Object.defineProperty({}, 'role', { get() { reads++; throw new Error('message getter'); } }) },
  ];
  Object.defineProperty(entries, '0', { get() { reads++; throw new Error('branch slot getter'); } });
  const recovered = nativeHistory('s', entries, { recentEvents: 12, maxBytes: 24576 });
  assert.equal(reads, 0);
  assert.deepEqual(recovered.history, []);
  assert.deepEqual(recovered.capture, { priorOmittedEvents: 3, admissionLimited: false });
});

test('actual native adapter shares one slot allowance across multiple nested messages and rejects scanned accessors', () => {
  let slots = 0, getters = 0;
  const blocks: unknown[] = Array.from({ length: 5000 }, () => ({ type: 'text', text: 'not a tool' }));
  Object.defineProperty(blocks, '4999', { get() { getters++; throw new Error('scanned accessor'); } });
  const tracked = new Proxy(blocks, { getOwnPropertyDescriptor(target, key) {
    if (/^\d+$/.test(String(key))) slots++;
    return Reflect.getOwnPropertyDescriptor(target, key);
  } });
  const older = new Proxy([], { getOwnPropertyDescriptor() { getters++; throw new Error('uninspected older message'); } });
  const recovered = nativeHistory('s', [
    { type: 'message', message: { role: 'assistant', content: older } },
    { type: 'message', message: { role: 'assistant', content: tracked } },
  ], { recentEvents: 12, maxBytes: 24576 });
  assert.equal(slots, 4095);
  assert.equal(getters, 0);
  assert.deepEqual(recovered.history, []);
  // 905 known block-prefix slots, one rejected block and one older branch entry.
  assert.deepEqual(recovered.capture, { priorOmittedEvents: 907, admissionLimited: true });
});
