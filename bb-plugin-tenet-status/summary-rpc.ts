import { useCallback } from 'react';
import { experimental_usePluginId, useSdk, type JsonValue } from '@get-bb/plugin-sdk/app';
import type { z } from 'zod';
import { rpcContract } from './contract';

type SummaryMethod = 'overview' | 'pickerProjects' | 'pickerThreads' | 'pickerSelection' | 'dashboard' | 'dashboardContributors' | 'dashboardStop';
type SummaryContract = typeof rpcContract;
type SummaryInputs = { [M in SummaryMethod]: z.input<SummaryContract[M]['input']> };
type SummaryOutputs = { [M in SummaryMethod]: z.output<SummaryContract[M]['output']> };
const summaryMethods: { [M in SummaryMethod]: { output: z.ZodType<SummaryOutputs[M]> } } = rpcContract;

export function useSummaryRpc() {
  const sdk = useSdk(), pluginId = experimental_usePluginId();
  return useCallback(<M extends SummaryMethod>(method: M, input: SummaryInputs[M] & JsonValue, signal?: AbortSignal) =>
    sdk.plugins.callRpc<SummaryOutputs[M]>({ pluginId, method, input, signal, outputSchema: summaryMethods[method].output }),
  [sdk, pluginId]);
}
