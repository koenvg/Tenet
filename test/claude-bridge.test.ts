import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, symlink, chmod, unlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answer } from './helpers.js';
import { startBridge, exchange, readLocalState, writeLocalState, type BridgeRequest } from '../src/claude/bridge.js';
import { handleHook, parseHook, denial } from '../src/claude/hook.js';

const base = { session_id: 'native', cwd: '', hook_event_name: 'PreToolUse', tool_use_id: 'call-1', tool_name: 'mcp__demo__publish', tool_input: { target: 'local' } };
const request: BridgeRequest = { version: 1, event: 'call', sessionId: 'native', contextId: 'main', cwd: '/tmp', callId: 'call-1', toolName: 'Bash', input: {} };
async function fixture(outcome: 'PASS' | 'FAIL' | 'APPROVAL_REQUIRED', mode: 'enforce' | 'observe' = 'enforce') {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'tc-')));
  const cwd = join(dir, 'project');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(cwd);
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Never publish.');
  const env = { TENET_MODE: mode, TENET_CONTROL_PATH: join(dir, 'control.json'), TENET_RECORDING_DIR: join(dir, 'recordings') };
  const server = await startBridge({ directory: dir, env, judge: async r => {
    assert.equal(r.resolvedAction?.status, 'unsupported', 'stock Claude has no executor resolver');
    return answer(r.policy, outcome);
  } });
  const hook = (event: Record<string, unknown>) => handleHook(JSON.stringify({ ...event, cwd }), { directory: dir, env, deadlineMs: 1200 });
  return { dir, cwd, env, server, hook, close: async () => { await server.close(); await rm(dir, { recursive: true, force: true }); } };
}

test('mapping accepts built-in and MCP inputs unchanged, never reads transcript or invents metadata', () => {
  const parsed = parseHook(JSON.stringify({ ...base, cwd: '/tmp', transcript_path: '/nonexistent' }), 'PreToolUse');
  assert.deepEqual(parsed, { version: 1, event: 'call', sessionId: 'native', contextId: 'main', cwd: '/tmp', callId: 'call-1', toolName: 'mcp__demo__publish', input: { target: 'local' } });
  assert.equal(parseHook(JSON.stringify({ ...base, cwd: '/tmp', tool_name: 'Bash' }), 'PreToolUse').event, 'call');
  assert.throws(() => parseHook(JSON.stringify({ ...base, cwd: '/tmp', tool_use_id: '' }), 'PreToolUse'));
  assert.deepEqual(JSON.parse(denial('unavailable')), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'TENET unavailable for this invocation.' } });
});

test('scripted decisions deny BLOCK and ASK; ALLOW returns no override; observe never vetoes', async () => {
  for (const [outcome, mode, blocked] of [
    ['PASS', 'enforce', false], ['FAIL', 'enforce', true], ['APPROVAL_REQUIRED', 'enforce', true], ['FAIL', 'observe', false],
  ] as const) {
    const f = await fixture(outcome, mode);
    try {
      assert.equal(await f.hook({ session_id: 'native', hook_event_name: 'SessionStart' }), '{}\n');
      const result = JSON.parse(await f.hook({ ...base, tool_name: 'Bash', tool_use_id: outcome }));
      assert.equal(result.hookSpecificOutput?.permissionDecision === 'deny', blocked);
      assert.equal(result.hookSpecificOutput?.permissionDecision === 'allow', false);
      assert.equal(result.hookSpecificOutput?.updatedInput, undefined);
      assert.equal(result.hookSpecificOutput?.additionalContext, undefined);
      assert.doesNotMatch(JSON.stringify(result), /Never publish|target|local/);
    } finally { await f.close(); }
  }
});

