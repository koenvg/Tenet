import { ArchiveWriter as ProductionArchiveWriter } from '../src/recording/archive.js';
import type { HostIdentity, RecordingIdentity, RecordingSink } from '../src/recording/contract.js';

/** Test-only writer for archives created before host-qualified identity existed. */
export class ArchiveWriter extends ProductionArchiveWriter {
  bindHistorical(identity: RecordingIdentity & HostIdentity, schemaVersion: 2 | 3): RecordingSink {
    return this.bindRecord({ ...identity, schemaVersion });
  }
  override bind(identity: RecordingIdentity & Partial<HostIdentity>): RecordingSink {
    const { host, contextId, ...legacy } = identity;
    if (host === undefined && contextId === undefined) return this.bindRecord({ ...legacy, schemaVersion: 1 });
    if (host === undefined || contextId === undefined) throw new Error('invalid-recording-identity');
    return super.bind({ ...legacy, host, contextId });
  }
}
