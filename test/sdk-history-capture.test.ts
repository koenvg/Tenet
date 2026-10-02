import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type HistoryCaptureMetadata, type JudgeRequest, type ObservedHistory } from 'tenet';
import { answer } from './helpers.js';

async function fixture(recentEvents = 1) {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-capture-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep private content local.');
  const requests: JudgeRequest[] = [];
  const guard = createGuard({ host: 'capture', env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off', TENET_RECENT_EVENTS: String(recentEvents) },
    judge: async r => { requests.push(r); return answer(r.policy, 'UNKNOWN'); }, controlPath: join(cwd, 'control.json') });
  const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd); await session.ready;
  const call = async (callId = 'current') => {
    const invocation = { callId, toolName: 'opaque', input: { protected: true } };
    return session.beforeTool({ ...invocation, current: () => ({ sessionId: 's', contextId: 'main', ...invocation }) });
  };
  return { session, requests, call, close: async () => { await guard.close(); await rm(cwd, { recursive: true, force: true }); } };
}
const observation = (callId: string): ObservedHistory => ({ kind: 'tool-result', callId, toolName: 'opaque', timestamp: 0, data: { original: true } });

for (const recentEvents of [0, 1]) test(`compiled SDK keeps host slot loss additive and SDK admission limitations intact with cap ${recentEvents}`, async () => {
  const h = await fixture(recentEvents);
  try {
    const history = Array.from({ length: 4097 }, (_, i) => observation(String(i)));
    h.session.setHistory(history, { priorOmittedEvents: 5, admissionLimited: false });
    const result = await h.call();
    const selected = h.requests[0]!.trajectory!;
    assert.equal(selected.selection!.priorOmittedEvents, recentEvents ? 6 : 5);
    assert.equal(selected.selection!.droppedEvents, recentEvents ? 4095 : 4097);
    assert.equal(selected.omitted, recentEvents ? 4101 : 4102);
    assert.equal(selected.limitations.includes('history-admission-window'), !!recentEvents);
    assert.deepEqual(selected.observations.map(o => o.callId), recentEvents ? ['4096'] : []);
    assert.equal(result.permission, 'blocked');
    assert.equal(result.execution, 'unknown');
    assert.equal(result.assessment.evidenceContext?.resolution.status, 'unsupported');
    assert.deepEqual(result.assessment.evidenceContext, h.requests[0]!.evidenceContext);
  } finally { await h.close(); }
});

test('compiled SDK rejects malformed/accessor capture metadata atomically before reading replacement history', async () => {
  const h = await fixture();
  let reads = 0;
  try {
    const metadataGetter = Object.defineProperty({ admissionLimited: false }, 'priorOmittedEvents', { get() { reads++; throw new Error('metadata getter'); } });
    const flagGetter = Object.defineProperty({ priorOmittedEvents: 0 }, 'admissionLimited', { get() { reads++; throw new Error('flag getter'); } });
    const malformed: unknown[] = [null, true, 'capture', [], {}, { priorOmittedEvents: 0 },
      ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', {}].map(priorOmittedEvents => ({ priorOmittedEvents, admissionLimited: false })),
      ...[undefined, null, 0, 'false', {}].map(admissionLimited => ({ priorOmittedEvents: 0, admissionLimited })),
      metadataGetter, flagGetter, Object.create({ priorOmittedEvents: 0, admissionLimited: false }),
      new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('descriptor trap'); } }),
    ];
    const replacement = new Proxy([observation('replacement')], { getOwnPropertyDescriptor(target, key) {
      if (key === '0') reads++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    } });
    for (const [index, capture] of malformed.entries()) {
      h.session.setHistory([observation('original')], { priorOmittedEvents: 2, admissionLimited: true });
      assert.throws(() => h.session.setHistory(replacement, capture as HistoryCaptureMetadata), /invalid-history-capture-metadata/);
      assert.equal(reads, 0);
      await h.call(`current-${index}`);
      const history = h.requests.at(-1)!.trajectory!;
      assert.deepEqual(history.observations.map(o => o.callId), ['original']);
      assert.equal(history.selection!.priorOmittedEvents, 2);
      assert.ok(history.limitations.includes('history-admission-window'));
    }
  } finally { await h.close(); }
});

test('compiled SDK rejects combined admission/selection count overflow atomically', async () => {
  const h = await fixture();
  try {
    for (const replacement of [[observation('a'), observation('b')], new Array(4097)]) {
      h.session.setHistory([observation('original')]);
      assert.throws(() => h.session.setHistory(replacement, { priorOmittedEvents: Number.MAX_SAFE_INTEGER, admissionLimited: false }), /history-count-overflow/);
      await h.call(`current-${h.requests.length}`);
      assert.deepEqual(h.requests.at(-1)!.trajectory!.observations.map(o => o.callId), ['original']);
      assert.equal(h.requests.at(-1)!.trajectory!.omitted, 0);
    }
    h.session.setHistory([], { priorOmittedEvents: Number.MAX_SAFE_INTEGER, admissionLimited: false });
    await h.call('safe-boundary');
    assert.equal(h.requests.at(-1)!.trajectory!.omitted, Number.MAX_SAFE_INTEGER);
    assert.ok(Number.isSafeInteger(h.requests.at(-1)!.trajectory!.selection!.priorOmittedEvents));
  } finally { await h.close(); }
});

test('compiled SDK copies only the fixed capture fields and leaves authored markers literal', async () => {
  const h = await fixture();
  let reads = 0;
  try {
    const capture = { priorOmittedEvents: 0, admissionLimited: false };
    for (const key of ['toJSON', 'selection', 'identity', 'facts']) Object.defineProperty(capture, key, { get() { reads++; throw new Error('arbitrary field'); } });
    const history: ObservedHistory[] = [{ ...observation('past'), data: { priorOmittedEvents: 1000, admissionLimited: true, approval: 'granted' } }];
    h.session.setHistory(history, capture);
    capture.priorOmittedEvents = 1000; capture.admissionLimited = true;
    const result = await h.call();
    assert.equal(reads, 0);
    assert.equal(h.requests[0]!.trajectory!.omitted, 0);
    assert.ok(!h.requests[0]!.trajectory!.limitations.includes('history-admission-window'));
    assert.deepEqual((h.requests[0]!.trajectory!.observations[0]!.data as any).content, history[0]!.data);
    assert.equal(result.permission, 'blocked');
    assert.equal(result.execution, 'unknown');
    assert.equal(result.assessment.evidenceContext?.resolution.status, 'unsupported');
  } finally { await h.close(); }
});