test('stopped bridge denies eligible enforce, passes observe; trusted off and dormant bypass', async () => {
  const f = await fixture('PASS');
  try {
    await f.hook({ session_id: 'native', hook_event_name: 'SessionStart' });
    await f.server.close();
    assert.match(await f.hook(base), /"permissionDecision":"deny"/);
    assert.equal(await handleHook(JSON.stringify({ ...base, cwd: f.cwd }), { directory: f.dir, env: { ...f.env, TENET_MODE: 'observe' }, deadlineMs: 300 }), '{}\n');
    const { ActivationStore } = await import('../src/runtime/activation.js');
    await new ActivationStore(join(f.dir, 'control.json')).write('off');
    assert.equal(await f.hook(base), '{}\n');
    await unlink(join(f.dir, 'control.json'));
    await unlink(join(f.cwd, 'TENET.md'));
    assert.match(await f.hook(base), /"permissionDecision":"deny"/); // prior eligibility cannot become dormancy
    assert.equal(await f.hook({ session_id: 'fresh', hook_event_name: 'SessionStart', source: 'startup' }), '{}\n');
    assert.equal(await f.hook({ ...base, session_id: 'fresh' }), '{}\n');
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('private path, protocol, size, disconnection and restart refuse unsafe or stale work', async () => {
  const f = await fixture('PASS');
  try {
    await f.hook({ session_id: 'native', hook_event_name: 'SessionStart' });
    const start = { version: 1, event: 'start', sessionId: 'native', contextId: 'main', cwd: f.cwd } as const;
    assert.deepEqual(await exchange(f.dir, { ...start, version: 2 } as unknown as BridgeRequest, 500), { version: 1, decision: 'deny' });
    assert.deepEqual(await exchange(f.dir, { ...request, cwd: f.cwd, sessionId: 'native', callId: 'oversize', input: 'x'.repeat(200_000) }, 500), { version: 1, decision: 'deny' });
    const state = await readLocalState(f.dir, 'native');
    assert.equal(state?.eligible, true);
    await f.server.close();
    const restarted = await startBridge({ directory: f.dir, env: f.env, judge: async r => answer(r.policy) });
    try { assert.match(await f.hook(base), /"permissionDecision":"deny"/); }
    finally { await restarted.close(); }
    const other = await realpath(await mkdtemp(join(tmpdir(), 'tenet-unsafe-')));
    try {
      await symlink(other, join(f.dir, 'link'));
      await assert.rejects(startBridge({ directory: join(f.dir, 'link'), env: f.env, judge: async r => answer(r.policy) }));
      await chmod(other, 0o755);
      await assert.rejects(writeLocalState(other, 's', { cwd: f.cwd, eligible: true }));
    } finally { await rm(other, { recursive: true, force: true }); }
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('a bridge restart cannot revive a live session through another SessionStart', async () => {
  const f = await fixture('PASS');
  try {
    const start = { session_id: 'native', hook_event_name: 'SessionStart' };
    await f.hook(start);
    assert.equal(await f.hook(base), '{}\n');
    await f.server.close();
    const restarted = await startBridge({ directory: f.dir, env: f.env, judge: async r => answer(r.policy) });
    try {
      assert.match(await f.hook(base), /"permissionDecision":"deny"/);
      await f.hook({ ...start, source: 'resume' });
      assert.match(await f.hook({ ...base, tool_use_id: 'after-resume' }), /"permissionDecision":"deny"/);
      await f.hook({ ...start, source: 'startup' });
      assert.match(await f.hook({ ...base, tool_use_id: 'after-startup' }), /"permissionDecision":"deny"/);
    } finally { await restarted.close(); }
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('a bridge restart cannot resume an off-created session after control turns on', async () => {
  const f = await fixture('PASS');
  try {
    const { ActivationStore } = await import('../src/runtime/activation.js');
    const control = new ActivationStore(f.env.TENET_CONTROL_PATH);
    await control.write('off');
    await f.hook({ session_id: 'native', hook_event_name: 'SessionStart', source: 'startup' });
    assert.equal((await readLocalState(f.dir, 'native'))?.deferred, true);
    await f.server.close();
    const restarted = await startBridge({ directory: f.dir, env: f.env, judge: async r => answer(r.policy) });
    try {
      await control.write('on');
      assert.match(await f.hook(base), /"permissionDecision":"deny"/);
      await f.hook({ session_id: 'native', hook_event_name: 'SessionStart', source: 'resume' });
      assert.match(await f.hook({ ...base, tool_use_id: 'after-resume' }), /"permissionDecision":"deny"/);
    } finally { await restarted.close(); }
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('malformed and oversized hook data denies enforce without emitting untrusted text', async () => {
  const f = await fixture('PASS');
  try {
    for (const data of ['{', JSON.stringify({ ...base, cwd: f.cwd, tool_use_id: null }), 'x'.repeat(140_000)]) {
      const output = await handleHook(data, { directory: f.dir, env: f.env });
      assert.match(output, /"permissionDecision":"deny"/);
      assert.doesNotMatch(output, /target|local|xxxxx/);
    }
  } finally { await f.close(); }
});

test('the command-hook process emits one protocol response and no agent-visible diagnostics', async () => {
  const { spawn } = await import('node:child_process');
  const { resolve } = await import('node:path');
  const f = await fixture('FAIL');
  const command = (event: string, data: Record<string, unknown>) => new Promise<{ stdout: string; stderr: string; code: number | null }>((done, fail) => {
    const child = spawn(process.execPath, [resolve('src/claude/cli.ts'), 'hook', event], { env: { ...process.env, ...f.env, TENET_CLAUDE_DIR: f.dir } });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    child.stdout.on('data', (value: Buffer) => stdout.push(value));
    child.stderr.on('data', (value: Buffer) => stderr.push(value));
    child.once('error', fail);
    child.once('close', code => done({ stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(), code }));
    child.stdin.end(JSON.stringify({ ...data, cwd: f.cwd }));
  });
  try {
    assert.deepEqual(await command('SessionStart', { session_id: 'native', hook_event_name: 'SessionStart' }), { stdout: '{}\n', stderr: '', code: 0 });
    const result = await command('PreToolUse', base);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    assert.doesNotMatch(result.stdout, /target|local|Never publish/);
    await f.server.close();
    const before = Date.now();
    const unavailable = await command('PreToolUse', { ...base, tool_use_id: 'next' });
    assert.equal(JSON.parse(unavailable.stdout).hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(Date.now() - before < 5000);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('wire rejects invalid protocol and oversized frames without assessing a partial call', async () => {
  const { createConnection } = await import('node:net');
  const f = await fixture('PASS');
  try {
    const raw = (data: string) => new Promise<string>((done, fail) => {
      const socket = createConnection(join(f.dir, 'bridge.sock'));
      let text = '';
      socket.on('data', bytes => { text += bytes.toString(); });
      socket.once('end', () => done(text));
      socket.once('error', fail);
      socket.once('connect', () => socket.write(data));
    });
    const invalid = JSON.parse(await raw(JSON.stringify({ version: 99, event: 'start', sessionId: 'native', contextId: 'main', cwd: f.cwd }) + '\n'));
    assert.equal(invalid.decision, 'deny');
    const oversized = JSON.parse(await raw('x'.repeat(128 * 1024 + 1) + '\n'));
    assert.equal(oversized.decision, 'deny');
    const response = await exchange(f.dir, { version: 1, event: 'call', sessionId: 'native', contextId: 'main', cwd: f.cwd, callId: 'missing-start', toolName: 'Bash', input: {} });
    assert.equal(response.decision, 'deny');
    assert.match(await handleHook(JSON.stringify({ ...base, cwd: f.cwd }), { directory: f.dir, env: f.env }), /"permissionDecision":"deny"/);
  } finally { await f.close(); }
});

test('mode mismatch and policy disappearance cannot release an eligible call', async () => {
  const f = await fixture('PASS', 'observe');
  try {
    await f.hook({ session_id: 'native', hook_event_name: 'SessionStart' });
    const enforce = await handleHook(JSON.stringify({ ...base, cwd: f.cwd }), { directory: f.dir, env: { ...f.env, TENET_MODE: 'enforce' } });
    assert.match(enforce, /"permissionDecision":"deny"/);
    assert.equal(await f.hook(base), '{}\n');
    await writeLocalState(f.dir, 'new', { cwd: f.cwd, eligible: true });
    await unlink(join(f.cwd, 'TENET.md'));
    const start = await exchange(f.dir, { version: 1, event: 'start', sessionId: 'new', contextId: 'main', cwd: f.cwd });
    assert.equal(start.decision, 'deny');
    const pretool = await handleHook(JSON.stringify({ ...base, session_id: 'new', cwd: f.cwd }), { directory: f.dir, env: { ...f.env, TENET_MODE: 'enforce' } });
    assert.match(pretool, /"permissionDecision":"deny"/);
  } finally { await f.close(); }
});

test('invalid and delayed bridge responses deny within the hook deadline', async () => {
  const { createServer } = await import('node:net');
  const f = await fixture('PASS');
  try {
    await f.hook({ session_id: 'native', hook_event_name: 'SessionStart' });
    await f.server.close();
    for (const reply of ['garbage\n', null]) {
      const server = createServer(socket => { socket.on('data', () => { if (reply) socket.end(reply); }); });
      await new Promise<void>(done => server.listen(join(f.dir, 'bridge.sock'), done));
      await chmod(join(f.dir, 'bridge.sock'), 0o600);
      try {
        const before = Date.now();
        const output = await handleHook(JSON.stringify({ ...base, cwd: f.cwd }), { directory: f.dir, env: f.env, deadlineMs: 200 });
        assert.match(output, /"permissionDecision":"deny"/);
        assert.ok(Date.now() - before < 1200);
      } finally {
        await new Promise<void>(done => server.close(() => done()));
      }
    }
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('repeated SessionStart after policy deletion never turns an eligible session dormant', async () => {
  const f = await fixture('PASS');
  try {
    const start = { session_id: 'native', hook_event_name: 'SessionStart' };
    assert.equal(await f.hook(start), '{}\n');
    assert.equal((await readLocalState(f.dir, 'native'))?.eligible, true);
    await unlink(join(f.cwd, 'TENET.md'));
    assert.equal(await f.hook({ ...start, source: 'resume' }), '{}\n');
    assert.equal((await readLocalState(f.dir, 'native'))?.eligible, true);
    assert.match(await f.hook(base), /"permissionDecision":"deny"/);
  } finally { await f.close(); }
});

test('SessionEnd removes markers and frees bridge capacity for later sessions', async () => {
  const f = await fixture('PASS');
  try {
    for (let i = 0; i < 130; i++) {
      const session_id = `session-${i}`;
      assert.equal(await f.hook({ session_id, hook_event_name: 'SessionStart' }), '{}\n');
      assert.equal(await f.hook({ session_id, hook_event_name: 'SessionEnd' }), '{}\n');
      assert.equal(await readLocalState(f.dir, session_id), undefined);
    }
    assert.equal(await f.hook({ session_id: 'last', hook_event_name: 'SessionStart' }), '{}\n');
    assert.equal(await f.hook({ ...base, session_id: 'last' }), '{}\n');
  } finally { await f.close(); }
});
