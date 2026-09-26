import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { hostContract, rpcContract, unavailable } from './contract.js';

/** Owner-facing RPC only. No agent tool, message, hook or assessment is registered. */
export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    recordingDirectories: { type: 'string', label: 'Recording directories by machine ID (JSON)', default: '{}',
      description: 'Optional absolute TENET archive paths, keyed by BB machine ID. Leave empty for ~/.tenet/recordings on each machine.' },
  });
  const host = bb.hosts.experimental_client({ contract: hostContract });
  bb.rpc.register(rpcContract, {
    async status({ threadId }) {
      try {
        // The requested thread, not a recording or client argument, supplies provider and machine.
        const thread = await bb.sdk.threads.get({ threadId });
        if (!thread || thread.providerId !== 'pi' || !thread.environmentId) return unavailable();
        const environment = await bb.sdk.environments.get({ environmentId: thread.environmentId });
        if (!environment || environment.id !== thread.environmentId) return unavailable();
        const hostId = environment.hostId;
        if (!/^host_[a-z0-9]{8,64}$/.test(hostId)) return unavailable();
        const configured: unknown = JSON.parse((await settings.get()).recordingDirectories);
        if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return unavailable();
        const directory = (configured as Record<string, unknown>)[hostId];
        if (directory !== undefined && (typeof directory !== 'string' || directory.length > 4096)) return unavailable();
        return await host.call('readStatus', { threadId,
          ...(directory === undefined ? {} : { recordingDirectory: directory }) }, { hostId });
      } catch { return unavailable(); }
    },
  });
}
export { rpcContract } from './contract.js';
