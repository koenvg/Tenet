import type { RequestedJudgeIdentity } from '../decision/contracts.js';
import { systemOneOrigin } from '../decision/system-one-origin.js';

interface Models { readonly requestedModel: string | null; readonly returnedModel?: string }
export interface JudgeReportV1 extends Models {
  readonly judgeReportVersion: 'judge-report-v1';
  readonly requestedProvider: 'typesafe' | 'apus-llamacpp' | 'injected' | 'unknown';
}
export interface JudgeReportV2 extends Models {
  readonly judgeReportVersion: 'judge-report-v2';
  readonly requestedProvider: RequestedJudgeIdentity['provider'];
  readonly requestedDestination: string | null;
  readonly transportContract: 'system-one-v1' | 'llamacpp-b11118-choice-v1' | null;
  readonly authentication: 'none' | 'bearer-env' | null;
}
export type JudgeReport = JudgeReportV1 | JudgeReportV2;

export function judgeReport(identity?: RequestedJudgeIdentity, returnedModel?: string): JudgeReportV2 {
  return { judgeReportVersion: 'judge-report-v2', requestedProvider: identity?.provider ?? 'injected',
    requestedModel: identity?.requestedModel ?? null, requestedDestination: identity?.requestedDestination ?? null,
    transportContract: identity?.transportContract ?? null, authentication: identity?.authentication ?? null,
    ...(returnedModel !== undefined ? { returnedModel } : {}) };
}
const alias = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 256 && !/[\x00-\x1f\x7f-\x9f]/.test(v);
function canonicalOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const explicitPort = /^http:\/\/(127\.0\.0\.1|\[::1\])$/.test(value) ? `${value}:80` : value;
  return systemOneOrigin(explicitPort) === value;
}
export function recordedJudgeReport(d: Record<string, unknown>): JudgeReport | undefined {
  if (d.requestedModel !== null && !alias(d.requestedModel)
    || d.returnedModel !== undefined && !alias(d.returnedModel)) return;
  const models = { requestedModel: d.requestedModel as string | null,
    ...(d.returnedModel !== undefined ? { returnedModel: d.returnedModel as string } : {}) };
  if (d.judgeReportVersion === 'judge-report-v1') {
    if (typeof d.requestedProvider !== 'string' || !['typesafe', 'apus-llamacpp', 'injected', 'unknown'].includes(d.requestedProvider)) return;
    return { judgeReportVersion: 'judge-report-v1', requestedProvider: d.requestedProvider as JudgeReportV1['requestedProvider'], ...models };
  }
  if (d.judgeReportVersion !== 'judge-report-v2') return;
  const { requestedProvider, requestedDestination, transportContract, authentication } = d;
  if (requestedProvider === 'system-one') {
    if (!canonicalOrigin(requestedDestination)
      || transportContract !== 'system-one-v1' || authentication !== 'none' && authentication !== 'bearer-env'
      || authentication === 'none' && !['127.0.0.1', '[::1]'].includes(new URL(requestedDestination).hostname)) return;
  } else if (requestedProvider === 'apus-llamacpp') {
    if (!canonicalOrigin(requestedDestination) || !requestedDestination.startsWith('http://')
      || transportContract !== 'llamacpp-b11118-choice-v1' || authentication !== 'none') return;
  } else if (requestedProvider !== 'injected' && requestedProvider !== 'unknown'
    || requestedDestination !== null || transportContract !== null || authentication !== null) return;
  if (d.returnedModel !== undefined && (d.assessment === null || d.assessmentAvailable === false
    || typeof d.status === 'string' && ['unavailable', 'pending', 'dropped', 'cancelled'].includes(d.status))) return;
  return { judgeReportVersion: 'judge-report-v2', requestedProvider: requestedProvider as JudgeReportV2['requestedProvider'],
    requestedDestination: requestedDestination as string | null, transportContract: transportContract as JudgeReportV2['transportContract'],
    authentication: authentication as JudgeReportV2['authentication'], ...models };
}
