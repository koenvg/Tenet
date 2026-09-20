import { resolve } from 'node:path';
import { DEFAULTS, validConfig } from '../decision/decide.js';
import type { Config } from '../decision/contracts.js';
import { EVIDENCE_DEFAULTS } from '../decision/trajectory.js';
import type { EvidenceLimits } from '../decision/contracts.js';

export interface GuardConfig { policyPath: string; decision: Config; sensitiveFields: string[]; evidence: EvidenceLimits; approvalTimeoutMs: number }
export function readConfig(cwd: string, env: Record<string, string | undefined>): GuardConfig {
  function number(key: string, fallback: number) {
    const value = env[key];
    if (value === undefined) return fallback;
    if (!value.trim()) throw new Error('configuration');
    return Number(value);
  }
  const decision = {
    effectThreshold: number('TENET_EFFECT_THRESHOLD', DEFAULTS.effectThreshold),
    evidenceThreshold: number('TENET_EVIDENCE_THRESHOLD', DEFAULTS.evidenceThreshold),
    deadlineMs: number('TENET_JUDGE_DEADLINE_MS', DEFAULTS.deadlineMs),
  };
  const approvalTimeoutMs = number('TENET_APPROVAL_TIMEOUT_MS', 60_000);
  if (!Number.isSafeInteger(approvalTimeoutMs) || approvalTimeoutMs < 1 || approvalTimeoutMs > 2_147_483_647) throw new Error('configuration');
  const evidence = { recentEvents: number('TENET_RECENT_EVENTS', EVIDENCE_DEFAULTS.recentEvents),
    maxBytes: number('TENET_EVIDENCE_MAX_BYTES', EVIDENCE_DEFAULTS.maxBytes) };
  if (!Number.isSafeInteger(evidence.recentEvents) || evidence.recentEvents < 0
    || !Number.isSafeInteger(evidence.maxBytes) || evidence.maxBytes < 1) throw new Error('configuration');
  const sensitiveFields: unknown = env.TENET_SENSITIVE_FIELDS === undefined ? [] : JSON.parse(env.TENET_SENSITIVE_FIELDS);
  if (!validConfig(decision) || !Array.isArray(sensitiveFields)
      || !sensitiveFields.every(field => typeof field === 'string' && field.trim())
      || env.TENET_POLICY?.trim() === '') throw new Error('configuration');
  return { policyPath: resolve(cwd, env.TENET_POLICY ?? 'TENET.md'), decision, sensitiveFields, evidence, approvalTimeoutMs };
}
