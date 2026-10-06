import { policyEvidence, policyIntegrity } from './policy-contract.js';
import type { JudgeRequest, EvidenceLimits } from './contracts.js';
import { jsonCopy } from './evidence.js';
import { prepareRequest, serializedBytes } from './history-selection.js';
import { UNSUPPORTED_ACTION } from '../runtime/resolved-action.js';
import { ASSESSMENT_PROFILE } from './assessment-contract.js';
import { evidenceContext } from './evidence-context.js';
import { freeze } from './evidence.js';

export function judgeState(request: JudgeRequest) {
  const policy = policyEvidence(request.policy);
  return { profile: ASSESSMENT_PROFILE, policy: jsonCopy(policy), context: { cwd: request.cwd },
    integrity: jsonCopy(policyIntegrity(request.policy)), action: jsonCopy(request.action),
    resolvedAction: jsonCopy(request.resolvedAction ?? UNSUPPORTED_ACTION),
    trajectory: jsonCopy(request.trajectory ?? { observations: [], omitted: 0, limitations: ['history-unavailable'] }) };
}

export function boundEvidence(request: JudgeRequest, limits?: EvidenceLimits): JudgeRequest | null {
  const bounded = prepareRequest(request, bounded => serializedBytes(judgeState(bounded)), limits);
  return bounded ? freeze({ ...bounded, evidenceContext: evidenceContext(bounded, limits, true) }) : null;
}
