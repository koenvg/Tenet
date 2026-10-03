import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EvidenceLimits, JudgeRequest, Observation, Trajectory } from '../src/decision/contracts.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { Observations, serializedBytes } from '../src/decision/trajectory.js';
import { answer, policy } from './helpers.js';
import { expandedData } from './exact-history-fixture.js';

const action = captureAction({ sessionId: 'synthetic', callId: 'pending', toolName: 'unfamiliar', arguments: { untouched: true } });
const event = (callId: string | null, kind: 'call' | 'result', data: any, timestamp: number, sessionId = 'synthetic'): Observation => ({
  sessionId, callId, origin: `host-tool-${kind}`, toolName: 'unfamiliar', timestamp, data,
});
async function submit(observations: readonly Observation[], limits: EvidenceLimits, source?: Trajectory) {
  let captured: JudgeRequest | undefined;
  const result = await decide({ policy, action, cwd: '/synthetic', evidenceLimits: limits,
    trajectory: source ?? { observations, omitted: 0, limitations: [] },
    judge: async request => { captured = request; return answer(request.policy, 'UNKNOWN'); } });
  assert.ok(captured);
  assert.deepEqual(captured.action, action);
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
  return { captured, result, history: captured.trajectory! };
}

test('count pressure keeps the newest interleaved group whole and restores ingestion order, not timestamp order', async () => {
  const observations = [event('a', 'call', 'a proposed', 90), event('b', 'call', 'b proposed', 80),
    event('a', 'result', { isError: true, text: 'a failed' }, 70), event('b', 'result', { isError: true, text: 'b failed' }, 60)];
  const { history, result } = await submit(observations, { recentEvents: 3, maxBytes: 24576 });
  assert.deepEqual(history.observations.map(o => [o.callId, o.origin, o.timestamp]), [
    ['b', 'host-tool-call', 80], ['b', 'host-tool-result', 60],
  ]);
  assert.deepEqual(expandedData(history).map((d: any) => d.content), ['b proposed', { isError: true, text: 'b failed' }]);
  assert.equal(history.selection!.droppedEvents, 2);
  assert.equal(result.evidenceContext.history!.omittedEvents, 2);
});

test('byte pressure tightens inline content before dropping any member of a fitting group', async () => {
  const observations = ['a', 'b', 'c'].flatMap((id, index) => [
    event(id, 'call', { text: `${id}-call ` + 'x'.repeat(1580) }, index * 2),
    event(id, 'result', { isError: index === 0, text: `${id}-result ` + 'y'.repeat(1580) }, index * 2 + 1),
  ]);
  const { history, result } = await submit(observations, { recentEvents: 6, maxBytes: 24576 });
  assert.deepEqual(history.observations.map(o => o.callId), ['a', 'a', 'b', 'b', 'c', 'c']);
  assert.equal(history.selection!.droppedEvents, 0);
  assert.equal(history.selection!.shortenedEvents, 6);
  assert.equal(history.selection!.exactCompactedBytes, 0);
  assert.ok(serializedBytes(history) <= 8192);
  assert.ok(history.observations.every(o => serializedBytes(o.data) <= 2048));
  const content = expandedData(history).map((d: any) => d.content);
  assert.equal(content[1].isError, true);
  assert.match(JSON.stringify(content), /tenetExcerpt/);
  assert.equal(result.evidenceContext.history!.shortenedEvents, 6);
  assert.equal(result.evidenceContext.history!.omittedEvents, 0);
});

test('SDK history is grouped as a batch before late interleaved results displace earlier calls', async () => {
  const history = new Observations('synthetic', { recentEvents: 3, maxBytes: 24576 });
  history.addHistory([
    { kind: 'tool-call', callId: 'a', toolName: 'opaque', data: 'a proposed', timestamp: 4 },
    { kind: 'tool-call', callId: 'b', toolName: 'opaque', data: 'b proposed', timestamp: 3 },
    { kind: 'tool-result', callId: 'a', toolName: 'opaque', data: 'a failed', timestamp: 2 },
    { kind: 'tool-result', callId: 'b', toolName: 'opaque', data: 'b failed', timestamp: 1 },
  ]);
  assert.deepEqual(history.snapshot().observations.map(o => [o.callId, o.origin]), [
    ['b', 'host-tool-call'], ['b', 'host-tool-result'],
  ]);
  const { history: submitted } = await submit([], history.limits, history.snapshot());
  assert.deepEqual(submitted, history.snapshot());
  assert.equal(submitted.selection!.droppedEvents, 2);
});


