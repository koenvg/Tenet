import type { Action, JudgeRequest } from './contracts.js';
import { argumentDigest } from './evidence.js';
import type { ResolvedAction } from '../runtime/resolved-action.js';

export const ASSESSMENT_PROFILE = 'applicability-v1';
export const QUESTION_VERSION = 'policy-rules-v6-applicability';
export type AssessmentProfile = typeof ASSESSMENT_PROFILE;
export const ASSESSMENT_METADATA = Object.freeze({ profile: ASSESSMENT_PROFILE, questionVersion: QUESTION_VERSION });
export type AssessmentMetadata = typeof ASSESSMENT_METADATA;
export interface FactReferences { digest: string; operationIds: string[] }
export function currentFactReferences(resolved: ResolvedAction | undefined): FactReferences | null {
  if (resolved?.status !== 'authenticated-complete') return null;
  return { digest: argumentDigest(resolved), operationIds: resolved.facts.operations.map(op => op.id) };
}
// This function consumes only host-populated JudgeRequest fields, never action arguments.
// The runtime owns authentication and freshness revalidation before permission release.
export function supportsExemption(refs: FactReferences, request?: Pick<JudgeRequest, 'action' | 'cwd' | 'resolvedAction'>): boolean {
  const resolved = request?.resolvedAction;
  if (!request || resolved?.status !== 'authenticated-complete' || resolved.redactedFields || resolved.limitations.length) return false;
  const { facts } = resolved;
  const action: Action = request.action;
  if (facts.coverage !== 'complete' || facts.limitations.length || !facts.operations.length
    || facts.binding.sessionId !== action.sessionId || facts.binding.callId !== action.callId
    || facts.binding.toolName !== action.toolName || facts.binding.argumentDigest !== action.argumentDigest || facts.binding.cwd !== request.cwd) return false;
  if (facts.operations.some(op => !['file-read', 'file-edit', 'move', 'remove'].includes(op.semantics)
    || !op.resources.length || op.content.some(c => c.role !== 'literal')
    || op.semantics === 'file-edit' && (!Object.hasOwn(op, 'before') || !Object.hasOwn(op, 'after')))) return false;
  const expected = currentFactReferences(resolved)!;
  return refs.digest === expected.digest && refs.operationIds.length === expected.operationIds.length
    && new Set(refs.operationIds).size === refs.operationIds.length && expected.operationIds.every(id => refs.operationIds.includes(id));
}
