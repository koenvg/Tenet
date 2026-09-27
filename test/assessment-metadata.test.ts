import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GuardRuntime } from '../src/runtime/guard.js';
import type { Permission } from '../src/runtime/consequences.js';
import { guardHarness } from './guard-harness.js';

const metadata = { profile: 'applicability-v1', questionVersion: 'policy-rules-v6-applicability' };
for (const scenario of ['pending', 'dropped', 'unavailable', 'pre-assessment'] as const) test(`captured assessment metadata reaches ${scenario} owner callbacks`, async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-profile-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; Never commit.');
  const permissions: Permission[] = [];
  const assessments: Array<{ identity: { profile: string; questionVersion: string }; status: string }> = [];
  let assessed!: () => void;
  const terminal = new Promise<void>(resolve => { assessed = resolve; });
  const runtime = new GuardRuntime({
    env: { TENET_ASSESSMENT_PROFILE: 'applicability-v1', TENET_MODE: scenario === 'pre-assessment' ? 'enforce' : 'observe',
      ...(scenario === 'pre-assessment' ? { TENET_EFFECT_THRESHOLD: 'invalid' } : {}) },
    judge: async (_request, signal) => {
      if (scenario !== 'pending') throw new Error('offline unavailable');
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
    },
    activation: { read: () => 'on', refresh: () => 'on' },
    onAssessment: (identity, status) => { assessments.push({ identity, status }); assessed(); },
    ...(scenario === 'dropped' ? { observationLimits: { bytes: 1 } } : {}),
  }, { host: 'fixture', version: '1', profile: 'test', interception: true, resultCorrelation: true, lifecycleInvalidation: true, argumentStability: true, trustedApproval: true, limitations: [] });
  const identity = { host: 'fixture', sessionId: 's', contextId: 'main' };
  try {
    const readiness = await runtime.start(identity, cwd);
    const input = { ...identity, cwd, callId: 'c', toolName: 'read', input: { file: 'README.md' } };
    await runtime.call({ ...input, current: () => input, onPermission: (_identity, permission) => permissions.push(permission) });
    assert.equal(permissions.length, 1);
    for (const [key, value] of Object.entries(metadata)) {
      assert.equal((permissions[0] as unknown as Record<string, unknown>)[key], value);
      assert.equal((readiness as unknown as Record<string, unknown>)[key], value);
    }
    if (scenario === 'unavailable' || scenario === 'dropped') await terminal;
    runtime.shutdown();
    if (scenario === 'pending') await terminal;
    if (scenario !== 'pre-assessment') {
      assert.ok(assessments.length > 0);
      assert.equal(assessments.at(-1)!.status, scenario === 'pending' ? 'cancelled' : scenario);
      for (const { identity } of assessments) for (const [key, value] of Object.entries(metadata))
        assert.equal((identity as unknown as Record<string, unknown>)[key], value);
    }
    assert.equal(permissions[0]!.profile, 'applicability-v1');
  } finally { runtime.shutdown(); await rm(cwd, { recursive: true, force: true }); }
});

test('Pi candidate startup announces its captured profile and question version', async () => {
  const h = await guardHarness({ env: { TENET_ASSESSMENT_PROFILE: 'applicability-v1' } });
  try {
    await h.start();
    assert.ok(h.notifications.some(text => text.includes('Judge questions: policy-rules-v6-applicability')));
    assert.ok(h.notifications.some(text => text.includes('applicability-v1')));
  } finally { await h.close(); }
});

test('unavailable candidate owner details keep profile metadata live and after recovery', async () => {
  const h = await guardHarness({ env: { TENET_ASSESSMENT_PROFILE: 'applicability-v1' }, judge: async () => { throw new Error('offline unavailable'); } });
  try {
    await h.start(); await h.call(); await h.assessed();
    for (const recover of [false, true]) {
      if (recover) await h.start();
      h.views.length = 0;
      let selected = false;
      h.ctx.ui.select = async (title, items) => { h.views.push({ title, items }); if (!selected) { selected = true; return items[0]; } return undefined; };
      await h.commands.get('tenet').handler('', h.ctx);
      const details = h.views[1].items.join('\n');
      assert.match(details, /Assessment profile: applicability-v1/);
      assert.match(details, /Judge questions: policy-rules-v6-applicability/);
      assert.doesNotMatch(details, /legacy \(historical\)/);
    }
  } finally { await h.close(); }
});
