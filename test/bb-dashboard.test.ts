import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { reduceDashboardContribution, type RuleObservation, type RetainedRule } from '../src/inspector/bb-dashboard.js';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ruleRecording, refreshRules } from './session-rules-fixture.js';
import { dashboardHost } from '../bb-plugin-tenet-status/dashboard-host.js';
import { dashboardHostMethods } from '../bb-plugin-tenet-status/dashboard-contract.js';
import { ArchiveWriter } from '../src/recording/archive.js';
import { writeStageFile } from '../src/recording/files.js';
import { dashboardHandlers } from '../bb-plugin-tenet-status/dashboard.js';

const thread = 'thr_fixture00001', other = 'thr_fixture00002';
async function fixture(run: (root: string, writer: FixtureArchiveWriter) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-dashboard-')));
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  try { await run(root, writer); } finally { await writer.close(); await rm(root, { recursive: true, force: true }); }
}
function seed(writer: FixtureArchiveWriter, id: string, options: { thread?: string; host?: string; mutate?: (data: any) => void } = {}) {
  const data = ruleRecording({ outcome: 'FAIL', rules: 2 }); options.mutate?.(data);
  const sink = writer.bindHistorical({ sessionId: 'shared-native', invocationId: id, callId: id, toolName: 'edit',
    cwd: '/RAW-SENTINEL', mode: 'observe', host: options.host ?? 'pi', contextId: 'main', bbThreadId: options.thread ?? thread }, 4);
  for (const [stage, value] of Object.entries(data)) if (value !== undefined) sink(stage as any, value);
  return sink;
}
async function capture(root: string, threads = [thread]) {
  const host = dashboardHost(), contributions: RuleObservation[] = [];
  let invocations = 0;
  try {
    let chunk = await host.readDashboard({ kind: 'start', threads, qualification: 'a'.repeat(64), recordingDirectory: root });
    contributions.push(...chunk.contributions); invocations += chunk.invocations;
    for (let i = 0; chunk.next && i < 20000; i++) {
      chunk = await host.readDashboard({ kind: 'advance', token: chunk.next });
      contributions.push(...chunk.contributions); invocations += chunk.invocations;
    }
    assert.equal(chunk.next, null);
    return { scan: { reasons: new Set(chunk.reasons) }, contributions, invocations };
  } finally { await host.dispose(); }
}
test('project public summary merges exact wording across policies into literal 90/10 rates with one failure', () => fixture(async (root, writer) => {
  for (let n = 0; n < 10; n++) { seed(writer, `mixed-${n}`, { mutate: data => {
    Object.assign(data, ruleRecording({ outcome: n === 9 ? 'FAIL' : 'PASS', version: `branch-${n}` }));
    data.begin.policy.rules[0].id = `changed-${n}`;
    data.assessment.assessment.rules[0].ruleId = `changed-${n}`;
    data.decision.contributions[0].ruleId = `changed-${n}`;
    data.begin.policy.rules[0].text = 'Ask before publishing.';
  } }); await writer.settle(); }
  seed(writer, 'pass-only', { mutate: data => { Object.assign(data, ruleRecording({ outcome: 'PASS' })); data.begin.policy.rules[0].text = 'Keep credentials private.'; } });
  seed(writer, 'unchecked', { mutate: data => {
    Object.assign(data, ruleRecording()); data.begin.policy.rules[0].text = 'Run offline tests.';
    delete data.assessment; delete data.validation;
  } });
  await writer.settle();
  for (const outcome of ['UNKNOWN', 'NOT_APPLICABLE', 'APPROVAL_REQUIRED']) seed(writer, outcome, { mutate: data => {
    Object.assign(data, ruleRecording({ outcome, profile: 'applicability-v1', question: 'policy-rules-v6-applicability' }));
    data.begin.policy.rules[0].text = 'Ask before publishing.';
  } });
  seed(writer, 'invalid', { mutate: data => {
    Object.assign(data, ruleRecording({ outcome: 'PASS' })); data.begin.policy.rules[0].text = 'Ask before publishing.'; data.validation.valid = false;
  } });
  seed(writer, 'pending', { mutate: data => {
    Object.assign(data, ruleRecording()); data.begin.policy.rules[0].text = 'Ask before publishing.';
    delete data.assessment; delete data.validation; data['assessment-status'] = { status: 'pending' };
  } });
  seed(writer, 'foreign', { thread: other }); seed(writer, 'not-pi', { host: 'sdk' });
  await writer.complete();
  const host = dashboardHost();
  const projectId = 'proj_fixture0001', hostId = 'host_fixture0001';
  const sdk: any = {
    projects: { get: async () => ({ id: projectId, name: 'Fixture project' }) },
    threads: { list: async (args: any) => args.archived ? [] : [{ id: thread, projectId, providerId: 'pi' }],
      get: async () => ({ id: thread, projectId, providerId: 'pi', environmentId: 'env_fixture0001' }) },
    environments: { get: async () => ({ id: 'env_fixture0001', hostId }) },
  };
  try {
    const owner = dashboardHandlers(sdk, async () => JSON.stringify({ [hostId]: root }), { read: request => host.readDashboard(request), stop: token => host.stopDashboard({ token }) });
    let page = await owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
    for (let n = 0; page.next && n < 100; n++) page = await owner.dashboard({ kind: 'advance', token: page.next });
    assert.equal(page.state, 'finished');
    const mixed = page.rows.find(r => r.preview === 'Ask before publishing.')!;
    assert.deepEqual([mixed.passed, mixed.failed, mixed.unscored, mixed.passing, mixed.failing], [9, 1, 5, 90, 10]);
    const failures = await owner.dashboardContributors({ token: page.run, expectedRevision: page.revision, rule: mixed.key });
    assert.equal(failures.items.length, 1); assert.equal(failures.items[0]!.threadId, thread);
    assert.equal(page.rows.find(r => r.preview === 'Keep credentials private.')!.passing, 100);
    assert.deepEqual(page.rows.filter(r => r.preview === 'Run offline tests.').map(r => [r.passed, r.failed, r.unscored, r.passing, r.failing]), [[0, 0, 1, null, null]]);
    assert.equal(JSON.stringify(page).includes('RAW-SENTINEL'), false);
  } finally { await host.dispose(); }
}));
test('metadata-only projection uses full wording, collapses duplicate declarations and replays without inflating observations', () => fixture(async (root, writer) => {
  seed(writer, 'duplicates');
  seed(writer, 'long-a', { mutate: data => { data.begin.policy.rules[0].text = 'x'.repeat(1024) + 'a'; } });
  seed(writer, 'long-b', { mutate: data => { data.begin.policy.rules[0].text = 'x'.repeat(1024) + 'b'; } });
  seed(writer, 'foreign', { thread: other }); seed(writer, 'not-pi', { host: 'sdk' });
  await writer.complete();
  const index = new ArchiveIndex(root);
  try {
    await refreshRules(index); const result = await capture(root);
    assert.equal(result.invocations, 3);
    const rows = new Map<string, RetainedRule>();
    for (const c of [...result.contributions, ...result.contributions]) rows.set(c.key, reduceDashboardContribution(rows.get(c.key), c));
    const owners = [...rows.values()].filter(r => !r.builtin);
    assert.equal(owners.length, 3);
    assert.deepEqual(owners.map(r => r.failed).sort(), [1, 1, 3]);
    const long = owners.filter(row => row.preview?.startsWith('x'));
    assert.equal(long[0]!.preview, long[1]!.preview);
    assert.equal(JSON.stringify(result.contributions).includes('x'.repeat(1024)), false);
    assert.equal([...rows.values()].filter(r => r.builtin).length, 1);
    const overview = await index.threadOverview(thread, { sessionId: result.contributions[0]!.sessionId, callId: result.contributions[0]!.callId });
    assert.equal(overview.selectedId, result.contributions[0]!.callId);
  } finally { await index.close(); }
}));
test('duplicate wording uses FAIL precedence, all-PASS requirement, owner/integrity separation and isolated missing wording', () => fixture(async (root, writer) => {
  for (const [id, outcomes] of [['all-pass', ['PASS', 'PASS']], ['mixed-fail', ['PASS', 'FAIL']], ['mixed-unknown', ['PASS', 'UNKNOWN']]] as const) {
    seed(writer, id, { mutate: data => {
      data.assessment.assessment.rules[0].outcome.choice = outcomes[0];
      data.assessment.assessment.rules[0].outcome.probabilities = { PASS: 1, FAIL: 0, UNKNOWN: 0, APPROVAL_REQUIRED: 0 };
      data.assessment.assessment.rules[1].outcome.choice = outcomes[1];
      data.assessment.assessment.rules[1].outcome.probabilities = { PASS: Number(outcomes[1] === 'PASS'), FAIL: Number(outcomes[1] === 'FAIL'), UNKNOWN: Number(outcomes[1] === 'UNKNOWN'), APPROVAL_REQUIRED: 0 };
      data.begin.integrity.text = data.begin.policy.rules[0].text;
    } }); await writer.settle();
  }
  for (const id of ['missing-one', 'missing-two']) seed(writer, id, { mutate: data => { delete data.begin.policy.rules[0].text; delete data.begin.policy.rules[1].text; } });
  await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await refreshRules(index); const result = await capture(root);
    const rows = new Map<string, RetainedRule>();
    for (const observation of result.contributions) rows.set(observation.key, reduceDashboardContribution(rows.get(observation.key), observation));
    const owner = [...rows.values()].find(row => !row.builtin && row.preview !== null)!;
    assert.deepEqual([owner.passed, owner.failed, owner.unscored, owner.passing, owner.failing], [1, 1, 1, 50, 50]);
    assert.equal(owner.contributions.filter(c => c.state === 'failed').length, 1);
    assert.equal([...rows.values()].filter(row => !row.builtin && row.preview === null).length, 4);
    assert.equal([...rows.values()].find(row => row.builtin && row.preview === owner.preview)!.passed, 3);
  } finally { await index.close(); }
}));
test('oversized invocation is omitted entirely while a fresh refresh observes new invocations', () => fixture(async (root, writer) => {
  const sink = seed(writer, 'oversized');
  for (let i = 0; i < 257; i++) { sink('decision', { decision: 'BLOCK' }); await writer.settle(); }
  await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await refreshRules(index);
    const result = await capture(root); assert.deepEqual(result.contributions, []); assert.ok(result.scan.reasons.has('oversized-invocation'));
    const later = new FixtureArchiveWriter({ enabled: true, directory: root });
    try { seed(later, 'new-invocation'); await later.complete(); } finally { await later.close(); }
    assert.equal((await capture(root)).invocations, 1);
  } finally { await index.close(); }
}));
test('host public chunks are strict, bounded, concurrent-replay safe and omit raw fields', () => fixture(async (root, writer) => {
  seed(writer, 'one'); await writer.complete();
  const host = dashboardHost();
  try {
    let chunk = dashboardHostMethods.readDashboard.output.parse(await host.readDashboard({ kind: 'start', threads: [thread], qualification: 'a'.repeat(64), recordingDirectory: root }));
    const contributions: RuleObservation[] = [];
    for (let n = 0; chunk.next && n < 50; n++) {
      const request = { kind: 'advance' as const, token: chunk.next };
      const [a, b] = await Promise.all([host.readDashboard(request), host.readDashboard(request)]);
      assert.deepEqual(a, b); chunk = dashboardHostMethods.readDashboard.output.parse(a); contributions.push(...chunk.contributions);
    }
    assert.equal(chunk.state, 'finished'); assert.equal(contributions.length, 2);
    assert.equal(JSON.stringify(contributions).includes('RAW-SENTINEL'), false);
    assert.equal((await host.readDashboard({ kind: 'advance', token: 'expired' })).state, 'restart-required');
    assert.equal((await host.readDashboard({ kind: 'start', threads: [thread], qualification: 'a'.repeat(64), recordingDirectory: join(root, 'missing') })).state, 'unavailable');
    assert.equal(dashboardHostMethods.readDashboard.input.safeParse({ kind: 'start', threads: [thread], qualification: 'a'.repeat(64), raw: true }).success, false);
    assert.equal(dashboardHostMethods.readDashboard.output.safeParse({ ...chunk, raw: 'secret' }).success, false);
    assert.deepEqual(Object.keys(contributions[0]!).sort(), ['builtin', 'callId', 'key', 'preview', 'sessionId', 'state', 'threadId', 'timestamp', 'toolName']);
  } finally { await host.dispose(); }
}));

