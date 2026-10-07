import { z } from 'zod';
import { findingCategories } from '../src/decision/finding-triage.js';
import { evaluatorFailureCodes } from '../src/inspector/finding-view.js';
import { summaryChoices, summaryGates } from '../src/inspector/bb-summary.js';

export const recordId = z.string().regex(/^[a-f0-9]{64}$/);
const label = z.string().max(256), count = z.number().int().nonnegative();
const cursor = z.string().min(1).max(512);
export const overviewSelection = {
  sessionId: recordId.optional(), callId: recordId.optional(), category: z.enum(findingCategories).optional(),
  sessionCursor: cursor.optional(), callCursor: cursor.optional(), ruleCursor: cursor.optional(),
};
const nullableCursor = cursor.nullable();
const codes = z.array(label).max(20);
const categories = z.array(z.enum(findingCategories)).max(5);
const evaluatorState = z.object({ status: z.enum(['completed', 'unavailable', 'pending', 'dropped', 'cancelled', 'incomplete']),
  reason: z.enum(evaluatorFailureCodes).nullable() }).strict();
const probability = z.number().min(0).max(1);
const score = z.object({ choice: z.enum(summaryChoices), probabilities: z.partialRecord(z.enum(summaryChoices), probability) }).strict().nullable();
const rule = z.object({ id: label, text: z.string().max(2048), line: count.nullable(), enforcement: label, builtin: z.boolean(),
  result: z.object({ outcome: score, evidence: score }).strict().nullable(), gateIds: z.array(z.enum(summaryGates)).max(8).nullable(),
  contribution: label, thresholds: z.object({ effectThreshold: probability.nullable(), evidenceThreshold: probability.nullable() }).strict(),
  evidenceGate: label, profile: label, textStatus: z.enum(['recorded', 'truncated', 'missing']).optional(), omittedTextChars: count.optional() }).strict();
const facts = { decision: label, permission: label, execution: label, categories, missing: z.array(label).max(8),
  assessmentStatus: label, failure: z.enum(evaluatorFailureCodes).nullable(), evaluatorState };
const call = z.object({ ...facts, id: recordId, callId: label, toolName: label, timestamp: z.number(), mode: label }).strict();
const selected = z.object({ ...facts, identity: z.object({ callId: label, toolName: label, mode: z.enum(['observe', 'enforce']) }).strict().nullable(),
  metadata: z.object({ schemas: z.array(z.number().int()).max(4), questionVersion: label, profile: label, policyDigest: recordId.nullable() }).strict(),
  reason: label, approval: label, noRulesClassifiedViolated: z.boolean(), rules: z.array(rule).max(16), omittedRules: count, missingRuleSnapshots: count.optional(),
  rulePage: z.object({ snapshot: recordId, offset: count, total: count, next: nullableCursor }).strict().optional() }).strict();
export const overviewSchema = z.object({ readScope: recordId.optional(), state: z.enum(['available', 'unsupported', 'unavailable']),
  coverage: z.enum(['unknown', 'partial', 'unavailable']), linkedCalls: count, failures: count, issues: codes,
  sessions: z.array(z.object({ id: recordId, timestamp: z.number(), started: z.number(), calls: count,
    categoryCounts: z.object({ violation: count, uncertainty: count, approval: count, unavailable: count, pending: count }).strict() }).strict()).max(50),
  nextSession: nullableCursor, sessionId: recordId.nullable(), calls: z.array(call).max(50), nextCall: nullableCursor,
  selectedId: recordId.nullable(), selected: selected.nullable() }).strict();
