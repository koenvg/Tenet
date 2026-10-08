import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { startInspector } from '../src/inspector/server.js';
import { sessionKey } from '../src/recording/archive.js';
import { readPrivateFile, writeStageFile } from '../src/recording/files.js';

const gate = 'evidence-confidence-below-threshold';
type Call = { id: string; begin: number; occurrence: number; stage?: 'decision' | 'assessment' | 'validation';
  source?: string; digest?: string; target?: string; profile?: string; ruleId?: string; gate?: string };

async function fixture(calls: Call[], run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-occurrence-')));
  try {
    const times = new Map(calls.map(call => [call.id, call]));
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root }, undefined, async (root, folder, name, text) => {
      const record = JSON.parse(text);
      const call = times.get(record.callId)!;
      record.timestamp = record.stage === 'begin' ? call.begin : call.occurrence;
      await writeStageFile(root, folder, name, JSON.stringify(record));
    });
    for (const call of calls) {
      const ruleId = call.ruleId ?? 'r';
      const sink = writer.bindHistorical({ sessionId: 's', invocationId: call.id, callId: call.id,
        toolName: 'read', cwd: '/p', mode: 'observe' }, 1);
      sink('begin', { policy: { source: call.source ?? '/p/TENET.md', digest: call.digest ?? 'digest',
        target: call.target ?? '/p/TENET.md', rules: [{ id: ruleId, text: 'Rule', enforcement: 'BLOCK' }] },
        ...(call.profile ? { config: { assessmentProfile: call.profile } } : {}) });
      const rules = [{ ruleId, outcome: { choice: 'PASS' }, gates: [call.gate ?? gate] }];
      const stage = call.stage ?? 'decision';
      if (stage === 'decision') {
        sink('assessment', { assessment: { model: 'offline', rules } });
        sink('decision', { decision: 'BLOCK', reason: 'insufficient-evidence', contributions: rules });
      } else {
        sink(stage, { valid: true, assessment: { model: 'offline', rules } });
      }
      await writer.settle();
    }
    await writer.complete();
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

const scenarios: { name: string; calls: Call[]; first: number; last: number }[] = [
  { name: 'single decision', calls: [{ id: 'one', begin: 1000, occurrence: 5000 }], first: 5000, last: 5000 },
  { name: 'multiple decisions in a different order from call starts', calls: [
    { id: 'one', begin: 1000, occurrence: 9000 },
    { id: 'two', begin: 2000, occurrence: 5000 },
    { id: 'three', begin: 3000, occurrence: 7000 },
  ], first: 5000, last: 9000 },
  { name: 'historical assessment without a decision', calls: [
    { id: 'one', begin: 1000, occurrence: 5000, stage: 'assessment' },
  ], first: 5000, last: 5000 },
  { name: 'historical validation without a decision or assessment', calls: [
    { id: 'one', begin: 1000, occurrence: 5000, stage: 'validation' },
  ], first: 5000, last: 5000 },
];
for (const scenario of scenarios) {
  test(`uncertainty range uses recorded occurrences for ${scenario.name}`, () => fixture(scenario.calls, async root => {
    let reads = 0;
    const index = new ArchiveIndex(root, async (root, file) => { reads++; return readPrivateFile(root, file); });
    await index.refresh();
    const coldReads = reads;
    const key = sessionKey('s');
    const grouped = index.uncertaintyGroups(key);
    const rows = index.invocations(key).items;
    assert.deepEqual(grouped, { items: [{
      id: sessionKey(JSON.stringify([JSON.stringify(['/p/TENET.md', 'digest', '/p/TENET.md']), 'r', 'legacy (historical)', gate])),
      rulePreview: { value: 'Rule', shortened: false },
      policyIdentity: JSON.stringify(['/p/TENET.md', 'digest', '/p/TENET.md']),
      profile: 'legacy (historical)', ruleId: 'r', gate, count: scenario.calls.length,
      first: scenario.first, last: scenario.last, omitted: 0,
      invocations: grouped.items[0]!.invocations,
    }], omittedGroups: 0 });
    assert.deepEqual(new Set(grouped.items[0]!.invocations.map(ref => JSON.stringify(ref))),
      new Set(scenario.calls.map(call => JSON.stringify({
        id: rows.find(row => row.callId === call.id)!.id, callId: call.id, timestamp: call.begin,
        actionPreview: { key: null, value: null, shortened: false },
      }))));
    assert.equal(index.sessions().items[0]!.categoryCounts.uncertainty, scenario.calls.length);
    assert.equal(reads, coldReads, 'groups and call summaries do not hydrate private detail');
    const server = await startInspector({ directory: root });
    try {
      const response = await fetch(`${server.origin}/api/sessions/${key}/groups`);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).groups, grouped);
      for (const ref of grouped.items[0]!.invocations) {
        const detail = await index.detail(key, ref.id);
        assert.equal(detail.records[0]!.callId, ref.callId);
        assert.equal(detail.records[0]!.timestamp, ref.timestamp);
        const missing = rows.find(row => row.id === ref.id)!.missing;
        if (scenario.calls[0]!.stage) assert.ok(missing.includes('decision'));
        if (scenario.calls[0]!.stage === 'validation') assert.ok(missing.includes('assessment'));
        assert.equal((await fetch(`${server.origin}/api/sessions/${key}/invocations/${ref.id}`)).status, 200);
      }
    } finally { await server.close(); }
  }));
}

