import { z } from 'zod';
import { findingCategories } from '../src/decision/finding-triage.js';
import { evaluatorFailureCodes } from '../src/inspector/finding-view.js';
import { summaryChoices, summaryGates } from '../src/inspector/bb-summary.js';
import { recordedActionMaxBytes } from '../src/inspector/summary-display.js';

import { recordedJudgeReport } from '../src/recording/judge.js';
import { recordedConfiguration } from '../src/recording/configuration.js';
import type { SummaryJudge } from '../src/inspector/summary-model.js';
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
const origin = z.object({ role: z.enum(['global', 'project']).nullable(), source: label.nullable(), target: label.nullable(),
  digest: label.nullable(), line: count.positive().nullable() }).strict();
const rule = z.object({ id: label, text: z.string().max(2048), line: count.nullable(), enforcement: label, builtin: z.boolean(), origin: origin.nullable().optional(),
  result: z.object({ outcome: score, evidence: score }).strict().nullable(), gateIds: z.array(z.enum(summaryGates)).max(8).nullable(),
  contribution: label, thresholds: z.object({ effectThreshold: probability.nullable(), evidenceThreshold: probability.nullable() }).strict(),
  evidenceGate: label, profile: label, textStatus: z.enum(['recorded', 'truncated', 'missing']).optional(), omittedTextChars: count.optional() }).strict();
const recordedAction = z.object({ field: z.enum(['command', 'path', 'file_path']),
  text: z.string().min(1).max(recordedActionMaxBytes).refine(text => new TextEncoder().encode(text).length <= recordedActionMaxBytes),
  truncated: z.boolean() }).strict().nullable();
const reportedViolations = z.object({ assessment: z.enum(['validated', 'unavailable']), uncertain: z.boolean(), total: count, missingRuleSnapshots: count,
  items: z.array(z.object({ id: label, text: rule.shape.text, textStatus: rule.shape.textStatus,
    omittedTextChars: rule.shape.omittedTextChars, enforcement: label, uncertain: z.boolean() }).strict()).max(16),
}).strict().refine(value => value.assessment === 'unavailable'
  ? value.uncertain && value.total === 0 && value.items.length === 0 && value.missingRuleSnapshots === 0
  : value.missingRuleSnapshots <= value.total && value.items.length === Math.min(16, value.total - value.missingRuleSnapshots), 'incoherent reported violations');
const explanation = z.object({ blockerCount: count, uncertaintyOnly: z.boolean(),
  firstBlocker: z.object({ builtin: z.boolean(), line: count.nullable(), gate: z.enum(summaryGates),
    result: rule.shape.result, thresholds: rule.shape.thresholds }).strict().nullable() }).strict();
const facts = { decision: label, permission: label, execution: label, categories, missing: z.array(label).max(8),
  assessmentStatus: label, failure: z.enum(evaluatorFailureCodes).nullable(), evaluatorState };
const configurationSource = z.enum(['owner', 'project', 'default', 'environment', 'sdk']);
const limitSources = z.object({ running: configurationSource, waiting: configurationSource, bytes: configurationSource, ageMs: configurationSource }).strict();
const configuration = z.object({
  source: z.enum(['~/.tenet/config.json', '~/.tenet/config.json + <project>/.tenet/config.json']),
  settings: z.enum(['absent', 'valid', 'invalid']), availability: z.enum(['ready', 'unavailable']),
  reason: z.enum(['unsafe', 'unreadable', 'oversized', 'malformed', 'schema', 'effective-limits']).optional(),
  deadlineMs: z.number().int().positive().max(2147483647).nullable(),
  observation: z.object({ running: count.positive(), waiting: count.positive(), bytes: count.positive(), ageMs: count.positive().max(2147483647) }).strict().nullable(),
  sources: z.object({ judge: configurationSource.nullable(), deadlineMs: configurationSource.nullable(), observation: limitSources.nullable() }).strict(),
}).strict().refine(value => !!recordedConfiguration(value), 'invalid recorded configuration');
export const summaryJudgeSchema = z.object({
  provider: z.enum(['typesafe', 'system-one', 'apus-llamacpp', 'injected', 'unknown']).nullable(),
  requestedModel: label.nullable(), returnedModel: label.nullable(),
  judgeReportVersion: z.enum(['judge-report-v1', 'judge-report-v2']).nullable(),
  requestedDestination: z.string().max(2048).nullable(),
  transportContract: z.enum(['system-one-v1', 'llamacpp-b11118-choice-v1']).nullable(),
  authentication: z.enum(['none', 'bearer-env']).nullable(), experimental: z.literal(true).nullable(), configuration: configuration.nullable(),
}).strict().refine(value => {
  if (value.experimental !== null && value.provider !== 'apus-llamacpp') return false;
  if (value.judgeReportVersion === null) return value.requestedDestination === null && value.transportContract === null && value.authentication === null;
  const report = recordedJudgeReport({ ...value, requestedProvider: value.provider, returnedModel: value.returnedModel ?? undefined });
  return !!report && (value.judgeReportVersion === 'judge-report-v2'
    || value.requestedDestination === null && value.transportContract === null && value.authentication === null);
}, 'incoherent recorded judge');
type Assert<T extends true> = T;
export type JudgeSchemaMatchesModel = Assert<z.infer<typeof summaryJudgeSchema> extends SummaryJudge ? true : false>;
export type JudgeModelMatchesSchema = Assert<SummaryJudge extends z.infer<typeof summaryJudgeSchema> ? true : false>;
const call = z.object({ ...facts, id: recordId, callId: label, toolName: label, timestamp: z.number(), mode: label }).strict();
const selected = z.object({ ...facts, judge: summaryJudgeSchema, identity: z.object({ callId: label, toolName: label, mode: z.enum(['observe', 'enforce']) }).strict().nullable(),
  recordedAction, reportedViolations,
  metadata: z.object({ schemas: z.array(z.number().int()).max(4), questionVersion: label, profile: label, policyDigest: recordId.nullable() }).strict(),
  reason: label, approval: label, noRulesClassifiedViolated: z.boolean(), explanation, rules: z.array(rule).max(16), omittedRules: count, missingRuleSnapshots: count.optional(),
  rulePage: z.object({ snapshot: recordId, offset: count, total: count, next: nullableCursor }).strict().optional() }).strict().refine(value => value.evaluatorState.status === 'completed' || value.judge.returnedModel === null, 'returned model without complete assessment');
export const overviewSchema = z.object({ readScope: recordId.optional(), state: z.enum(['available', 'unsupported', 'unavailable']),
  coverage: z.enum(['unknown', 'partial', 'unavailable']), linkedCalls: count, failures: count, issues: codes,
  sessions: z.array(z.object({ id: recordId, timestamp: z.number(), started: z.number(), calls: count,
    categoryCounts: z.object({ violation: count, uncertainty: count, approval: count, unavailable: count, pending: count }).strict() }).strict()).max(50),
  nextSession: nullableCursor, sessionId: recordId.nullable(), calls: z.array(call).max(50), nextCall: nullableCursor,
  selectedId: recordId.nullable(), selected: selected.nullable() }).strict();
