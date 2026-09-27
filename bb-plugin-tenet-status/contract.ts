import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';

export const threadIdSchema = z.string().regex(/^thr_[a-z0-9]{8,64}$/);
const request = z.object({ threadId: threadIdSchema }).strict();
export const statusSchema = z.object({ coverage: z.enum(['unknown', 'partial', 'unavailable']), linkedCalls: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(), issues: z.array(z.string()).max(20) }).strict();
export type Status = z.infer<typeof statusSchema>;
export const unavailable = (): Status => ({ coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: ['host-or-archive-unavailable'] });
const findingRule = z.object({ ruleId: z.string().max(256), severity: z.enum(['BLOCK', 'WARN']),
  policyText: z.string().max(2048).nullable(), confidence: z.number().min(0).max(1).nullable() }).strict();
const finding = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), callId: z.string().max(256), toolName: z.string().max(256),
  timestamp: z.number(), mode: z.enum(['observe', 'enforce']), rules: z.array(findingRule).max(16),
  wouldDecision: z.enum(['ALLOW', 'ASK', 'BLOCK', 'unknown']), actualPermission: z.enum(['released', 'blocked', 'unknown']),
  observedExecution: z.enum(['executed', 'failed', 'unknown']), missingStages: z.array(z.string()).max(8) }).strict();
export const findingsSchema = z.object({ coverage: statusSchema.shape.coverage, linkedCalls: statusSchema.shape.linkedCalls,
  issues: statusSchema.shape.issues, items: z.array(finding).max(5), next: z.string().max(512).nullable() }).strict();
export type Findings = z.infer<typeof findingsSchema>;
export const unavailableFindings = (): Findings => ({ coverage: 'unavailable', linkedCalls: 0, issues: ['host-or-archive-unavailable'], items: [], next: null });
const findingsRequest = z.object({ ...request.shape, cursor: z.string().min(1).max(512).optional() }).strict();
export const hostContract = defineRpcContract({ readStatus: { input: z.object({ ...request.shape,
  recordingDirectory: z.string().max(4096).optional() }).strict(), output: statusSchema },
  readFindings: { input: z.object({ ...findingsRequest.shape, recordingDirectory: z.string().max(4096).optional() }).strict(), output: findingsSchema } });
export const rpcContract = defineRpcContract({ status: { input: request, output: statusSchema },
  findings: { input: findingsRequest, output: findingsSchema } });
