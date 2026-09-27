import { experimental_defineHostEntry } from '@get-bb/plugin-sdk/host';
import { isAbsolute, resolve } from 'node:path';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { recordingConfig } from '../src/recording/archive.js';
import { hostContract, unavailable, unavailableFindings } from './contract.js';

// Retain validated metadata for incremental bounded refreshes on this machine.
const indexes = new Map<string, ArchiveIndex>();
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async readStatus({ threadId, recordingDirectory }) {
      const root = recordingDirectory ?? recordingConfig({}).directory;
      if (!isAbsolute(root) || resolve(root) !== root) return unavailable();
      try {
        let index = indexes.get(root);
        if (!index) {
          if (indexes.size >= 8) indexes.delete(indexes.keys().next().value!);
          index = new ArchiveIndex(root);
          indexes.set(root, index);
        }
        await index.refresh();
        const status = index.threadStatus(threadId);
        if (status.issues.includes('archive-unavailable')) return unavailable();
        return status;
      } catch { return unavailable(); }
    },
    async readFindings({ threadId, cursor, recordingDirectory }) {
      const root = recordingDirectory ?? recordingConfig({}).directory;
      if (!isAbsolute(root) || resolve(root) !== root) return unavailableFindings();
      let index = indexes.get(root);
      if (!index) {
        if (indexes.size >= 8) indexes.delete(indexes.keys().next().value!);
        index = new ArchiveIndex(root); indexes.set(root, index);
      }
      await index.refresh();
      if (index.issues().some(issue => issue.reason === 'archive-unavailable')) return unavailableFindings();
      return index.threadFindings(threadId, cursor);
    },
  },
  dispose() { indexes.clear(); },
});
