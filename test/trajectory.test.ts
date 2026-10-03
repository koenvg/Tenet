import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Judge, JudgeRequest } from '../src/decision/contracts.js';
import { Observations, EVIDENCE_DEFAULTS, serializedBytes } from '../src/decision/trajectory.js';
import { judgeState } from '../src/decision/judge-evidence.js';
import { registerGuard } from '../src/pi/guard.js';
import { RULE } from '../src/decision/policy.js';
import { answer } from './helpers.js';

async function host(judge: Judge, env: Record<string, string> = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'tenet-trajectory-'));
  await writeFile(join(cwd, 'TENET.md'), `Rule; ${RULE}`);
  const handlers = new Map<string, Function>();
  const records: any[] = [];
  const entries: any[] = [];
  let session = 'one', approvals = 0, executions = 0;
  const pi = { on: (name: string, handler: Function) => handlers.set(name, handler),
    registerCommand() {},
    appendEntry: (_: string, data: unknown) => records.push(data), getAllTools: () => [] } as unknown as ExtensionAPI;
  const ctx = { cwd, hasUI: true, sessionManager: { getSessionId: () => session, getBranch: () => entries },
    ui: { notify() {}, setStatus() {}, confirm: async () => { approvals++; return false; } } } as unknown as ExtensionContext;
  registerGuard(pi, { judge, env: { TENET_RECORDING: 'off', TENET_MODE: 'enforce', ...env } });
  const emit = (type: string, data: any = {}) => handlers.get(type)?.({ type, ...data }, ctx);
  await emit('session_start');
  return { records, entries, emit, counts: () => ({ approvals, executions }),
    switch: async (id: string) => { session = id; await emit('session_start'); },
    result: (id: string, content: unknown, details?: unknown) => emit('tool_result', { toolCallId: id, toolName: 'novel', content, details, isError: false }),
    call: async (id: string, input: unknown = {}) => {
      const result = await emit('tool_call', { toolCallId: id, toolName: 'novel', input });
      if (!result?.block) executions++;
      return result;
    }, close: () => rm(cwd, { recursive: true, force: true }) };
}

test('in-flight snapshot excludes later sibling results and preserves prior conflicts and source times', async () => {
  const requests: JudgeRequest[] = [];
  let entered!: () => void, finish!: () => void;
  const ready = new Promise<void>(r => { entered = r; });
  const wait = new Promise<void>(r => { finish = r; });
  const h = await host(async request => {
    requests.push(request);
    if (request.action.callId === 'pending') { entered(); await wait; }
    return answer(request.policy);
  });
  try {
    await h.result('old', [{ type: 'text', text: 'target 9 is local' }]);
    await h.result('new', [{ type: 'text', text: 'target 9 uploads code' }]);
    const pending = h.call('pending', { id: 9 }); await ready;
    const before = JSON.stringify(requests[0]);
    await h.result('sibling', [{ type: 'text', text: 'later sibling' }]);
    assert.equal(JSON.stringify(requests[0]), before);
    assert.ok(Object.isFrozen(requests[0]!.action.arguments));
    assert.ok(Object.isFrozen(requests[0]!.trajectory!.observations));
    assert.deepEqual(requests[0]!.trajectory!.observations.map(o => o.callId), ['old', 'new']);
    assert.ok(requests[0]!.trajectory!.observations.every(o => o.sessionId === 'one' && typeof o.timestamp === 'number'));
    finish(); assert.equal(await pending, undefined);
    await h.call('next'); assert.match(JSON.stringify(requests[1]), /later sibling/);
    assert.equal(h.counts().executions, 2);
  } finally { finish(); await h.close(); }
});

test('event and UTF-8 byte budgets omit history, never truncate the pending action', async () => {
  const requests: JudgeRequest[] = [];
  const h = await host(async r => { requests.push(r); return answer(r.policy); });
  try {
    for (let i = 0; i < 20; i++) await h.result(String(i), [{ type: 'text', text: `event-${i} ` + '界'.repeat(1100) }]);
    await h.call('small', { unusual: 'preserve me' });
    const r = requests[0]!;
    assert.ok(r.trajectory!.observations.length <= 12);
    assert.ok(r.trajectory!.omitted >= 8);
    assert.ok(r.trajectory!.limitations.includes('history-omitted'));
    assert.ok(serializedBytes(judgeState(r)) <= 24 * 1024);
    assert.deepEqual(r.action.arguments, { unusual: 'preserve me' });
    assert.match((await h.call('huge', { arbitrary: '界'.repeat(12000) })).reason, /insufficient-evidence/);
    assert.equal(requests.length, 1);
    assert.equal(h.counts().executions, 1);
  } finally { await h.close(); }
});

test('configurable zero history and tiny evidence budgets fail conservatively', async () => {
  const requests: JudgeRequest[] = [];
  const h = await host(async r => { requests.push(r); return answer(r.policy, 'UNKNOWN'); }, { TENET_RECENT_EVENTS: '0' });
  try {
    await h.result('old', [{ type: 'text', text: 'target uploads code' }]);
    assert.match((await h.call('pending')).reason, /insufficient-evidence/);
    assert.equal(requests[0]!.trajectory!.observations.length, 0);
    assert.equal(requests[0]!.trajectory!.omitted, 1);
    assert.equal(h.records.find(r => r.stage === 'assessment').assessment.rules[0].outcome.choice, 'UNKNOWN');
  } finally { await h.close(); }
  const tiny = await host(async () => { throw new Error('must not judge'); }, { TENET_EVIDENCE_MAX_BYTES: '1' });
  try { assert.match((await tiny.call('pending')).reason, /insufficient-evidence/); } finally { await tiny.close(); }
});