test('multiple failures and a contradictory result stay distinct; an oversized group is not split to fill slots', async () => {
  const input = [event('orphan', 'result', 'unpaired earlier', 0), event('x', 'call', { attempt: 1 }, 1),
    event('x', 'result', { isError: true, status: 'failed' }, 2), event('x', 'result', { isError: false, status: 'contradiction' }, 3)];
  const full = await submit(input, { recentEvents: 4, maxBytes: 24576 });
  assert.deepEqual(expandedData(full.history).map((d: any) => d.content), ['unpaired earlier', { attempt: 1 },
    { isError: true, status: 'failed' }, { isError: false, status: 'contradiction' }]);
  const tight = await submit(input, { recentEvents: 2, maxBytes: 24576 });
  assert.deepEqual(tight.history.observations.map(o => o.callId), ['orphan']);
  assert.equal(tight.history.selection!.droppedEvents, 3);
});

test('an earlier same-ID result stays singleton, never joins the only later visible call', async () => {
  const input = [event('x', 'result', 'stale earlier result', 0), event('x', 'call', 'later proposal', 1), event('x', 'result', 'later failure', 2)];
  const { history } = await submit(input, { recentEvents: 1, maxBytes: 24576 });
  assert.deepEqual(expandedData(history).map((d: any) => d.content), ['stale earlier result']);
  assert.equal(history.selection!.droppedEvents, 2);
});

test('reused call boundaries are ambiguous singletons, even after tighter reselection removes the first call', async () => {
  const input = [event('x', 'call', 'attempt one', 0), event('x', 'result', 'failure one', 1),
    event('x', 'call', 'attempt two', 2), event('x', 'result', 'contradictory two', 3)];
  const first = await submit(input, { recentEvents: 3, maxBytes: 24576 });
  assert.deepEqual(expandedData(first.history).map((d: any) => d.content), ['failure one', 'attempt two', 'contradictory two']);
  const second = await submit([], { recentEvents: 1, maxBytes: 24576 }, first.history);
  assert.deepEqual(expandedData(second.history).map((d: any) => d.content), ['contradictory two']);
  assert.equal(second.history.selection!.droppedEvents, 3);
});

for (const id of [null, '']) test(`missing or empty call identity ${JSON.stringify(id)} never groups observations`, async () => {
  const { history } = await submit([event(id, 'call', 'proposal', 0), event(id, 'result', 'unpaired failure', 1),
    event(id, 'result', 'another distinct result', 2)], { recentEvents: 2, maxBytes: 24576 });
  assert.deepEqual(expandedData(history).map((d: any) => d.content), ['unpaired failure', 'another distinct result']);
  assert.equal(history.selection!.droppedEvents, 1);
});

test('duplicate IDs in different sessions pair separately; unknown session identities do not pair', async () => {
  const { history } = await submit([event('x', 'call', 'one call', 9, 'one'), event('x', 'call', 'two call', 8, 'two'),
    event('x', 'result', 'one failure', 7, 'one'), event('x', 'result', 'two failure', 6, 'two')], { recentEvents: 3, maxBytes: 24576 });
  assert.deepEqual(history.observations.map(o => [o.sessionId, o.callId, o.timestamp]), [['two', 'x', 8], ['two', 'x', 6]]);
  const empty = await submit([event('x', 'call', 'unknown call', 0, ''), event('x', 'result', 'unknown result', 1, '')], { recentEvents: 1, maxBytes: 24576 });
  assert.deepEqual(expandedData(empty.history).map((d: any) => d.content), ['unknown result']);
});

