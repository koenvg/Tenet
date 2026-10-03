import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { createGuard, type Guard, type Judge, type JudgeRequest } from 'tenet';
import { createJevJudge } from '../src/decision/jev.js';
import { judgeState } from '../src/decision/judge-evidence.js';
import { serializedBytes } from '../src/decision/history-selection.js';
import { readArchive } from '../src/recording/archive.js';
import { invocationView } from '../src/inspector/view.js';
import { guardHarness } from './guard-harness.js';
import { answer, sdkAnswers } from './helpers.js';

// Synthetic host metadata and scripted transport only. No executor or provider runs.
for (const host of ['pi', 'compiled-sdk'] as const) for (const tier of ['full', 'schema omitted', 'both omitted', 'description unavailable'] as const) {
  test(`${host} submits and records the same immutable evidence under ${tier}`, async () => {
    const metadata = {
      ...(tier === 'description unavailable' ? {} : {
        description: tier === 'full' ? 'Inspect literal content. 界🙂' + 'd'.repeat(2000)
          : tier === 'schema omitted' ? 'Exact useful current description. 界🙂' : '界'.repeat(20000),
      }),
      parameters: tier === 'full' ? { type: 'object', properties: { text: { type: 'string' } } } : { large: 's'.repeat(30000) },
    };
    let prepared!: JudgeRequest, outbound: any;
    let entered!: () => void, finish!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const wait = new Promise<void>(resolve => { finish = resolve; });
    const transport = createJevJudge({ apiKey: 'offline-transport-secret', fetch: async (_url, init) => {
      outbound = JSON.parse(init!.body as string);
      entered();
      await wait;
      return Response.json({ model: 'scripted-offline', answers: sdkAnswers(answer(prepared.policy)) });
    } });
    const judge: Judge = async (request, signal, recording) => {
      prepared = request;
      assert.ok(Object.isFrozen(request.action.parameters));
      assert.ok(Object.isFrozen(request.trajectory!.observations));
      return transport(request, signal, recording);
    };
    const h = await guardHarness({ env: { TENET_MODE: 'enforce', TENET_RECORDING: 'on', TENET_EVIDENCE_MAX_BYTES: '4096', TENET_RECENT_EVENTS: '2' }, judge });
    let guard: Guard | undefined;
    try {
      const input = { text: 'Current complete arguments. 界🙂', token: 'synthetic-canary' };
      const call = { callId: 'pending', toolName: 'edit', input };
      let pending: Promise<unknown>;
      let later: () => Promise<unknown>;
      let archive: string;
      const original = JSON.stringify({ metadata, input });
      if (host === 'pi') {
        h.pi.getAllTools = () => [{ name: 'edit', description: metadata.description!, parameters: metadata.parameters }];
        await h.start();
        for (let index = 0; index < 4; index++) await h.emit('tool_result', {
          toolCallId: String(index), toolName: 'edit', content: 'a', isError: false,
        });
        pending = h.call(call.callId, input);
        later = () => h.emit('tool_result', { toolCallId: 'later', toolName: 'edit', content: 'later sibling result', isError: false });
        archive = join(h.cwd, 'archive');
      } else {
        archive = join(h.cwd, 'sdk-archive');
        guard = createGuard({ host: 'synthetic', judge, controlPath: join(h.cwd, 'sdk-control.json'),
          env: { TENET_MODE: 'enforce', TENET_RECORDING: 'on', TENET_RECORDING_DIR: archive, TENET_EVIDENCE_MAX_BYTES: '4096', TENET_RECENT_EVENTS: '2' } });
        const session = guard.openSession({ sessionId: 's', contextId: 'main' }, h.cwd);
        await session.ready;
        session.setHistory(Array.from({ length: 4 }, (_, index) => ({ kind: 'tool-result', callId: String(index), toolName: 'edit', timestamp: 0, data: 'a' })),
          { priorOmittedEvents: 5, admissionLimited: true });
        pending = session.beforeTool({ ...call, metadata: () => metadata, current: () => ({ ...call, sessionId: 's', contextId: 'main' }) });
        later = async () => session.setHistory([{ kind: 'tool-result', callId: 'later', toolName: 'edit', data: 'later sibling result' }]);
      }
      await Promise.race([started, pending.then(() => { throw new Error('call finished before scripted transport'); })]);
      const frozen = JSON.stringify(prepared);
      const submitted = JSON.stringify(outbound);
      await later();
      assert.equal(JSON.stringify(prepared), frozen);
      assert.equal(JSON.stringify(outbound), submitted);
      assert.equal(JSON.stringify({ metadata, input }), original);
      assert.deepEqual(prepared.action.arguments, { text: input.text });
      assert.equal(prepared.action.description, tier === 'both omitted' ? null : metadata.description ?? null);
      assert.deepEqual(prepared.action.parameters, tier === 'full' ? metadata.parameters : null);
      assert.equal(prepared.action.limitations.includes('tool-metadata-omitted'), tier !== 'full');
      assert.equal(prepared.action.limitations.includes('description-unavailable'), tier === 'description unavailable');
      assert.equal(prepared.resolvedAction!.status, 'unsupported');
      assert.ok(serializedBytes(outbound.state) <= 4096);
      assert.ok(prepared.trajectory!.observations.length <= 2);
      assert.ok(prepared.trajectory!.limitations.includes('history-omitted'));
      assert.equal(prepared.trajectory!.omitted, (host === 'compiled-sdk' ? 5 : 0) + 4 - prepared.trajectory!.observations.length);
      assert.deepEqual(prepared.trajectory!.observations.map(event => event.callId), ['2', '3'].slice(2 - prepared.trajectory!.observations.length));
      finish();
      const result: any = await pending;
      assert.equal(host === 'pi' ? result : result.permission, host === 'pi' ? undefined : 'released');
      if (host === 'pi') await h.shutdownCaptured();
      else await guard!.close();
      const { records, issues } = await readArchive(archive);
      assert.deepEqual(issues, []);
      const request = records.find(row => row.stage === 'request' && row.callId === 'pending')!;
      assert.ok(request);
      assert.deepEqual(request.data.payload, outbound);
      assert.deepEqual(outbound.state, judgeState(prepared));
      assert.deepEqual(request.data.evidenceContext, prepared.evidenceContext);
      assert.deepEqual(invocationView(records.filter(row => row.callId === 'pending')).evidence, outbound.state);
      assert.ok(!JSON.stringify(records).includes('synthetic-canary'));
      assert.ok(!JSON.stringify(records).includes('offline-transport-secret'));
    } finally { finish(); await guard?.close(); await h.close(); }
  });
}
