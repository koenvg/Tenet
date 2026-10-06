import type { RuleOrigin } from './contracts.js';

/** Browser-safe validation of recorded current declaration origins. No file reads. */
export function validOrigin(value: unknown): value is RuleOrigin {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const path = (p: unknown) => typeof p === 'string' && p.length > 0 && p.length <= 8192;
  return (v.role === 'global' || v.role === 'project') && path(v.source) && path(v.target)
    && typeof v.digest === 'string' && /^[a-f0-9]{64}$/.test(v.digest)
    && Number.isSafeInteger(v.line) && (v.line as number) > 0 && (v.line as number) <= 65536;
}