test('group selection prunes pools and preserves the exact reconstruction of all retained events', async () => {
  const old = 'old complete '.repeat(50), fresh = 'fresh complete '.repeat(50);
  const input = [event('a', 'call', { text: old }, 0), event('b', 'call', { text: fresh }, 1),
    event('a', 'result', { isError: true, text: old }, 2), event('b', 'result', { isError: true, text: fresh }, 3)];
  const first = await submit(input, { recentEvents: 4, maxBytes: 24576 });
  const wire = JSON.stringify(first.history);
  assert.deepEqual(first.history.values, { v0: old, v1: fresh });
  const second = await submit([], { recentEvents: 3, maxBytes: 24576 }, first.history);
  assert.deepEqual(second.history.values, { v0: fresh });
  const data = expandedData(second.history);
  assert.deepEqual(data.map((d: any) => d.content), [{ text: fresh }, { isError: true, text: fresh }]);
  const { values: _pool, ...inline } = { ...second.history, observations: second.history.observations.map((o, i) => ({ ...o, data: data[i]! })) };
  assert.equal(second.history.selection!.exactCompactedBytes, serializedBytes(inline) - serializedBytes(second.history));
  assert.equal(JSON.stringify(first.history), wire);
  assert.ok(Object.isFrozen(second.history.values));
});

test('missing calls and results remain absent, arbitrary origins and tool names never supply call kind', async () => {
  const input = [event('only-call', 'call', { pending: true }, 0), event('only-result', 'result', { isError: true }, 1),
    { ...event('opaque', 'call', { kind: 'tool-call', claimedSuccess: true }, 2), origin: 'opaque-source' },
    event('opaque', 'result', { isError: true }, 3)];
  const { history } = await submit(input, { recentEvents: 3, maxBytes: 24576 });
  assert.deepEqual(history.observations.map(o => [o.callId, o.origin]), [['only-result', 'host-tool-result'],
    ['opaque', 'opaque-source'], ['opaque', 'host-tool-result']]);
  assert.equal(history.observations.some(o => o.callId === 'only-call'), false);
  const renamed = await submit(input.map(o => ({ ...o, toolName: 'unfamiliar-other' })), { recentEvents: 3, maxBytes: 24576 });
  assert.deepEqual(renamed.history.observations.map(o => [o.callId, o.origin]), history.observations.map(o => [o.callId, o.origin]));
});

test('raw preparation inspects at most 4096 recent slots, including sparse/accessor admission failures', async () => {
  const raw: Observation[] = new Array(1_000_000);
  let prefixReads = 0, getterCalls = 0, scanned = 0;
  Object.defineProperty(raw, '0', { get() { prefixReads++; throw new Error('excluded prefix'); } });
  Object.defineProperty(raw, '999998', { get() { getterCalls++; throw new Error('accessor slot'); } });
  raw[999999] = event('orphan', 'result', 'failure without captured call', 1);
  const proxy = new Proxy(raw, { getOwnPropertyDescriptor(target, key) { if (/^\d+$/.test(String(key))) scanned++; return Reflect.getOwnPropertyDescriptor(target, key); } });
  const { history, result } = await submit(proxy, { recentEvents: 12, maxBytes: 24576 });
  assert.equal(prefixReads, 0); assert.equal(getterCalls, 0); assert.equal(scanned, 4096);
  assert.deepEqual(history.observations.map(o => o.callId), ['orphan']);
  assert.equal(history.selection!.priorOmittedEvents, 999999);
  assert.equal(history.selection!.droppedEvents, 0);
  assert.ok(history.limitations.includes('history-admission-window'));
  assert.ok(result.evidenceContext.history!.limitations.includes('history-admission-window'));
});

test('the fixed batch admission horizon does not expand with a higher configured event ceiling', async () => {
  const raw = Array.from({ length: 4100 }, (_, i) => event(String(i), 'result', i, i));
  const { history } = await submit(raw, { recentEvents: 5000, maxBytes: 12_000_000 });
  assert.equal(history.observations.length, 4096);
  assert.equal(history.observations[0]!.callId, '4');
  assert.equal(history.selection!.priorOmittedEvents, 4);
  assert.equal(history.selection!.droppedEvents, 0);
  assert.ok(history.limitations.includes('history-admission-window'));
});

