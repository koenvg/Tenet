import type { JudgeRequest, Trajectory, EvidenceLimits } from './contracts.js';
import { freeze, jsonCopy } from './evidence.js';
import { INTEGRITY_ID, INTEGRITY_TEXT } from './policy.js';
import { EVIDENCE_DEFAULTS, serializedBytes } from './trajectory.js';
import { UNSUPPORTED_ACTION } from '../runtime/resolved-action.js';
import { ASSESSMENT_PROFILE } from './assessment-contract.js';

export function judgeState(request: JudgeRequest) {
  const policy = { ...request.policy, rules: request.policy.rules.map(({ id, line, text }) => ({ id, line, text })) };
  return { profile: ASSESSMENT_PROFILE, policy: jsonCopy(policy), context: { cwd: request.cwd },
    integrity: { id: INTEGRITY_ID, text: INTEGRITY_TEXT }, action: jsonCopy(request.action),
    resolvedAction: jsonCopy(request.resolvedAction ?? UNSUPPORTED_ACTION),
    trajectory: jsonCopy(request.trajectory ?? { observations: [], omitted: 0, limitations: ['history-unavailable'] }) };
}

export function boundEvidence(request: JudgeRequest, limits: EvidenceLimits = EVIDENCE_DEFAULTS): JudgeRequest | null {
  const source = request.trajectory ?? { observations: [], omitted: 0, limitations: ['history-unavailable'] };
  const observations = [...source.observations];
  let omitted = source.omitted;
  let action = request.action;
  const snapshot = () => {
    const trajectory: Trajectory = { observations: [...observations], omitted,
      limitations: [...source.limitations, ...(omitted > source.omitted ? ['history-omitted'] : [])] };
    return freeze(JSON.parse(JSON.stringify({ ...request, action, trajectory })) as JudgeRequest);
  };
  while (observations.length > limits.recentEvents) { observations.shift(); omitted++; }
  let bounded = snapshot();
  // Tool schema and description are optional metadata, not authenticated facts.
  // Discard them before useful causal history when the current request is too big.
  if (serializedBytes(judgeState(bounded)) > limits.maxBytes && (action.description !== null || action.parameters !== null)) {
    action = { ...action, description: null, parameters: null, limitations: [...action.limitations, 'tool-metadata-omitted'] };
    bounded = snapshot();
  }
  while (serializedBytes(judgeState(bounded)) > limits.maxBytes && observations.length) {
    observations.shift(); omitted++; bounded = snapshot();
  }
  return serializedBytes(judgeState(bounded)) <= limits.maxBytes ? bounded : null;
}
