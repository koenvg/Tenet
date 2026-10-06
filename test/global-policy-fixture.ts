import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rm, realpath, chmod, symlink, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createGuard, type GuardOptions, type OwnerEvent, type JudgeRequest, type ToolInvocation } from '../dist/sdk/index.js';
import { answer, ruleAnswer } from './helpers.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import { judgeState } from '../src/decision/judge-evidence.js';
import { policyIntegrity } from '../src/decision/policy-contract.js';
import { guardHarness } from './guard-harness.js';
import { diagnoseProject, formatDoctor } from '../src/doctor/doctor.js';
import { startBridge, readLocalState } from '../src/claude/bridge.js';
import { handleHook } from '../src/claude/hook.js';

const [scenario, selectedMode, root] = process.argv.slice(2);
const mode = selectedMode as 'observe' | 'enforce';
assert.ok(root && ['observe', 'enforce'].includes(mode));
assert.equal(homedir(), await realpath(join(root!, 'home')), 'real process HOME must be fixture data');
assert.equal(process.env.TYPESAFE_API_KEY, undefined);
globalThis.fetch = () => { throw new Error('network forbidden'); };
const global = join(homedir(), '.tenet/TENET.md');
await mkdir(join(homedir(), '.tenet'), { mode: 0o700 });
const cwd = join(root!, 'project'); await mkdir(cwd);
const project = join(cwd, 'TENET.md');
const globalText = '# global\nRule; BLOCK; evidenceThreshold=0.95; Keep private content local.';
const projectText = '# project\nRule; WARN; evidenceThreshold=0.75; Permit publishing.';
const env = { TENET_MODE: mode, TENET_RECORDING: 'off', TENET_CONTROL_PATH: join(homedir(), '.tenet/control.json') };
async function until(predicate: () => boolean) {
  for (let i = 0; i < 400 && !predicate(); i++) await new Promise(r => setTimeout(r, 5));
  assert.ok(predicate(), 'fixture checkpoint timed out');
}
function sdk(options: Partial<GuardOptions> = {}) {
  const requests: JudgeRequest[] = [], events: OwnerEvent[] = [];
  const guard = createGuard({ host: 'fixture', capabilities: ['interception', 'lifecycle-invalidation', 'trusted-approval'], env,
    judge: async r => { requests.push(r); return answer(r.policy); }, onOwnerEvent: e => events.push(e), ...options });
  const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd);
  const call = (callId: string, approve?: ToolInvocation['approve']) => { const tool = { callId, toolName: 'edit', input: { path: 'work.txt', text: 'fixture' } };
    return session.beforeTool({ ...tool, approve, current: () => ({ sessionId: 's', contextId: 'main', ...tool }) }); };
  return { guard, session, call, requests, events };
}

