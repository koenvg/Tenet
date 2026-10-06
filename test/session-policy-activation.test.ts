import { chmod, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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
      if (mode === 'observe') await h.assessed('local');
      assert.equal(assessments, 1);
      assert.ok(h.records.some(r => r.stage === 'status' && r.status === 'ready'));
    } finally { await h.close(); }
  });

  for (const selection of ['local', 'explicit'] as const) {
    for (const [name, prepare, reason] of [
      ['malformed', async (file: string) => writeFile(file, 'not a policy'), 'policy-format'],
      ['unreadable', async (file: string) => chmod(file, 0), 'policy-unavailable'],
      ['broken link', async (file: string) => { await unlink(file); await symlink('missing-target', file); }, 'policy-unavailable'],
    ] as const) {
      test(`${mode}: ${name} ${selection} source stays unavailable rather than dormant`, async () => {
        const h = await guardHarness({ env: { TENET_MODE: mode, ...(selection === 'explicit' ? { TENET_POLICY: 'selected.md' } : {}) } });
        const file = selection === 'explicit' ? join(h.cwd, 'selected.md') : h.file;
        try {
          if (selection === 'explicit') await writeFile(file, 'Rule; selected rule');
          await prepare(file);
          await h.start();
          assert.ok(h.commands.has('tenet'));
          assert.equal(h.records.find(r => r.stage === 'status')?.reason, reason);
          assert.equal((await h.call(name))?.block, mode === 'enforce' ? true : undefined);
          assert.equal(h.records.find(r => r.stage === 'permission')?.assessmentAvailable, false);
        } finally { await chmod(file, 0o600).catch(() => {}); await h.close(); }
      });
    }
  }

  for (const override of ['unset', 'relative-existing', 'relative-missing', 'absolute-existing', 'absolute-missing', 'empty', 'blank'] as const) {
    for (const local of ['valid', 'absent', 'invalid'] as const) {
      test(`${mode}: ${override} selects the project policy with ${local} local policy`, async () => {
        const root = await mkdtemp(join(tmpdir(), 'tenet-selected-policy-'));
        const external = join(root, 'external.md');
        const value = { unset: undefined, 'relative-existing': 'external.md', 'relative-missing': 'missing.md',
          'absolute-existing': external, 'absolute-missing': join(root, 'missing.md'), empty: '', blank: ' \t ' }[override];
        const submitted: string[][] = [];
        const h = await guardHarness({ localPolicy: local !== 'absent', policy: local === 'invalid' ? 'not a policy' : 'Rule; local rule',
          env: { TENET_MODE: mode, TENET_RECORDING: 'on', ...(value === undefined ? {} : { TENET_POLICY: value }) },
          judge: async request => { submitted.push(request.policy.rules.map(rule => rule.text)); return answer(request.policy); } });
        try {
          await writeFile(external, 'Rule; external rule');
          await writeFile(join(h.cwd, 'external.md'), 'Rule; relative rule');
          await h.start();
          const status = h.records.find(r => r.stage === 'status');
          const dormant = override === 'unset' && local === 'absent';
          const ready = override.endsWith('-existing') || override === 'unset' && local === 'valid';
          if (ready) {
            const text = override === 'unset' ? 'local rule' : override === 'relative-existing' ? 'relative rule' : 'external rule';
            assert.equal(status?.status, 'ready');
            assert.equal(status.policy.candidates[1]!.source, override === 'unset' ? h.file : override === 'relative-existing' ? join(h.cwd, 'external.md') : external);
            assert.equal(status.policy.sources[0]!.digest, createHash('sha256').update(`Rule; ${text}`).digest('hex'));
            assert.equal(await h.call('selected'), undefined);
            if (mode === 'observe') await h.assessed('selected');
            assert.deepEqual(submitted, [[text]]);
          } else if (!dormant) {
            const reason = override === 'empty' || override === 'blank' ? 'configuration'
              : override === 'unset' ? 'policy-format' : 'policy-unavailable';
            assert.equal(status?.reason, reason);
            assert.equal((await h.call('unavailable'))?.block, mode === 'enforce' ? true : undefined);
            assert.equal(h.records.find(r => r.stage === 'permission')?.assessmentAvailable, false);
            assert.deepEqual(submitted, []);
          } else {
            assert.equal(await h.call('dormant'), undefined);
            await h.emit('tool_result', { toolName: 'edit', toolCallId: 'dormant', content: [], isError: false });
            assert.deepEqual(submitted, []);
            assert.deepEqual(h.records, []);
            assert.deepEqual(h.statuses, []);
            assert.deepEqual(h.notifications, []);
            assert.deepEqual(h.prompts, []);
            assert.equal(h.commands.has('tenet'), false);
            assert.deepEqual((await readArchive(join(h.cwd, 'archive'))).records, []);
          }
        } finally { await h.close(); await rm(root, { recursive: true, force: true }); }
      });
    }
  }
}

for (const mode of ['observe', 'enforce'] as const) {
  test(`${mode}: policy deletion after activation is unavailable, never dormant`, async () => {
    const h = await guardHarness({ env: { TENET_MODE: mode } });
    try {
      await h.start();
      await unlink(h.file);
      assert.equal((await h.call('deleted'))?.block, mode === 'enforce' ? true : undefined);
      if (mode === 'observe') {
        assert.equal(h.records.find(r => r.stage === 'permission')?.reason, 'assessment-pending');
        assert.equal((await h.assessed('deleted')).status, 'cancelled');
      } else assert.equal(h.records.find(r => r.stage === 'permission')?.reason, 'policy-stale');
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
