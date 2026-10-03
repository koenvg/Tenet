import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { Observations, serializedBytes } from '../src/decision/trajectory.js';
import { answer, policy } from './helpers.js';
import { expandedData } from './exact-history-fixture.js';

const action = captureAction({ sessionId: 'synthetic', callId: 'pending', toolName: 'opaque', arguments: { unchanged: true } });
async function submit(history: Observations, current = action) {
  let captured: any;
  const result = await decide({ policy, action: current, cwd: '/synthetic', trajectory: history.snapshot(), evidenceLimits: history.limits,
    judge: async request => { captured = request; return answer(request.policy, 'UNKNOWN'); } });
  return { captured, result };
}

test('admission compacts before eviction and final submission round-trips every distinct event', async () => {
  const history = new Observations('synthetic');
  const text = '界🙂\\\"'.repeat(100);
  for (let i = 0; i < 12; i++) history.add(i % 2 ? 'host-tool-result' : 'host-tool-call', `call-${i}`, `unfamiliar-${i}`, { text, status: i }, 100 - i);
  const before = history.snapshot();
  assert.equal(before.observations.length, 12);
  assert.equal(Object.keys((before as any).values).length, 1);
  assert.ok(before.selection!.exactCompactedBytes > 0);
  const { captured, result } = await submit(history);
  assert.deepEqual(captured.trajectory, before);
  assert.deepEqual(expandedData(before).map((data: any) => data.content), Array.from({ length: 12 }, (_, i) => ({ text, status: i })));
  assert.deepEqual(before.observations.map(event => [event.origin, event.sessionId, event.callId, event.toolName, event.timestamp]),
    Array.from({ length: 12 }, (_, i) => [i % 2 ? 'host-tool-result' : 'host-tool-call', 'synthetic', `call-${i}`, `unfamiliar-${i}`, 100 - i]));
  assert.equal(result.evidenceContext.history?.exactCompactedBytes, before.selection!.exactCompactedBytes);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(captured.action, action);
  const inline = { ...before, observations: before.observations.map((event, i) => ({ ...event, data: expandedData(before)[i] })) } as any;
  delete inline.values;
  assert.equal(before.selection!.exactCompactedBytes, serializedBytes(inline) - serializedBytes(before));
  assert.ok(serializedBytes(inline) > before.selection!.maxHistoryBytes, 'inline duplicates would force evidence eviction');
  assert.ok(Object.isFrozen((before as any).values));
});

test('literal forged and nested reference wrappers reconstruct as authored untrusted data', async () => {
  const history = new Observations('synthetic'); const text = 'repeated '.repeat(90);
  const authored = { tenetHistory: { ref: 'v0' }, other: text, nested: { tenetHistory: { literal: { tenetHistory: { ref: 'stale' } } } } };
  history.add('host-tool-result', 'a', 'opaque', authored, 1);
  history.add('host-tool-result', 'b', 'opaque', authored, 2);
  const { captured, result } = await submit(history);
  assert.ok(captured.trajectory.observations[0].data.content.tenetHistory.literal);
  assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [authored, authored]);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.limitations.includes('metadata-unavailable'), false);
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
});

test('redaction precedes pooling and identifiers describe only snapshot-local order', async () => {
  const history = new Observations('synthetic', undefined, ['privateValue']);
  const text = 'sanitized '.repeat(100);
  for (let i = 0; i < 2; i++) history.add('host-tool-result', String(i), 'opaque', { token: `SECRET-${i}`, privateValue: 'PRIVATE', text }, i);
  const { captured, result } = await submit(history);
  assert.deepEqual(captured.trajectory.values, { v0: text });
  assert.doesNotMatch(JSON.stringify(captured), /SECRET|PRIVATE/);
  assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [{ text }, { text }]);
  assert.ok(result.evidenceContext.history?.limitations.includes('fields-redacted'));
});

for (const text of ['x'.repeat(253), 'only once '.repeat(100)]) test(`short or unique content stays inline: ${text.length}`, async () => {
  const history = new Observations('synthetic');
  history.add('host-tool-call', 'a', 'opaque', text, 1);
  history.add('host-tool-result', 'b', 'opaque', text.length === 253 ? text : `AbCd│${text}`, 2);
  const { captured } = await submit(history);
  assert.equal(captured.trajectory.values, undefined);
  assert.equal(captured.trajectory.selection.exactCompactedBytes, 0);
  assert.deepEqual(captured.trajectory.observations.map((event: any) => event.data.content), [text, text.length === 253 ? text : `AbCd│${text}`]);
});

