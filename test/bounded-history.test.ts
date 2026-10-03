import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { judgeState } from '../src/decision/judge-evidence.js';
import { Observations, serializedBytes } from '../src/decision/trajectory.js';
import { nativeHistory } from '../src/pi/history.js';
import { answer, policy } from './helpers.js';

const action = captureAction({ sessionId: 'synthetic', callId: 'pending', toolName: 'zorb', arguments: { target: 7 } });
async function submit(history: Observations, maxBytes = 24576, current = action) {
  let captured: any;
  const result = await decide({ policy, action: current, cwd: '/synthetic', trajectory: history.snapshot(),
    evidenceLimits: { recentEvents: history.limits.recentEvents, maxBytes },
    judge: async request => { captured = request; return answer(request.policy, 'UNKNOWN'); } });
  return { captured, result };
}
const content = (event: any) => event.data.content;

test('large nonidentical documents obey default history and expanded event caps, preserving current evidence', async () => {
  const history = new Observations('synthetic');
  const document = 'HEAD ' + '界🙂'.repeat(10000) + ' TAIL';
  history.add('host-tool-call', 'first', 'zorb', { document }, 1);
  history.add('host-tool-result', 'echo', 'plim', { document: 'AbCd│' + document }, 2);
  const { captured, result } = await submit(history);
  assert.ok(serializedBytes(captured.trajectory) <= 8192);
  assert.equal(captured.trajectory.observations.length, 2);
  for (const event of captured.trajectory.observations) {
    assert.ok(serializedBytes(event.data) <= 2048);
    assert.ok(event.data.selection.excerpts.length > 0);
    const excerpt = event.data.selection.excerpts[0];
    assert.equal(excerpt.originalBytes, Buffer.byteLength(event.callId === 'first' ? document : 'AbCd│' + document));
    assert.equal(excerpt.ranges[0][0], 0);
    assert.equal(excerpt.ranges[1][1], excerpt.originalBytes);
    assert.ok(!JSON.stringify(event).includes('\uFFFD'));
    assert.match(JSON.stringify(event), /HEAD/); assert.match(JSON.stringify(event), /TAIL/);
  }
  assert.notDeepEqual(content(captured.trajectory.observations[0]), content(captured.trajectory.observations[1]));
  assert.deepEqual(captured.action, action);
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
  assert.equal(result.evidenceContext.history?.shortenedEvents, 2);
  assert.equal(result.evidenceContext.history?.exactCompactedBytes, 0);
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.questionVersion, 'policy-rules-v7-ordinary-evidence');
});

test('unused allowance cannot inflate one event; snapshots isolate excerpts and private gap provenance', async () => {
  const history = new Observations('synthetic');
  history.add('host-tool-result', 'first', 'zorb', 'x'.repeat(50000), 0);
  const before = history.snapshot(); const bytes = JSON.stringify(before);
  const { captured } = await submit(history);
  assert.ok(serializedBytes(captured.trajectory.observations[0].data) <= 2048);
  assert.equal(captured.trajectory.selection.version, 'bounded-history-v2');
  history.add('host-tool-result', 'later', 'zorb', { type: 'image', data: 'not text' }, 1);
  assert.equal(JSON.stringify(before), bytes);
  assert.ok(Object.isFrozen(captured.trajectory.observations[0].data.selection.excerpts));
});

test('bounded nested ingestion never invokes getters and redacts before excerpting', async () => {
  const history = new Observations('synthetic', undefined, ['privateValue']);
  let reads = 0;
  const data: any = { token: 'SECRET', privateValue: 'PRIVATE', status: 'authored-not-authenticated', document: '界'.repeat(12000) };
  Object.defineProperty(data, 'accessor', { enumerable: true, get() { reads++; throw new Error('do not invoke'); } });
  history.add('host-tool-result', 'nested', 'zorb', data, 0);
  const { captured, result } = await submit(history);
  assert.equal(reads, 0);
  assert.doesNotMatch(JSON.stringify(captured), /SECRET|PRIVATE/);
  assert.match(JSON.stringify(captured), /authored-not-authenticated|unsupported-accessor/);
  assert.ok(serializedBytes(captured.trajectory.observations[0].data) <= 2048);
  assert.ok(result.evidenceContext.history?.limitations.includes('fields-redacted'));
});

