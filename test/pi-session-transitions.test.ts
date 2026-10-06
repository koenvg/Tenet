import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';

for (const mode of ['observe', 'enforce'] as const) for (const transition of ['reload', 'switch'] as const) {
  test(`${mode}: ${transition} to dormant clears owner state and retained commands stay silent until eligibility returns`, async () => {
    let assessments = 0;
    const h = await guardHarness({ env: { TENET_MODE: mode }, judge: async request => { assessments++; return answer(request.policy, 'FAIL'); } });
    const visible = new Map<string, string | undefined>();
    const setStatus = h.ctx.ui.setStatus;
    h.ctx.ui.setStatus = (key: string, value?: string) => { visible.set(key, value); setStatus(key, value ?? ''); };
    let sessionId = 'eligible'; h.ctx.sessionManager.getSessionId = () => sessionId;
    try {
      await h.start(); await h.call('historical');
      if (mode === 'observe') await h.assessed('historical');
      assert.equal(assessments, 1);
      assert.match(visible.get('tenet')!, /ready: 1 rules/);
      await h.commands.get('tenet').handler('off', h.ctx);
      const oldRecords = structuredClone(h.records), oldBranch = structuredClone(h.branch);
      const control = await readFile(join(h.cwd, 'control.json'));
      if (transition === 'reload') await unlink(h.file);
      else {
        await mkdir(join(h.cwd, 'dormant'));
        await h.emit('session_before_switch');
        h.ctx.cwd = join(h.cwd, 'dormant'); sessionId = 'dormant';
      }
      const transitionCounts = [h.records.length, h.notifications.length, h.prompts.length, h.views.length];
      const opening = h.emit('session_start', { reason: transition === 'switch' ? 'new' : 'reload' });
      await Promise.all(['', 'status', 'on', 'off'].map(args => h.commands.get('tenet').handler(args, h.ctx)));
      assert.deepEqual([h.records.length, h.notifications.length, h.prompts.length, h.views.length], transitionCounts, 'handlers stay silent during session replacement');
      await opening;
      assert.equal(visible.get('tenet'), undefined, 'the old enforcement footer must be removed');
      assert.equal(visible.get('tenet-recording'), undefined, 'the old capture footer must be removed');
      const counts = [h.records.length, h.notifications.length, h.prompts.length, h.views.length];
      assert.equal(await h.call('dormant'), undefined);
      await h.emit('tool_result', { toolName: 'edit', toolCallId: 'dormant', content: [], isError: false });
      for (const args of ['', 'status', 'on', 'off', 'invalid']) await h.commands.get('tenet').handler(args, h.ctx);
      assert.deepEqual([h.records.length, h.notifications.length, h.prompts.length, h.views.length], counts);
      assert.deepEqual(await readFile(join(h.cwd, 'control.json')), control, 'retained commands cannot change owner activation while dormant');
      assert.equal(assessments, 1); assert.deepEqual(h.records, oldRecords); assert.deepEqual(h.branch, oldBranch);
      const currentText = '# new physical line\nRule; Updated project declaration.';
      await writeFile(h.file, currentText);
      h.ctx.cwd = h.cwd; sessionId = 'eligible-again';
      await h.start();
      assert.match(visible.get('tenet')!, /TENET OFF/);
      await h.commands.get('tenet').handler('on', h.ctx);
      const currentNotices = h.notifications.length;
      await h.commands.get('tenet').handler('status', { ...h.ctx,
        sessionManager: { ...h.ctx.sessionManager, getSessionId: () => 'old-command-context' } });
      assert.equal(h.notifications.length, currentNotices, 'a retained command cannot serve an old host context');
      await h.commands.get('tenet').handler('status', h.ctx);
      assert.match(h.notifications.at(-1)!, new RegExp(createHash('sha256').update(currentText).digest('hex')));
      assert.ok(h.notifications.at(-1)!.includes('project candidate: ' + JSON.stringify(h.file)));
      await h.commands.get('tenet').handler('', h.ctx);
      assert.ok(h.views.at(-1).items.some((item: string) => item.includes('historical')));
      await h.call('current'); if (mode === 'observe') await h.assessed('current');
      assert.equal(assessments, 2);
      assert.deepEqual(h.records.slice(0, oldRecords.length), oldRecords, 'historical native records stay unchanged');
    } finally { await h.close(); }
  });
}
