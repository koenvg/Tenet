import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createGuard, SDK_VERSION } from 'tenet';

assert.equal(SDK_VERSION, 'alpha-1');
const sdk = import.meta.resolve('tenet');
assert.ok(sdk.includes('tenet-relocated-') && sdk.endsWith('/dist/sdk/index.js'));
const installation = fileURLToPath(new URL('../../', sdk));
const root = await realpath(await mkdtemp(join(process.cwd(), 'exercise-')));
const archive = join(root, 'recordings');
const events = [];
let executed = 0, inspector;
const fetchHTTP = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('live evaluator forbidden'); };
const judge = async request => {
  const choice = request.action.callId === 'pass' ? 'PASS' : request.action.callId.startsWith('ask') ? 'APPROVAL_REQUIRED' : 'FAIL';
  const rule = (id, selected, integrity = false) => ({ ruleId: id,
    outcome: { choice: selected, probabilities: { PASS: +(selected === 'PASS'), APPROVAL_REQUIRED: +(selected === 'APPROVAL_REQUIRED'),
      FAIL: +(selected === 'FAIL'), UNKNOWN: 0, ...(integrity ? {} : { NOT_APPLICABLE: 0 }) } },
    evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } });
  return { profile: 'applicability-v1', model: 'offline-script',
    rules: [...request.policy.rules.map(r => rule(r.id, choice)), rule('builtin:policy-integrity', 'PASS', true)] };
};
const options = { host: 'archive-dummy', capabilities: ['interception', 'result-correlation', 'lifecycle-invalidation', 'trusted-approval'],
  controlPath: join(root, 'control.json'), judge, onOwnerEvent: e => events.push(e) };
const observe = createGuard({ ...options, env: { TENET_RECORDING_DIR: archive } });
const enforce = createGuard({ ...options, env: { TENET_MODE: 'enforce', TENET_RECORDING_DIR: archive } });
try {
  await mkdir(join(root, 'project'));
  await writeFile(join(root, 'project/TENET.md'), 'Rule; BLOCK; Ask before publishing the harmless dummy value.');
  const trial = async (guard, id, calls) => {
    const session = guard.openSession({ sessionId: id, contextId: 'main' }, join(root, 'project'));
    assert.equal((await session.ready).state, 'ready');
    for (const [callId, approved, permission] of calls) {
      const invocation = { callId, toolName: 'dummy', input: { value: 'harmless' } };
      const result = await session.beforeTool({ ...invocation, current: () => ({ sessionId: id, contextId: 'main', ...invocation }),
        approve: async request => { assert.equal(await request.valid(), true); return approved ? 'approved' : 'denied'; } });
      assert.equal(result.permission, permission);
      if (result.permission === 'released') {
        // Actual harmless executor dispatch, never inferred from the assessment label.
        const dummy = input => { assert.deepEqual(input, { value: 'harmless' }); executed++; return 'dummy-result'; };
        session.afterTool({ callId, toolName: 'dummy', content: dummy(invocation.input) });
      }
    }
    session.endTurn();
    if (id === 'observe') {
      for (let n = 0; n < 200 && !events.some(e => e.type === 'assessment' && e.assessment.wouldDecision === 'BLOCK'); n++)
        await new Promise(r => setTimeout(r, 5));
      assert.ok(events.some(e => e.type === 'assessment' && e.assessment.wouldDecision === 'BLOCK'));
    }
    assert.equal(await session.close(), true);
  };
  await trial(observe, 'observe', [['fail', false, 'released']]);
  assert.equal(executed, 1, 'observe releases despite a counterfactual BLOCK finding');
  await trial(enforce, 'enforce', [['pass', false, 'released'], ['ask-denied', false, 'blocked'], ['ask-approved', true, 'released'], ['fail', true, 'blocked']]);
  assert.equal(executed, 3, 'only PASS and approved ASK dispatch in enforce mode');
  assert.equal(await observe.close(), true); assert.equal(await enforce.close(), true);

  inspector = spawn('node', ['dist/inspector/serve-cli.js'], { cwd: installation,
    env: { ...process.env, TENET_RECORDING_DIR: archive }, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timeout = setTimeout(() => reject(new Error(`inspector readiness timed out: ${errors}`)), 10_000);
    inspector.stderr.on('data', b => { errors += b; });
    inspector.once('exit', code => { clearTimeout(timeout); reject(new Error(`inspector exited ${code}: ${errors}`)); });
    inspector.stdout.on('data', b => {
      output += b; const match = output.match(/TENET inspector: (http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  const htmlResponse = await fetchHTTP(url); assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text(); assert.ok(html.includes('<div id="app">'));
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)]; assert.ok(assets.length >= 2);
  for (const [, path] of assets) assert.equal((await fetchHTTP(new URL(path, url))).status, 200);
  const get = async path => { const response = await fetchHTTP(new URL(path, url)); assert.equal(response.status, 200); return response.json(); };
  const status = await get('/api/status'); assert.match(status.reader.build, /\/assets-/);
  const listing = await get('/api/sessions'); assert.equal(listing.sessions.length, 2);
  const details = await Promise.all(listing.sessions.map(s => get(`/api/sessions/${s.id}`)));
  const invocations = details.flatMap(d => d.invocations);
  assert.equal(invocations.length, 5);
  assert.ok(invocations.some(i => i.decision === 'BLOCK' && i.assessmentStatus === 'completed'));
  console.log(`${process.versions.bun ? 'Bun' : 'Node'} production-only SDK: findings, 3 dummy executions, enforcement and built inspector HTTP passed.`);
} finally {
  await observe.close(); await enforce.close();
  if (inspector && inspector.exitCode === null) {
    const exited = new Promise(r => inspector.once('exit', r)); inspector.kill('SIGTERM'); await exited;
  }
  globalThis.fetch = fetchHTTP;
  await rm(root, { recursive: true, force: true });
}
