import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { ActivationStore } from '../src/runtime/activation.js';
import { startBridge } from '../src/claude/bridge.js';
import { handleHook } from '../src/claude/hook.js';
import { answer } from './helpers.js';
import { guardHarness } from './guard-harness.js';

const run = promisify(execFile);
const entry = resolve('src/claude/cli.ts');
const shortTmp = realpath('/tmp'); // Unix socket paths have a hard byte limit on macOS/Linux.
const pretool = { session_id: 'owner', hook_event_name: 'PreToolUse', tool_use_id: 'one', tool_name: 'Bash', tool_input: { command: 'echo safe' } };
const wait = async (ready: () => boolean) => {
  const until = Date.now() + 2000;
  while (!ready()) {
    if (Date.now() > until) throw new Error('timed out waiting for assessment');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

test('owner CLI uses Pi control path even with bridge stopped; failures never report success', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'tenet-owner-')));
  const control = join(dir, 'control.json');
  const env = { ...process.env, TENET_CLAUDE_DIR: join(dir, 'claude'), TENET_CONTROL_PATH: control, TENET_MODE: 'enforce' };
  const cli = (command: string) => run(process.execPath, [entry, command], { env });
  try {
    const initial = (await cli('status')).stdout;
    assert.match(initial, /activation: on/);
    assert.match(initial, /bridge: unavailable/);
    assert.match(initial, /session eligibility: unknown/);
    assert.match(initial, /coverage: unverified/);
    assert.match(initial, /mode: enforce/);
    assert.match(initial, /capture: unknown/);
    assert.match((await cli('off')).stdout, /OFF.*other runtimes.*not acknowledged/i);
    assert.equal(new ActivationStore(control).read(), 'off');
    assert.match((await cli('off')).stdout, /OFF/);
    assert.match((await cli('status')).stdout, /activation: off/);
    assert.match((await cli('on')).stdout, /ON/);
    assert.equal(new ActivationStore(control).read(), 'on');
    assert.deepEqual(JSON.parse(await readFile(control, 'utf8')), { version: 1, activation: 'on' });
    await writeFile(control, 'corrupt', { mode: 0o600 });
    assert.match((await cli('status')).stdout, /activation: unavailable/);
    await chmod(control, 0o644);
    await assert.rejects(cli('off'), (error: any) => {
      assert.doesNotMatch(error.stdout ?? '', /OFF.*other runtimes/);
      assert.match(error.stderr ?? '', /control update failed/);
      return true;
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI off cancels bridge work in another process and suppresses new calls and capture', async () => {
  const dir = await realpath(await mkdtemp(join(await shortTmp, 'tc-')));
  const cwd = join(dir, 'project');
  await mkdir(cwd);
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Do not publish.');
  const env = { TENET_MODE: 'enforce', TENET_CONTROL_PATH: join(dir, 'control.json'), TENET_RECORDING_DIR: join(dir, 'recordings') };
  let started = false;
  let respond!: (value: any) => void;
  const reply = new Promise<any>(done => { respond = done; });
  let assessed = 0;
  let policy: Parameters<typeof answer>[0] | undefined;
  const server = await startBridge({ directory: join(dir, 'claude'), env, judge: async r => { assessed++; started = true; policy = r.policy; return reply; } });
  const hook = (event: Record<string, unknown>) => handleHook(JSON.stringify({ ...event, cwd }), { directory: join(dir, 'claude'), env, deadlineMs: 1200 });
  const cli = (command: string) => run(process.execPath, [entry, ...command.split(' ')], { env: { ...process.env, ...env, TENET_CLAUDE_DIR: join(dir, 'claude') } });
  try {
    assert.match((await cli('status')).stdout, /bridge: running/);
    assert.match((await cli('status')).stdout, /coverage: unverified/);
    await hook({ session_id: 'owner', hook_event_name: 'SessionStart', source: 'startup' });
    const active = (await cli('status')).stdout;
    assert.match(active, /session eligibility: unknown/);
    assert.match((await cli('status owner')).stdout, /session eligibility: eligible/);
    assert.match((await cli('status owner')).stdout, /policy readiness: ready/);
    const pending = hook(pretool);
    await wait(() => started);
    assert.match((await cli('off')).stdout, /OFF.*other runtimes.*not acknowledged/i);
    assert.match(await pending, /"permissionDecision":"deny"/);
    assert.equal(await hook({ ...pretool, tool_use_id: 'off-call' }), '{}\n');
    assert.equal(assessed, 1);
    respond(answer(policy!));
    await cli('on');
    assert.equal(await hook({ ...pretool, tool_use_id: 'fresh' }), '{}\n');
    assert.equal(assessed, 2);
  } finally { respond(undefined); await server.close(); await rm(dir, { recursive: true, force: true }); }
});

test('corrupt shared control prevents bridge assessments in either mode', async () => {
  for (const mode of ['enforce', 'observe'] as const) {
    const dir = await realpath(await mkdtemp(join(await shortTmp, 'tc-')));
    const cwd = join(dir, 'project');
    await mkdir(cwd);
    await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Do not publish.');
    const env = { TENET_MODE: mode, TENET_CONTROL_PATH: join(dir, 'control.json'), TENET_RECORDING: 'off' };
    let assessed = 0;
    const server = await startBridge({ directory: join(dir, 'claude'), env, judge: async r => { assessed++; return answer(r.policy); } });
    const hook = (event: Record<string, unknown>) => handleHook(JSON.stringify({ ...event, cwd }), { directory: join(dir, 'claude'), env });
    try {
      await hook({ session_id: 'owner', hook_event_name: 'SessionStart', source: 'startup' });
      await writeFile(env.TENET_CONTROL_PATH, 'broken', { mode: 0o600 });
      const response = await hook(pretool);
      assert.equal(response === '{}\n', mode === 'observe');
      assert.equal(assessed, 0);
    } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
  }
});

test('CLI changes propagate to running Pi and Pi commands change the CLI choice', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'tenet-pi-cli-')));
  const control = join(dir, 'control.json');
  const env = { ...process.env, TENET_CONTROL_PATH: control, TENET_CLAUDE_DIR: join(dir, 'claude'), TENET_MODE: 'enforce' };
  const cli = (command: string) => run(process.execPath, [entry, command], { env });
  let assessed = 0;
  const pi = await guardHarness({ controlPath: control, env: { TENET_MODE: 'enforce' }, judge: async r => { assessed++; return answer(r.policy); } });
  try {
    await pi.start();
    assert.equal(await pi.call('before'), undefined);
    assert.equal(assessed, 1);
    await cli('off');
    await wait(() => pi.statuses.some(s => s.includes('TENET OFF')));
    assert.equal(await pi.call('while-off'), undefined);
    assert.equal(assessed, 1);
    assert.equal(pi.records.some((r: any) => r.callId === 'while-off'), false);
    await pi.commands.get('tenet').handler('on', pi.ctx);
    assert.match((await cli('status')).stdout, /activation: on/);
    assert.equal(await pi.call('after'), undefined);
    assert.equal(assessed, 2);
  } finally { await pi.close(); await rm(dir, { recursive: true, force: true }); }
});

