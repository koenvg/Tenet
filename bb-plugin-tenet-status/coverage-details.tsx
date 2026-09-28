import type { Findings } from './contract';
import { StatusIcon } from './status-icon';

const gapLabel: Record<string, string> = {
  'indexing-in-progress': 'Still reading saved calls. More may appear soon.',
  'writer-loss': 'Some calls were not saved.',
  'missing-stages': 'Some calls have missing details.',
  'temporary-record': 'A recording is unfinished.',
  'additional-archive-issues': 'Some archive warnings could not be listed.',
  'corrupt-record': 'A saved call could not be read.',
  'unsupported-schema': 'A saved call uses an unsupported format.',
  'detail-unavailable': 'Some flagged calls could not be read. They are not shown.',
  'detail-rule-limit': 'Some flagged rules are not shown because there are too many.',
  'policy-text-unavailable': 'The rule text is missing or too long to show.',
};

/** Keep coverage qualified at a glance; leave recording mechanics on demand. */
export function CoverageDetails({ coverage, issues, notices, linkedCalls }: Pick<Findings, 'coverage' | 'issues' | 'notices' | 'linkedCalls'>) {
  if (coverage === 'unavailable' || (!linkedCalls && !issues.length)) return null;
  const labels = [
    notices?.approvals ? `${notices.approvals} approval ${notices.approvals === 1 ? 'condition' : 'conditions'}` : '',
    issues.length ? 'Archive warnings' : '',
  ].filter(Boolean);
  return <div className="space-y-2 text-xs text-foreground">
    {coverage === 'partial' && <p className="flex items-center gap-2"><StatusIcon name="coverage" />Some calls may be missing.</p>}
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-1 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <StatusIcon name="chevron" className="group-open:rotate-90" />
        <span>{labels.length ? labels.join(' · ') : 'About this status'}</span>
      </summary>
      <div className="space-y-3 pb-1 pl-6 pt-2 leading-relaxed">
        {linkedCalls > 0 && <p>A flag means TENET found a possible rule break. It does not mean the call was blocked.</p>}
        {linkedCalls > 0 && <p>{linkedCalls} saved {linkedCalls === 1 ? 'call' : 'calls'} in this thread. Rule counts include only the calls shown.</p>}
        {linkedCalls > 0 && notices && <ul className="space-y-1">
          {notices.approvals > 0 && <li>{notices.approvals} {notices.approvals === 1 ? 'call needed' : 'calls needed'} approval. This is not a rule break.</li>}
          {notices.uncertain > 0 && <li>{notices.uncertain} {notices.uncertain === 1 ? 'call had' : 'calls had'} an uncertain result or weak evidence.</li>}
          {notices.incomplete > 0 && <li>{notices.incomplete} {notices.incomplete === 1 ? 'check is' : 'checks are'} missing or unfinished.</li>}
        </ul>}
        {issues.length > 0 && <div className="space-y-1"><p>These warnings may include records from other threads.</p>
          <ul className="list-disc space-y-1 pl-4">{issues.map(issue => <li key={issue}>{gapLabel[issue] ?? 'Another recording problem was found.'}</li>)}</ul>
        </div>}
      </div>
    </details>
  </div>;
}