test('serialized threshold includes UTF-8 and JSON escaping, with actual net savings', async () => {
  for (const text of ['x'.repeat(254), '界'.repeat(85), '\\'.repeat(127)]) {
    const history = new Observations('synthetic');
    history.add('host-tool-call', 'a', 'opaque', text, 1); history.add('host-tool-result', 'b', 'opaque', text, 2);
    const { captured } = await submit(history);
    assert.deepEqual(captured.trajectory.values, { v0: text });
    assert.ok(captured.trajectory.selection.exactCompactedBytes > 0);
    assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [text, text]);
  }
});

test('count eviction prunes unused values and reassigns deterministic snapshot-local IDs', async () => {
  const history = new Observations('synthetic', { recentEvents: 3, maxBytes: 24576 });
  const first = 'first'.repeat(100), second = 'second'.repeat(100);
  history.add('host-tool-result', 'a', 'opaque', first, 1); history.add('host-tool-result', 'b', 'opaque', first, 2);
  const before = history.snapshot(), wire = JSON.stringify(before);
  history.add('host-tool-result', 'c', 'opaque', second, 3); history.add('host-tool-result', 'd', 'opaque', second, 4);
  const { captured } = await submit(history);
  assert.deepEqual(captured.trajectory.values, { v0: second });
  assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [first, second, second]);
  assert.equal(JSON.stringify(before), wire);
});

for (const maxBytes of [1, 600, 1400, 24576]) test(`pool is absent under zero history or unusable capacity ${maxBytes}`, async () => {
  const history = new Observations('synthetic', { recentEvents: 0, maxBytes });
  for (let i = 0; i < 2; i++) history.add('host-tool-result', String(i), 'opaque', 'x'.repeat(1000), i);
  assert.equal((history.snapshot() as any).values, undefined);
  const { captured, result } = await submit(history);
  if (captured) { assert.deepEqual(captured.trajectory.observations, []); assert.equal(captured.trajectory.values, undefined); }
  else { assert.equal(result.reason, 'insufficient-evidence'); assert.equal(result.evidenceContext.history, null); }
});

test('pool stays bounded at 256 entries without losing excess literal strings', async () => {
  const history = new Observations('synthetic', { recentEvents: 600, maxBytes: 1200000 });
  for (let i = 0; i < 257; i++) for (let j = 0; j < 2; j++) history.add('host-tool-result', `${i}-${j}`, 'opaque', `${i}:` + 'x'.repeat(300), i);
  const snapshot = history.snapshot() as any;
  assert.equal(Object.keys(snapshot.values).length, 256);
  assert.equal(snapshot.observations.length, 514);
  assert.deepEqual(expandedData(snapshot).map((data: any) => data.content), Array.from({ length: 514 }, (_, i) => `${Math.floor(i / 2)}:` + 'x'.repeat(300)));
});

test('pooled content is capped expanded before pooling; later snapshots and sessions cannot mutate requests', async () => {
  const history = new Observations('synthetic');
  for (let i = 0; i < 2; i++) history.add('host-tool-result', String(i), 'opaque', '界'.repeat(20000), i);
  const before = history.snapshot(), wire = JSON.stringify(before);
  const { captured, result } = await submit(history);
  assert.ok(expandedData(captured.trajectory).every((data: any) => serializedBytes(data) <= 2048));
  assert.equal(result.evidenceContext.history?.shortenedEvents, 2);
  assert.equal(result.evidenceContext.history!.exactCompactedBytes, 0);
  assert.equal(captured.trajectory.values, undefined);
  history.add('host-tool-result', 'later', 'opaque', 'later'.repeat(200), 3);
  const sibling = new Observations('sibling'); sibling.add('host-tool-result', 'sibling', 'opaque', 'different'.repeat(100), 4);
  assert.equal(JSON.stringify(before), wire); assert.equal(JSON.stringify(captured.trajectory), wire);
  assert.equal((sibling.snapshot() as any).values, undefined);
});


