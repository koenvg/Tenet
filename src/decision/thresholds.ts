import type { Config, PolicySet } from './contracts.js';
import { INTEGRITY_ID } from './policy.js';

/** Host configuration only; never part of semantic rule instructions. */
export function evidenceThreshold(ruleId: string, policy: PolicySet, config: Config): number {
  return (ruleId === INTEGRITY_ID ? undefined : policy.rules.find(rule => rule.id === ruleId)?.evidenceThreshold)
    ?? config.evidenceThreshold;
}
