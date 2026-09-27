import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { hostContract, rpcContract, unavailable, unavailableFindings } from './contract.js';

/** Owner-facing RPC only. No agent tool, message, hook or assessment is registered. */
export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    recordingDirectories: { type: 'string', label: 'Recording directories by machine ID (JSON)', default: '{}',
      description: 'Optional absolute TENET archive paths, keyed by BB machine ID. Leave empty for ~/.tenet/recordings on each machine.' },
  });
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const target = async (threadId: string) => {
    const thread = await bb.sdk.threads.get({ threadId });
    if (!thread || thread.providerId !== 'pi' || !thread.environmentId) return null;
    const environment = await bb.sdk.environments.get({ environmentId: thread.environmentId });
    if (!environment || environment.id !== thread.environmentId) return null;
    const hostId = environment.hostId;
    if (!/^host_[a-z0-9]{8,64}$/.test(hostId)) return null;
    const configured: unknown = JSON.parse((await settings.get()).recordingDirectories);
    if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return null;
    const directory = (configured as Record<string, unknown>)[hostId];
    if (directory !== undefined && (typeof directory !== 'string' || directory.length > 4096)) return null;
    return { hostId, input: directory === undefined ? {} : { recordingDirectory: directory } };
  };
  bb.rpc.register(rpcContract, {
    async status({ threadId }) {
      try {
        const selected = await target(threadId);
        return selected ? await host.call('readStatus', { threadId, ...selected.input }, { hostId: selected.hostId }) : unavailable();
      } catch { return unavailable(); }
    },
    async findings({ threadId, cursor }) {
      let selected: Awaited<ReturnType<typeof target>>;
      try { selected = await target(threadId); } catch { return unavailableFindings(); }
      if (!selected) return unavailableFindings();
      // A rejected page request reaches the UI so it can offer a page-one restart.
      return host.call('readFindings', { threadId, ...(cursor ? { cursor } : {}), ...selected.input }, { hostId: selected.hostId });
    },
  });
}
export { rpcContract } from './contract.js';
