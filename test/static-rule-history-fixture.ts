import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ruleRecording, writeRuleRecording } from './session-rules-fixture.js';
import { writeStageFile } from '../src/recording/files.js';

export async function materializeStaticRuleHistory(root: string) {
  const stages: Parameters<typeof writeStageFile>[] = [];
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root }, undefined, async (...args) => { stages.push(args); });
  for (let n = 0; n < 4096; n++) {
    writeRuleRecording(writer, 's', `i${n}`, { begin: ruleRecording().begin, validation: { valid: false } });
    if (n % 8 === 0) await writer.settle();
  }
  await writer.complete();
  assert.equal(writer.health().written, 8192);
  assert.equal(stages.length, 8192);
  const identities = new Map<string, string[]>();
  for (const [, , , text] of stages) {
    const record = JSON.parse(text);
    assert.equal(record.schemaVersion, 1); assert.equal(record.sessionId, 's');
    assert.equal(record.callId, record.invocationId);
    const group = identities.get(record.invocationId) ?? []; group.push(record.stage); identities.set(record.invocationId, group);
  }
  assert.equal(identities.size, 4096);
  for (let n = 0; n < 4096; n++) assert.deepEqual(identities.get(`i${n}`), ['begin', 'validation']);
  let next = 0, completed = 0;
  const failures: unknown[] = [];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < stages.length) {
      const args = stages[next++]!;
      try {
        await writeStageFile(...args);
        const path = join(args[1], `${args[2]}.json`), info = await lstat(path);
        assert.equal(info.isFile(), true); assert.equal(info.nlink, 1); assert.equal(info.mode & 0o777, 0o600);
        assert.equal(await readFile(path, 'utf8'), args[3]); completed++;
      } catch (error) { failures.push(error); }
    }
  }));
  assert.deepEqual(failures, []); assert.equal(completed, 8192);
  console.log(`STATIC_HISTORY invocations=${identities.size} stages=${stages.length} actualWrites=${completed} verifiedBytesAndPrivateModes=${completed} workers=8 failures=${failures.length}`);
}
