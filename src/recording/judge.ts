import type { RequestedJudgeIdentity } from '../decision/contracts.js';

/** Additive owner identity contract. Absent fields stay absent in historical reports. */
export interface JudgeReport {
  readonly judgeReportVersion: 'judge-report-v1';
  readonly requestedProvider: RequestedJudgeIdentity['provider'];
  readonly requestedModel: string | null;
  readonly returnedModel?: string;
}
const alias = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 256 && !/[\x00-\x1f\x7f-\x9f]/.test(v);
export function recordedJudgeReport(d: Record<string, unknown>): JudgeReport | undefined {
  if (d.judgeReportVersion !== 'judge-report-v1'
    || !['typesafe', 'apus-llamacpp', 'injected', 'unknown'].includes(String(d.requestedProvider))
    || d.requestedModel !== null && !alias(d.requestedModel)
    || d.returnedModel !== undefined && !alias(d.returnedModel)) return;
  return { judgeReportVersion: 'judge-report-v1', requestedProvider: d.requestedProvider as JudgeReport['requestedProvider'],
    requestedModel: d.requestedModel as string | null, ...(d.returnedModel !== undefined ? { returnedModel: d.returnedModel as string } : {}) };
}
