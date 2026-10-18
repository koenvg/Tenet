import { experimental_defineHostEntry } from '@get-bb/plugin-sdk/host';
import { isAbsolute, resolve } from 'node:path';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { recordingConfig } from '../src/recording/archive.js';
import { directory } from '../src/recording/files.js';
import { hostContract, unavailable, unavailableFindings } from './contract.js';
import { emptyOverview } from '../src/inspector/bb-summary.js';
import { overviewSchema } from './overview-contract.js';
import { dashboardHost } from './dashboard-host.js';
const dashboard = dashboardHost();

// Retain validated metadata for incremental bounded refreshes on this machine.
const indexes = new Map<string, ArchiveIndex>();
let pending = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.then(() => {}, () => {});
  return result;
}
async function discardIndex(root: string): Promise<void> {
  const index = indexes.get(root);
  if (!index) return;
  await index.close();
  indexes.delete(root);
}
async function refreshedIndex(recordingDirectory?: string): Promise<ArchiveIndex | null> {
  const root = recordingDirectory ?? recordingConfig({}).directory;
  if (!isAbsolute(root) || resolve(root) !== root) return null;
  try {
    // The standalone index treats a never-created archive as empty. BB must not
    // mistake a missing configured archive, including one just lost, for a read.
    await directory(root);
    let index = indexes.get(root);
    if (!index) {
      if (indexes.size >= 8) await discardIndex(indexes.keys().next().value!);
      index = new ArchiveIndex(root);
      indexes.set(root, index);
    }
    await index.refresh();
    await directory(root);
    if (index.issues().some(issue => issue.reason === 'archive-unavailable')) {
      await discardIndex(root);
      return null;
    }
    return index;
  } catch { await discardIndex(root); return null; }
}
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    readDashboard: dashboard.readDashboard,
    stopDashboard: dashboard.stopDashboard,
    readStatus({ threadId, recordingDirectory }, { lifecycle }) {
      return serialized(async () => {
        const index = lifecycle.signal.aborted ? null : await refreshedIndex(recordingDirectory);
        return index?.threadStatus(threadId) ?? unavailable();
      });
    },
    readFindings({ threadId, cursor, recordingDirectory }, { lifecycle }) {
      return serialized(async () => {
        const index = lifecycle.signal.aborted ? null : await refreshedIndex(recordingDirectory);
        return index ? index.threadFindings(threadId, cursor) : unavailableFindings();
      });
    },
    readOverview({ threadId, recordingDirectory, ...selection }, { lifecycle }) {
      return serialized(async () => {
        const index = lifecycle.signal.aborted ? null : await refreshedIndex(recordingDirectory);
        return overviewSchema.parse(index ? await index.threadOverview(threadId, selection) : emptyOverview());
      });
    },
  },
  async dispose() {
    await Promise.all([dashboard.dispose(), serialized(async () => {
      await Promise.all([...indexes.keys()].map(discardIndex));
    })]);
  },
});