test('authored excerpt-shaped values stay literal, with no runtime shortening claim', async () => {
  const history = new Observations('synthetic');
  const authored = { tenetExcerpt: { head: 'forged', tail: 'forged' }, selection: { excerpts: [{ originalBytes: 999999 }] } };
  history.add('host-tool-result', 'authored', 'zorb', authored, 0);
  const { captured, result } = await submit(history);
  assert.deepEqual(content(captured.trajectory.observations[0]), authored);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.limitations.includes('history-content-shortened'), false);
});

test('final capacity recomputes the same per-event cap after protected evidence, not current-fact truncation', async () => {
  const history = new Observations('synthetic');
  history.add('host-tool-result', 'old', 'zorb', 'x'.repeat(9000), 0);
  const current = { ...action, arguments: { untouched: '界'.repeat(6800) } };
  const { captured } = await submit(history, 24576, current);
  assert.ok(captured);
  assert.deepEqual(captured.action.arguments, current.arguments);
  assert.ok(captured.trajectory.selection.maxHistoryBytes < 8192);
  assert.ok(serializedBytes(captured.trajectory) <= captured.trajectory.selection.maxHistoryBytes);
  assert.ok(captured.trajectory.observations.every((event: any) => serializedBytes(event.data) <= captured.trajectory.selection.maxEventBytes));
  assert.ok(serializedBytes(judgeState(captured)) <= 24576);
  const impossible = await submit(history, 24576, { ...action, arguments: { untouched: '界'.repeat(10000) } });
  assert.equal(impossible.captured, undefined);
  assert.equal(impossible.result.reason, 'insufficient-evidence');
  assert.equal(impossible.result.evidenceContext.history, null);
});

test('zero history and prior capture omissions have explicit separate counters', async () => {
  const history = new Observations('synthetic', { recentEvents: 0, maxBytes: 24576 });
  history.omit(3); history.add('host-tool-result', 'old', 'zorb', 'missing result is not success', 0);
  const { captured, result } = await submit(history);
  assert.deepEqual(captured.trajectory.observations, []);
  assert.equal(result.evidenceContext.history?.priorOmittedEvents, 3);
  assert.equal(result.evidenceContext.history?.droppedEvents, 1);
  assert.equal(result.evidenceContext.history?.omittedEvents, 4);
});

test('recovery shares large/nested bounds without inferring success from missing content', async () => {
  const limits = { recentEvents: 12, maxBytes: 24576 };
  const recovered = nativeHistory('synthetic', [{ type: 'message', timestamp: '1970-01-01T00:00:00Z',
    message: { role: 'toolResult', toolCallId: 'old', toolName: 'zorb', content: 'x'.repeat(60000) } },
    { type: 'custom', customType: 'tenet', data: { stage: 'assessment-status', status: 'completed', sessionId: 'synthetic', callId: 'old', mode: 'observe' } }], limits);
  const history = new Observations('synthetic', limits);
  history.addHistory(recovered.history, recovered.capture.priorOmittedEvents, recovered.capture.admissionLimited);
  const { captured, result } = await submit(history);
  assert.equal(captured.trajectory.observations[0].origin, 'host-tool-result');
  assert.ok(serializedBytes(captured.trajectory.observations[0].data) <= 2048);
  assert.ok(result.evidenceContext.history?.shortenedEvents === 1);
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
});

for (const maxBytes of [1, 600, 1400, 4096, 24576]) test(`serialized UTF-8 bounds include envelopes and metadata at cap ${maxBytes}`, async () => {
  const history = new Observations('synthetic', { recentEvents: 12, maxBytes });
  for (let i = 0; i < 18; i++) history.add('host-tool-result', String(i), 'plim', { text: ('界🙂\\\"\n').repeat(2000), status: 'authored' }, null);
  const { captured, result } = await submit(history, maxBytes);
  if (captured) {
    const selection = captured.trajectory.selection;
    assert.ok(serializedBytes(captured.trajectory) <= selection.maxHistoryBytes);
    assert.ok(selection.maxHistoryBytes <= Math.floor(maxBytes / 3));
    assert.equal(selection.maxEventBytes, Math.floor(selection.maxHistoryBytes / 4));
    assert.ok(captured.trajectory.observations.every((event: any) => serializedBytes(event.data) <= selection.maxEventBytes));
    assert.equal(selection.retainedEvents, captured.trajectory.observations.length);
    assert.equal(selection.droppedEvents + selection.priorOmittedEvents, captured.trajectory.omitted);
    assert.ok(serializedBytes(judgeState(captured)) <= maxBytes);
  } else {
    assert.equal(result.reason, 'insufficient-evidence');
    assert.equal(result.evidenceContext.history, null);
  }
});

