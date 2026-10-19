import { z } from 'zod';
import { threadRuleReasons } from '../src/inspector/thread-rules-model.js';
import { summaryGates } from '../src/inspector/bb-summary.js';
const id = z.string().regex(/^[a-f0-9]{64}$/);
const cursor = z.string().min(1).max(512);
const count = z.number().int().nonnegative();
const status = z.enum(['clear', 'violation', 'unclear', 'unchecked']);
const text = z.string().max(512).refine(value => new TextEncoder().encode(value).length <= 512);
export const threadRuleQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('calls') }).strict(),
  z.object({ kind: z.literal('inventory'), inventoryCursor: cursor.optional(), revision: id.optional() }).strict(),
  z.object({ kind: z.literal('checks'), ruleId: id, checkCursor: cursor.optional(), revision: id.optional() }).strict(),
  z.object({ kind: z.literal('call'), ruleId: id, sessionId: id, callId: id, ruleCursor: cursor.optional(), revision: id.optional() }).strict(),
]);
const rule = z.object({ id, policyId: id.nullable(), declarationRevision: id, label: text, labelShortened: z.boolean(),
  builtin: z.boolean(), role: z.enum(['global', 'project']).nullable(), excerpt: text.nullable(),
  excerptState: z.enum(['excerpt', 'shortened', 'unavailable', 'conflict']), status, conflict: z.boolean(),
  checks: count, unassessedObservations: count, timestamp: z.number().finite() }).strict();
const check = z.object({ id, sessionId: id, callId: id, timestamp: z.number().finite(), status, trusted: z.boolean(),
  outcome: z.enum(['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED', 'NOT_APPLICABLE']).nullable(),
  gates: z.array(z.enum([...summaryGates, 'unrecognized-gate'])).max(7).nullable(),
  reason: z.enum(['validated-recording', 'assessment-unavailable-or-invalid', 'gates-unavailable', 'unresolved-recorded-check']),
  profile: z.enum(['legacy', 'applicability-v1', 'unrecognized']), question: z.enum(['historical', 'current', 'unrecognized']).nullable(),
  input: z.enum(['current', 'unrecognized']).nullable() }).strict().refine(value => value.trusted || value.outcome === null);
const envelope = { revision: id, summary: z.object({ status, inventory: z.enum(['known', 'unknown']), retainedRules: count.max(1024), unchecked: count.max(1024),
  indexing: z.boolean(), capture: z.literal('best-effort'), incomplete: z.boolean(), reasons: z.array(z.enum(threadRuleReasons)).max(threadRuleReasons.length),
  omittedRules: count, omittedChecks: count, missingIntegrity: count }).strict() };
export const threadRulesSchema = z.discriminatedUnion('kind', [
  z.object({ ...envelope, kind: z.literal('inventory'), items: z.array(rule).max(50), next: cursor.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('checks'), rule, items: z.array(check).max(50), next: cursor.nullable(), omittedChecks: count }).strict(),
  z.object({ ...envelope, kind: z.literal('call'), rule, items: z.array(check).max(50), next: cursor.nullable(), omittedChecks: count }).strict(),
]);
