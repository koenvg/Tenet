import { categoryLabels, findingCategories, type FindingCategory } from '../../../src/decision/finding-triage.js';
import { Button } from '../../../web/components/ui/button.js';
import { timestamp, toolLabel, primaryStatus, callConcern, modeLabel } from '../presentation.js';
import DecisionIcon from '../DecisionIcon.js';
import StatusChip from '../StatusChip.js';
import type { SummaryCall } from './model.js';

interface Props {
  calls: SummaryCall[]; selectedId: string; category: FindingCategory | '';
  loading: boolean; unavailable: boolean; more: boolean;
  selectCall(id: string): void; filterCategory(category: FindingCategory | ''): void; loadMore?: () => void;
  showCallLabels?: boolean; explorerId?: string; filterId?: string;
}
export default function CallExplorer({ calls, selectedId, category, loading, unavailable, more, selectCall, filterCategory, loadMore, showCallLabels = true, explorerId, filterId }: Props) {
  return <aside id={explorerId} className="explorer" aria-label="Call explorer">
    <div className="pane-heading"><h2>Recent calls</h2></div>
    <div className="triage-tools"><label>Finding category
      <select id={filterId} aria-label="Finding category" value={category} onChange={event => filterCategory(event.currentTarget.value as FindingCategory | '')}>
        <option value="">All recorded calls</option>{findingCategories.map(c => <option key={c} value={c}>{categoryLabels[c]}</option>)}
      </select>
    </label></div>
    <nav className="call-list" aria-label="Invocations">{calls.map(item => {
      const status = primaryStatus(item), concern = callConcern(item);
      return <Button variant="ghost" key={item.id} className="call-row" data-call-id={item.id} aria-pressed={selectedId === item.id} onClick={() => selectCall(item.id)}>
        <DecisionIcon kind={item.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(item.toolName) ? 'document' : 'tool'} />
        <span className="call-copy">
          <span className="call-top"><strong>{toolLabel(item.toolName)}</strong><time>{timestamp(item.timestamp)}</time></span>
          <span className="call-id" hidden={!showCallLabels}>{item.callId}</span>
          <span className="call-state" title={status.explanation}><StatusChip value={status.label} tone={status.tone} icon={status.icon} showIcon /><span className="call-mode">{modeLabel(item.mode)}</span></span>
          {concern && <small className={`call-concern ${concern.tone} ${status.inconsistency ? 'recording-inconsistency' : ''}`} title={concern.description}>{concern.text}</small>}
        </span>
      </Button>;
    })}
      {loading ? <p role="status">Loading calls…</p> : !calls.length && <p className="empty-inline">{unavailable ? 'Calls unavailable. Missing records are not a pass.' : category ? 'No calls match this finding category.' : 'No recorded invocations in this session.'}</p>}
      {more && loadMore && <Button variant="ghost" className="text-button" disabled={loading} onClick={loadMore}>More invocations</Button>}
    </nav>
    <div className="explorer-footer"><span>Read-only recorded calls</span></div>
  </aside>;
}
