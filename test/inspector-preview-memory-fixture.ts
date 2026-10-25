import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { recordSessionKey } from '../src/recording/archive.js';
import { FixtureArchiveWriter } from './archive-fixture.js';

const previews = [
  { text: 'a'.repeat(512), value: 'a'.repeat(512), shortened: false },
  { text: 'b'.repeat(513), value: 'b'.repeat(512), shortened: true },
  { text: ' \n' + 'c'.repeat(510) + '\t  z \r ', value: 'c'.repeat(510) + ' z', shortened: false },
  { text: '😀'.repeat(128), value: '😀'.repeat(128), shortened: false },
  { text: 'a'.repeat(511) + '😀', value: 'a'.repeat(511), shortened: true },
  { text: '雪'.repeat(170) + 'xy', value: '雪'.repeat(170) + 'xy', shortened: false },
  { text: 'a'.repeat(509) + '\ud800x', value: 'a'.repeat(509) + '\ud800', shortened: true },
  { text: 'a'.repeat(509) + '\udc00', value: 'a'.repeat(509) + '\udc00', shortened: false },
];
const session = recordSessionKey({ schemaVersion: 3, host: 'pi', contextId: 'main', sessionId: 'synthetic-preview-memory', invocationId: '' });

async function seed(root: string) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  try {
    for (let call = 0; call < 32; call++) {
      const sink = writer.bindHistorical({ sessionId: 'synthetic-preview-memory', invocationId: String(call), callId: String(call),
        toolName: 'bash', cwd: '/synthetic', mode: 'observe', host: 'pi', contextId: 'main' }, 3);
      sink('request', {
        policy: { source: '/synthetic/TENET.md', digest: 'synthetic', rules: Array.from({ length: 16 }, (_, rule) => ({
          id: `rule-${call}-${rule}`, text: 'r'.repeat(512) + 'EXACT-DETAIL-ONLY', enforcement: 'WARN',
        })) }, questionVersion: 'recorded-only', mapping: [],
        payload: { model: 'offline', questions: {}, state: { action: { arguments: { command: previews[call % 8]!.text } },
          policy: {}, context: {}, trajectory: {}, integrity: {} } },
      });
      await writer.settle();
    }
    await writer.complete();
  } finally { await writer.close(); }
}

async function refresh(index: ArchiveIndex) {
  for (let turn = 0; turn < 10; turn++) {
    await index.refresh();
    if (!index.indexing) break;
  }
  assert.equal(index.indexing, false);
  assert.deepEqual(index.issues(), []);
}

async function measure(phase: string) {
  assert.equal(typeof global.gc, 'function');
  for (let turn = 0; turn < 3; turn++) { await setImmediate(); global.gc!(); }
  return { phase, heapUsed: process.memoryUsage().heapUsed };
}

async function warm(root: string) {
  const index = new ArchiveIndex(root);
  try { await refresh(index); assert.equal(index.invocations(session, { limit: 100 }).items.length, 32); }
  finally { await index.close(); }
}

const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-preview-memory-')));
try {
  await seed(root);
  await warm(root);
  const baseline = await measure('baseline');
  const index = new ArchiveIndex(root);
  try {
    await refresh(index);
    const indexed = await measure('indexed');
    const calls = index.invocations(session, { limit: 100 });
    assert.equal(calls.items.length, 32);
    assert.equal(calls.next, null);
    for (const call of calls.items) {
      const expected = previews[Number(call.callId) % 8]!;
      assert.deepEqual(call.actionPreview, { key: 'command', value: expected.value, shortened: expected.shortened });
    }
    let rules = 0, cursor: string | undefined;
    do {
      const page = index.sessionRules(session, { limit: 100, cursor });
      for (const rule of page.items) {
        assert.equal(rule.preview, 'r'.repeat(512));
        assert.equal(rule.unassessedObservations, 1);
        rules++;
      }
      cursor = page.next ?? undefined;
    } while (cursor);
    assert.equal(rules, 512);
    await index.close();
    const released = await measure('released');
    console.log(JSON.stringify({ runtime: process.version, phases: [baseline, indexed, released], calls: calls.items.length, rules }));
  } finally { await index.close(); }
} finally { await rm(root, { recursive: true, force: true }); }
