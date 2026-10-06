import type { Fetch } from '@typesafe-ai/sdk';
import { recordedJudge } from '../eval/recorded-decision.js';
import { readFrozenEvidenceManifest } from '../eval/evidence-selection-inputs.js';
import { observeEvidenceCampaign } from '../eval/evidence-selection-observations.js';

/** Offline mechanical replies for pinned historical payloads, never a historical evaluator. */
export async function runScriptedEvidenceCampaign(options: { apiKey?: string; storage: string; fetch: Fetch; signal?: AbortSignal; authorized: boolean }) {
  if (options.authorized !== true || !options.apiKey?.trim()) throw Error('scripted-credentials-required');
  const apiKey = options.apiKey;
  // Only the injected fake transport sees the recorded request bytes. The current
  // SDK parses its scripted reply; neither old instructions nor fixture actions run.
  return observeEvidenceCampaign(readFrozenEvidenceManifest(), { apiKey, storage: options.storage, fetch: options.fetch,
    signal: options.signal }, (entry, transport) => recordedJudge(entry, { apiKey, fetch: transport }));
}
