import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dashboardHost } from '../bb-plugin-tenet-status/dashboard-host.js';
import { dashboardHandlers } from '../bb-plugin-tenet-status/dashboard.js';
import { DashboardArchiveReader } from '../src/inspector/dashboard-reader.js';
import { DashboardHistoryIndex } from '../src/inspector/dashboard-history-index.js';
import { dashboardRecordFacts } from '../src/inspector/dashboard-facts.js';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ruleRecording } from './session-rules-fixture.js';
import { readPrivateFile } from '../src/recording/files.js';

const thread = 'thr_fixture00001', qualification = 'a'.repeat(64);
async function fixture(run: (root: string, path: string) => Promise<void>, data = ruleRecording({ outcome: 'FAIL' })) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-sqlite-')));
  try {
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    try {
      const sink = writer.bindHistorical({ sessionId: 'selected', invocationId: 'one', callId: 'one', toolName: 'edit', cwd: '/synthetic', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread }, 4);
      for (const [stage, value] of Object.entries(data)) sink(stage as any, value);
      await writer.complete();
    } finally { await writer.close(); }
    const session = (await readdir(root))[0]!;
    const path = join(root, session, (await readdir(join(root, session))).find(name => name.endsWith('.json'))!);
    await run(root, path);
  } finally { await rm(root, { recursive: true, force: true }); }
}
async function collect(reader: DashboardArchiveReader) {
  const observations = [];
  let result;
  try {
    do { result = await reader.advance(); observations.push(...result.contributions); } while (!result.finished);
    return { observations, association: result.association, reasons: result.reasons };
  } finally { await reader.close(); }
}
test('SQLite warm acquisitions preserve exact observations without rereading unchanged payloads', () => fixture(async root => {
  const index = new DashboardHistoryIndex();
  let reads = 0;
  const read = async (root: string, path: string) => { reads++; return readPrivateFile(root, path); };
  try {
    const baseline = await collect(new DashboardArchiveReader(root, new Set([thread]), qualification));
    const cold = await collect(new DashboardArchiveReader(root, new Set([thread]), qualification, read, index.source(root)));
    const coldReads = reads;
    const warm = await collect(new DashboardArchiveReader(root, new Set([thread]), qualification, read, index.source(root)));
    assert.deepEqual(cold, baseline);
    assert.deepEqual(warm, baseline);
    assert.deepEqual(warm.observations.map(row => row.state).sort(), ['failed', 'passed']);
    assert.ok(coldReads > 0);
    assert.equal(reads, coldReads);
  } finally { index.close(); }
}));
test('SQLite invalidates replacements, deletions and permission changes and rebuilds after restart', () => fixture(async (root, path) => {
  const index = new DashboardHistoryIndex();
  const read = () => collect(new DashboardArchiveReader(root, new Set([thread]), qualification, readPrivateFile, index.source(root)));
  try {
    await read();
    const text = await readFile(path, 'utf8');
    await writeFile(path, text.replace('"toolName":"edit"', '"toolName":"bash"'));
    assert.deepEqual(await read(), await collect(new DashboardArchiveReader(root, new Set([thread]), qualification)));
    await chmod(path, 0o644);
    const unsafe = await read();
    assert.equal(unsafe.association, 'partial');
    assert.ok(unsafe.reasons.includes('unsafe-or-unreadable-record'));
    await chmod(path, 0o600);
    await rm(path);
    assert.deepEqual(await read(), await collect(new DashboardArchiveReader(root, new Set([thread]), qualification)));
  } finally { index.close(); }
  const rebuilt = new DashboardHistoryIndex();
  try {
    assert.deepEqual(await collect(new DashboardArchiveReader(root, new Set([thread]), qualification, readPrivateFile, rebuilt.source(root))), await collect(new DashboardArchiveReader(root, new Set([thread]), qualification)));
  } finally { rebuilt.close(); }
}));
test('new recordings extend SQLite facts without rereading unchanged recordings', () => fixture(async root => {
  const index = new DashboardHistoryIndex();
  let reads = 0;
  const read = async (root: string, path: string) => { reads++; return readPrivateFile(root, path); };
  const reader = () => new DashboardArchiveReader(root, new Set([thread]), qualification, read, index.source(root));
  try {
    const interrupted = reader();
    const first = await interrupted.advance();
    assert.deepEqual([first.finished, first.contributions], [false, []]);
    await interrupted.close();
    assert.equal((await collect(reader())).observations.length, 2);
    assert.equal(reads, 4);
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    try {
      const sink = writer.bindHistorical({ sessionId: 'new-session', invocationId: 'two', callId: 'two', toolName: 'edit', cwd: '/synthetic', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread }, 4);
      for (const [stage, value] of Object.entries(ruleRecording({ outcome: 'FAIL' }))) sink(stage as any, value);
      await writer.complete();
    } finally { await writer.close(); }
    const result = await collect(reader());
    assert.deepEqual(result.observations.map(row => row.state).sort(), ['failed', 'failed', 'passed', 'passed']);
    assert.equal(result.association, 'complete');
    assert.equal(reads, 8);
    const sessions = await readdir(root);
    assert.equal(sessions.length, 2);
    for (const session of sessions) assert.equal((await readdir(join(root, session))).length, 4);
  } finally { index.close(); }
}));

