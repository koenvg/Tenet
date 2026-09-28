import { experimental_defineHostEntry } from '@get-bb/plugin-sdk/host';
import { isAbsolute, resolve } from 'node:path';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { recordingConfig } from '../src/recording/archive.js';
import { directory } from '../src/recording/files.js';
import { hostContract, unavailable, unavailableFindings } from './contract.js';

// Retain validated metadata for incremental bounded refreshes on this machine.
const indexes = new Map<string, ArchiveIndex>();
async function refreshedIndex(recordingDirectory?: string): Promise<ArchiveIndex | null> {
  const root = recordingDirectory ?? recordingConfig({}).directory;
  if (!isAbsolute(root) || resolve(root) !== root) return null;
  try {
    // The standalone index treats a never-created archive as empty. BB must not
    // mistake a missing configured archive, including one just lost, for a read.
    await directory(root);
    let index = indexes.get(root);
    if (!index) {
      if (indexes.size >= 8) indexes.delete(indexes.keys().next().value!);
      index = new ArchiveIndex(root);
      indexes.set(root, index);
    }
    await index.refresh();
    await directory(root);
    return index.issues().some(issue => issue.reason === 'archive-unavailable') ? null : index;
  } catch { indexes.delete(root); return null; }
}
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async readStatus({ threadId, recordingDirectory }) {
      const index = await refreshedIndex(recordingDirectory);
      return index?.threadStatus(threadId) ?? unavailable();
    },
    async readFindings({ threadId, cursor, recordingDirectory }) {
      const index = await refreshedIndex(recordingDirectory);
      return index ? index.threadFindings(threadId, cursor) : unavailableFindings();
    },
  },
  dispose() { indexes.clear(); },
});
