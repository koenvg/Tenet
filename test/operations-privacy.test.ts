import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard } from 'tenet';
import { startBridge } from '../src/claude/bridge.js';
import { handleHook } from '../src/claude/hook.js';
import { ActivationStore } from '../src/runtime/activation.js';
import { OPERATIONS_DIRECTORY } from '../src/runtime/operations.js';
import { answer } from './helpers.js';
import type { Judge } from '../src/decision/contracts.js';

async function publication(root: string, state: string) {
  const folder = join(root, OPERATIONS_DIRECTORY), deadline = Date.now() + 5000;
  while (true) {
    const files = (await readdir(folder).catch(() => [] as string[])).filter(f => f.endsWith('.json'));
    assert.ok(files.length <= 1);
    if (files[0]) {
      const raw = await readFile(join(folder, files[0]), 'utf8'), doc = JSON.parse(raw);
      if (doc.state === state && (state !== 'running' || doc.requests[0]?.permission.kind === 'committed')) return { raw, doc };
    }
    assert.ok(Date.now() < deadline, `missing ${state} publication`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

for (const host of ['sdk', 'claude'] as const) test(`${host} raw Operations files exclude archive configuration and fixture credentials through suspension`, async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'ops-privacy-')));
  const sentinel = 'fixture-capture-credential-sentinel', root = join(cwd, sentinel), controlPath = join(cwd, 'control', 'state.json');
  const env = { TENET_MODE: 'enforce', TENET_RECORDING_DIR: root, TENET_CONTROL_PATH: controlPath, TYPESAFE_API_KEY: sentinel };
  await writeFile(join(cwd, 'TENET.md'), 'Rule; Keep fixture content local.');
  const judge: Judge = async request => answer(request.policy, 'PASS');
  let close: (() => Promise<unknown>) | undefined;
  try {
    let suspend: () => Promise<unknown>;
    if (host === 'sdk') {
      const guard = createGuard({ host: 'fixture', env, controlPath, judge }); close = () => guard.close();
      const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
      const call = { callId: 'call', toolName: 'fixture', input: {} };
      assert.equal((await session.beforeTool({ ...call, current: () => ({ ...call, sessionId: 'one', contextId: 'main' }) })).permission, 'released');
      suspend = () => guard.setActivation('off');
    } else {
      const directory = join(cwd, 'bridge'), bridge = await startBridge({ directory, env, judge }); close = bridge.close;
      const hook = (event: Record<string, unknown>) => handleHook(JSON.stringify({ ...event, cwd }), { directory, env, deadlineMs: 1200 });
      assert.equal(await hook({ session_id: 'one', hook_event_name: 'SessionStart' }), '{}\n');
      assert.equal(await hook({ session_id: 'one', hook_event_name: 'PreToolUse', tool_use_id: 'call', tool_name: 'fixture', tool_input: {} }), '{}\n');
      suspend = () => new ActivationStore(controlPath).write('off');
    }
    for (const state of ['running', 'suspended', 'closed']) {
      if (state === 'suspended') await suspend();
      if (state === 'closed') { assert.ok(close); await close(); close = undefined; }
      const { raw, doc } = await publication(root, state);
      assert.equal(doc.requests.length, state === 'running' ? 1 : 0);
      assert.deepEqual(Object.keys(doc.capture).sort(), ['drainTimeouts', 'dropped', 'failed']);
      assert.deepEqual(doc.capture, { failed: 0, dropped: 0, drainTimeouts: 0 });
      assert.equal(raw.includes(sentinel), false);
      assert.equal(raw.includes(root), false);
      for (const field of ['directory', 'enabled', 'written', 'pending']) assert.equal(raw.includes(`"${field}":`), false);
    }
  } finally { await close?.(); await rm(cwd, { recursive: true, force: true }); }
});
