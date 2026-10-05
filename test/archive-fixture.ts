import assert from 'node:assert/strict';
import { HistoricalArchiveWriter as ArchiveWriter } from './legacy-recording-fixture.js';
import { writeStageFile } from '../src/recording/files.js';

/** Static archives must be complete before a reader starts. Production shutdown stays bounded. */
export class FixtureArchiveWriter extends ArchiveWriter {
  private waiters = new Set<() => void>();
  constructor(config: ConstructorParameters<typeof ArchiveWriter>[0],
    limits?: ConstructorParameters<typeof ArchiveWriter>[1], persist = writeStageFile) {
    super(config, limits, () => {
      if (this.health().pending === 0) {
        for (const resolve of this.waiters) resolve();
        this.waiters.clear();
      }
    }, persist);
  }

  async settle(): Promise<void> {
    if (this.health().pending) await new Promise<void>(resolve => { this.waiters.add(resolve); });
    const { failed, dropped, pending, drainTimeouts } = this.health();
    assert.deepEqual({ failed, dropped, pending, drainTimeouts }, { failed: 0, dropped: 0, pending: 0, drainTimeouts: 0 },
      'Static archive fixture did not finish cleanly');
  }

  async complete(): Promise<void> {
    await this.settle();
    assert.equal(await this.close(), true, 'Static archive fixture did not close');
  }
}
