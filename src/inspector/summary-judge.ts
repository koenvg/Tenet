import type { RecordedJudge } from '../recording/native.js';
import { recordedJudgeReport } from '../recording/judge.js';
import { recordedConfiguration } from '../recording/configuration.js';
import type { SummaryEvaluatorState, SummaryJudge } from './summary-model.js';

/** Recorded facts only. Origins are validated whole, never shortened into another address. */
export function summaryJudge(judge: RecordedJudge, state: SummaryEvaluatorState): SummaryJudge {
  const report = recordedJudgeReport({ ...judge, requestedProvider: judge.provider,
    returnedModel: state.status === 'completed' ? judge.returnedModel ?? undefined : undefined });
  const alias = (v: string | null) => v && v.length <= 256 && !/[\x00-\x1f\x7f-\x9f]/.test(v) ? v : null;
  const v2 = report?.judgeReportVersion === 'judge-report-v2' ? report : undefined;
  return {
    provider: report?.requestedProvider ?? (judge.judgeReportVersion === null
      && ['typesafe', 'apus-llamacpp', 'injected', 'unknown'].includes(judge.provider ?? '') ? judge.provider as SummaryJudge['provider'] : null),
    requestedModel: report?.requestedModel ?? (judge.judgeReportVersion === null ? alias(judge.requestedModel) : null),
    returnedModel: state.status === 'completed' ? report?.returnedModel ?? (judge.judgeReportVersion === null ? alias(judge.returnedModel) : null) : null,
    judgeReportVersion: report?.judgeReportVersion ?? null,
    requestedDestination: v2?.requestedDestination ?? null, transportContract: v2?.transportContract ?? null,
    authentication: v2?.authentication ?? null,
    experimental: (report?.requestedProvider ?? judge.provider) === 'apus-llamacpp' && judge.experimental === true ? true : null,
    configuration: recordedConfiguration(judge.configuration) ?? null,
  };
}