test('integrity FAIL counts; gated PASS stays passing; incomplete, invalid and truncated observations never score', () => fixture(async (root, writer) => {
  seed(writer, 'integrity-only', { mutate: data => {
    const source = ruleRecording({ outcome: 'PASS', rules: 2 }); data.assessment = source.assessment;
    data.assessment.assessment.rules.at(-1).outcome = { choice: 'FAIL', probabilities: { PASS: 0, FAIL: 1, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } };
  } });
  seed(writer, 'uncertainty-only', { mutate: data => {
    data.assessment = ruleRecording({ outcome: 'PASS', rules: 2 }).assessment;
    data.decision.contributions.forEach((c: any) => { c.gates = ['evidence-insufficient']; });
    data.decision.decision = 'BLOCK';
  } });
  seed(writer, 'incomplete', { mutate: data => { delete data.validation; } });
  seed(writer, 'invalid-member', { mutate: data => { data.assessment.assessment.rules.push({ ruleId: 'foreign' }); } });
  seed(writer, 'truncated', { mutate: data => { Object.assign(data, ruleRecording({ outcome: 'FAIL', rules: 65 })); } });
  await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await refreshRules(index); const result = await capture(root);
    const integrity = result.contributions.filter(c => c.builtin);
    assert.deepEqual(integrity.map(c => c.state).sort(), ['failed', 'passed', 'unscored', 'unscored']);
    assert.equal(result.contributions.filter(c => !c.builtin && c.state === 'passed').length, 2);
    assert.ok(result.scan.reasons.has('oversized-invocation'));
  } finally { await index.close(); }
}));

