import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { recordSessionKey, recordInvocationKey } from '../src/recording/archive.js';
import { readPrivateFile } from '../src/recording/files.js';
import { startInspector } from '../src/inspector/server.js';
import { invocationView } from '../src/inspector/view.js';

const request = (args: unknown) => ({ policy: {}, questionVersion: 'recorded-only', mapping: [],
  payload: { model: 'offline', questions: {}, state: { action: { arguments: args }, policy: {}, context: {}, trajectory: {}, integrity: {} } } });
const unavailable = { key: null, value: null, shortened: false };

for (const schema of [1, 2, 3, 4] as const) test(`schema ${schema} lists bounded recorded previews without reading detail`, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-preview-')));
  try {
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    const identity = { sessionId: 'fictional', invocationId: 'one', callId: 'one', toolName: 'edit', cwd: '/fictional', mode: 'observe' as const,
      host: 'pi', contextId: 'main', ...(schema >= 3 ? { bbThreadId: 'thr_fictional1' } : {}) };
    const sink = schema === 1 ? writer.bindHistorical({ ...identity, host: undefined, contextId: undefined, bbThreadId: undefined }, 1)
      : schema === 2 ? writer.bindHistorical({ ...identity, bbThreadId: undefined }, 2) : writer.bindHistorical(identity, schema);
    const command = ' \n<script>fictional()</script>\t' + '雪😀'.repeat(200);
    sink('begin', { action: { arguments: { path: 'must-not-infer.txt' } } });
    sink('request', request({ command, path: 'ignored.txt', oldText: 'FULL-EVIDENCE-NOT-METADATA' }));
    await writer.complete();
    const address = { ...identity, schemaVersion: schema };
    const session = recordSessionKey(address), invocation = recordInvocationKey(address);
    let reads = 0;
    const index = new ArchiveIndex(root, async (root, file) => { reads++; return readPrivateFile(root, file); });
    await index.refresh();
    const rows = index.invocations(session);
    assert.deepEqual(rows.items[0]!.actionPreview, { key: 'command', value: '<script>fictional()</script> ' + '雪😀'.repeat(69), shortened: true });
    assert.equal(Buffer.byteLength(rows.items[0]!.actionPreview.value!), 512);
    assert.ok(!JSON.stringify(rows).includes('FULL-EVIDENCE-NOT-METADATA'));
    await index.refresh(); index.invocations(session); index.sessions(); index.uncertaintyGroups(session);
    assert.equal(reads, 2, 'unchanged list/group refresh has no eager detail or evidence reread');
    assert.ok(!JSON.stringify(index.threadStatus('thr_fictional1')).includes('fictional()'));
    assert.ok(!JSON.stringify(await index.threadFindings('thr_fictional1')).includes('fictional()'));
    const detail = await index.detail(session, invocation);
    assert.equal(invocationView(detail.records).evidence.action.arguments.command, command);
    assert.equal(reads, 4, 'only selected detail reads its stages');
    const app = await startInspector({ directory: root });
    try {
      const response = await fetch(`${app.origin}/api/sessions/${session}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const data: any = await response.json();
      assert.deepEqual(data.invocations[0].actionPreview, rows.items[0]!.actionPreview);
      assert.ok(!JSON.stringify(data).includes('FULL-EVIDENCE-NOT-METADATA'));
      assert.ok(!JSON.stringify(data).includes('"evidence":'));
      assert.equal(data.invocations[0].id, invocation);
    } finally { await app.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('changed and deleted requests invalidate previews without rereading other evidence', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-preview-')));
  try {
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    const identity = { sessionId: 'change', invocationId: 'one', callId: 'one', toolName: 'edit', cwd: '/fictional', mode: 'observe' as const };
    const sink = writer.bindHistorical(identity, 1);
    sink('begin', {}); await writer.settle();
    let reads = 0;
    const index = new ArchiveIndex(root, async (root, file) => { reads++; return readPrivateFile(root, file); });
    const session = recordSessionKey({ ...identity, schemaVersion: 1 });
    const preview = () => index.invocations(session).items[0]!.actionPreview;
    await index.refresh(); assert.deepEqual(preview(), unavailable);
    sink('request', request({ path: 'src/first.ts' })); await writer.complete();
    await index.refresh(); assert.equal(preview().value, 'src/first.ts'); assert.equal(reads, 2);
    const folder = join(root, session);
    const files = await readdir(folder);
    const file = files.find(file => file.includes('-000000000002-'))!;
    const record = JSON.parse(await readPrivateFile(root, join(folder, file)));
    record.data = request({ path: 'src/changed-longer.ts' });
    await writeFile(join(folder, file), JSON.stringify(record), { mode: 0o600 });
    await index.refresh(); assert.equal(preview().value, 'src/changed-longer.ts'); assert.equal(reads, 3);
    await rm(join(folder, file));
    await index.refresh(); assert.deepEqual(preview(), unavailable); assert.equal(reads, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing and malformed captured arguments stay unavailable; valid keys use recorded order', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-preview-')));
  try {
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    const cases: [unknown, unknown][] = [
      [undefined, unavailable], [null, unavailable], ['', unavailable], [[], unavailable],
      [{}, unavailable], [{ command: 42, path: false, file_path: {} }, unavailable],
      [{ command: ' \n\t', path: '', file_path: '' }, unavailable],
      [{ command: null, path: 'src/first.ts', file_path: 'ignored.ts' }, { key: 'path', value: 'src/first.ts', shortened: false }],
      [{ path: [], file_path: 'src/second.ts' }, { key: 'file_path', value: 'src/second.ts', shortened: false }],
      [{ command: 'echo\n  fictional\ttext', path: 'ignored.ts' }, { key: 'command', value: 'echo fictional text', shortened: false }],
      [{ command: 'a'.repeat(511) + '😀' }, { key: 'command', value: 'a'.repeat(511), shortened: true }],
      [{ path: '雪'.repeat(170) + 'xy' }, { key: 'path', value: '雪'.repeat(170) + 'xy', shortened: false }],
    ];
    for (const [n, [args]] of cases.entries()) {
      const sink = writer.bindHistorical({ sessionId: 'cases', invocationId: String(n), callId: String(n), toolName: 'unknown', cwd: '/fictional', mode: 'observe' }, 1);
      sink('begin', { arguments: { path: 'do-not-infer' } });
      sink('request', request(args));
      await writer.settle();
    }
    writer.bindHistorical({ sessionId: 'cases', invocationId: 'missing', callId: 'missing', toolName: 'bash', cwd: '/fictional', mode: 'observe' }, 1)('begin', {});
    await writer.complete();
    const index = new ArchiveIndex(root); await index.refresh();
    const rows = index.invocations(recordSessionKey({ schemaVersion: 1, sessionId: 'cases', invocationId: '' })).items;
    for (const [n, [, expected]] of cases.entries()) assert.deepEqual(rows.find(r => r.callId === String(n))!.actionPreview, expected);
    assert.deepEqual(rows.find(r => r.callId === 'missing')!.actionPreview, unavailable);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('private previews never enter non-empty BB status or finding projections', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-preview-')));
  try {
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    const identity = { sessionId: 'private', invocationId: 'one', callId: 'one', toolName: 'edit', cwd: '/fictional', mode: 'observe' as const,
      host: 'pi', contextId: 'main', bbThreadId: 'thr_fictional1' };
    const sink = writer.bindHistorical(identity, 4);
    const policy = { rules: [{ id: 'r', text: 'Fictional selected rule', enforcement: 'BLOCK' }, { id: 'unselected', text: 'PRIVATE-RULE-EXCERPT-ONLY', enforcement: 'WARN' }] };
    sink('begin', { policy });
    const privateRequest = request({ path: 'PRIVATE-PREVIEW-ONLY.txt', newText: 'FULL-EVIDENCE-ONLY' });
    sink('request', { ...privateRequest, payload: { ...privateRequest.payload, questions: { q: { instructions: 'PRIVATE-QUESTION-ONLY', criteria: { PASS: 'fictional' } } } }, policy });
    sink('validation', { valid: true });
    sink('assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'r', outcome: { choice: 'FAIL', probabilities: { FAIL: .99 } } }] } });
    sink('decision', { decision: 'BLOCK' }); sink('permission', { outcome: 'released' });
    await writer.complete();
    const index = new ArchiveIndex(root); await index.refresh();
    assert.equal(index.invocations(recordSessionKey({ ...identity, schemaVersion: 4 })).items[0]!.actionPreview.value, 'PRIVATE-PREVIEW-ONLY.txt');
    const status = index.threadStatus(identity.bbThreadId), findings = await index.threadFindings(identity.bbThreadId);
    assert.equal(status.failures, 1); assert.equal(findings.items.length, 1);
    for (const value of [status, findings]) {
      const json = JSON.stringify(value);
      assert.ok(!json.includes('PRIVATE-PREVIEW-ONLY'));
      assert.ok(!json.includes('FULL-EVIDENCE-ONLY'));
      assert.ok(!json.includes('PRIVATE-RULE-EXCERPT-ONLY'));
      assert.ok(!json.includes('rulePreviews'));
      assert.ok(!json.includes('actionPreview'));
      assert.ok(!json.includes('arguments'));
    }
    const overview = await index.threadOverview(identity.bbThreadId);
    const selected = await index.threadOverview(identity.bbThreadId, { sessionId: overview.sessionId!, callId: overview.selectedId! });
    for (const value of [overview, selected]) {
      const json = JSON.stringify(value);
      for (const privateField of ['PRIVATE-PREVIEW-ONLY', 'FULL-EVIDENCE-ONLY', 'rulePreviews', 'actionPreview', 'arguments', 'PRIVATE-QUESTION-ONLY']) {
        assert.ok(!json.includes(privateField), `${privateField} must not enter the BB summary`);
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
