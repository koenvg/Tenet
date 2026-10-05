import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type ApprovalRequest, type OwnerEvent } from 'tenet';
import { answer } from './helpers.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'authorization checkpoint timed out');
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}

for (const phase of ['judge', 'approval'] as const) {
  for (const revocation of ['off', 'invalidate', 'cancel', 'session-close', 'guard-close'] as const) {
    test(`compiled authorization finalizes once after ${revocation} during ${phase}`, async () => {
      const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-authorization-')));
      await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep private content local.');
      const judgeReply = deferred<void>();
      const uiReply = deferred<'approved'>();
      const controller = new AbortController();
      const stages: { stage: string; data: Record<string, unknown> }[] = [];
      const events: OwnerEvent[] = [];
      let judgeStarted = false;
      let approval: ApprovalRequest | undefined;
      const guard = createGuard({ host: 'authorization', hostVersion: '1', hostProfile: 'scripted',
        capabilities: ['interception', 'result-correlation', 'lifecycle-invalidation', 'trusted-approval'],
        env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control', 'state.json'),
        judge: async request => {
          judgeStarted = true;
          if (phase === 'judge') await judgeReply.promise; // Deliberately ignores cancellation.
          return answer(request.policy, 'APPROVAL_REQUIRED');
        },
        bindRecording: () => (stage, data) => { stages.push({ stage, data }); },
        onOwnerEvent: event => { events.push(event); } });
      try {
        const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd);
        await session.ready;
        const call = { callId: 'call', toolName: 'opaque', input: {} };
        const pending = session.beforeTool({ ...call, signal: controller.signal,
          current: () => ({ sessionId: 'one', contextId: 'main', ...call }),
          approve: async request => { approval = request; return uiReply.promise; } });
        await until(() => phase === 'judge' ? judgeStarted : !!approval);
        if (revocation === 'off') await guard.setActivation('off');
        if (revocation === 'invalidate') session.invalidate('context-replaced');
        if (revocation === 'cancel') controller.abort();
        if (revocation === 'session-close') await session.close();
        if (revocation === 'guard-close') await guard.close();
        const result = await pending;
        assert.equal(result.permission, 'blocked');
        if (approval) assert.equal(approval.signal.aborted, true);
        const permissions = () => stages.filter(e => e.stage === 'permission');
        assert.deepEqual(permissions().map(e => e.data.outcome), revocation === 'off' ? [] : ['blocked']);
        const terminalStages = stages.length;
        const terminalEvents = events.length;
        judgeReply.resolve();
        uiReply.resolve('approved');
        await new Promise(resolve => setTimeout(resolve, 20));
        session.invalidate('repeated-invalidation');
        await session.close();
        await guard.close();
        assert.equal(stages.length, terminalStages, 'late response or repeated closure must not record twice');
        assert.equal(events.length, terminalEvents, 'late response must not publish another permission');
        assert.equal(stages.some(e => e.stage === 'execution'), false);
        assert.equal(session.afterTool({ callId: 'call', toolName: 'opaque' }).outcome, 'unknown');
      } finally {
        judgeReply.resolve(); uiReply.resolve('approved');
        await guard.close(); await rm(cwd, { recursive: true, force: true });
      }
    });
  }
}