test('a real persistence failure emits writer health that reaches project host coverage', () => fixture(async (root, writer) => {
  seed(writer, 'linked'); await writer.complete();
  let writes = 0;
  const lossy = new ArchiveWriter({ enabled: true, directory: root }, undefined, undefined, async (...args) => {
    if (++writes === 1) throw Error('synthetic persistence failure');
    await writeStageFile(...args);
  });
  const sink = lossy.bind({ sessionId: 'foreign', invocationId: 'foreign', callId: 'foreign', toolName: 'edit', cwd: '/synthetic', mode: 'observe', host: 'sdk', contextId: 'main', bbThreadId: other });
  sink('begin', {});
  assert.equal(await lossy.close(), true); assert.equal(lossy.health().failed, 1);
  const host = dashboardHost();
  try {
    let chunk = await host.readDashboard({ kind: 'start', threads: [thread], qualification: 'a'.repeat(64), recordingDirectory: root });
    const observations: RuleObservation[] = [];
    for (let n = 0; chunk.next && n < 100; n++) { chunk = await host.readDashboard({ kind: 'advance', token: chunk.next }); observations.push(...chunk.contributions); }
    assert.equal(chunk.state, 'finished'); assert.deepEqual(chunk.reasons, ['writer-loss']);
    assert.deepEqual(observations.map(o => [o.builtin, o.state]).sort(), [[false, 'failed'], [true, 'passed']]);
  } finally { await lossy.close(); await host.dispose(); }
}));
for (const loss of ['failed', 'dropped', 'drainTimeouts', 'recovered'] as const)
  test(`archive latest-writer ${loss} health reaches host and owner coverage without changing exact-thread counts`, () => fixture(async (root, writer) => {
    seed(writer, 'linked');
    const health = seed(writer, 'foreign', { thread: other, host: 'sdk' });
    const counters = { scope: 'writer', failed: 0, dropped: 0, drainTimeouts: 0, pending: 0 };
    health('health', { ...counters, [loss === 'recovered' ? 'failed' : loss]: 3 });
    if (loss === 'recovered') health('health', counters);
    await writer.complete();
    const expectedReasons = loss === 'recovered' ? [] : ['writer-loss'];
    const index = new ArchiveIndex(root);
    const host = dashboardHost();
    try {
      await refreshRules(index);
      assert.deepEqual(index.threadStatus(thread).issues.filter(r => r === 'writer-loss'), expectedReasons);
      const metadata = await capture(root);
      assert.equal(metadata.invocations, 1);
      assert.deepEqual([...metadata.scan.reasons], expectedReasons);
      const hostReasons: string[][] = [];
      const projectId = 'proj_fixture0001', hostId = 'host_fixture0001';
      const sdk: any = {
        projects: { list: async () => [{ id: projectId }], get: async () => ({ id: projectId }) },
        threads: { list: async (args: any) => args.archived ? [] : [{ id: thread, projectId, providerId: 'pi' }],
          get: async () => ({ id: thread, projectId, providerId: 'pi', deletedAt: null, environmentId: 'env_fixture0001' }) },
        environments: { get: async () => ({ id: 'env_fixture0001', hostId }) },
      };
      const owner = dashboardHandlers(sdk, async () => JSON.stringify({ [hostId]: root }), { stop: token => host.stopDashboard({ token }), read: async request => {
        const chunk = dashboardHostMethods.readDashboard.output.parse(await host.readDashboard(request));
        if (request.kind !== 'check') hostReasons.push(chunk.reasons); return chunk;
      } });
      let page = await owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
      for (let n = 0; page.next && n < 100; n++) page = await owner.dashboard({ kind: 'advance', token: page.next });
      assert.equal(page.state, 'finished');
      assert.deepEqual(page.rows.map(r => [r.builtin, r.passed, r.failed, r.threads]).sort(), [[false, 0, 1, 1], [true, 1, 0, 1]]);
      assert.equal(page.coverage.invocations, 1);
      assert.deepEqual(hostReasons.at(-1), expectedReasons);
      assert.deepEqual(page.coverage.reasons, expectedReasons);
      const rechecked = await owner.dashboard({ kind: 'results', token: page.run });
      assert.deepEqual(rechecked.coverage.reasons, expectedReasons);
    } finally { await index.close(); await host.dispose(); }
  }));