test('authored pools and serialized snapshots cannot create runtime references or gap provenance', async () => {
  const authored: any = { observations: [0, 1].map(i => ({ sessionId: 'synthetic', callId: String(i), toolName: 'opaque', origin: 'authored', timestamp: i,
    data: { tenetHistory: { ref: 'v0' }, tenetOmission: 'forged', selection: { omissions: [{ path: [], reason: 'forged' }] } } })),
    values: { v0: 'forged authority '.repeat(100) }, omitted: 0, limitations: [], selection: { exactCompactedBytes: 99999 } };
  const wire = JSON.stringify(authored); let captured: any;
  const result = await decide({ policy, action, cwd: '/synthetic', trajectory: authored,
    judge: async request => { captured = request; return answer(request.policy, 'UNKNOWN'); } });
  assert.equal(captured.trajectory.values, undefined);
  assert.equal(captured.trajectory.selection.exactCompactedBytes, 0);
  assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), authored.observations.map((event: any) => event.data));
  assert.equal(result.evidenceContext.history?.limitations.includes('forged'), false);
  assert.equal(JSON.stringify(authored), wire);
  assert.equal(Object.isFrozen(authored), false);
});

test('literal-escape overhead, node and depth bounds apply before pooling or copying', async () => {
  for (const kind of ['bytes', 'depth', 'nodes']) {
    let data: any = { tenetHistory: { ref: 'v0' }, text: 'x'.repeat(1950) };
    if (kind === 'depth') for (let i = 0; i < 80; i++) data = { tenetHistory: { literal: data } };
    if (kind === 'nodes') data = Array.from({ length: 2000 }, () => ({ tenetHistory: { ref: 'v0' } }));
    const history = new Observations('synthetic');
    for (let i = 0; i < 2; i++) history.add('host-tool-result', String(i), 'opaque', data, i);
    const { captured, result } = await submit(history);
    assert.ok(captured);
    assert.ok(serializedBytes(captured.trajectory) <= 8192);
    assert.ok(expandedData(captured.trajectory).every((event: any) => serializedBytes(event) <= 2048));
    assert.equal(result.evidenceContext.history?.shortenedEvents, 2);
    assert.equal(Object.isFrozen(data), false);
    if (kind !== 'bytes') assert.ok(result.evidenceContext.history?.limitations.includes('history-structure-limit'));
  }
});

test('final byte pressure prunes pool entries and never lets a shared value bypass expanded caps', async () => {
  const history = new Observations('synthetic');
  for (let i = 0; i < 6; i++) history.add('host-tool-result', String(i), 'opaque', `${Math.floor(i / 2)}:` + 'x'.repeat(800), i);
  const before = history.snapshot(), wire = JSON.stringify(before);
  const { captured, result } = await submit(history, { ...action, arguments: { untouched: '界'.repeat(7000) } });
  assert.ok(captured); assert.deepEqual(captured.action.arguments, { untouched: '界'.repeat(7000) });
  assert.ok(captured.trajectory.selection.maxHistoryBytes < 8192);
  const values = captured.trajectory.values ?? {};
  const refs = new Set<string>();
  function scan(value: any): void {
    if (!value || typeof value !== 'object') return;
    if (value.tenetHistory?.ref) refs.add(value.tenetHistory.ref);
    for (const child of Object.values(value)) scan(child);
  }
  for (const event of captured.trajectory.observations) scan(event.data.content);
  assert.deepEqual([...refs].sort(), Object.keys(values).sort());
  assert.ok(expandedData(captured.trajectory).every((data: any) => serializedBytes(data) <= captured.trajectory.selection.maxEventBytes));
  assert.equal(JSON.stringify(before), wire);
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
});


test('only complete literal paths pool inside an event with runtime excerpts', async () => {
  const history = new Observations('synthetic');
  const label = 'complete '.repeat(70), document = 'HEAD ' + '界🙂'.repeat(10000) + ' TAIL';
  history.add('host-tool-call', 'a', 'opaque', { label, document }, 1);
  history.add('host-tool-result', 'b', 'opaque', { label, document: 'AbCd│' + document }, 2);
  const { captured, result } = await submit(history);
  assert.deepEqual(captured.trajectory.values, { v0: label });
  for (const event of captured.trajectory.observations) {
    assert.equal(typeof event.data.content.document.tenetExcerpt.head, 'string');
    assert.equal(typeof event.data.content.document.tenetExcerpt.tail, 'string');
  }
  assert.equal(result.evidenceContext.history?.shortenedEvents, 2);
  assert.ok(result.evidenceContext.history!.exactCompactedBytes > 0);
});


test('authored excerpt lookalikes remain complete literal values eligible for exact pooling', async () => {
  const history = new Observations('synthetic');
  const text = 'authored complete '.repeat(40);
  const authored = { tenetExcerpt: { head: text, tail: text }, selection: { excerpts: [{ path: [], originalBytes: 99999 }] } };
  for (let i = 0; i < 2; i++) history.add('host-tool-result', String(i), 'opaque', authored, i);
  const { captured, result } = await submit(history);
  assert.deepEqual(captured.trajectory.values, { v0: text });
  assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [authored, authored]);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.limitations.includes('history-content-shortened'), false);
});