test('root eviction causes rebuilds without changing canonical observations', async () => {
  const index = new DashboardHistoryIndex();
  try {
    for (let n = 0; n < 5; n++) await fixture(async root => {
      for (let refresh = 0; refresh < 2; refresh++) {
        const result = await collect(new DashboardArchiveReader(root, new Set([thread]), qualification, readPrivateFile, index.source(root)));
        assert.deepEqual(result.observations.map(row => row.state).sort(), ['failed', 'passed']);
        assert.equal(result.association, 'complete');
      }
    });
    const { hits, misses, evictions } = index.metrics;
    assert.deepEqual({ hits, misses, evictions }, { hits: 20, misses: 20, evictions: 1 });
  } finally { index.close(); }
});

test('a killed index process leaves recordings unchanged and the next index rebuilds', () => fixture(async (root, path) => {
  const before = await readFile(path, 'utf8');
  const code = `
    import { DashboardArchiveReader } from ${JSON.stringify(new URL('../src/inspector/dashboard-reader.ts', import.meta.url).href)};
    import { DashboardHistoryIndex } from ${JSON.stringify(new URL('../src/inspector/dashboard-history-index.ts', import.meta.url).href)};
    const index = new DashboardHistoryIndex();
    const root = process.argv[1];
    const reader = new DashboardArchiveReader(root, new Set([${JSON.stringify(thread)}]), ${JSON.stringify(qualification)}, undefined, index.source(root));
    await reader.advance();
    process.stdout.write('indexed\\n');
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ['--no-env-file', '-e', code, root], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = new Promise<{ code: number | null; signal: string | null }>(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      let output = '';
      child.stdout.on('data', data => { output += data.toString(); if (output.includes('indexed\n')) resolve(); });
      child.once('error', reject);
      child.once('exit', () => reject(Error('index process exited before its checkpoint')));
      timer = setTimeout(() => reject(Error('index process checkpoint timed out')), 10000);
    });
    child.kill('SIGKILL');
    assert.deepEqual(await exit, { code: null, signal: 'SIGKILL' });
  } finally { clearTimeout(timer); child.kill('SIGKILL'); await exit; }
  const rebuilt = new DashboardHistoryIndex();
  try {
    const result = await collect(new DashboardArchiveReader(root, new Set([thread]), qualification, readPrivateFile, rebuilt.source(root)));
    assert.deepEqual(result.observations.map(row => row.state).sort(), ['failed', 'passed']);
    assert.equal(result.association, 'complete');
    assert.equal(await readFile(path, 'utf8'), before);
  } finally { rebuilt.close(); }
}));

test('SQLite page pressure cannot change successfully loaded recording facts', () => fixture(async root => {
  const index = new DashboardHistoryIndex();
  const session = (await readdir(root))[0]!, folder = join(root, session);
  let path = '';
  for (const name of await readdir(folder)) {
    const candidate = join(folder, name);
    if (JSON.parse(await readPrivateFile(root, candidate)).stage === 'assessment') path = candidate;
  }
  const facts = await dashboardRecordFacts(root, path, session, new Set([thread]));
  const source = index.source(root), prefix = `/synthetic/${Array(5).fill('s'.repeat(180)).join('/')}/`;
  try {
    for (let n = 0; n < 5000; n++) {
      const key = `${prefix}${String(n).padStart(41, '0')}`;
      assert.equal(key.length, 957);
      const result = await source(key, '1:2:1234:1234567890123456789:1234567890123456789:33152:1000:1000:1', new Set([thread]), async () => facts);
      assert.deepEqual([result.thread, result.stage?.stage, result.stage?.assessment?.rules.map(rule => rule.outcome)], [thread, 'assessment', ['FAIL', 'PASS']]);
    }
    assert.equal(index.metrics.misses, 5000);
    assert.ok(index.metrics.evictions > 0);
  } finally { index.close(); }
}));

for (const repair of ['file-permissions', 'directory-permissions', 'oversized-file']) test(`repairing rejected ${repair} invalidates retained source history`, () => fixture(async root => {
  const session = (await readdir(root))[0]!, folder = join(root, session);
  let path = '';
  for (const name of await readdir(folder)) {
    const candidate = join(folder, name);
    if (JSON.parse(await readPrivateFile(root, candidate)).stage === 'assessment') path = candidate;
  }
  const original = await readPrivateFile(root, path);
  if (repair === 'oversized-file') await writeFile(path, 'x'.repeat(4 * 1024 * 1024 + 1));
  else await chmod(repair === 'file-permissions' ? path : folder, repair === 'file-permissions' ? 0o644 : 0o755);
  const host = dashboardHost();
  const acquire = async (qualification: string) => {
    let chunk = await host.readDashboard({ kind: 'start', threads: [thread], qualification, recordingDirectory: root });
    const observations = [...chunk.contributions];
    while (chunk.next) { chunk = await host.readDashboard({ kind: 'advance', token: chunk.next }); observations.push(...chunk.contributions); }
    assert.equal(chunk.state, 'finished');
    return observations.map(row => row.state).sort();
  };
  try {
    assert.deepEqual(await acquire(qualification), repair === 'directory-permissions' ? [] : ['unscored', 'unscored']);
    assert.equal((await host.readDashboard({ kind: 'check', qualification })).state, 'finished');
    if (repair === 'oversized-file') await writeFile(path, original);
    else await chmod(repair === 'file-permissions' ? path : folder, repair === 'file-permissions' ? 0o600 : 0o700);
    assert.equal((await host.readDashboard({ kind: 'check', qualification })).state, 'restart-required');
    assert.deepEqual(await acquire('b'.repeat(64)), ['failed', 'passed']);
  } finally { await host.dispose(); }
}));

for (const options of [
  { profile: 'legacy', question: 'policy-rules-v5-resolved-action' },
  { profile: 'applicability-v1', question: 'policy-rules-v6-applicability' },
  { profile: 'applicability-v1', question: 'policy-rules-v7-evidence-selection' },
  { profile: 'applicability-v1', question: 'policy-rules-v7-ordinary-evidence' },
  { profile: 'applicability-v1', question: 'policy-rules-v8-source-set' },
  { profile: 'applicability-v1', question: 'unsupported-future-contract' },
]) test(`warm SQLite retains the recorded ${options.question} contract`, () => fixture(async root => {
  const index = new DashboardHistoryIndex();
  try {
    const expected = await collect(new DashboardArchiveReader(root, new Set([thread]), qualification));
    for (let n = 0; n < 2; n++) {
      const result = await collect(new DashboardArchiveReader(root, new Set([thread]), qualification, readPrivateFile, index.source(root)));
      assert.deepEqual(result, expected);
      assert.deepEqual(result.observations.map(row => row.state).sort(), options.question === 'unsupported-future-contract' ? ['unscored', 'unscored'] : ['failed', 'passed']);
    }
  } finally { index.close(); }
}, ruleRecording({ ...options, outcome: 'FAIL' })));

for (const operation of ['results', 'contributors', 'replay', 'stopped-advance', 'authorization-race']) test(`retained owner ${operation} checks source freshness without replacing authorization`, () => fixture(async (root, path) => {
  const host = dashboardHost();
  let accessible = true, revokeOnCheck = false;
  const projectId = 'proj_fixture0001', hostId = 'host_fixture0001';
  const owner = dashboardHandlers({
    projects: { get: async () => { if (!accessible) throw Error('revoked'); return { id: projectId }; } },
    threads: { list: async ({ archived }: any) => archived ? [] : [{ id: thread, projectId, providerId: 'pi' }],
      get: async () => ({ id: thread, projectId, providerId: 'pi', environmentId: 'env_fixture0001' }) },
    environments: { get: async () => ({ id: 'env_fixture0001', hostId }) },
  } as any, async () => JSON.stringify({ [hostId]: root }), {
    read: async input => { const chunk = await host.readDashboard(input); if (input.kind === 'check' && revokeOnCheck) accessible = false; return chunk; },
    stop: token => host.stopDashboard({ token }),
  });
  try {
    let page = await owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } }), last = '';
    while (page.next && (operation !== 'stopped-advance' || page.rows.length === 0)) { last = page.next; page = await owner.dashboard({ kind: 'advance', token: last }); }
    assert.equal(page.state, operation === 'stopped-advance' ? 'reading' : 'finished');
    if (operation === 'stopped-advance') await owner.dashboardStop({ token: page.run });
    assert.deepEqual(page.rows.map(row => [row.passed, row.failed]).sort(), [[0, 1], [1, 0]]);
    const failed = page.rows.find(row => row.failed === 1)!;
    if (operation === 'authorization-race') revokeOnCheck = true;
    else await rm(path);
    const result = operation === 'contributors'
      ? await owner.dashboardContributors({ token: page.run, rule: failed.key, expectedRevision: page.revision })
      : await owner.dashboard(operation === 'replay' ? { kind: 'advance', token: last } : operation === 'stopped-advance' ? { kind: 'advance', token: page.next! } : { kind: 'results', token: page.run });
    assert.equal(result.state, 'restart-required');
    assert.deepEqual('items' in result ? result.items : result.rows, []);
  } finally { await host.dispose(); }
}));

test('retained host results reject evidence changes after acquisition closes', () => fixture(async (root, path) => {
  const host = dashboardHost();
  try {
    let chunk = await host.readDashboard({ kind: 'start', threads: [thread], qualification, recordingDirectory: root });
    while (chunk.next) chunk = await host.readDashboard({ kind: 'advance', token: chunk.next });
    assert.equal(chunk.state, 'finished');
    assert.equal((await host.readDashboard({ kind: 'check', qualification })).state, 'finished');
    await rm(path);
    assert.equal((await host.readDashboard({ kind: 'check', qualification })).state, 'restart-required');
  } finally { await host.dispose(); }
}));
