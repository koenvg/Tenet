import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardHarness } from './guard-harness.js';
import { answer, sdkAnswers } from './helpers.js';
import { createJevJudge } from '../src/decision/jev.js';
import { startInspector } from '../src/inspector/server.js';
import { qualifiedSessionKey } from '../src/recording/archive.js';

// Public integration seams: Pi lifecycle, scripted SDK HTTP, and standalone read API.
test('closed inspector capture survives reader restart and same-session live resumption', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-workflow-')));
  const submitted = new Map<string, any>();
  const h = await guardHarness({ env: { TENET_RECORDING_DIR: directory, TENET_RECORDING: 'on' },
    createJudge: () => createJevJudge({ apiKey: 'workflow-transport-secret', fetch: async (_url, init) => {
      const payload = JSON.parse(init!.body as string);
      const id = payload.state.action.callId;
      submitted.set(id, payload);
      if (id === 'failure') return new Response('private-provider-body', { status: 503 });
      const assessment = answer(payload.state.policy, id === 'concern' ? 'FAIL' : 'PASS');
      return Response.json({ model: 'offline-workflow', answers: sdkAnswers(assessment) });
    } }) });
  let app: Awaited<ReturnType<typeof startInspector>> | undefined;
  const get = async (path: string) => {
    const response = await fetch(app!.origin + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json() as Promise<any>;
  };
  const callsPath = `/api/sessions/${qualifiedSessionKey('pi', 's', 'main')}`;
  const detail = (id: string) => get(`${callsPath}/invocations/${id}`);
  const eventually = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 100; i++) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('live archive did not reach expected stage');
  };
  try {
    await h.start();
    for (const id of ['pass', 'concern', 'failure']) {
      assert.equal(await h.call(id, { text: '<script>window.hostile=true</script>', token: 'workflow-redacted-secret' }), undefined);
      await h.assessed(id);
      await h.captured();
    }
    await h.shutdownCaptured();
    app = await startInspector({ directory });
    const sessions = await get('/api/sessions');
    assert.equal(sessions.sessions.length, 1);
    assert.equal(sessions.sessions[0].invocations, 3);
    const calls = (await get(callsPath)).invocations;
    const historical = new Map<string, any>();
    for (const call of calls) {
      const { view } = await detail(call.id);
      historical.set(call.id, view);
      const payload = submitted.get(view.identity.callId);
      assert.deepEqual(view.evidence, payload.state);
      assert.equal(view.rules.length, payload.state.policy.rules.length + 1);
      for (const rule of view.rules) {
        assert.deepEqual(rule.questions.outcome, payload.questions[rule.mapping.outcomeKey]);
        assert.deepEqual(rule.questions.evidence, payload.questions[rule.mapping.evidenceKey]);
      }
      assert.equal(view.decision, view.identity.callId === 'pass' ? 'ALLOW' : view.identity.callId === 'failure' ? 'unavailable' : 'BLOCK');
      assert.equal(view.permission, 'released');
      assert.equal(view.execution, 'unknown');
      assert.equal(view.assessmentStatus, view.identity.callId === 'failure' ? 'unavailable' : 'completed');
      assert.equal(view.failure, view.identity.callId === 'failure' ? 'provider-error' : null);
    }
    await app.close();
    app = await startInspector({ directory });
    for (const [id, view] of historical) assert.deepEqual((await detail(id)).view, view);

    await h.start();
    await h.call('resumed');
    await h.assessed('resumed');
    let resumed: any;
    await eventually(async () => {
      resumed = (await get(callsPath)).invocations.find((call: any) => call.callId === 'resumed');
      return resumed && (await detail(resumed.id)).view.permission === 'released';
    });
    assert.equal((await detail(resumed.id)).view.execution, 'unknown');
    await h.emit('tool_result', { toolCallId: 'resumed', toolName: 'edit', content: [], isError: false });
    await eventually(async () => (await detail(resumed.id)).view.execution === 'unknown' && (await detail(resumed.id)).view.missing.includes('execution') === false);
    assert.deepEqual((await detail(resumed.id)).view.evidence, submitted.get('resumed').state);
    assert.equal((await get('/api/sessions')).sessions.length, 1);
    assert.equal((await get(`/api/sessions?project=${encodeURIComponent(await realpath(h.cwd))}`)).sessions.length, 1);
    assert.equal((await get('/api/sessions?project=/different-project')).sessions.length, 0);
    for (const [id, view] of historical) assert.deepEqual((await detail(id)).view, view);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await fetch(app.origin + callsPath, { method })).status, 405);
    }
    const safeRecords = JSON.stringify(h.records);
    for (const secret of ['window.hostile', 'workflow-transport-secret', 'workflow-redacted-secret', 'private-provider-body']) {
      assert.ok(!safeRecords.includes(secret));
      if (secret !== 'window.hostile') assert.ok(!JSON.stringify([...historical.values()]).includes(secret));
    }
  } finally {
    await h.emit('session_shutdown');
    await app?.close();
    await h.close();
    await rm(directory, { recursive: true, force: true });
  }
});
