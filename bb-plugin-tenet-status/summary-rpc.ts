import { useCallback } from 'react';
import { experimental_usePluginId, useSdk, type JsonValue } from '@get-bb/plugin-sdk/app';
import type { z } from 'zod';
import { rpcContract } from './contract';

/** The convenience useRpc client has no signal option in SDK 0.6.15. */
export function useSummaryRpc() {
  const sdk = useSdk(), pluginId = experimental_usePluginId();
  return useCallback(<M extends 'overview' | 'pickerProjects' | 'pickerThreads' | 'pickerSelection'>(
    method: M, input: z.input<(typeof rpcContract)[M]['input']>, signal?: AbortSignal,
  ): Promise<z.output<(typeof rpcContract)[M]['output']>> => sdk.plugins.callRpc({
    pluginId, method, input: input as JsonValue, signal,
    outputSchema: rpcContract[method].output as unknown as z.ZodType<z.output<(typeof rpcContract)[M]['output']>>,
  }), [sdk, pluginId]);
}
