import { chmod, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { readArchive } from '../src/recording/archive.js';
import { ActivationStore } from '../src/pi/activation.js';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';

for (const mode of ['observe', 'enforce'] as const) {
  test(`${mode}: no local policy leaves TENET silent and permits calls`, async () => {
    let assessments = 0;
    const h = await guardHarness({ localPolicy: false, env: { TENET_MODE: mode, TENET_RECORDING: 'on' },
      judge: async () => { assessments++; throw new Error('dormant guard submitted assessment'); } });
    try {
      await h.start();
      assert.equal(await h.call('unconfigured'), undefined);
      await h.emit('tool_result', { toolName: 'edit', toolCallId: 'unconfigured', content: [], isError: false });
      assert.equal(assessments, 0);
      assert.deepEqual(h.records, []);
      assert.deepEqual(h.statuses, []);
      assert.deepEqual(h.notifications, []);
      assert.deepEqual(h.prompts, []);
      assert.equal(h.commands.has('tenet'), false);
      assert.deepEqual((await readArchive(join(h.cwd, 'archive'))).records, []);
    } finally { await h.close(); }
    assert.deepEqual(h.statuses, [], 'shutdown is silent too');
  });
}

for (const mode of ['observe', 'enforce'] as const) {
  test(`${mode}: valid local policy activates TENET`, async () => {
    let assessments = 0;
    const h = await guardHarness({ env: { TENET_MODE: mode }, judge: async request => { assessments++; return answer(request.policy); } });
    try {
      await h.start();
      assert.ok(h.commands.has('tenet'));
      assert.equal(await h.call('local'), undefined);
      assert.equal(assessments, 1);
      assert.ok(h.records.some(r => r.stage === 'status' && r.status === 'ready'));
    } finally { await h.close(); }
  });

  for (const [name, prepare, envPolicy, reason] of [
    ['malformed local', async (h: Awaited<ReturnType<typeof guardHarness>>) => writeFile(h.file, 'not a policy'), undefined, 'policy-format'],
    ['unreadable local', async (h: Awaited<ReturnType<typeof guardHarness>>) => chmod(h.file, 0), undefined, 'policy-unavailable'],
    ['broken local link', async (h: Awaited<ReturnType<typeof guardHarness>>) => { await unlink(h.file); await symlink('missing-target', h.file); }, undefined, 'policy-unavailable'],
    ['explicit missing relative', async (h: Awaited<ReturnType<typeof guardHarness>>) => unlink(h.file), 'external.md', 'policy-unavailable'],
    ['explicit empty', async (h: Awaited<ReturnType<typeof guardHarness>>) => unlink(h.file), ' ', 'configuration'],
  ] as const) {
    test(`${mode}: ${name} stays unavailable rather than dormant`, async () => {
      const h = await guardHarness({ env: { TENET_MODE: mode, ...(envPolicy === undefined ? {} : { TENET_POLICY: envPolicy }) } });
      try {
        await prepare(h);
        await h.start();
        assert.ok(h.commands.has('tenet'));
        assert.equal(h.records.find(r => r.stage === 'status')?.reason, reason);
        assert.equal((await h.call(name))?.block, mode === 'enforce' ? true : undefined);
        assert.equal(h.records.find(r => r.stage === 'permission')?.assessmentAvailable, false);
      } finally { await chmod(h.file, 0o600).catch(() => {}); await h.close(); }
    });
  }
  test(`${mode}: explicit relative source overrides local policy`, async () => {
    const h = await guardHarness({ env: { TENET_MODE: mode, TENET_POLICY: 'external.md' } });
    try {
      await writeFile(join(h.cwd, 'external.md'), 'Rule; external rule');
      await h.start();
      assert.equal(h.records.find(r => r.stage === 'status')?.policy.source, join(h.cwd, 'external.md'));
      assert.equal(await h.call('external'), undefined);
    } finally { await h.close(); }
  });
  test(`${mode}: explicit absolute source activates a project without TENET.md`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenet-external-policy-'));
    const source = resolve(root, 'external.md');
    const h = await guardHarness({ localPolicy: false, env: { TENET_MODE: mode, TENET_POLICY: source } });
    try {
      await writeFile(source, 'Rule; external rule');
      await h.start();
      assert.equal(h.records.find(r => r.stage === 'status')?.policy.source, source);
      assert.equal(await h.call('absolute'), undefined);
      assert.ok(h.commands.has('tenet'));
    } finally { await h.close(); await rm(root, { recursive: true, force: true }); }
  });
}

for (const mode of ['observe', 'enforce'] as const) {
  test(`${mode}: policy deletion after activation is unavailable, never dormant`, async () => {
    const h = await guardHarness({ env: { TENET_MODE: mode } });
    try {
      await h.start();
      await unlink(h.file);
      assert.equal((await h.call('deleted'))?.block, mode === 'enforce' ? true : undefined);
      assert.equal(h.records.find(r => r.stage === 'permission')?.reason, 'policy-stale');
      assert.equal((await h.call('still-deleted'))?.block, mode === 'enforce' ? true : undefined);
      assert.equal(h.records.find(r => r.callId === 'still-deleted' && r.stage === 'permission')?.assessmentAvailable, false);
    } finally { await h.close(); }
  });
  test(`${mode}: a policy created after dormancy waits for the next session start`, async () => {
    const h = await guardHarness({ localPolicy: false, env: { TENET_MODE: mode } });
    try {
      await h.start();
      await writeFile(h.file, 'Rule; newly created');
      assert.equal(await h.call('before-reload'), undefined);
      assert.equal(h.records.length, 0);
      await h.start();
      assert.ok(h.commands.has('tenet'));
      assert.equal(await h.call('after-reload'), undefined);
      assert.ok(h.records.some(r => r.callId === 'after-reload' && r.stage === 'permission'));
    } finally { await h.close(); }
  });
  test(`${mode}: shared off, on and corrupt control do not wake a dormant session`, async () => {
    const h = await guardHarness({ localPolicy: false, env: { TENET_MODE: mode, TENET_RECORDING: 'on' } });
    try {
      await h.start();
      const control = new ActivationStore(join(h.cwd, 'control.json'));
      for (const choice of ['off', 'on'] as const) {
        await control.write(choice);
        assert.equal(await h.call(choice), undefined);
      }
      await writeFile(control.path, '{');
      assert.equal(await h.call('corrupt'), undefined);
      assert.deepEqual(h.records, []);
      assert.deepEqual(h.statuses, []);
      assert.deepEqual(h.notifications, []);
    } finally { await h.close(); }
  });
}
