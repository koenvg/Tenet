import { JudgeFailure, type Judge, type JudgeIdentity, type RequestedJudgeIdentity } from '../decision/contracts.js';
import { MODEL } from '../decision/typesafe-contract.js';
import { prepareConfiguration, type PreparedConfiguration } from './configuration.js';

/** Local preparation only. No client construction, credential validation or connectivity check. */
export interface JudgeStatus extends RequestedJudgeIdentity {
  readonly availability: 'ready' | 'unavailable';
  readonly reason?: 'missing-credentials' | 'configuration';
  readonly connectivity: 'unverified';
  readonly experimental?: true;
}
export function prepareJudge(options: {
  env: Readonly<Record<string, string | undefined>>;
  judge?: Judge;
  createJudge?: () => Judge;
  judgeIdentity?: JudgeIdentity;
  configuration?: PreparedConfiguration;
}): { status: JudgeStatus; judge: Judge; configuration: PreparedConfiguration } {
  const configuration = options.configuration ?? prepareConfiguration({ env: options.env });
  const injected = !!(options.judge || options.createJudge);
  const selected = configuration.settings.state === 'valid' ? configuration.settings.value.judge
    : configuration.settings.state === 'absent' ? { provider: 'typesafe' as const } : undefined;
  const providerName = injected ? 'injected' : selected?.provider ?? 'unknown';
  const requestedModel = injected ? options.judgeIdentity?.requestedModel ?? null
    : selected?.provider === 'apus-llamacpp' ? selected.model : selected?.provider === 'typesafe' ? MODEL : null;
  if (requestedModel !== null && (typeof requestedModel !== 'string' || !requestedModel.trim()
    || requestedModel.length > 256 || /[\x00-\x1f\x7f-\x9f]/.test(requestedModel))) throw new Error('invalid-judge-identity');
  const apiKey = options.env.TYPESAFE_API_KEY;
  const reason = configuration.status.availability === 'unavailable' ? 'configuration'
    : !injected && selected?.provider === 'typesafe' && !apiKey?.trim() ? 'missing-credentials' : undefined;
  const status: JudgeStatus = Object.freeze({ provider: providerName, requestedModel,
    availability: reason ? 'unavailable' : 'ready', ...(reason ? { reason } : {}), connectivity: 'unverified',
    ...(providerName === 'apus-llamacpp' ? { experimental: true as const } : {}) });
  // Snapshot dependencies now. The caller cannot change selection after preparation.
  let provider = options.judge;
  const createJudge = options.createJudge;
  const judge: Judge = async (request, signal, recording) => {
    if (reason) throw new JudgeFailure('provider-error');
    if (!provider) {
      if (createJudge) provider = createJudge();
      else if (selected?.provider === 'apus-llamacpp') {
        const { createApusJudge } = await import('../decision/apus.js');
        provider ??= createApusJudge({ baseUrl: selected.baseUrl, model: selected.model });
      } else {
        const { createJevJudge } = await import('../decision/jev.js');
        provider ??= createJevJudge({ apiKey });
      }
    }
    return provider(request, signal, recording);
  };
  return { status, judge, configuration };
}
