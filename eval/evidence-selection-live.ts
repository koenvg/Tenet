import type { Fetch } from '@typesafe-ai/sdk';
import { createJevJudge } from '../src/decision/jev.js';
import { prepareEvidenceManifest } from './evidence-selection-inputs.js';
import { observeEvidenceCampaign, type LiveReport } from './evidence-selection-observations.js';

export { renderLiveReport, type LiveReport, type LiveRow } from './evidence-selection-observations.js';

/** Authorized fixed campaign only. Compatibility is checked before outputs or transport. */
export async function runEvidenceLive(options: { authorized: boolean; apiKey?: string; storage: string; fetch?: Fetch; signal?: AbortSignal }): Promise<LiveReport> {
  if (Object.keys(options).some(key => !['authorized', 'apiKey', 'storage', 'fetch', 'signal'].includes(key))) throw Error('unsupported-campaign-scope');
  if (options.authorized !== true || !options.apiKey?.trim()) throw Error('authorization-and-credentials-required');
  const apiKey = options.apiKey;
  const manifest = prepareEvidenceManifest();
  return observeEvidenceCampaign(manifest, { apiKey, storage: options.storage, fetch: options.fetch ?? globalThis.fetch,
    signal: options.signal }, (_entry, fetch) => createJevJudge({ apiKey, fetch }));
}
