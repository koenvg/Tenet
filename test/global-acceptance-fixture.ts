import assert from 'node:assert/strict';
import { mkdir, writeFile, realpath, rm, chmod, symlink, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createGuard, type GuardOptions, type OwnerEvent, type ApprovalRequest } from '../dist/sdk/index.js';
import { answer, ruleAnswer, sdkAnswers } from './helpers.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import { createJevJudge } from '../src/decision/jev.js';
import { diagnoseProject } from '../src/doctor/doctor.js';

const [scenario, selectedMode, root] = process.argv.slice(2);
const mode = selectedMode as 'observe' | 'enforce';
assert.ok(root && ['observe', 'enforce'].includes(mode));
assert.equal(homedir(), await realpath(join(root!, 'home')));
for (const key of ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TENET_POLICY']) assert.equal(process.env[key], undefined);
globalThis.fetch = async () => { throw new Error('live requests forbidden'); };
await mkdir(join(homedir(), '.tenet'), { mode: 0o700 });
const cwd = join(root!, 'project'); await mkdir(cwd);
const paths = { global: join(homedir(), '.tenet/TENET.md'), project: join(cwd, 'TENET.md') };
const text = 'Rule; BLOCK; evidenceThreshold=0.1; Permit fixture operations.';
const env = { TENET_MODE: mode, TENET_RECORDING: 'off' };
async function restore() {
  for (const path of Object.values(paths)) { await rm(path, { force: true, recursive: true }); await writeFile(path, text); }
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 400 && !predicate(); i++) await new Promise(r => setTimeout(r, 5));
  assert.ok(predicate(), 'acceptance checkpoint timed out');
}
function open(options: Partial<GuardOptions> = {}) {
  const events: OwnerEvent[] = []; let calls = 0;
  const guard = createGuard({ host: 'acceptance', capabilities: ['interception', 'lifecycle-invalidation', 'trusted-approval'],
    env, controlPath: join(homedir(), '.tenet/control.json'),
    judge: async request => { calls++; return answer(request.policy); }, onOwnerEvent: event => events.push(event), ...options });
  const identity = { sessionId: 'fixture', contextId: 'main' };
  const session = guard.openSession(identity, cwd);
  const call = (input: Record<string, string> = {}, approve?: (request: ApprovalRequest) => Promise<'approved'>) => {
    const invocation = { callId: 'fixture-call', toolName: 'fixture-operation', input };
    return session.beforeTool({ ...invocation, approve, current: () => ({ ...identity, ...invocation }) });
  };
  return { guard, session, call, events, count: () => calls };
}

if (scenario === 'invalid-sources') {
  for (const role of ['global', 'project'] as const) for (const kind of ['empty', 'malformed', 'utf8', 'unreadable', 'directory', 'broken-link', 'file-limit', 'rule-limit', 'text-limit']) {
    await restore(); const path = paths[role];
    const reason = ['unreadable', 'directory', 'broken-link'].includes(kind) ? 'policy-unavailable'
      : kind === 'file-limit' ? 'policy-file-limit' : kind === 'rule-limit' ? 'policy-rule-count-limit'
      : kind === 'text-limit' ? 'policy-rule-size-limit' : 'policy-format';
    if (kind === 'empty') await writeFile(path, '');
    if (kind === 'malformed') await writeFile(path, 'Rule;');
    if (kind === 'utf8') await writeFile(path, Buffer.from([0xff]));
    if (kind === 'unreadable') await chmod(path, 0);
    if (kind === 'directory') { await unlink(path); await mkdir(path); }
    if (kind === 'broken-link') { await unlink(path); await symlink(join(root!, 'missing'), path); }
    if (kind === 'file-limit') await writeFile(path, text + '\n' + 'x'.repeat(65536));
    if (kind === 'rule-limit') await writeFile(path, Array(17).fill('Rule; valid').join('\n'));
    if (kind === 'text-limit') await writeFile(path, 'Rule; ' + 'x'.repeat(4097));
    const h = open();
    try {
      const status = await h.session.ready;
      assert.equal(status.state, 'unavailable', `${role}/${kind}`);
      assert.equal(status.reason, reason); assert.equal(status.policy.failedRole, role);
      assert.deepEqual(status.policy.sources, []); assert.equal(status.policy.combinedDigest, null);
      const result = await h.call();
      assert.equal(result.permission, mode === 'enforce' ? 'blocked' : 'released');
      assert.equal(result.assessment.status, 'unavailable'); assert.equal(result.assessment.wouldDecision, undefined);
      assert.equal(h.count(), 0, 'no valid subset may reach the judge');
      const doctor = await diagnoseProject({ projectDir: cwd, deliveryDir: resolve('.'), env });
      assert.equal(doctor.policy.validation, 'invalid'); assert.equal(doctor.policy.reason, reason);
      assert.equal(doctor.policy.failedRole, role); assert.deepEqual(doctor.policy.sources, []);
    } finally { await chmod(path, 0o600).catch(() => {}); await h.guard.close(); }
  }
}

