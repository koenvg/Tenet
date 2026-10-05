import { ArchiveWriter, parseBbThreadId } from '../src/recording/archive.js';
import type { HostIdentity, RecordingIdentity, RecordingSink } from '../src/recording/contract.js';

type Schema1Identity = RecordingIdentity & { host?: never; contextId?: never; bbThreadId?: never };
type Schema2Identity = RecordingIdentity & HostIdentity & { bbThreadId?: never };

/** Historical fixtures select their recorded schema. Inherited bind() is the production current writer. */
export class HistoricalArchiveWriter extends ArchiveWriter {
  bindHistorical(identity: Schema1Identity, schemaVersion: 1): RecordingSink;
  bindHistorical(identity: Schema2Identity, schemaVersion: 2): RecordingSink;
  bindHistorical(identity: RecordingIdentity & HostIdentity, schemaVersion: 3): RecordingSink;
  bindHistorical(identity: RecordingIdentity & Partial<HostIdentity>, schemaVersion: 1 | 2 | 3): RecordingSink {
    const { host, contextId, bbThreadId } = identity;
    if (schemaVersion === 1) {
      if (host !== undefined || contextId !== undefined || bbThreadId !== undefined) throw new Error('invalid-historical-recording-identity');
      return this.bindRecord({ ...identity, host: undefined, contextId: undefined, schemaVersion });
    }
    if (![2, 3].includes(schemaVersion)
      || ![host, contextId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256)
      || (bbThreadId !== undefined && (schemaVersion === 2 || parseBbThreadId(bbThreadId) !== bbThreadId)))
      throw new Error('invalid-historical-recording-identity');
    return this.bindRecord({ ...identity, host: host!, contextId: contextId!, schemaVersion });
  }
}
