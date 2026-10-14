import { JudgeFailure, type Judge, type JudgeIdentity, type RequestedJudgeIdentity } from '../decision/contracts.js';
import { DEFAULT_JUDGE, prepareConfiguration, type PreparedConfiguration } from './configuration.js';

import { diagnosticSafety, type DiagnosticSafety } from './diagnostic-safety.js';
/** Local preparation only. No client construction, credential validity or connectivity check. */
export interface JudgeStatus extends Required<RequestedJudgeIdentity> {
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
}): { status: JudgeStatus; judge: Judge; configuration: PreparedConfiguration; diagnostics: DiagnosticSafety } {
  const prepared = options.configuration ?? prepareConfiguration({ env: options.env });
  const configuration = options.judge || options.createJudge ? { ...prepared,
    status: Object.freeze({ ...prepared.status, sources: Object.freeze({ ...prepared.status.sources, judge: 'sdk' as const }) }) } : prepared;
  const injected = !!(options.judge || options.createJudge);
  const selected = configuration.settings.state === 'valid' ? configuration.settings.value.judge
    : configuration.settings.state === 'absent' ? DEFAULT_JUDGE : undefined;
  const providerName = injected ? 'injected' : selected?.protocol ?? 'unknown';
  const requestedModel = injected ? options.judgeIdentity?.requestedModel ?? null : selected?.model ?? null;
  if (requestedModel !== null && (typeof requestedModel !== 'string' || !requestedModel.trim()
    || requestedModel.length > 256 || /[\x00-\x1f\x7f-\x9f]/.test(requestedModel))) throw new Error('invalid-judge-identity');
  // Resolve only the final selection, and only if configuration is usable and not injected.
  const auth = !injected && configuration.status.availability === 'ready' && selected?.protocol === 'system-one' ? selected.auth : undefined;
  const token = auth?.type === 'bearer-env' ? options.env[auth.name] : undefined;
  // Never resolve a displaced credential getter for a diagnostic copy.
  const typeSafeValue = Object.getOwnPropertyDescriptor(options.env, 'TYPESAFE_API_KEY')?.value;
  const diagnostics = diagnosticSafety([auth?.type === 'bearer-env' ? auth.name : undefined, token,
    typeof typeSafeValue === 'string' ? typeSafeValue : undefined]);
  const reason = configuration.status.availability === 'unavailable' ? 'configuration'
    : auth?.type === 'bearer-env' && (typeof token !== 'string' || !/^[\x21-\x7e]+$/.test(token)) ? 'missing-credentials' : undefined;
  const status: JudgeStatus = Object.freeze({ provider: providerName, requestedModel,
    requestedDestination: injected || !selected ? null : new URL(selected.baseUrl).origin,
    transportContract: injected || !selected ? null : selected.protocol === 'system-one' ? 'system-one-v1' : 'llamacpp-b11118-choice-v1',
    authentication: injected || !selected ? null : selected.protocol === 'system-one' ? selected.auth.type : 'none',
    availability: reason ? 'unavailable' : 'ready', ...(reason ? { reason } : {}), connectivity: 'unverified',
    ...(providerName === 'apus-llamacpp' ? { experimental: true as const } : {}) });
  // Snapshot dependencies now. The caller cannot change selection after preparation.
  let provider = options.judge;
  const createJudge = options.createJudge;
  const judge: Judge = async (request, signal, recording) => {
    if (reason) throw new JudgeFailure('provider-error');
    if (!provider) {
      if (createJudge) provider = createJudge();
      else if (selected?.protocol === 'apus-llamacpp') {
        const { createApusJudge } = await import('../decision/apus.js');
        provider ??= createApusJudge({ baseUrl: selected.baseUrl, model: selected.model });
      } else {
        const { createSystemOneJudge } = await import('../decision/system-one.js');
        provider ??= createSystemOneJudge({ baseUrl: selected!.baseUrl, model: selected!.model,
          auth: auth?.type === 'bearer-env' ? { type: 'bearer', token } : { type: 'none' } });
      }
    }
    return provider(request, signal, recording);
  };
  return { status, judge, configuration, diagnostics };
}