if (scenario === 'stale-consent') {
  for (const role of ['global', 'project'] as const) for (const mutation of ['edit', 'delete', 'unreadable', 'retarget', 'appearance']) {
    await restore(); const path = paths[role];
    if (mutation === 'appearance') await unlink(path);
    if (mutation === 'retarget') { const target = join(root!, `${role}-before.md`); await writeFile(target, text); await unlink(path); await symlink(target, path); }
    let entered = false, release!: () => void, consent: ApprovalRequest | undefined;
    const held = new Promise<void>(r => { release = r; });
    const h = open({ judge: async request => {
      if (mode === 'observe') { entered = true; await held; }
      return answer(request.policy, mode === 'observe' ? 'PASS' : 'APPROVAL_REQUIRED');
    } });
    try {
      assert.equal((await h.session.ready).state, 'ready');
      const pending = h.call({}, async request => { consent = request; entered = true; assert.ok(await request.valid()); await held; return 'approved'; });
      await until(() => entered);
      if (mutation === 'edit' || mutation === 'appearance') await writeFile(path, 'Rule; changed');
      if (mutation === 'delete') await unlink(path);
      if (mutation === 'unreadable') await chmod(path, 0);
      if (mutation === 'retarget') { const other = join(root!, `${role}-after.md`); await writeFile(other, text); await unlink(path); await symlink(other, path); }
      if (consent) assert.equal(await consent.valid(), false, 'whole-set change cancels consent before its answer');
      release(); const result = await pending;
      if (mode === 'observe') await until(() => h.session.status().reason === 'policy-stale');
      assert.equal(result.permission, mode === 'enforce' ? 'blocked' : 'released');
      assert.equal(h.session.status().reason, 'policy-stale');
      assert.ok(!h.events.some(event => event.type === 'assessment' && event.assessment.status === 'completed'));
    } finally { release(); await chmod(path, 0o600).catch(() => {}); await h.guard.close(); }
  }
}

if (scenario === 'integrity-paths') {
  await restore();
  const targets = { global: join(root!, 'global-target.md'), project: join(root!, 'project-target.md') };
  const aliases = { global: join(root!, 'global-alias.md'), project: join(root!, 'project-alias.md') };
  for (const role of ['global', 'project'] as const) {
    await writeFile(targets[role], text); await unlink(paths[role]); await symlink(targets[role], paths[role]); await symlink(targets[role], aliases[role]);
  }
  for (const absent of [undefined, 'global', 'project'] as const) {
    if (absent) await unlink(paths[absent]);
    let submitted = 0, approvals = 0;
    const h = open({ judge: createJevJudge({ apiKey: 'offline-only', fetch: async (url, init) => {
      assert.equal(new URL(String(url)).origin, 'https://api.typesafe.ai'); submitted++;
      const payload = JSON.parse(init!.body as string), integrity = payload.state.integrity;
      assert.equal(integrity.version, 'policy-integrity-v2');
      assert.deepEqual(integrity.candidates.map((c: any) => [c.role, c.source]), Object.entries(paths));
      assert.deepEqual(integrity.targets.map((t: any) => [t.role, t.target]), Object.entries(targets).filter(([role]) => role !== absent));
      assert.match(payload.questions[`rule_${integrity.targets.length}_outcome`].instructions, /every state.integrity.candidates path.*state.integrity.targets resolved target/);
      const input = payload.state.action.arguments;
      const response = { model: 'scripted-path-contract', rules: [
        ...payload.state.policy.rules.map((r: any) => ruleAnswer(r.id)), { ...ruleAnswer(INTEGRITY_ID, input.operation === 'write' ? 'FAIL' : 'PASS'),
          evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: input.operation === 'low-evidence' ? .85 : .97, INSUFFICIENT: input.operation === 'low-evidence' ? .15 : .03 } } },
      ] };
      return Response.json({ model: response.model, answers: sdkAnswers(response) });
    } }) });
    try {
      assert.equal((await h.session.ready).state, 'ready');
      // Inputs are inert. The scripted judge proves submitted path coverage and independent gates, not semantic accuracy.
      for (const role of ['global', 'project'] as const) for (const path of [paths[role], ...(role === absent ? [] : [targets[role], aliases[role]]), dirname(paths[role])]) {
        for (const operation of ['read', 'write', 'low-evidence']) {
          const call = { callId: `${role}-${path}-${operation}`, toolName: 'fixture-operation', input: { operation, path } };
          const result = await h.session.beforeTool({ ...call, approve: async () => { approvals++; return 'approved'; },
            current: () => ({ sessionId: 'fixture', contextId: 'main', ...call }) });
          assert.equal(result.permission, operation !== 'read' && mode === 'enforce' ? 'blocked' : 'released');
          if (mode === 'observe') await until(() => h.events.some(e => e.type === 'assessment' && e.callId === call.callId && e.assessment.status === 'completed'));
        }
      }
      assert.ok(submitted > 0); assert.equal(approvals, 0, 'passing user rules cannot approve integrity');
    } finally { await h.guard.close(); }
    if (absent) await symlink(targets[absent], paths[absent]);
  }
}
console.log('Whole-feature fixture passed');