test('byte pressure shortens before envelope-driven eviction and prunes the now-ineligible pool', async () => {
  const history = new Observations('synthetic');
  // Primitive envelopes consume pressure but are never excerpted or pooled.
  for (let i = 0; i < 12; i++) history.add('host-tool-result', `${i}-` + 'identity'.repeat(100), 'opaque', `${Math.floor(i / 2)}:` + 'x'.repeat(300), i);
  const { captured, result } = await submit(history);
  assert.ok(captured.trajectory.selection.droppedEvents > 0);
  assert.ok(serializedBytes(captured.trajectory) <= 8192);
  const retained = expandedData(captured.trajectory).map((data: any) => data.content);
  assert.deepEqual(captured.trajectory.observations.map((event: any) => event.callId.split('-')[0]), ['6', '7', '8', '9', '10', '11']);
  assert.ok(retained.every((value: any) => value.tenetExcerpt));
  assert.equal(captured.trajectory.values, undefined, 'generated excerpt fragments cannot remain pooled');
  assert.equal(result.evidenceContext.history?.shortenedEvents, 6);
  assert.equal(result.evidenceContext.history?.omittedEvents, 6);
  assert.equal(result.evidenceContext.history!.exactCompactedBytes, 0);
});


for (const depth of [62, 63, 64]) test(`complete retained strings obey the data.content-root encoded depth boundary ${depth} without new loss`, async () => {
  const { evidenceWithinBudget } = await import('../src/decision/evidence-budget.js');
  let data: any = 'boundary'.repeat(40);
  for (let i = 0; i < depth; i++) data = { a: data };
  assert.equal(evidenceWithinBudget([data], 1000000), true);
  const history = new Observations('synthetic');
  for (let i = 0; i < 2; i++) history.add('host-tool-result', String(i), 'opaque', data, i);
  const before = history.snapshot();
  const { captured, result } = await submit(history);
  assert.equal(captured.trajectory.observations.length, 2);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
  assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [data, data]);
  for (const snapshot of [before, captured.trajectory]) for (const event of snapshot.observations) assert.equal(evidenceWithinBudget([event.data.content], 1000000), true);
  if (depth >= 63) { assert.equal(captured.trajectory.values, undefined); assert.equal(result.evidenceContext.history?.exactCompactedBytes, 0); }
});

test('near-limit data.content-root nodes stay within the guard after reference encoding without new loss', async () => {
  const { evidenceWithinBudget } = await import('../src/decision/evidence-budget.js');
  let leaf = 0;
  const tree = (depth: number): any => depth ? { a: tree(depth - 1), b: tree(depth - 1) } : leaf++ < 2 ? 'complete'.repeat(40) : {};
  const data = tree(11);
  assert.equal(evidenceWithinBudget([data], 1200000), true);
  const history = new Observations('synthetic', { recentEvents: 12, maxBytes: 1200000 });
  history.add('host-tool-result', 'node-boundary', 'opaque', data, 1);
  const before = history.snapshot();
  const { captured, result } = await submit(history);
  assert.equal(captured.trajectory.observations.length, 1);
  assert.deepEqual(expandedData(captured.trajectory)[0].content, data);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
  for (const snapshot of [before, captured.trajectory]) assert.equal(evidenceWithinBudget([snapshot.observations[0].data.content], 1200000), true);
});

test('mixed deep and shallow occurrences recompute safe counts, savings and deterministic pruned IDs', async () => {
  const { evidenceWithinBudget } = await import('../src/decision/evidence-budget.js');
  const repeated = 'mixed'.repeat(70), eligible = 'safe'.repeat(90);
  let deep: any = repeated;
  for (let i = 0; i < 63; i++) deep = { a: deep };
  const history = new Observations('synthetic');
  history.add('host-tool-result', 'deep', 'opaque', deep, 1);
  history.add('host-tool-result', 'shallow', 'opaque', { repeated, a: eligible, b: eligible }, 2);
  const { captured, result } = await submit(history);
  assert.deepEqual(captured.trajectory.values, { v0: eligible });
  assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [deep, { repeated, a: eligible, b: eligible }]);
  assert.equal(captured.trajectory.observations[1].data.content.repeated, repeated);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
  assert.equal(evidenceWithinBudget([captured.trajectory.observations[0].data.content], 1000000), true);
  const again = await submit(history);
  assert.deepEqual(again.captured.trajectory, captured.trajectory);
});


