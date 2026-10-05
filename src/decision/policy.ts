import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Policy, PolicyCandidate, PolicyFailure, PolicyRole, PolicySet, PolicySource, Rule } from './contracts.js';
import { probeFilesystemPresence } from './filesystem-presence.js';
import { freeze } from './immutable.js';
export const POLICY_CONTRACT = 'policy-sources-v1' as const;

// Example text, not a parser allowlist.
export const RULE = 'Never publish code to a remote repository without explicit approval.';
export const POLICY_LIMITS = Object.freeze({ fileBytes: 64 * 1024, rules: 16, ruleBytes: 4096 });
export const INTEGRITY_ID = 'builtin:policy-integrity';
export const INTEGRITY_TEXT = 'Never modify, delete, replace, rename or redirect the selected policy sources, resolved targets or absent selected candidates, including through aliases, links or parent-directory operations. Reading the policy is permitted. This constraint has no approval exception and cannot be overridden by user rules.';
class PolicyError extends Error { constructor(readonly reason: PolicyFailure) { super(reason); } }

async function snapshot(source: string) {
  const target = await realpath(source);
  // Nonblocking open prevents special files such as FIFOs from stalling the guard.
  const file = await open(target, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new PolicyError('policy-unavailable');
    if (stat.size > POLICY_LIMITS.fileBytes) throw new PolicyError('policy-file-limit');
    const buffer = Buffer.alloc(POLICY_LIMITS.fileBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > POLICY_LIMITS.fileBytes) throw new PolicyError('policy-file-limit');
    if (await realpath(source) !== target) throw new PolicyError('policy-unavailable');
    const bytes = buffer.subarray(0, length);
    return { target, bytes, digest: createHash('sha256').update(bytes).digest('hex') };
  } finally { await file.close(); }
}

/** A path selects one project source. Candidate sets are an internal composition seam,
 * not discovery: runtime callers supply the shared selector's result. */
export async function loadPolicy(input: string | readonly PolicyCandidate[]): Promise<Policy> {
  const candidates: PolicyCandidate[] = (typeof input === 'string'
    ? [{ role: 'project' as const, source: resolve(input), selection: 'explicit' as const, presence: 'present' as const }]
    : input.map(c => ({ role: c.role, source: c.source ? resolve(c.source) : '', selection: c.selection, presence: c.presence })))
    .sort((a, b) => a.role === b.role ? 0 : a.role === 'global' ? -1 : 1);
  let failedRole: PolicyRole | undefined;
  try {
    failedRole = candidates.find(c => !c.source || c.presence === 'unavailable')?.role;
    if (!candidates.length || candidates.length > 2 || new Set(candidates.map(c => c.role)).size !== candidates.length
      || candidates.some(c => !['global', 'project'].includes(c.role) || !c.source
        || !['local', 'explicit'].includes(c.selection) || !['present', 'absent', 'unavailable'].includes(c.presence)))
      throw new PolicyError('policy-unavailable');
    const sources: PolicySource[] = [];
    for (const candidate of candidates) {
      failedRole = candidate.role;
      if (candidate.presence === 'absent') {
        if (candidate.selection !== 'local' || (await probeFilesystemPresence(candidate.source)) !== 'absent') throw new PolicyError('policy-unavailable');
        continue;
      }
      if (candidate.presence !== 'present') throw new PolicyError('policy-unavailable');
      const { source, role } = candidate;
      const { bytes, target, digest } = await snapshot(source);
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new PolicyError('policy-format'); }
      const rules: Rule[] = [];
      for (const [index, raw] of text.split(/\r?\n/).entries()) {
        const line = raw.trim();
        if (!line.startsWith('Rule;')) continue;
        const declaration = line.slice(5).trim();
        const prefix = /^(BLOCK|WARN);/.exec(declaration);
        const enforcement = prefix?.[1] === 'WARN' ? 'WARN' : 'BLOCK';
        let rule = prefix ? declaration.slice(prefix[0].length).trim() : declaration;
        let evidenceThreshold: number | undefined;
        if (prefix && /^evidenceThreshold\b/.test(rule)) {
          const metadata = /^evidenceThreshold\s*=\s*(\d+(?:\.\d+)?)\s*;/.exec(rule);
          if (!metadata) throw new PolicyError('policy-format');
          evidenceThreshold = Number(metadata[1]);
          rule = rule.slice(metadata[0].length).trim();
          if (!Number.isFinite(evidenceThreshold) || evidenceThreshold > 1 || /^evidenceThreshold\b/.test(rule)) throw new PolicyError('policy-format');
        }
        if (!rule) throw new PolicyError('policy-format');
        if (Buffer.byteLength(rule, 'utf8') > POLICY_LIMITS.ruleBytes) throw new PolicyError('policy-rule-size-limit');
        rules.push({ id: `${role}:${digest}:${index + 1}`, line: index + 1,
          origin: { role, source, target, digest, line: index + 1 }, text: rule, enforcement,
          ...(evidenceThreshold === undefined ? {} : { evidenceThreshold }) });
        if (rules.length > POLICY_LIMITS.rules) throw new PolicyError('policy-rule-count-limit');
      }
      if (!rules.length) throw new PolicyError('policy-format');
      sources.push({ role, source, target, digest, bytes: bytes.length, rules });
      if (sources.reduce((n, s) => n + s.bytes, 0) > POLICY_LIMITS.fileBytes) throw new PolicyError('policy-file-limit');
      if (sources.reduce((n, s) => n + s.rules.length, 0) > POLICY_LIMITS.rules) throw new PolicyError('policy-rule-count-limit');
    }
    if (!sources.length) throw new PolicyError('policy-unavailable');
    for (const s of sources) {
      if (sources.some(other => other.target === s.target && other.digest !== s.digest)) throw new PolicyError('policy-unavailable');
    }
    const policy: PolicySet = { available: true, contractVersion: POLICY_CONTRACT, candidates, sources,
      combinedDigest: combinedPolicyDigest(candidates, sources), bytes: sources.reduce((n, s) => n + s.bytes, 0),
      rules: sources.flatMap(s => s.rules) };
    if (!await policyIsCurrent(policy)) { failedRole = undefined; throw new PolicyError('policy-unavailable'); }
    return freeze(policy);
  } catch (error) {
    return freeze({ available: false, contractVersion: POLICY_CONTRACT, candidates, failedRole,
      reason: error instanceof PolicyError ? error.reason : 'policy-unavailable' });
  }
}

/** Stable, unambiguous encoding. No concatenated policy text or path delimiters. */
export function combinedPolicyDigest(candidates: readonly PolicyCandidate[], sources: readonly PolicySource[]): string {
  return createHash('sha256').update(JSON.stringify([POLICY_CONTRACT, candidates.map(c => {
    const s = sources.find(s => s.role === c.role);
    return [c.role, c.source, c.selection, c.presence, s ? [s.target, s.digest, s.bytes] : null];
  })])).digest('hex');
}

export async function policyIsCurrent(policy: PolicySet): Promise<boolean> {
  try {
    for (const c of policy.candidates) {
      if (c.presence === 'absent') { if ((await probeFilesystemPresence(c.source)) !== 'absent') return false; continue; }
      const s = policy.sources.find(s => s.role === c.role);
      if (!s) return false;
      const current = await snapshot(c.source);
      if (current.target !== s.target || current.digest !== s.digest) return false;
    }
    return true;
  } catch { return false; }
}
