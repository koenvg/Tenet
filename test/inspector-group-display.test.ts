import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { readPrivateFile } from '../src/recording/files.js';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { recordSessionKey } from '../src/recording/archive.js';
import { startInspector } from '../src/inspector/server.js';

const sessionId = 'group-display';
const session = recordSessionKey({ schemaVersion: 1, sessionId, invocationId: '' });
const sentinel = 'PRIVATE-RULE-DISPLAY-ONLY';
async function seed(root: string, count = 4, distinct = false) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  for (let n = 0; n < count; n++) {
    const sink = writer.bindHistorical({ sessionId, invocationId: String(n), callId: String(n), toolName: 'edit', cwd: '/fictional', mode: 'observe' }, 1);
    const policy = { source: distinct ? `/fictional-${n}/TENET.md` : n === 2 ? '/different/TENET.md' : '/fictional/TENET.md', target: '/fictional/TENET.md', digest: 'same-digest', rules: Array.from({ length: 18 }, (_, i) => ({ id: `r${i}`, text: i === 0 ? sentinel + ' 雪😀'.repeat(200) : `FULL-RULE-${i}`, enforcement: 'BLOCK' })) };
    if (n === 3) policy.rules[0]!.text = '';
    sink('begin', { policy });
    sink('request', { policy, questionVersion: 'fictional', mapping: [], payload: { model: 'offline', questions: {}, state: { action: { arguments: n === 3 ? {} : { path: `PRIVATE-ACTION-${n}` } }, policy, context: {}, trajectory: { history: 'FULL-EVIDENCE-ONLY' }, integrity: {} } } });
    sink('decision', { decision: 'BLOCK', reason: 'insufficient-evidence', diagnostics: [{ ruleId: 'r0', gates: ['outcome-confidence-below-threshold'] }, { ruleId: 'r17', gates: ['evidence-confidence-below-threshold'] }] });
    await writer.settle();
  }
  await writer.complete();
}

test('private group displays are bounded, identity-based and evidence-free outside private groups', async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet-group-display-'));
  try {
    await seed(root);
    let reads = 0;
    const index = new ArchiveIndex(root, async (root, path) => { reads++; return readPrivateFile(root, path); });
    await index.refresh();
    const before = reads;
    const groups = index.uncertaintyGroups(session);
    assert.equal(groups.items.length, 4, 'two recorded policy identities and two gates stay distinct');
    const textGroups = groups.items.filter(group => group.gate === 'outcome-confidence-below-threshold');
    assert.equal(textGroups.length, 2);
    assert.equal(new Set(textGroups.map(group => group.id)).size, 2);
    assert.deepEqual(textGroups.map(group => group.count).sort(), [1, 3]);
    for (const group of textGroups) {
      assert.ok(group.rulePreview.value!.startsWith(sentinel));
      assert.ok(Buffer.byteLength(group.rulePreview.value!, 'utf8') <= 512);
      assert.equal(group.rulePreview.shortened, true);
      assert.ok(!group.rulePreview.value!.endsWith('\ud83d'));
      assert.equal(group.count, group.invocations.length + group.omitted);
      assert.ok(group.first <= group.last);
    }
    assert.ok(groups.items.filter(group => group.ruleId === 'r17').every(group => group.rulePreview.value === null), 'excerpts stop at supported policy count');
    const unavailable = textGroups.flatMap(group => group.invocations).find(ref => ref.callId === '3')!;
    assert.equal(unavailable.actionPreview.value, null);
    await index.refresh(); index.invocations(session); index.uncertaintyGroups(session);
    assert.equal(reads, before, 'unchanged group/list reads do not hydrate details or reread evidence');
    const projected = JSON.stringify(groups);
    assert.ok(!projected.includes('FULL-EVIDENCE-ONLY'));
    assert.ok(!projected.includes('FULL-RULE-17'));
    for (const projection of [index.sessions(), index.invocations(session), index.threadStatus('thr_fictional1'), await index.threadFindings('thr_fictional1')]) assert.ok(!JSON.stringify(projection).includes(sentinel));
    const app = await startInspector({ directory: root });
    try {
      const list = await (await fetch(`${app.origin}/api/sessions/${session}`)).json();
      assert.equal(list.groups, undefined);
      assert.ok(!JSON.stringify(list).includes(sentinel));
      const api = await (await fetch(`${app.origin}/api/sessions/${session}/groups`)).json();
      assert.deepEqual(api.groups, groups);
      assert.ok(!JSON.stringify(await (await fetch(`${app.origin}/api/status`)).json()).includes(sentinel));
    } finally { await app.close(); }
    const folder = join(root, session), files = await readdir(folder);
    const records = await Promise.all(files.map(async file => ({ file, record: JSON.parse(await readPrivateFile(root, join(folder, file))) })));
    const { file, record } = records.find(item => item.record.stage === 'request' && item.record.callId === '2')!;
    record.data.policy.rules[0].text = 'Changed recorded excerpt';
    await writeFile(join(folder, file), JSON.stringify(record), { mode: 0o600 });
    await index.refresh();
    assert.equal(reads, before + 1);
    assert.ok(index.uncertaintyGroups(session).items.some(group => group.rulePreview.value === 'Changed recorded excerpt'));
    await rm(join(folder, file)); await index.refresh();
    assert.equal(reads, before + 1);
    assert.ok(index.uncertaintyGroups(session).items.some(group => group.rulePreview.value?.startsWith(sentinel)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('group reference cap retains accurate counts and paginated individual access', async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet-group-cap-'));
  try {
    await seed(root, 105);
    const index = new ArchiveIndex(root);
    for (let n = 0; n < 5; n++) await index.refresh();
    const groups = index.uncertaintyGroups(session);
    const group = groups.items.find(group => group.count === 104)!;
    assert.equal(group.invocations.length, 100); assert.equal(group.omitted, 4);
    let page = index.invocations(session, { limit: 100 });
    assert.equal(page.items.length, 100); assert.ok(page.next);
    page = index.invocations(session, { limit: 100, cursor: page.next! });
    assert.equal(page.items.length, 5);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('bounded group overflow counts distinct identities without hiding paginated calls', async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet-group-overflow-'));
  try {
    await seed(root, 105, true);
    const index = new ArchiveIndex(root);
    for (let n = 0; n < 5; n++) await index.refresh();
    const groups = index.uncertaintyGroups(session);
    assert.equal(groups.items.length, 100); assert.equal(groups.omittedGroups, 110);
    assert.equal(new Set(groups.items.map(group => group.id)).size, 100);
    assert.ok(groups.items.every(group => group.count === 1 && group.omitted === 0));
    assert.ok(groups.items.some(group => group.rulePreview.value === null));
    assert.ok(index.invocations(session).next);
  } finally { await rm(root, { recursive: true, force: true }); }
});
