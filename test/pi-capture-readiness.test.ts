import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { guardHarness } from './guard-harness.js';
import { readArchive } from '../src/recording/archive.js';

// The public Pi lifecycle may enqueue execution records only when shutdown starts.
test('static Pi capture includes terminal execution records before a reader opens', async () => {
  const h = await guardHarness({ env: { TENET_RECORDING: 'on' } });
  try {
    await h.start(); await h.call('terminal'); await h.assessed('terminal');
    await h.shutdownCaptured();
    assert.equal(h.statuses.findLast(status => status.startsWith('TENET capture')), 'TENET capture ON; 0 lost; drained');
    const archive = await readArchive(join(h.cwd, 'archive'));
    assert.deepEqual(archive.issues, []);
    const execution = archive.records.filter(record => record.callId === 'terminal' && record.stage === 'execution');
    assert.equal(execution.length, 1);
    assert.equal(execution[0]!.data.outcome, 'unknown', 'shutdown does not invent an execution result');
  } finally { await h.close(); }
});

test('static Pi capture rejects an incomplete terminal drain after clean pre-shutdown capture', async () => {
  // Block only this disposable subprocess, never the suite runner or another process.
  const result = spawnSync('bun', ['--eval', `
    import assert from 'node:assert/strict';
    import { guardHarness } from './test/guard-harness.ts';
    const h = await guardHarness({ env: { TENET_RECORDING: 'on' } });
    console.log('TEST_DIRECTORY ' + h.cwd);
    await h.start(); await h.call('terminal'); await h.assessed('terminal'); await h.captured();
    console.log('BEFORE ' + h.statuses.findLast(status => status.startsWith('TENET capture')));
    const shutdown = h.shutdownCaptured();
    // Let the clean-capture await finish and shutdown enqueue its new stages.
    await Promise.resolve();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
    const rejected = assert.rejects(shutdown, /Static Pi fixture did not shut down cleanly/);
    // Observe terminal status even on the red checkpoint, where shutdown resolves.
    await shutdown.catch(() => {});
    console.log('TERMINAL ' + h.statuses.findLast(status => status.startsWith('TENET capture')));
    await rejected;
    assert.match(h.statuses.findLast(status => status.startsWith('TENET capture')), /incomplete drain$/);
    // No retry. The closed guard's own pending filesystem work finishes as this process exits.
  `], { encoding: 'utf8', env: { ...process.env, TMPDIR: '/tmp', TYPESAFE_API_KEY: '' }, timeout: 10000 });
  const directory = /^TEST_DIRECTORY (.+)$/m.exec(result.stdout)?.[1];
  try {
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /BEFORE TENET capture ON; 0 lost; 0 pending; 0 drain timeouts/);
    assert.match(result.stdout, /TERMINAL TENET capture ON; 0 lost; incomplete drain/);
  } finally {
    // The subprocess has exited, so no writer can race fixture deletion.
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});
