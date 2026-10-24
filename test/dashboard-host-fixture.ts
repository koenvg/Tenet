import type { HostDashboardChunk } from '../bb-plugin-tenet-status/dashboard-contract.js';

export const currentDashboardEvidence = (): HostDashboardChunk => ({ state: 'finished', next: null, contributions: [], linkedThreads: [], invocations: 0,
  invocationSizes: [], association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] });