test('an eligible Claude session started while off assesses after on without another SessionStart', async () => {
  const dir = await realpath(await mkdtemp(join(await shortTmp, 'tc-')));
  const cwd = join(dir, 'project');
  await mkdir(cwd);
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Do not publish.');
  const env = { TENET_MODE: 'enforce', TENET_RECORDING: 'off', TENET_CONTROL_PATH: join(dir, 'control.json') };
  const directory = join(dir, 'claude');
  let assessed = 0;
  const server = await startBridge({ directory, env, judge: async r => { assessed++; return answer(r.policy); } });
  const hook = (event: Record<string, unknown>) => handleHook(JSON.stringify({ ...event, cwd }), { directory, env });
  const cli = (command: string) => run(process.execPath, [entry, command], { env: { ...process.env, ...env, TENET_CLAUDE_DIR: directory } });
  try {
    await cli('off');
    assert.equal(await hook({ session_id: 'owner', hook_event_name: 'SessionStart', source: 'startup' }), '{}\n');
    assert.equal(await hook(pretool), '{}\n');
    assert.equal(assessed, 0);
    await cli('on');
    assert.deepEqual(await Promise.all([hook(pretool), hook({ ...pretool, tool_use_id: 'two' })]), ['{}\n', '{}\n']);
    assert.equal(assessed, 2);
    assert.equal(await hook({ ...pretool, tool_use_id: 'three' }), '{}\n');
    assert.equal(assessed, 3);
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});

test('status uses the bridge capture setting rather than the CLI setting', async () => {
  const dir = await realpath(await mkdtemp(join(await shortTmp, 'tc-')));
  const directory = join(dir, 'claude');
  const control = join(dir, 'control.json');
  const server = await startBridge({ directory, env: { TENET_CONTROL_PATH: control, TENET_RECORDING: 'on', TENET_RECORDING_DIR: join(dir, 'records') },
    judge: async r => answer(r.policy) });
  const cli = () => run(process.execPath, [entry, 'status'], { env: { ...process.env, TENET_CLAUDE_DIR: directory, TENET_CONTROL_PATH: control, TENET_RECORDING: 'off' } });
  let stopped = false;
  try {
    assert.match((await cli()).stdout, /capture: on \(bridge configured/);
    await server.close(); stopped = true;
    assert.match((await cli()).stdout, /capture: unknown/);
  } finally { if (!stopped) await server.close(); await rm(dir, { recursive: true, force: true }); }
});

test('valid judgment after two seconds reaches the hook instead of timing out', async () => {
  const dir = await realpath(await mkdtemp(join(await shortTmp, 'tc-')));
  const cwd = join(dir, 'project');
  await mkdir(cwd);
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Do not publish.');
  const env = { ...process.env, TENET_MODE: 'enforce', TENET_RECORDING: 'off', TENET_CLAUDE_DIR: join(dir, 'claude'), TENET_CONTROL_PATH: join(dir, 'control.json') };
  const server = await startBridge({ directory: env.TENET_CLAUDE_DIR, env, judge: async r => { await new Promise(resolve => setTimeout(resolve, 2200)); return answer(r.policy); } });
  const cli = (event: string, data: Record<string, unknown>) => new Promise<string>((done, reject) => {
    const child = execFile(process.execPath, [entry, 'hook', event], { env }, (error, stdout, stderr) => {
      if (error) reject(error); else if (stderr) reject(new Error(stderr)); else done(stdout);
    });
    child.stdin?.end(JSON.stringify({ ...data, cwd }));
  });
  try {
    assert.equal(await cli('SessionStart', { session_id: 'owner', hook_event_name: 'SessionStart', source: 'startup' }), '{}\n');
    assert.equal(await cli('PreToolUse', pretool), '{}\n');
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});