test('occurrence correction preserves every grouping identity', () => fixture([
  { id: 'base', begin: 1000, occurrence: 5000 },
  { id: 'source', begin: 1000, occurrence: 5000, source: '/other/TENET.md' },
  { id: 'digest', begin: 1000, occurrence: 5000, digest: 'other' },
  { id: 'target', begin: 1000, occurrence: 5000, target: '/other/TENET.md' },
  { id: 'profile', begin: 1000, occurrence: 5000, profile: 'candidate' },
  { id: 'rule', begin: 1000, occurrence: 5000, ruleId: 'other' },
  { id: 'gate', begin: 1000, occurrence: 5000, gate: 'applicability-unresolved' },
], async root => {
  const index = new ArchiveIndex(root); await index.refresh();
  const groups = index.uncertaintyGroups(sessionKey('s'));
  assert.equal(groups.items.length, 7);
  assert.equal(groups.omittedGroups, 0);
  assert.equal(new Set(groups.items.map(g => JSON.stringify([g.policyIdentity, g.profile, g.ruleId, g.gate]))).size, 7);
  for (const group of groups.items) {
    assert.equal(group.count, 1);
    assert.equal(group.first, 5000);
    assert.equal(group.last, 5000);
    assert.equal(group.invocations[0]!.timestamp, 1000);
  }
}));

test('reader and API retain group and reference overflow while ranging over all occurrences', () => fixture([
  ...Array.from({ length: 101 }, (_, n) => ({ id: `repeated-${n}`, begin: 1000 + n, occurrence: 9000 + n })),
  ...Array.from({ length: 100 }, (_, n) => ({ id: `other-${n}`, begin: 2000 + n, occurrence: 6000 + n, digest: `digest-${n}` })),
], async root => {
  let reads = 0;
  const index = new ArchiveIndex(root, async (root, file) => { reads++; return readPrivateFile(root, file); });
  do { await index.refresh(); } while (index.indexing);
  const coldReads = reads;
  const key = sessionKey('s');
  const grouped = index.uncertaintyGroups(key);
  assert.equal(grouped.items.length, 100);
  assert.equal(grouped.omittedGroups, 1);
  assert.equal(index.sessions().items[0]!.categoryCounts.uncertainty, 201);
  const repeated = grouped.items.find(g => g.count === 101)!;
  assert.equal(repeated.first, 9000);
  assert.equal(repeated.last, 9100);
  assert.equal(repeated.invocations.length, 100);
  assert.equal(repeated.omitted, 1);
  assert.equal(new Set(repeated.invocations.map(ref => ref.id)).size, 100);
  for (const ref of repeated.invocations) {
    const n = Number(ref.callId.slice('repeated-'.length));
    assert.equal(ref.id, sessionKey(`repeated-${n}`));
    assert.equal(ref.timestamp, 1000 + n);
  }
  assert.equal(reads, coldReads);
  const server = await startInspector({ directory: root });
  try {
    let response: any;
    for (let n = 0; n < 4; n++) {
      response = await (await fetch(`${server.origin}/api/sessions/${key}/groups`)).json();
      if (!response.indexing) break;
    }
    assert.equal(response.indexing, false);
    assert.deepEqual(response.groups, grouped);
  } finally { await server.close(); }
}));