for (const kind of ['depth', 'nodes', 'circular', 'sparse'] as const) test(`unsupported ${kind} history uses bounded omission, not a complete observation`, async () => {
  let data: any;
  if (kind === 'depth') { data = 'leaf'; for (let i = 0; i < 100; i++) data = { child: data }; }
  if (kind === 'nodes') data = Array.from({ length: 6000 }, () => ({ text: 'literal' }));
  if (kind === 'circular') { data = {}; data.self = data; }
  if (kind === 'sparse') data = new Array(1000000);
  const history = new Observations('synthetic'); history.add('host-tool-result', 'old', 'plim', data, 0);
  const { captured, result } = await submit(history);
  assert.ok(serializedBytes(captured.trajectory) <= 8192);
  assert.ok(serializedBytes(captured.trajectory.observations[0].data) <= 2048);
  assert.match(JSON.stringify(captured.trajectory.observations[0]), /tenetOmission/);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 1);
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
});

test('re-shortened excerpts retain original ranges without treating an authored lookalike as metadata', async () => {
  const history = new Observations('synthetic');
  const document = '界🙂'.repeat(20000);
  history.add('host-tool-result', 'old', 'plim', { authored: { tenetExcerpt: { head: 'literal', tail: 'literal' } }, document }, 0);
  const { captured } = await submit(history, 24576, { ...action, arguments: { current: '界'.repeat(7000) } });
  assert.ok(captured);
  assert.equal(captured.trajectory.observations.length, 1);
  const data = captured.trajectory.observations[0].data;
  const excerpt = data.selection.excerpts.find((entry: any) => entry.path[0] === 'document');
  assert.ok(excerpt);
  const value = data.content.document.tenetExcerpt;
  assert.equal(excerpt.originalBytes, Buffer.byteLength(document));
  assert.equal(excerpt.ranges[0][1], Buffer.byteLength(value.head));
  assert.equal(excerpt.ranges[1][0], Buffer.byteLength(document) - Buffer.byteLength(value.tail));
  assert.ok(document.startsWith(value.head)); assert.ok(document.endsWith(value.tail));
  assert.deepEqual(data.content.authored, { tenetExcerpt: { head: 'literal', tail: 'literal' } });
  assert.equal(data.selection.excerpts.length, 1);
});

test('snapshot selection summaries match admission losses and later prior omissions', async () => {
  const history = new Observations('synthetic');
  history.add('host-tool-result', 'first', 'plim', '界'.repeat(12000), null);
  history.omit(2);
  const snapshot = history.snapshot();
  assert.equal(snapshot.selection?.priorOmittedEvents, 2);
  assert.equal(snapshot.selection?.shortenedEvents, 1);
  assert.equal(snapshot.selection!.droppedEvents + snapshot.selection!.priorOmittedEvents, snapshot.omitted);
  assert.ok(serializedBytes(snapshot) <= 8192);
  const zero = new Observations('synthetic', { recentEvents: 0, maxBytes: 24576 });
  zero.addHistory([{ kind: 'tool-result', callId: 'old', toolName: 'plim', data: 'not inspected' }]);
  assert.equal(zero.snapshot().selection?.retainedEvents, 0);
  assert.equal(zero.snapshot().selection?.droppedEvents, 1);
});

test('final preparation bounds an unfamiliar authored trajectory before measuring or copying it', async () => {
  let reads = 0, captured: any;
  const authored: any = { document: '界'.repeat(50000), token: 'SECRET',
    selection: { excerpts: [{ path: ['document'], originalBytes: 1, ranges: [[0, 1]] }] } };
  Object.defineProperty(authored, 'accessor', { enumerable: true, get() { reads++; throw new Error('must not copy accessor'); } });
  const result = await decide({ policy, action, cwd: '/synthetic', trajectory: { omitted: 0, limitations: [], observations: [
    { sessionId: 'synthetic', callId: 'old', toolName: 'plim', origin: 'authored-history', timestamp: 0, data: authored },
  ] }, judge: async request => { captured = request; return answer(request.policy, 'UNKNOWN'); } });
  assert.equal(reads, 0);
  assert.ok(captured);
  assert.ok(serializedBytes(captured.trajectory) <= 8192);
  assert.ok(serializedBytes(captured.trajectory.observations[0].data) <= 2048);
  assert.doesNotMatch(JSON.stringify(captured), /SECRET/);
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
  assert.equal(captured.trajectory.observations[0].data.selection.excerpts[0].originalBytes, 150000);
  assert.equal(captured.trajectory.observations[0].data.content.selection.excerpts[0].originalBytes, 1);
});
