import { freeze } from '../decision/immutable.js';
import { validOrigin } from '../decision/policy-origin.js';

export interface RecordedOrigin { role: 'global' | 'project' | null; source: string | null; target: string | null; digest: string | null; line: number | null }
export function recordedOrigin(schemaVersion: number | undefined, rule: Record<string, any>, policy: Record<string, any>): RecordedOrigin {
  if (schemaVersion === 5 && validOrigin(rule.origin)) return freeze({ ...rule.origin });
  // Do not infer project origin from a legacy path or identifier.
  return freeze({ role: null, source: typeof policy.source === 'string' ? policy.source : null,
    target: typeof policy.target === 'string' ? policy.target : null, digest: typeof policy.digest === 'string' ? policy.digest : null,
    line: typeof rule.line === 'number' ? rule.line : null });
}
export function recordedPolicyIdentity(schemaVersion: number | undefined, policy: Record<string, any>): string | undefined {
  if (schemaVersion === 5) return policy.contractVersion === 'policy-sources-v1' && policy.available === true
    && typeof policy.combinedDigest === 'string' && /^[a-f0-9]{64}$/.test(policy.combinedDigest) ? `policy-sources-v1:${policy.combinedDigest}` : undefined;
  return typeof policy.source === 'string' && typeof policy.digest === 'string'
    ? JSON.stringify([policy.source, policy.digest, typeof policy.target === 'string' ? policy.target : null]) : undefined;
}