if (scenario === 'selection') {
  for (const kind of ['dormant', 'global-only', 'combined', 'project-only', 'override', 'absolute', 'missing', 'blank', 'invalid-global', 'broken-global'] as const) {
    await rm(global, { force: true }); await rm(project, { force: true });
    if (!['dormant', 'project-only'].includes(kind)) await writeFile(global, globalText);
    if (['combined', 'project-only', 'override', 'absolute', 'invalid-global', 'broken-global'].includes(kind)) await writeFile(project, projectText);
    await writeFile(join(cwd, 'selected.md'), 'Rule; selected project declaration');
    if (kind === 'invalid-global') await writeFile(global, 'not a policy');
    if (kind === 'broken-global') { await unlink(global); await symlink('missing', global); }
    const override = kind === 'override' ? 'selected.md' : kind === 'absolute' ? join(cwd, 'selected.md') : kind === 'missing' ? 'missing.md' : kind === 'blank' ? ' \t ' : undefined;
    const selectedEnv = { ...env, ...(override === undefined ? {} : { TENET_POLICY: override }) };
    const ready = !['dormant', 'missing', 'blank', 'invalid-global', 'broken-global'].includes(kind);
    const h = sdk({ env: selectedEnv });
    try {
      const status = await h.session.ready;
      assert.equal(status.state, kind === 'dormant' ? 'dormant' : ready ? 'ready' : 'unavailable', kind);
      assert.deepEqual(status.policy.candidates.map(c => c.role), ['global', 'project']);
      const expectedRoles = kind === 'global-only' ? ['global'] : kind === 'project-only' ? ['project'] : ['global', 'project'];
      if (ready) { assert.deepEqual(status.policy.sources.map(s => s.role), expectedRoles); assert.equal(status.policy.ruleCount, expectedRoles.length); }
      const result = await h.call(kind);
      assert.equal(result.permission, !ready && kind !== 'dormant' && mode === 'enforce' ? 'blocked' : 'released');
      if (kind === 'dormant') { assert.equal(result.bypassReason, 'dormant'); assert.equal(h.events.length, 0); }
      else if (!ready) { assert.equal(result.assessment.status, 'unavailable'); assert.equal(result.assessment.wouldDecision, undefined); assert.equal(h.requests.length, 0); }
      else { await until(() => h.requests.length === 1); assert.deepEqual(h.requests[0]!.policy.rules.map(r => r.origin.role), expectedRoles); }
      const doctor = await diagnoseProject({ projectDir: cwd, deliveryDir: resolve('.'), env: selectedEnv });
      assert.equal(doctor.policy.validation, kind === 'dormant' ? 'absent' : ready ? 'valid' : 'invalid');
      assert.deepEqual(doctor.policy.candidates.map(c => c.role), ['global', 'project']);
      if (ready) assert.deepEqual(doctor.policy.sources.map(s => s.role), expectedRoles);
      if (kind === 'invalid-global' || kind === 'broken-global') assert.equal(doctor.policy.failedRole, 'global');
      if (kind === 'missing' || kind === 'blank') assert.equal(doctor.policy.failedRole, 'project');
      assert.doesNotMatch(formatDoctor(doctor), /Keep private content|Permit publishing/);
      const pi = await guardHarness({ localPolicy: kind !== 'dormant' && kind !== 'global-only', env: selectedEnv, policy: projectText });
      try {
        // The absolute override belongs to the SDK project; relative override is session-relative.
        await writeFile(join(pi.cwd, 'selected.md'), 'Rule; selected project declaration');
        await pi.start();
        assert.equal(pi.commands.has('tenet'), kind !== 'dormant');
        const statusRecord = pi.records.find(r => r.stage === 'status');
        if (ready) assert.deepEqual(statusRecord.policy.sources.map((s: any) => s.role), expectedRoles);
        if (ready) {
          await pi.commands.get('tenet').handler('status', pi.ctx);
          const summary = pi.notifications.at(-1)!;
          for (const role of expectedRoles) assert.match(summary, new RegExp(`${role} source:.*SHA-256.*1 rules`));
          assert.doesNotMatch(summary, /Keep private content|Permit publishing/);
        }
        assert.equal((await pi.call(kind))?.block, !ready && kind !== 'dormant' && mode === 'enforce' ? true : undefined);
      } finally { await pi.close(); }
      const directory = join(root!, 'bridge');
      const server = await startBridge({ directory, env: selectedEnv, judge: async r => answer(r.policy) });
      const hook = (event: string) => handleHook(JSON.stringify({ session_id: kind, cwd, hook_event_name: event, source: 'startup', tool_use_id: 'c', tool_name: 'Edit', tool_input: {} }), { directory, env: selectedEnv });
      try {
        await hook('SessionStart');
        assert.equal((await readLocalState(directory, kind))?.eligible, kind !== 'dormant');
        assert.equal(JSON.parse(await hook('PreToolUse')).hookSpecificOutput?.permissionDecision === 'deny', !ready && kind !== 'dormant' && mode === 'enforce');
      } finally { await server.close(); }
    } finally { await h.guard.close(); }
  }
} else if (scenario === 'freshness') {
  for (const mutation of ['edit-global', 'delete-global', 'unreadable-global', 'retarget-global', 'new-global', 'new-project'] as const) {
    await rm(global, { force: true }); await rm(project, { force: true });
    if (mutation !== 'new-global') await writeFile(global, globalText);
    if (mutation !== 'new-project') await writeFile(project, projectText);
    const target = join(root!, 'same.md'); await writeFile(target, globalText);
    if (mutation === 'retarget-global') { await unlink(global); await symlink(target, global); }
    const h = sdk();
    try {
      assert.equal((await h.session.ready).state, 'ready');
      if (mutation === 'edit-global') await writeFile(global, globalText + '\nchanged');
      if (mutation === 'delete-global') await unlink(global);
      if (mutation === 'unreadable-global') await chmod(global, 0);
      if (mutation === 'retarget-global') { const other = join(root!, 'same-other.md'); await writeFile(other, globalText); await unlink(global); await symlink(other, global); }
      if (mutation === 'new-global') await writeFile(global, globalText);
      if (mutation === 'new-project') await writeFile(project, projectText);
      const result = await h.call(mutation);
      if (mode === 'observe') await until(() => h.events.some(e => e.type === 'assessment' && e.assessment.status !== 'pending'));
      assert.equal(h.requests.length, 0, 'stale source set must not be sent for assessment');
      assert.equal(result.permission, mode === 'enforce' ? 'blocked' : 'released');
      assert.equal(h.session.status().reason, 'policy-stale');
      assert.ok(!h.events.some(e => e.type === 'assessment' && e.assessment.status === 'completed'));
      await h.guard.setActivation('off'); assert.equal((await h.call('off')).bypassReason, 'off');
      await h.guard.setActivation('on'); assert.equal(h.session.status().reason, 'policy-stale');
      assert.equal((await h.call('on')).assessment.wouldDecision, undefined);
      if (mutation === 'unreadable-global') await chmod(global, 0o600);
      await h.guard.close();
      const reloaded = sdk();
      try {
        assert.equal((await reloaded.session.ready).state, 'ready');
        await reloaded.call('reload'); await until(() => reloaded.requests.length === 1);
      } finally { await reloaded.guard.close(); }
    } finally { await chmod(global, 0o600).catch(() => {}); await h.guard.close(); }
  }
}
if (scenario === 'home-mismatch') {
  await writeFile(global, globalText);
  const directory = join(root!, 'bridge');
  const otherHome = join(root!, 'other-home'); await mkdir(otherHome);
  const server = await startBridge({ directory, env, judge: async r => answer(r.policy) });
  try {
    const script = `import { handleHook } from ${JSON.stringify(resolve('src/claude/hook.ts'))};
      const env = ${JSON.stringify(env)};
      for (const event of ['SessionStart', 'PreToolUse']) console.log(await handleHook(JSON.stringify({ session_id: 'mismatch', cwd: ${JSON.stringify(cwd)}, hook_event_name: event, source: 'startup', tool_use_id: 'c', tool_name: 'Edit', tool_input: {} }), { directory: ${JSON.stringify(directory)}, env }));`;
    const { stdout } = await promisify(execFile)('bun', ['-e', script], { env: { PATH: process.env.PATH, HOME: otherHome, TMPDIR: '/tmp' }, timeout: 10000 });
    assert.equal((await readLocalState(directory, 'mismatch'))?.eligible, true, 'different owner homes cannot fabricate a dormant bridge session');
    assert.equal(stdout.includes('"permissionDecision":"deny"'), mode === 'enforce');
  } finally { await server.close(); }
}
if (scenario === 'limits') {
  for (const [g, p, reason] of [
    [Array(8).fill('Rule; same').join('\n'), Array(8).fill('Rule; same').join('\n'), undefined],
    [Array(8).fill('Rule; same').join('\n'), Array(9).fill('Rule; same').join('\n'), 'policy-rule-count-limit'],
    ['Rule; ok\n' + 'x'.repeat(32759), 'Rule; ok\n' + 'x'.repeat(32759), undefined],
    ['Rule; ok\n' + 'x'.repeat(32759), 'Rule; ok\n' + 'x'.repeat(32760), 'policy-file-limit'],
    ['Rule; ' + 'é'.repeat(2048), 'Rule; ok', undefined],
    ['Rule; ' + 'é'.repeat(2048) + 'x', 'Rule; ok', 'policy-rule-size-limit'],
    ['', 'Rule; ok', 'policy-format'], ['Rule; ok', 'Rule; ', 'policy-format'],
  ] as const) {
    await writeFile(global, g); await writeFile(project, p);
    const h = sdk();
    try {
      const status = await h.session.ready;
      assert.equal(status.state, reason ? 'unavailable' : 'ready');
      assert.equal(status.reason, reason);
      if (reason) { assert.deepEqual(status.policy.sources, []); assert.equal((await h.call('invalid')).assessment.wouldDecision, undefined); assert.equal(h.requests.length, 0); }
      else { assert.ok(status.policy.sources.every(s => s.ruleCount >= 1)); }
    } finally { await h.guard.close(); }
  }
  await writeFile(global, Array(8).fill('Rule; Same.').join('\n'));
  const h = sdk({ env: { ...env, TENET_POLICY: global } });
  try {
    const status = await h.session.ready; assert.equal(status.policy.ruleCount, 16);
    await h.call('shared-target'); await until(() => h.requests.length === 1);
    const policy = h.requests[0]!.policy;
    assert.equal(new Set(policy.rules.map(r => r.id)).size, 16);
    assert.deepEqual(policy.rules.map(r => r.origin.role), [...Array(8).fill('global'), ...Array(8).fill('project')]);
    assert.equal(policy.sources[0]!.target, policy.sources[1]!.target);
  } finally { await h.guard.close(); }
}
if (scenario === 'conflicts') {
  await writeFile(global, globalText); await writeFile(project, projectText);
  for (const gate of ['prohibition', 'threshold', 'integrity', 'integrity-approval', 'unauthenticated-applicability'] as const) {
    let approvals = 0;
    const h = sdk({ judge: async r => {
      assert.deepEqual(r.policy.rules.map(rule => [rule.origin.role, rule.origin.line, rule.enforcement, rule.evidenceThreshold]), [['global', 2, 'BLOCK', .95], ['project', 2, 'WARN', .75]]);
      const integrity = policyIntegrity(r.policy);
      assert.equal(integrity.candidates.length, 2); assert.equal(integrity.targets.length, 2);
      const response = answer(r.policy);
      if (gate === 'prohibition') response.rules[0]!.outcome = answer(r.policy, 'FAIL').rules[0]!.outcome;
      if (gate === 'threshold') for (const rule of response.rules.slice(0, 2)) rule.evidence = { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .85, INSUFFICIENT: .15 } };
      if (gate.startsWith('integrity')) response.rules[response.rules.length - 1] = ruleAnswer(INTEGRITY_ID, gate === 'integrity' ? 'FAIL' : 'APPROVAL_REQUIRED');
      if (gate === 'unauthenticated-applicability') response.rules[0]!.outcome = { choice: 'NOT_APPLICABLE', probabilities: { NOT_APPLICABLE: 1, PASS: 0, FAIL: 0, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } };
      return response;
    } });
    try {
      await h.session.ready;
      const result = await h.call(gate, async () => { approvals++; return 'approved'; });
      assert.equal(result.permission, mode === 'enforce' ? 'blocked' : 'released');
      if (mode === 'observe') await until(() => h.events.some(e => e.type === 'assessment' && e.assessment.status !== 'pending'));
      assert.equal(approvals, 0);
      if (gate !== 'unauthenticated-applicability' && gate !== 'integrity-approval') {
        const event = h.events.find(e => e.type === 'assessment' && e.assessment.status === 'completed');
        const assessment = mode === 'enforce' ? result.assessment : event?.type === 'assessment' ? event.assessment : undefined;
        assert.equal(assessment?.wouldDecision, 'BLOCK');
      }
    } finally { await h.guard.close(); }
  }
  // Candidate paths remain protected even when one role is absent. An alias or
  // parent operation has one integrity result, not a separate permission system.
  for (const absent of ['global', 'project']) {
    await writeFile(global, globalText); await writeFile(project, projectText);
    await unlink(absent === 'global' ? global : project);
    const h = sdk({ judge: async r => {
      const state = policyIntegrity(r.policy); assert.deepEqual(judgeState(r).integrity, state);
      assert.equal(state.candidates.filter(c => c.presence === 'absent').length, 1);
      assert.equal(state.targets.length, 1);
      const response = answer(r.policy); response.rules[response.rules.length - 1] = ruleAnswer(INTEGRITY_ID, 'FAIL'); return response;
    } });
    try { await h.session.ready; assert.equal((await h.call('create-candidate')).permission, mode === 'enforce' ? 'blocked' : 'released'); }
    finally { await h.guard.close(); }
  }
}
if (scenario === 'in-flight') {
  for (const changed of ['global', 'project', 'appearance']) {
    await writeFile(global, globalText); await writeFile(project, projectText);
    if (changed === 'appearance') await unlink(project);
    let entered = false, release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const h = sdk({ judge: async r => { entered = true; await gate; return answer(r.policy); } });
    try {
      await h.session.ready; const pending = h.call('pending'); await until(() => entered);
      await writeFile(changed === 'global' ? global : project, 'Rule; Changed.'); release();
      const result = await pending; assert.equal(result.permission, mode === 'enforce' ? 'blocked' : 'released');
      if (mode === 'observe') await until(() => h.session.status().reason === 'policy-stale');
      assert.equal(h.session.status().reason, 'policy-stale');
      assert.ok(!h.events.some(e => e.type === 'assessment' && e.assessment.status === 'completed'));
    } finally { release(); await h.guard.close(); }
    if (mode === 'enforce') {
      let prompted = false, approved!: () => void;
      const wait = new Promise<void>(r => { approved = r; });
      await writeFile(global, globalText); await writeFile(project, projectText);
      if (changed === 'appearance') await unlink(project);
      const a = sdk({ judge: async r => answer(r.policy, 'APPROVAL_REQUIRED') });
      try {
        await a.session.ready;
        const pending = a.call('approval', async request => { prompted = true; assert.ok(await request.valid()); await wait; return 'approved'; });
        await until(() => prompted);
        await writeFile(changed === 'global' ? global : project, 'Rule; New owner rule.'); approved();
        assert.equal((await pending).permission, 'blocked'); assert.equal(a.session.status().reason, 'policy-stale');
      } finally { approved(); await a.guard.close(); }
    }
  }
  if (mode === 'enforce') {
    await writeFile(global, globalText); await writeFile(project, projectText);
    let approvals = 0;
    const h = sdk({ judge: async r => answer(r.policy, 'APPROVAL_REQUIRED') });
    try {
      await h.session.ready;
      for (const id of ['first', 'retry']) assert.equal((await h.call(id, async request => { assert.ok(await request.valid()); approvals++; return 'approved'; })).permission, 'released');
      assert.equal(approvals, 2, 'consent is invocation-local');
    } finally { await h.guard.close(); }
  }
}
if (scenario === 'dormant') {
  const h = sdk();
  try {
    assert.equal((await h.session.ready).state, 'dormant'); await writeFile(global, globalText);
    assert.equal((await h.call('not-hot-added')).bypassReason, 'dormant');
    await h.guard.setActivation('off'); await h.guard.setActivation('on');
    assert.equal((await h.call('still-dormant')).bypassReason, 'dormant'); assert.equal(h.requests.length, 0);
  } finally { await h.guard.close(); }
  const reloaded = sdk();
  try { assert.equal((await reloaded.session.ready).state, 'ready'); await reloaded.call('new-session'); await until(() => reloaded.requests.length === 1); }
  finally { await reloaded.guard.close(); }
  const missing = sdk({ judge: undefined });
  try { assert.equal((await missing.session.ready).reason, 'missing-credentials'); assert.equal((await missing.call('no-key')).assessment.status, 'unavailable'); }
  finally { await missing.guard.close(); }
}
console.log('Global policy fixture passed');
