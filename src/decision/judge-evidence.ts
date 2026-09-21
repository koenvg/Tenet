import type { JudgeRequest, Trajectory, EvidenceLimits } from './contracts.js';
import { freeze, jsonCopy } from './evidence.js';
import { INTEGRITY_ID, INTEGRITY_TEXT } from './policy.js';
import { EVIDENCE_DEFAULTS, serializedBytes } from './trajectory.js';

export function judgeState(request: JudgeRequest) {
  const policy = { ...request.policy, rules: request.policy.rules.map(({ id, line, text }) => ({ id, line, text })) };
  return { policy: jsonCopy(policy), context: { cwd: request.cwd },
    integrity: { id: INTEGRITY_ID, text: INTEGRITY_TEXT }, action: jsonCopy(request.action),
    trajectory: jsonCopy(request.trajectory ?? { observations: [], omitted: 0, limitations: ['history-unavailable'] }) };
}

export function boundEvidence(request: JudgeRequest, limits: EvidenceLimits = EVIDENCE_DEFAULTS): JudgeRequest | null {
  const source = request.trajectory ?? { observations: [], omitted: 0, limitations: ['history-unavailable'] };
  const observations = [...source.observations];
  let omitted = source.omitted;
  const snapshot = () => {
    const trajectory: Trajectory = { observations: [...observations], omitted,
      limitations: [...source.limitations, ...(omitted > source.omitted ? ['history-omitted'] : [])] };
    return freeze(JSON.parse(JSON.stringify({ ...request, trajectory })) as JudgeRequest);
  };
  while (observations.length > limits.recentEvents) { observations.shift(); omitted++; }
  let bounded = snapshot();
  while (serializedBytes(judgeState(bounded)) > limits.maxBytes && observations.length) {
    observations.shift(); omitted++; bounded = snapshot();
  }
  return serializedBytes(judgeState(bounded)) <= limits.maxBytes ? bounded : null;
}
