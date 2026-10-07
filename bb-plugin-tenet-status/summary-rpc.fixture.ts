import { renderSlot, type RenderedSlot, type RpcCall } from '@get-bb/plugin-sdk/testing/app';

/** Exercise the official signal-capable SDK transport with authored RPC fixtures. */
export const renderSummarySlot: typeof renderSlot = (registration, props, options = {}) => renderSlot(registration, props, {
  ...options,
  sdk: { ...options.sdk, plugins: { ...options.sdk?.plugins,
    callRpc: async ({ method, input, outputSchema, signal }) => {
      if (signal?.aborted) throw new Error('Aborted');
      const handler = options.rpc?.[method];
      if (!handler) throw new Error(`No authored RPC fixture for ${method}`);
      return outputSchema.parse(await handler(input));
    },
  } },
});
export const summaryCalls = (slot: RenderedSlot): RpcCall[] => slot.inspection.sdkCalls
  .filter(call => call.method === 'plugins.callRpc')
  .map(call => { const args = call.args[0] as { method: string; input: unknown }; return { method: args.method, input: args.input }; });
