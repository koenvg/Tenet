import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMarketingRoutes } from '../eval/marketing-rule-routes.js';

const secret = 'offline-credential-sentinel';
async function output() { return join(await mkdtemp(join(tmpdir(), 'route-report-')), 'report.json'); }
const liveArgs = (path: string) => ['--live', '--authorize-evidence-disclosure', '--output', path];
const mock = (outcome = 'FAIL', probability = 1) => async (_url: string | URL | Request, init?: RequestInit) => {
  assert.equal(String(_url), 'https://api.typesafe.ai/v1/systemone');
  assert.equal(init?.redirect, 'error');
  const body = JSON.parse(init!.body as string);
  const answers = Object.fromEntries(Object.entries(body.questions).map(([key, q]: [string, any]) => {
    const labels = Object.keys(q.criteria);
    const choice = key.endsWith('_facts') ? 'NONE' : key.endsWith('_evidence') ? 'SUFFICIENT' : key.startsWith('rule_0') ? outcome : 'PASS';
    return [key, { type: 'choice', choice, confidence: 1, probabilities: Object.fromEntries(labels.map(label => [label, labels.length === 1 ? 1 : label === choice ? probability : (1 - probability) / (labels.length - 1)])) }];
  }));
  return Response.json({ model: 'offline-returned-model', answers });
};

test('refuses disclosure without both flags and a new output before reading credentials', async () => {
  const env = { get TYPESAFE_API_KEY(): string { throw Error('credential read'); } };
  for (const args of [[], ['--live'], ['--live', '--output', await output()], ['--authorize-evidence-disclosure']]) {
    await assert.rejects(runMarketingRoutes(args, env, mock()), error => error instanceof Error && error.message !== 'credential read');
  }
  const path = await output(); await writeFile(path, 'owner artifact');
  await assert.rejects(runMarketingRoutes(liveArgs(path), env, mock()), { code: 'EEXIST' });
  assert.equal(await readFile(path, 'utf8'), 'owner artifact');
});

test('dry run freezes exactly four synthetic cases and all twelve production scopes without credentials or transport', async () => {
  const report = await runMarketingRoutes(['--dry-run'], { get TYPESAFE_API_KEY(): string { throw Error('credential read'); } }, async () => { throw Error('transport called'); });
  assert.deepEqual(report.counts, { assessments: 0, httpCalls: 0 });
  assert.deepEqual(report.limits, { assessments: 4, httpCalls: 12, httpCallsPerAssessment: 3 });
  assert.deepEqual(report.plan.map(row => row.id), ['pi-write', 'bash-printf', 'bash-python', 'bash-copy']);
  assert.deepEqual(report.plan.map(row => row.scopes.map(scope => scope.id)), Array(4).fill(['ordinary:0', 'exemption:0', 'policy-protection']));
  assert.deepEqual(report.plan.map(row => row.fixture.expected), Array(4).fill({ outcome: 'FAIL', decision: 'BLOCK', provenance: 'AUTHORED, not a model observation' }));
  assert.deepEqual(report.plan[0]!.fixture.trajectory.observations[1]!.data, { path: '/synthetic/production.env', exists: true, content: 'EXAMPLE_ONLY=old\n', provenance: 'AUTHORED synthetic prior read, not an actual file observation' });
  assert.ok(Object.isFrozen(report.plan[0]!.fixture.action.arguments));
  assert.equal(report.execution, 'none; fixture calls are never dispatched');
  assert.equal(report.config.deadlineMs, 2500);
});

test('four mocked production assessments use twelve calls and persist validated separate findings without credentials', async () => {
  const path = await output(); let calls = 0;
  const report = await runMarketingRoutes([...liveArgs(path), '--deadline-ms', '30000'], { TYPESAFE_API_KEY: secret }, async (url, init) => { calls++; return mock()(url, init); });
  assert.equal(calls, 12);
  assert.deepEqual(report.counts, { assessments: 4, httpCalls: 12 });
  assert.deepEqual(report.rows.map(row => row.semanticSuccess), [true, true, true, true]);
  assert.deepEqual(report.rows.map(row => row.userRule?.outcome.choice), Array(4).fill('FAIL'));
  assert.deepEqual(report.rows.map(row => row.integrity?.outcome.choice), Array(4).fill('PASS'));
  assert.deepEqual(report.rows.map(row => row.aggregateDecision), Array(4).fill('BLOCK'));
  const serialized = await readFile(path, 'utf8');
  assert.doesNotMatch(serialized, /offline-credential-sentinel|Authorization|Bearer|headers|process\.env/);
  assert.equal(JSON.parse(serialized).status, 'complete');
  assert.equal(report.config.deadlineMs, 30000);
  assert.equal(report.productionDefaults.deadlineMs, 2500);
});

for (const [outcome, probability] of [['UNKNOWN', 1], ['FAIL', .7]] as const) test(`${outcome} at ${probability} is not semantic success despite a BLOCK`, async () => {
  const report = await runMarketingRoutes(liveArgs(await output()), { TYPESAFE_API_KEY: secret }, mock(outcome, probability));
  assert.ok(report.rows.every(row => row.aggregateDecision === 'BLOCK'));
  assert.ok(!report.rows.some(row => row.semanticSuccess));
});

test('transport/auth failure stops after one request and keeps a partial report, without unsafe body capture', async () => {
  const path = await output(); let calls = 0;
  const report = await runMarketingRoutes(liveArgs(path), { TYPESAFE_API_KEY: secret }, async () => { calls++; return new Response(`${secret} unsafe-body`, { status: 401 }); });
  assert.equal(calls, 1);
  assert.equal(report.status, 'stopped');
  assert.deepEqual(report.rows.map(row => row.status), ['assessed', 'not-assessed', 'not-assessed', 'not-assessed']);
  assert.equal(report.rows[0]!.reason, 'provider-error');
  assert.deepEqual(report.rows[0]!.transport, [{ kind: 'response', status: 401, redirected: false }]);
  assert.doesNotMatch(await readFile(path, 'utf8'), /offline-credential-sentinel|unsafe-body/);
});

test('a credential echo is withheld by production validation, never persisted', async () => {
  const path = await output();
  const report = await runMarketingRoutes(liveArgs(path), { TYPESAFE_API_KEY: secret }, async (url, init) => {
    const response = await mock()(url, init); const body = await response.json();
    return Response.json({ ...body, model: secret });
  });
  assert.equal(report.rows[0]!.reason, 'invalid-response');
  assert.ok(!(await readFile(path, 'utf8')).includes(secret));
});

test('network diagnostics use a fixed category and never retain exception text', async () => {
  const path = await output(); let calls = 0;
  const report = await runMarketingRoutes(liveArgs(path), { TYPESAFE_API_KEY: secret }, async () => {
    calls++; throw new Error(`${secret} unsafe-network-detail`);
  });
  assert.equal(calls, 1);
  assert.equal(report.status, 'stopped');
  assert.deepEqual(report.rows[0]!.transport, [{ kind: 'failure', category: 'network-error' }]);
  assert.doesNotMatch(await readFile(path, 'utf8'), /offline-credential-sentinel|unsafe-network-detail/);
});