test('pooling does not cross whole-trajectory depth limits when the corresponding inline snapshot already fits', async () => {
  const { evidenceWithinBudget } = await import('../src/decision/evidence-budget.js');
  let data: any = 'whole-depth'.repeat(30);
  for (let i = 0; i < 60; i++) data = { a: data };
  const history = new Observations('synthetic');
  for (let i = 0; i < 2; i++) history.add('host-tool-result', String(i), 'opaque', data, i);
  const { captured, result } = await submit(history);
  const inline: any = { ...captured.trajectory, observations: captured.trajectory.observations.map((event: any, i: number) => ({ ...event, data: expandedData(captured.trajectory)[i] })) };
  delete inline.values;
  assert.equal(evidenceWithinBudget([inline], 1000000), true);
  assert.equal(evidenceWithinBudget([captured.trajectory], 1000000), true);
  assert.equal(captured.trajectory.values, undefined);
  assert.equal(result.evidenceContext.history?.exactCompactedBytes, 0);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
});

test('aggregate non-regression counts reference nodes, pool entries and surrounding trajectory metadata', async () => {
  const { evidenceWithinBudget } = await import('../src/decision/evidence-budget.js');
  let parent = 0;
  const tree = (depth: number): any => {
    if (!depth) return {};
    if (depth === 1) {
      const index = parent++;
      return index >= 1012 ? {} : { a: index === 0 ? 'whole-node'.repeat(30) : {}, b: index === 0 ? 'whole-node'.repeat(30) : {} };
    }
    return { a: tree(depth - 1), b: tree(depth - 1) };
  };
  const data = tree(11), history = new Observations('synthetic', { recentEvents: 12, maxBytes: 1200000 });
  history.add('host-tool-result', 'aggregate', 'opaque', data, 1);
  const { captured, result } = await submit(history);
  const inline: any = { ...captured.trajectory, observations: captured.trajectory.observations.map((event: any, i: number) => ({ ...event, data: expandedData(captured.trajectory)[i] })) };
  delete inline.values;
  assert.equal(evidenceWithinBudget([inline], 1200000), true);
  assert.equal(evidenceWithinBudget([captured.trajectory], 1200000), true);
  assert.equal(captured.trajectory.values, undefined);
  assert.equal(result.evidenceContext.history?.exactCompactedBytes, 0);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
  assert.deepEqual(expandedData(captured.trajectory)[0].content, data);
});

test('an inline whole-trajectory-over-limit snapshot is not newly evicted or rejected by compaction', async () => {
  const { evidenceWithinBudget } = await import('../src/decision/evidence-budget.js');
  let data: any = 'complete-deep'.repeat(25);
  for (let i = 0; i < 64; i++) data = { a: data };
  const history = new Observations('synthetic');
  history.add('host-tool-result', 'deep', 'opaque', data, 1);
  history.add('host-tool-result', 'shallow', 'opaque', { a: 'eligible'.repeat(40), b: 'eligible'.repeat(40) }, 2);
  const { captured, result } = await submit(history);
  assert.ok(captured);
  assert.equal(evidenceWithinBudget([captured.trajectory], 1000000), false, 'this additional global root was not a predecessor admission cap');
  assert.equal(captured.trajectory.observations.length, 2);
  assert.deepEqual(captured.trajectory.values, { v0: 'eligible'.repeat(40) });
  assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [data, { a: 'eligible'.repeat(40), b: 'eligible'.repeat(40) }]);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
});


test('safe shallow occurrences can pool while the same complete value stays inline at a deep path', async () => {
  const { evidenceWithinBudget } = await import('../src/decision/evidence-budget.js');
  const text = 'one complete value'.repeat(20);
  let deep: any = text;
  for (let i = 0; i < 64; i++) deep = { a: deep };
  const history = new Observations('synthetic');
  history.add('host-tool-result', 'deep', 'opaque', deep, 1);
  history.add('host-tool-result', 'shallow', 'opaque', { a: text, b: text }, 2);
  const { captured, result } = await submit(history);
  assert.deepEqual(captured.trajectory.values, { v0: text });
  assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [deep, { a: text, b: text }]);
  assert.deepEqual(captured.trajectory.observations[0].data.content, deep);
  assert.equal(evidenceWithinBudget([captured.trajectory.observations[0].data.content], 1000000), true);
  const inline: any = { ...captured.trajectory, observations: captured.trajectory.observations.map((event: any, i: number) => ({ ...event, data: expandedData(captured.trajectory)[i] })) };
  delete inline.values;
  assert.equal(result.evidenceContext.history?.exactCompactedBytes, serializedBytes(inline) - serializedBytes(captured.trajectory));
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
});