test('SDK scan-boundary orphaning and zero history never inspect an excluded call or slot getter', () => {
  const raw: any[] = new Array(4097);
  let accessed = 0;
  Object.defineProperty(raw, '0', { get() { accessed++; throw new Error('call outside window'); } });
  raw[4096] = { kind: 'tool-result', callId: 'x', toolName: 'opaque', data: { isError: true } };
  const history = new Observations('synthetic'); history.addHistory(raw);
  assert.equal(accessed, 0);
  assert.deepEqual(history.snapshot().observations.map(o => [o.callId, o.origin]), [['x', 'host-tool-result']]);
  assert.equal(history.snapshot().selection!.priorOmittedEvents, 4096);
  const zero = new Observations('synthetic', { recentEvents: 0, maxBytes: 24576 }); zero.addHistory(raw);
  assert.equal(accessed, 0);
  assert.deepEqual(zero.snapshot().observations, []);
  assert.equal(zero.snapshot().selection!.droppedEvents, 4097);
  assert.equal(zero.snapshot().selection!.priorOmittedEvents, 0);
  assert.ok(!zero.snapshot().limitations.includes('history-admission-window'));
});

test('unselected payloads are not traversed, copied or frozen during batch count selection', async () => {
  let visited = 0;
  const payload = new Proxy({ text: 'excluded' }, { ownKeys() { visited++; throw new Error('unselected payload'); } });
  const input = [event('old', 'call', payload, 0), event('new', 'call', 'new proposal', 1),
    event('old', 'result', payload, 2), event('new', 'result', 'new failure', 3)];
  const { history } = await submit(input, { recentEvents: 2, maxBytes: 24576 });
  assert.deepEqual(history.observations.map(o => o.callId), ['new', 'new']);
  assert.equal(visited, 0);
  assert.equal(Object.isFrozen(payload), false);
});


test('a group whose bounded envelopes cannot fit the byte cap is omitted whole with no invented result', async () => {
  const input = [event('x', 'call', { proposal: true }, 0), ...Array.from({ length: 11 }, (_, i) =>
    event('x', 'result', { isError: i % 2 === 0, status: i }, i + 1))];
  const { history, result } = await submit(input, { recentEvents: 12, maxBytes: 4096 });
  assert.deepEqual(history.observations, []);
  assert.equal(history.selection!.droppedEvents, 12);
  assert.equal(history.selection!.shortenedEvents, 0);
  assert.equal(history.values, undefined);
  assert.equal(result.evidenceContext.history!.omittedEvents, 12);
  assert.ok(serializedBytes(history) <= Math.floor(4096 / 3));
});

test('live incremental selection cannot recreate calls already lost before late sibling results arrive', async () => {
  const live = new Observations('synthetic', { recentEvents: 3, maxBytes: 24576 });
  for (const id of ['a', 'b', 'c']) live.add('host-tool-call', id, 'opaque', `${id} proposal`, 0);
  for (const id of ['a', 'b', 'c']) live.add('host-tool-result', id, 'opaque', `${id} failure`, 1);
  assert.deepEqual(live.snapshot().observations.map(o => [o.callId, o.origin]), [['b', 'host-tool-result'], ['c', 'host-tool-result']]);
  assert.equal(live.snapshot().selection!.droppedEvents, 4);
  const { history } = await submit([], live.limits, live.snapshot());
  assert.deepEqual(history, live.snapshot());
});

test('tiny-cap admission preserves invalid-versus-uninspected loss classification without host content', () => {
  const tiny = new Observations('synthetic', { recentEvents: 12, maxBytes: 1 });
  tiny.addHistory([{} as any]);
  assert.deepEqual(tiny.snapshot().observations, []);
  assert.equal(tiny.snapshot().selection!.priorOmittedEvents, 1);
  assert.equal(tiny.snapshot().selection!.droppedEvents, 0);
});