test('generic structured results, images, redactions and unsupported content retain explicit markers', async () => {
  const requests: JudgeRequest[] = [];
  const h = await host(async r => { requests.push(r); return answer(r.policy, 'UNKNOWN'); }, { TENET_SENSITIVE_FIELDS: '["privateValue"]' });
  try {
    await h.result('image', [{ type: 'image', data: 'not-text', mimeType: 'image/png' }]);
    await h.result('structured', [{ type: 'text', text: 'untrusted page' }], { arbitrary: { target: 7 }, token: 'SECRET', privateValue: 'PRIVATE', other: new Map() });
    await h.call('pending');
    const evidence = JSON.stringify(requests[0]);
    assert.match(evidence, /unsupported-image/); assert.doesNotMatch(evidence, /not-text|SECRET|PRIVATE/);
    assert.match(evidence, /unsupported-content/); assert.match(evidence, /fields-redacted/);
    assert.match(evidence, /arbitrary/); assert.match(evidence, /description-unavailable/);
    assert.equal(h.counts().executions, 0);
    assert.match((await h.call('unsupported', { value: BigInt(1) })).reason, /insufficient-evidence/);
  } finally { await h.close(); }
});

test('resume recovers bounded observations, not grants; sessions never share live evidence', async () => {
  const requests: JudgeRequest[] = [];
  const h = await host(async r => { requests.push(r); return answer(r.policy, 'APPROVAL_REQUIRED'); });
  try {
    await h.result('live', [{ type: 'text', text: 'old session only' }]);
    await h.switch('two'); await h.call('isolated');
    assert.doesNotMatch(JSON.stringify(requests.at(-1)), /old session only/);
    for (let i = 0; i < 18; i++) {
      h.entries.push({ type: 'message', timestamp: '2020-01-01T00:00:00Z',
        message: { role: 'toolResult', toolCallId: `recovered-${i}`, toolName: 'novel', content: [{ type: 'text', text: `target-${i} uploads code` }] } });
      h.entries.push({ type: 'custom', customType: 'tenet', data: { stage: 'permission', mode: 'observe', sessionId: 'two',
        callId: `recovered-${i}`, outcome: 'released', wouldDecision: 'ASK' } });
    }
    h.entries.push({ type: 'custom', customType: 'tenet', timestamp: '2020-01-02T00:00:00Z',
      data: { stage: 'approval', sessionId: 'two', callId: 'pending', toolName: 'novel', outcome: 'approved' } });
    h.entries.push({ type: 'custom', customType: 'tenet', data: { stage: 'approval', sessionId: 'one', callId: 'foreign', outcome: 'approved' } });
    await h.switch('two');
    assert.match((await h.call('pending')).reason, /approval-denied/);
    const r = requests.at(-1)!;
    assert.equal(r.trajectory!.observations.length, 12);
    assert.equal(r.trajectory!.omitted, 6);
    assert.doesNotMatch(JSON.stringify(r), /recovered-tenet-approval/);
    assert.doesNotMatch(JSON.stringify(r), /foreign/);
    assert.equal(h.counts().approvals, 2); assert.equal(h.counts().executions, 0);
    assert.ok(r.trajectory!.observations.some(o => o.timestamp === Date.parse('2020-01-01T00:00:00Z')));
    await h.result('pending', []);
    assert.ok(!h.records.some(r => r.stage === 'execution' && r.callId === 'pending'));
  } finally { await h.close(); }
});

test('recovery includes proposed calls and decisions with unavailable metadata explicitly marked', async () => {
  let captured: JudgeRequest | undefined;
  const h = await host(async r => { captured = r; return answer(r.policy, 'UNKNOWN'); });
  try {
    h.entries.push({ type: 'message', message: { role: 'assistant', content: [
      { type: 'toolCall', id: 'proposed', name: 'unexpected', arguments: { strangeKey: 77, authorization: 'hidden' } },
    ] } });
    h.entries.push({ type: 'custom', customType: 'tenet', data: { stage: 'decision', sessionId: 'one', callId: 'proposed', decision: 'BLOCK' } });
    h.entries.push({ type: 'custom', customType: 'tenet', data: { stage: 'permission', mode: 'enforce',
      sessionId: 'one', callId: 'proposed', outcome: 'blocked', wouldDecision: 'BLOCK' } });
    await h.switch('one'); await h.call('pending');
    const observations = captured!.trajectory!.observations;
    assert.deepEqual(observations.map(o => o.origin), ['host-tool-call']);
    assert.ok(captured!.trajectory!.limitations.includes('metadata-unavailable'));
    assert.match(JSON.stringify(observations), /strangeKey/); assert.doesNotMatch(JSON.stringify(observations), /hidden/);
    assert.equal(h.counts().executions, 0);
  } finally { await h.close(); }
});

test('observation copies are independent, retain missing metadata and bound oversized results', () => {
  const history = new Observations('s');
  const data = { arbitrary: ['before'] };
  history.add('pi-tool-result', null, null, data, null);
  const snapshot = history.snapshot();
  data.arbitrary[0] = 'after';
  assert.match(JSON.stringify(snapshot), /before/);
  assert.ok(snapshot.limitations.includes('metadata-unavailable'));
  history.add('pi-tool-result', 'large', 'novel', 'x'.repeat(EVIDENCE_DEFAULTS.maxBytes * 2));
  assert.match(JSON.stringify(history.snapshot()), /tenetExcerpt/);
  assert.ok(serializedBytes(history.snapshot()) <= 8192);
  assert.ok(history.snapshot().observations.every(event => serializedBytes(event.data) <= 2048));
  assert.equal(snapshot.observations.length, 1);
});
