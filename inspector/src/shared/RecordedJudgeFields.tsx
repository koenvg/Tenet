import type { SummaryJudge } from './model.js';

export default function RecordedJudgeFields({ judge }: { judge: SummaryJudge }) {
  const absent = judge.judgeReportVersion === 'judge-report-v2' ? 'unknown' : 'not recorded';
  const configuration = judge.configuration;
  return <>
    <div><dt>Implementation</dt><dd>{judge.provider ?? 'Implementation not recorded'}{judge.experimental ? ' experimental' : ''}</dd></div>
    <div><dt>Requested model</dt><dd>{judge.requestedModel ?? absent}</dd></div>
    <div className="record-wide"><dt>Returned model</dt><dd>{judge.returnedModel ?? 'not recorded; no complete returned assessment'}</dd></div>
    <div><dt>Judge report contract</dt><dd>{judge.judgeReportVersion ?? 'not recorded'}</dd></div>
    <div className="record-wide"><dt>Origin</dt><dd>{judge.requestedDestination ?? absent}</dd></div>
    <div><dt>Transport contract</dt><dd>{judge.transportContract ?? absent}</dd></div>
    <div><dt>Authentication</dt><dd>{judge.authentication ?? absent}</dd></div>
    <div><dt>Judge source</dt><dd>{configuration?.sources.judge ?? 'not recorded'}</dd></div>
    <div><dt>Assessment deadline</dt><dd>{configuration?.deadlineMs === undefined || configuration.deadlineMs === null ? 'not recorded' : `${configuration.deadlineMs} ms (${configuration.sources.deadlineMs ?? 'unknown'})`}</dd></div>
    <div className="record-wide"><dt>Observation limits</dt><dd>{configuration?.observation ? Object.entries(configuration.observation).map(([key, value]) => `${key} ${value} (${configuration.sources.observation?.[key as keyof typeof configuration.observation] ?? 'unknown'})`).join('; ') : 'not recorded'}</dd></div>
  </>;
}
