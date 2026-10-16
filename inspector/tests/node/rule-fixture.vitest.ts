import { expect, test, vi } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const observed = vi.hoisted(() => ({ scans: 0, writes: 0 }));
vi.mock('../../../dist/recording/files.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../dist/recording/files.js')>();
  return { ...actual, writeStageFile: async (...args: Parameters<typeof actual.writeStageFile>) => {
    await new Promise(resolve => setTimeout(resolve, 15));
    await actual.writeStageFile(...args);
    observed.writes++;
  } };
});
vi.mock('../../../src/recording/archive.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/recording/archive.js')>();
  return { ...actual, readArchive: async (...args: Parameters<typeof actual.readArchive>) => {
    observed.scans++;
    return actual.readArchive(...args);
  } };
});

import { recordRuleFixture } from '../../../test/rule-fixture.js';
import { fixtureSubmissions } from '../../../test/recording-fixture.js';

test('rule capture waits for slow persistence without scanning earlier scenarios', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-rule-capture-')));
  observed.scans = 0;
  observed.writes = 0;
  try {
    const { records, submitted } = await recordRuleFixture(directory);
    expect(observed.scans).toBe(1);
    expect(observed.writes).toBe(records.length);
    expect(new Set(records.map(record => record.cwd)).size).toBe(1);
    expect(records.filter(record => record.stage === 'request')).toHaveLength(7);
    expect(fixtureSubmissions(records).flatMap(submission => submission.status === 'completed' && 'payload' in submission ? [submission.payload] : [])).toEqual(submitted);
    for (const callId of ['low-pass', 'unknown', 'approval', 'evidence', 'evidence-confidence', 'warn', 'integrity']) {
      const call = records.filter(record => record.callId === callId);
      expect(call.some(record => record.stage === 'assessment-status' && record.data.status === 'completed')).toBe(true);
      expect(call.some(record => record.stage === 'execution' && record.data.outcome === 'unknown')).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
