import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HistoricalArchiveWriter as ArchiveWriter } from './legacy-recording-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { sessionKey } from '../src/recording/archive.js';

test('index groups captured uncertainty by policy, profile, rule and gate while retaining call links', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-triage-')));
  try {
    const writer = new ArchiveWriter({ enabled: true, directory: root });
    for (const [id, digest, profile] of [['one', 'digest-a', 'legacy'], ['two', 'digest-a', 'legacy'],
      ['other-policy', 'digest-b', 'legacy'], ['other-profile', 'digest-a', 'candidate']] as const) {
      const sink = writer.bindHistorical({ sessionId: 'triage', invocationId: id, callId: id, toolName: 'read', cwd: '/triage', mode: 'observe' }, 1);
      sink('begin', { policy: { source: '/p/TENET.md', target: '/p/TENET.md', digest, rules: [{ id: 'rule-1', line: 1, text: 'Rule', enforcement: 'BLOCK' }] }, config: { assessmentProfile: profile } });
      sink('assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'rule-1', outcome: { choice: 'PASS' } }] } });
      sink('decision', { decision: 'BLOCK', reason: 'insufficient-evidence', contributions: [
        { ruleId: 'rule-1', contribution: 'blocking-gates', gates: ['evidence-confidence-below-threshold'] }] });
      sink('permission', { outcome: 'released' });
    }
    await writer.close();
    const index = new ArchiveIndex(root); await index.refresh();
    const groups = index.uncertaintyGroups(sessionKey('triage')).items;
    assert.equal(groups.length, 3);
    const repeated = groups.find(g => g.count === 2)!;
    assert.deepEqual(new Set(repeated.invocations.map(r => r.callId)), new Set(['one', 'two']));
    assert.ok(repeated.first <= repeated.last);
    assert.equal(index.invocations(sessionKey('triage'), { category: 'uncertainty' }).items.length, 4);
    assert.equal(index.invocations(sessionKey('triage'), { category: 'violation' }).items.length, 0);
    assert.equal(index.sessions().items[0]?.categoryCounts.uncertainty, 4);
    assert.equal(index.sessions().items[0]?.concerns, 4);
    await writeFile(join(root, sessionKey('triage'), 'new.json'), JSON.stringify({ schemaVersion: 6 }), { mode: 0o600 });
    await writeFile(join(root, sessionKey('triage'), 'bad.json'), '{', { mode: 0o600 });
    await index.refresh();
    assert.equal(index.status().unsupported, 1);
    assert.equal(index.status().newerUnsupported, 1);
    assert.equal(index.status().corrupt, 1);
    assert.equal(index.sessions().items[0]?.invocations, 4);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('validation-only assessment keeps approval in details, counts, filters and groups', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-partial-triage-')));
  try {
    const writer = new ArchiveWriter({ enabled: true, directory: root });
    const sink = writer.bindHistorical({ sessionId: 'partial', invocationId: 'one', callId: 'one', toolName: 'read', cwd: '/p', mode: 'observe' }, 1);
    sink('begin', { policy: { source: '/p/TENET.md', digest: 'digest-a', rules: [{ id: 'r', line: 1, text: 'Ask', enforcement: 'BLOCK' }] } });
    sink('validation', { valid: true, assessment: { model: 'offline', rules: [{ ruleId: 'r', outcome: { choice: 'APPROVAL_REQUIRED' } }] } });
    sink('decision', { decision: 'BLOCK', reason: 'insufficient-evidence', contributions: [{ ruleId: 'r', gates: ['evidence-confidence-below-threshold'] }] });
    await writer.close();
    const index = new ArchiveIndex(root); await index.refresh();
    const key = sessionKey('partial'), row = index.invocations(key).items[0]!;
    const detail = await index.detail(key, row.id);
    const { invocationView } = await import('../src/inspector/view.js');
    const view = invocationView(detail.records);
    assert.deepEqual(view.categories, ['uncertainty', 'approval']);
    assert.deepEqual(row.categories, view.categories);
    assert.equal(index.invocations(key, { category: 'approval' }).items.length, 1);
    assert.equal(index.sessions().items[0]?.categoryCounts.approval, 1);
    assert.equal(index.uncertaintyGroups(key).items[0]?.count, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('group endpoint is separate from paginated calls and preserves target identity', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-group-route-')));
  const { startInspector } = await import('../src/inspector/server.js');
  let server: Awaited<ReturnType<typeof startInspector>> | undefined;
  try {
    const writer = new ArchiveWriter({ enabled: true, directory: root });
    for (const target of ['/p/a/TENET.md', '/p/b/TENET.md']) {
      const sink = writer.bindHistorical({ sessionId: 'targets', invocationId: target, callId: target, toolName: 'read', cwd: '/p', mode: 'observe' }, 1);
      sink('begin', { policy: { source: '/p/TENET.md', digest: 'same', target, rules: [{ id: 'r', text: 'Rule', enforcement: 'BLOCK' }] } });
      sink('assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'r', outcome: { choice: 'PASS' } }] } });
      sink('decision', { decision: 'BLOCK', reason: 'insufficient-evidence', contributions: [{ ruleId: 'r', gates: ['evidence-confidence-below-threshold'] }] });
    }
    await writer.close();
    server = await startInspector({ directory: root });
    const path = `/api/sessions/${sessionKey('targets')}`;
    const timeline = await (await fetch(server.origin + path)).json();
    assert.equal(timeline.invocations.length, 2);
    assert.equal('groups' in timeline, false, 'ordinary navigation does not ship all group links');
    const response = await fetch(server.origin + path + '/groups');
    assert.equal(response.status, 200);
    const grouped = await response.json();
    assert.equal(grouped.groups.items.length, 2);
    assert.deepEqual(new Set(grouped.groups.items.map((g: { policyIdentity: string }) => JSON.parse(g.policyIdentity)[2])), new Set(['/p/a/TENET.md', '/p/b/TENET.md']));
    assert.equal((await fetch(server.origin + path + '/groups?category=uncertainty')).status, 400);
  } finally { await server?.close(); await rm(root, { recursive: true, force: true }); }
});
