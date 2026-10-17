import { z } from 'zod';

const threadId = z.string().regex(/^thr_[a-z0-9]{8,64}$/);
const projectId = z.string().regex(/^proj_[a-z0-9]{8,64}$/);
const key = z.string().regex(/^[a-f0-9]{64}$/);
const token = z.string().min(1).max(128);
const count = z.number().int().nonnegative();
export const dashboardScope = z.object({ kind: z.literal('project'), projectId }).strict();
export const dashboardContribution = z.object({ key, preview: z.string().max(2048).nullable(), builtin: z.boolean(),
  state: z.enum(['passed', 'failed', 'unscored']),
  threadId, sessionId: key, callId: key, timestamp: z.number().finite(), toolName: z.string().max(256) }).strict();
const rate = z.number().finite().min(0).max(100).nullable();
const row = dashboardContribution.pick({ key: true, preview: true, builtin: true })
  .extend({ passed: count, failed: count, unscored: count, passing: rate, failing: rate, threads: count }).strict();
// Unknown is a subset of processed. Partial observations and unsearched threads are separate from completed work.
export const coverageSchema = z.object({ discovered: count, resolved: count, processed: count, unknown: count, unavailable: count,
  unprocessed: count, partial: count, omittedInvocations: count,
  invocations: count, capture: z.literal('best-effort'), reasons: z.array(z.string().max(128)).max(20) }).strict();
const states = ['discovering', 'reading', 'finished', 'limited', 'restart-required'] as const;
export const dashboardPage = z.object({ run: token, scope: dashboardScope, projectLabel: z.string().max(256), state: z.enum(states), revision: count,
  started: z.number().finite(), observed: z.number().finite(), coverage: coverageSchema,
  rows: z.array(row).max(50), next: token.nullable(), rowsNext: token.nullable() }).strict();
const contributor = dashboardContribution.pick({ threadId: true, sessionId: true, callId: true, timestamp: true, toolName: true })
  .extend({ projectId, label: z.string().max(256) }).strict();
const stopInput = z.object({ token }).strict();
const stopOutput = z.object({ stopped: z.literal(true) }).strict();
export const dashboardMethods = {
  dashboardStop: { input: stopInput, output: stopOutput },
  dashboard: { input: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('start'), scope: dashboardScope }).strict(),
    z.object({ kind: z.literal('advance'), token }).strict(),
    z.object({ kind: z.literal('results'), token, cursor: token.optional() }).strict(),
  ]), output: dashboardPage },
  dashboardContributors: { input: z.object({ token, rule: key, expectedRevision: count, cursor: token.optional() }).strict(),
    output: z.object({ state: z.enum(['ready', 'restart-required']), items: z.array(contributor).max(50), next: token.nullable() }).strict() },
};
export const dashboardHostMethods = { readDashboard: {
  input: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('start'), threads: z.array(threadId).min(1).max(128), qualification: key,
      recordingDirectory: z.string().max(4096).optional() }).strict(),
    z.object({ kind: z.literal('advance'), token }).strict(),
  ]),
  output: z.object({ state: z.enum(['reading', 'finished', 'limited', 'restart-required', 'unavailable']), next: token.nullable(),
    contributions: z.array(dashboardContribution).max(65), linkedThreads: z.array(threadId).max(128), invocations: count.max(128), invocationSizes: z.array(count.max(65)).max(128),
    // Association completion is not a capture guarantee. The omission count covers known retained groups; omittedThreads also covers unretained groups.
    association: z.enum(['pending', 'complete', 'partial']), omittedThreads: z.array(threadId).max(128), omittedInvocations: count,
    reasons: z.array(z.string().max(128)).max(20) }).strict().superRefine((chunk, ctx) => {
      if (chunk.invocationSizes.length !== chunk.invocations || chunk.invocationSizes.reduce((sum, size) => sum + size, 0) !== chunk.contributions.length) {
        ctx.addIssue({ code: 'custom', message: 'Invocation boundaries must match counts and contributions' });
        return;
      }
      let offset = 0;
      for (const size of chunk.invocationSizes) {
        const segment = chunk.contributions.slice(offset, offset + size), first = segment[0];
        for (const contribution of segment) {
          if (contribution.threadId !== first!.threadId || contribution.sessionId !== first!.sessionId || contribution.callId !== first!.callId) {
            ctx.addIssue({ code: 'custom', message: 'Invocation segment must have one thread/session/call identity' });
            return;
          }
        }
        offset += size;
      }
    }),
}, stopDashboard: { input: stopInput, output: stopOutput } };
export type DashboardScope = z.infer<typeof dashboardScope>;
export type Coverage = z.infer<typeof coverageSchema>;
export type ProjectRuleSummary = z.infer<typeof dashboardPage>;
export type DashboardPage = ProjectRuleSummary;
export type DashboardRequest = z.infer<typeof dashboardMethods.dashboard.input>;
export type ContributorRequest = z.infer<typeof dashboardMethods.dashboardContributors.input>;
export type ContributorPage = z.infer<typeof dashboardMethods.dashboardContributors.output>;
export type HostDashboardRequest = z.infer<typeof dashboardHostMethods.readDashboard.input>;
export type HostDashboardChunk = z.infer<typeof dashboardHostMethods.readDashboard.output>;
export type DashboardStopRequest = z.infer<typeof stopInput>;
export type DashboardStopAck = z.infer<typeof stopOutput>;
