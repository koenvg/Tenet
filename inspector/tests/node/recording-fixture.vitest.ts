import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { browserFixture } from '../browser-fixture.js';
import { readArchive } from '../../../src/recording/archive.js';
import { captureHealth } from '../../../src/inspector/view.js';

// Assessment completion is not a disk-write barrier. Model a slower CI filesystem
// so the fixture cannot accidentally depend on draining the writer between calls.
vi.mock('../../../src/recording/files.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/recording/files.js')>();
  return { ...actual, writeStageFile: async (...args: Parameters<typeof actual.writeStageFile>) => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return actual.writeStageFile(...args);
  } };
});

test('browser fixture records every stage without writer loss on a slow filesystem', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-slow-fixture-')));
  try {
    await browserFixture(directory);
    const archive = await readArchive(directory);
    expect(archive.issues).toEqual([]);
    expect(captureHealth(archive.records)).toEqual([]);
    for (const callId of ['low-pass', 'unknown', 'approval', 'evidence', 'evidence-confidence', 'warn', 'integrity']) {
      const records = archive.records.filter(r => r.callId === callId);
      expect(records.some(r => r.stage === 'assessment-status' && r.data.status === 'completed'), callId).toBe(true);
      expect(records.some(r => r.stage === 'execution'), callId).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
