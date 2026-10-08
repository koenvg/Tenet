import type { InvocationSummary, SessionSummary } from '../../src/inspector/archive-index.js';
import { categoryLabels, findingCategories, type FindingCategory } from '../../src/decision/finding-triage.js';
import { Button } from '../../web/components/ui/button.js';
import DecisionIcon from './DecisionIcon.js';
import StatusChip from './StatusChip.js';
import { displayedContext, primaryStatus, callConcern, permissionFact, resultFact, modeLabel, toolLabel, timestamp } from './standalone-presentation.js';

export default function PrivateCallExplorer({ calls, selectedId, session, category, loading, more, selectCall, filterCategory, loadMore }: {
  calls: InvocationSummary[]; selectedId: string; session?: SessionSummary; category: FindingCategory | '';
  loading: boolean; more: boolean; selectCall(id: string): void; filterCategory(category: FindingCategory | ''): void; loadMore(): void;
}) {
  const context = displayedContext(calls);
  return <aside id="call-explorer" className="explorer" aria-label="Call explorer">
    <div className="pane-heading"><h2>Recent calls</h2></div>
    <div className="triage-tools"><label htmlFor="finding-category">Finding category</label>
      <select id="finding-category" value={category} onChange={event => filterCategory(event.currentTarget.value as FindingCategory | '')}>
        <option value="">All recorded calls</option>{findingCategories.map(c => <option key={c} value={c}>{categoryLabels[c]}{session?.categoryCounts ? ` (${session.categoryCounts[c]})` : ''}</option>)}
      </select><p>Counts are distinct calls. Categories can overlap.</p>
    </div>
    {category && <div className="active-filter"><span>{categoryLabels[category]}</span><Button variant="ghost" onClick={() => filterCategory('')}>Clear filter</Button></div>}
    {(context.mode || context.permission || context.absentResult) && <p className="displayed-context" aria-label="Displayed call context">Displayed calls: {context.mode ? modeLabel(context.mode) + ' mode. ' : ''}{context.permission ? 'Not blocked by Tenet. ' : ''}{context.absentResult ? 'No tool results recorded.' : ''}</p>}
    <nav className="call-list" aria-label="Invocations">{calls.map(item => {
      const status = primaryStatus(item), concern = callConcern(item), permission = permissionFact(item.permission), result = resultFact(item.execution);
      return <Button variant="ghost" key={item.id} className="call-row" data-call-id={item.id} aria-pressed={selectedId === item.id} onClick={() => selectCall(item.id)}>
        <DecisionIcon kind={item.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(item.toolName) ? 'document' : 'tool'} />
        <span className="call-copy"><span className="call-preview">{item.actionPreview?.value ? <><span className="call-preview-value">{item.actionPreview.value}</span>{item.actionPreview.shortened && <small className="preview-marker">Preview shortened</small>}</> : <small>Action preview unavailable</small>}</span>
          <span className="call-top"><strong>{toolLabel(item.toolName)}</strong><time>{timestamp(item.timestamp)}</time></span><span className="call-id" hidden>{item.callId}</span>
          <span className="call-state">
            {(!context.permission || item.permission === 'blocked') && <span data-list-fact="permission"><StatusChip value={permission.label} tone={permission.tone} /></span>}
            {!context.absentResult && <span data-list-fact="result"><StatusChip value={result.label} tone={result.tone} /></span>}
            {!context.mode && <span className="call-mode">{modeLabel(item.mode)}</span>}
          </span>
          {concern && <small className={`call-concern ${concern.tone} ${status.inconsistency ? 'recording-inconsistency' : ''}`} title={concern.description}>{concern.text}</small>}
        </span>
      </Button>;
    })}
      {loading ? <p role="status">Loading calls…</p> : session && !calls.length && <p className="empty-inline">{category ? 'No calls match this finding category.' : 'No recorded invocations in this session.'}</p>}
      {more && <Button variant="ghost" className="text-button" disabled={loading} onClick={loadMore}>More invocations</Button>}
    </nav><div className="explorer-footer"><span>Read-only recorded calls</span></div>
  </aside>;
}