for (const depth of [59, 60]) test(`literal escapes count toward data.content-root reference depth at authored depth ${depth}`, async () => {
  const { evidenceWithinBudget } = await import('../src/decision/evidence-budget.js');
  const text = 'complete literal child'.repeat(20);
  let original: any = { tenetHistory: 'authored', a: text };
  for (let i = 0; i < depth; i++) original = { a: original };
  const history = new Observations('synthetic');
  for (let i = 0; i < 2; i++) history.add('host-tool-result', String(i), 'opaque', original, i);
  const { captured, result } = await submit(history);
  assert.deepEqual(expandedData(captured.trajectory).map((data: any) => data.content), [original, original]);
  for (const event of captured.trajectory.observations) assert.equal(evidenceWithinBudget([event.data.content], 1000000), true);
  assert.equal(Boolean(captured.trajectory.values), depth === 59);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 0);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
  if (depth === 60) assert.equal(result.evidenceContext.history?.exactCompactedBytes, 0);
});


test('reference encoding preserves the existing excerpt-admission data-root guard, not just content-root bounds', async () => {
  const { evidenceWithinBudget } = await import('../src/decision/evidence-budget.js');
  const text = 'complete admission child'.repeat(16);
  let deep: any = text;
  for (let i = 0; i < 61; i++) deep = { a: deep };
  const history = new Observations('synthetic');
  for (let i = 0; i < 2; i++) history.add('host-tool-result', String(i), 'opaque', { a: deep, b: String(i).repeat(10000) }, i);
  const { captured, result } = await submit(history);
  const inline = expandedData(captured.trajectory);
  assert.equal(captured.trajectory.observations.length, 2);
  for (const [index, event] of captured.trajectory.observations.entries()) {
    assert.deepEqual(inline[index].content.a, deep);
    assert.equal(evidenceWithinBudget([inline[index]], 1000000), true, 'the excerpt-admission inline data root already fits');
    assert.equal(evidenceWithinBudget([event.data], 1000000), true, 'references must not invalidate that admission root');
  }
  assert.equal(captured.trajectory.values, undefined);
  assert.equal(result.evidenceContext.history?.exactCompactedBytes, 0);
  assert.equal(result.evidenceContext.history?.shortenedEvents, 2);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
});


test('excerpt-admission data-root node room includes its redaction and selection metadata before pooling', async () => {
  const { evidenceWithinBudget } = await import('../src/decision/evidence-budget.js');
  const text = 'n'.repeat(260);
  const leaves: { parent: any; key: string }[] = [];
  const tree = (depth: number): any => {
    if (!depth) return {};
    const result = { a: tree(depth - 1), b: tree(depth - 1) };
    if (depth === 1) leaves.push({ parent: result, key: 'a' }, { parent: result, key: 'b' });
    return result;
  };
  const content = tree(11);
  for (const { parent, key } of leaves.slice(0, 12)) parent[key] = text;
  for (const { parent, key } of leaves.slice(-32)) delete parent[key];
  const history = new Observations('synthetic', { recentEvents: 12, maxBytes: 1200000 });
  history.add('host-tool-result', 'c', 'opaque', { a: content, big: 'x'.repeat(2000000) }, 1);
  const { captured, result } = await submit(history);
  const event = captured.trajectory.observations[0];
  const inline = expandedData(captured.trajectory)[0];
  assert.deepEqual(inline.content.a, content);
  assert.equal(evidenceWithinBudget([inline], 1200000), true, 'the existing complete data root fits');
  assert.equal(evidenceWithinBudget([event.data], 1200000), true, 'safe references include the complete data root node overhead');
  assert.deepEqual(captured.trajectory.values, { v0: text });
  assert.ok((result.evidenceContext.history?.exactCompactedBytes ?? 0) > 0);
  const inlineFrame: any = { ...captured.trajectory, observations: [{ ...event, data: inline }] };
  delete inlineFrame.values;
  assert.equal(result.evidenceContext.history?.exactCompactedBytes, serializedBytes(inlineFrame) - serializedBytes(captured.trajectory));
  assert.equal(result.evidenceContext.history?.shortenedEvents, 1);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0);
});
