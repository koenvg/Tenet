import { combinedPolicyDigest, INTEGRITY_ID, INTEGRITY_TEXT } from './policy.js';
import type { Policy } from './contracts.js';
import { validOrigin } from './policy-origin.js';

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const path = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 8192;
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v: unknown, max: number) => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= max;
/** Current provenance only. Historical shapes are routed by the containing record version. */
export function validPolicySnapshot(v: unknown): v is Policy {
  if (!object(v) || ['source', 'target', 'digest'].some(key => Object.hasOwn(v, key)) || v.contractVersion !== 'policy-sources-v1' || !Array.isArray(v.candidates)
    || v.candidates.length > 2 || new Set(v.candidates.map((c: any) => c?.role)).size !== v.candidates.length
    || v.candidates.some((c: any, i: number) => !object(c) || !['global', 'project'].includes(c.role)
      || typeof c.source !== 'string' || c.source.length > 8192 || !['local', 'explicit'].includes(c.selection)
      || !['present', 'absent', 'unavailable'].includes(c.presence) || i > 0 && c.role !== 'project')) return false;
  if (v.available === false) return ['policy-unavailable', 'policy-format', 'policy-file-limit', 'policy-rule-count-limit', 'policy-rule-size-limit'].includes(v.reason)
    && !['sources', 'rules', 'combinedDigest', 'bytes'].some(key => Object.hasOwn(v, key))
    && (v.failedRole === undefined || v.candidates.some((c: any) => c.role === v.failedRole));
  if (v.available !== true || !v.candidates.length || v.candidates.some((c: any) => !path(c.source)
    || c.presence === 'unavailable' || c.presence === 'absent' && c.selection !== 'local')
    || !digest(v.combinedDigest) || !integer(v.bytes, 65536) || !Array.isArray(v.sources) || !v.sources.length
    || v.sources.length !== v.candidates.filter((c: any) => c.presence === 'present').length
    || !Array.isArray(v.rules) || !v.rules.length || v.rules.length > 16) return false;
  const declarations: any[] = [];
  for (const [i, s] of v.sources.entries()) {
    const c = v.candidates.filter((c: any) => c.presence === 'present')[i];
    if (!object(s) || s.role !== c.role || s.source !== c.source || !path(s.target) || !digest(s.digest)
      || !integer(s.bytes, 65536) || !Array.isArray(s.rules) || !s.rules.length) return false;
    let lastLine = 0;
    for (const r of s.rules) {
      if (!object(r) || !validOrigin(r.origin) || r.line !== r.origin.line || r.line <= lastLine
        || r.id !== `${s.role}:${s.digest}:${r.line}` || r.origin.role !== s.role || r.origin.source !== s.source
        || r.origin.target !== s.target || r.origin.digest !== s.digest || typeof r.text !== 'string' || !r.text.trim()
        || new TextEncoder().encode(r.text).length > 4096 || !['BLOCK', 'WARN'].includes(r.enforcement)
        || r.evidenceThreshold !== undefined && (typeof r.evidenceThreshold !== 'number' || !Number.isFinite(r.evidenceThreshold) || r.evidenceThreshold < 0 || r.evidenceThreshold > 1)) return false;
      lastLine = r.line; declarations.push(r);
    }
  }
  return v.bytes === v.sources.reduce((n: number, s: any) => n + s.bytes, 0)
    && v.combinedDigest === combinedPolicyDigest(v.candidates, v.sources)
    && new Set(declarations.map(r => r.id)).size === declarations.length
    && v.sources.every((s: any) => v.sources.every((t: any) => s.target !== t.target || s.digest === t.digest))
    && JSON.stringify(declarations) === JSON.stringify(v.rules);
}
/** Current evaluator projection. Source metadata appears once; declaration references
 * resolve by role, digest and physical line. Decision settings remain host-only. */
export function policyEvidence(policy: Extract<Policy, { available: true }>) {
  return { available: true, contractVersion: policy.contractVersion, evidenceVersion: 'policy-evidence-v2',
    combinedDigest: policy.combinedDigest, bytes: policy.bytes, candidates: policy.candidates,
    sources: policy.sources.map(({ rules, ...s }) => ({ ...s, declarationIds: rules.map(r => r.id) })),
    rules: policy.rules.map(({ id, line, text, origin }) => ({ id, line, text,
      origin: { role: origin.role, digest: origin.digest, line: origin.line } })) };
}

export function policyIntegrity(policy: Extract<Policy, { available: true }>) {
  return { version: 'policy-integrity-v2', id: INTEGRITY_ID, text: INTEGRITY_TEXT,
    candidates: policy.candidates, targets: policy.sources.map(({ role, source, target, digest }) => ({ role, source, target, digest })) };
}
