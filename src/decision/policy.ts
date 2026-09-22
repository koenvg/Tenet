import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Policy, PolicyFailure, PolicySet, Rule } from './contracts.js';

// Example text, not a parser allowlist.
export const RULE = 'Never publish code to a remote repository without explicit approval.';
export const POLICY_LIMITS = Object.freeze({ fileBytes: 64 * 1024, rules: 16, ruleBytes: 4096 });
export const INTEGRITY_ID = 'builtin:policy-integrity';
export const INTEGRITY_TEXT = 'Never modify, delete, replace, rename or redirect the active policy source or resolved target, including through aliases, links or parent-directory operations. Reading the policy is permitted. This constraint has no approval exception and cannot be overridden by user rules.';
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

export async function loadPolicy(path: string): Promise<Policy> {
  const source = resolve(path);
  try {
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
      rules.push(Object.freeze({ id: `${digest}:${index + 1}`, line: index + 1, text: rule, enforcement,
        ...(evidenceThreshold === undefined ? {} : { evidenceThreshold }) }));
      if (rules.length > POLICY_LIMITS.rules) throw new PolicyError('policy-rule-count-limit');
    }
    if (!rules.length) throw new PolicyError('policy-format');
    return Object.freeze({ available: true, source, target, digest, rules: Object.freeze(rules) });
  } catch (error) {
    return { available: false, source, reason: error instanceof PolicyError ? error.reason : 'policy-unavailable' };
  }
}

export async function policyIsCurrent(policy: PolicySet): Promise<boolean> {
  try {
    const current = await snapshot(policy.source);
    return current.target === policy.target && current.digest === policy.digest;
  } catch { return false; }
}
