import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard } from 'tenet';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { Observations, serializedBytes } from '../src/decision/trajectory.js';
import { answer, policy } from './helpers.js';

const cases = ['data accessor', 'identity accessor', 'toJSON accessor', 'circular identity', 'object identity',
  'object timestamp', 'nonfinite timestamp', 'oversized identity', 'multibyte identity', 'escaped identity'] as const;
function malformed(kind: typeof cases[number]) {
  let reads = 0;
  const metadata: any = {};
  const event: any = { kind: 'tool-result', sessionId: 'synthetic', origin: 'authored-history', callId: 'old', toolName: 'plim', timestamp: 0,
    data: { retained: 'not inspected when envelope is invalid' } };
  if (kind === 'data accessor') Object.defineProperty(event, 'data', { enumerable: true, get() { reads++; throw new Error('data getter'); } });
  if (kind === 'identity accessor') Object.defineProperty(event, 'callId', { enumerable: true, get() { reads++; throw new Error('identity getter'); } });
  if (kind === 'toJSON accessor') {
    Object.defineProperty(metadata, 'toJSON', { get() { reads++; throw new Error('toJSON getter'); } }); event.callId = metadata;
  }
  if (kind === 'circular identity') { metadata.self = metadata; event.callId = metadata; }
  if (kind === 'object identity') {
    Object.defineProperty(metadata, 'nested', { enumerable: true, get() { reads++; return 'must not read'; } }); event.toolName = metadata;
  }
  if (kind === 'object timestamp') { metadata.value = 'not a timestamp'; event.timestamp = metadata; }
  if (kind === 'nonfinite timestamp') event.timestamp = Infinity;
  if (kind === 'oversized identity') {
    event.callId = '界'.repeat(30000);
    Object.defineProperty(event.data, 'nested', { enumerable: true, get() { reads++; throw new Error('oversized envelope must not inspect payload'); } });
  }
  if (kind === 'multibyte identity' || kind === 'escaped identity') {
    event.callId = (kind === 'multibyte identity' ? '界' : '\n').repeat(5000);
    Object.defineProperty(event.data, 'nested', { enumerable: true, get() { reads++; throw new Error('metadata byte cap must precede payload'); } });
  }
  return { event, metadata, reads: () => reads };
}
const action = captureAction({ sessionId: 'synthetic', callId: 'pending', toolName: 'zorb', arguments: {} });

for (const kind of cases) test(`final preparation rejects ${kind} without touching caller objects`, async () => {
  const value = malformed(kind);
  let captured: any;
  const result = await decide({ policy, action, cwd: '/synthetic', trajectory: { observations: [value.event], omitted: 0, limitations: [] },
    judge: async request => { captured = request; return answer(request.policy, 'UNKNOWN'); } });
  assert.equal(value.reads(), 0);
  assert.equal(Object.isFrozen(value.metadata), false);
  assert.equal(Object.isFrozen(value.event), false);
  assert.ok(captured);
  assert.deepEqual(captured.trajectory.observations, []);
  assert.equal(captured.trajectory.omitted, 1);
  assert.ok(serializedBytes(captured.trajectory) <= 8192);
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
});

for (const kind of cases) test(`compiled SDK admission rejects ${kind} without throwing or freezing caller metadata`, async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-envelope-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep authored information local.');
  const value = malformed(kind);
  let captured: any;
  const guard = createGuard({ host: 'history', judge: async request => { captured = request; return answer(request.policy, 'UNKNOWN'); },
    env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control.json') });
  try {
    const session = guard.openSession({ sessionId: 'synthetic', contextId: 'main' }, cwd); await session.ready;
    assert.doesNotThrow(() => session.setHistory([value.event]));
    assert.equal(value.reads(), 0);
    assert.equal(Object.isFrozen(value.metadata), false);
    assert.equal(Object.isFrozen(value.event), false);
    const call = { callId: 'pending', toolName: 'zorb', input: {} };
    const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 'synthetic', contextId: 'main', ...call }) });
    assert.ok(captured);
    assert.deepEqual(captured.trajectory.observations, []);
    assert.equal(captured.trajectory.omitted, 1);
    assert.equal(result.permission, 'blocked');
    assert.equal(result.assessment.evidenceContext?.resolution.status, 'unsupported');
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});

test('raw final observation slots and unknown extra envelope fields never invoke authored accessors', async () => {
  let reads = 0, captured: any;
  const event: any = { sessionId: 'synthetic', origin: 'authored-history', callId: 'old', toolName: 'plim', timestamp: 0, data: 'literal' };
  Object.defineProperty(event, 'extra', { enumerable: true, get() { reads++; throw new Error('extra getter'); } });
  const observations = [event, event];
  Object.defineProperty(observations, '1', { get() { reads++; throw new Error('slot getter'); } });
  await decide({ policy, action, cwd: '/synthetic', trajectory: { observations, omitted: 0, limitations: [] },
    judge: async request => { captured = request; return answer(request.policy); } });
  assert.equal(reads, 0);
  assert.equal(captured.trajectory.observations.length, 1);
  assert.equal(captured.trajectory.observations[0].callId, 'old');
  assert.equal(Object.hasOwn(captured.trajectory.observations[0], 'extra'), false);
  assert.equal(captured.trajectory.omitted, 1);
  assert.equal(Object.isFrozen(event), false);
});

test('live admission validates envelope primitives before visiting content', () => {
  let reads = 0;
  const data = { get content() { reads++; throw new Error('must not inspect'); } };
  const history = new Observations('synthetic');
  assert.doesNotThrow(() => history.add('live-tool-result', { nested: 'invalid' } as any, 'plim', data, 0));
  assert.equal(reads, 0);
  assert.deepEqual(history.snapshot().observations, []);
  assert.equal(history.snapshot().omitted, 1);
  assert.equal(Object.isFrozen(data), false);
});
