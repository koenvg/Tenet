import { useState, type Ref } from 'react';
import type { InvocationView } from '../../src/inspector/view.js';
import { Button } from '../../web/components/ui/button.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../web/components/ui/tabs.js';
import QuestionView from './QuestionView.js';
import { pretty, ruleName, type RuleView, type DockTab } from './presentation.js';

const tabs: DockTab[] = ['Evidence', 'Questions', 'Response', 'Policy'];
const evidenceOrder = ['action', 'context', 'trajectory', 'policy', 'integrity'];
const evidenceNames: Record<string, string> = { action: 'Action and arguments', context: 'Host context', trajectory: 'Chronological history', policy: 'Submitted policy', integrity: 'Submitted integrity constraint' };

export default function EvidenceDock({ view, rule, activeTab, onTabChange, headingRef }: {
  view: InvocationView; rule: RuleView | undefined; activeTab: DockTab;
  onTabChange: (tab: DockTab) => void; headingRef: Ref<HTMLHeadingElement>;
}) {
  const [questionFormat, setQuestionFormat] = useState<'rich' | 'json'>('rich');
  const evidenceEntries = view.evidence && typeof view.evidence === 'object' ? Object.entries(view.evidence).sort(([a], [b]) => {
    const rank = (key: string) => evidenceOrder.includes(key) ? evidenceOrder.indexOf(key) : evidenceOrder.length;
    return rank(a) - rank(b);
  }) : [];
  return <section className="evidence-dock" aria-label="Evidence dock">
    <div className="pane-heading"><h3 id="dock-heading" tabIndex={-1} ref={headingRef}>Evidence dock</h3></div>
    <Tabs className="dock-content" value={activeTab} onValueChange={value => onTabChange(value as DockTab)}>
      <TabsList className="dock-tabs" aria-label="Recorded data">
        {tabs.map(tab => <TabsTrigger key={tab} id={`tab-${tab}`} aria-controls={`panel-${tab}`} value={tab}>{tab}</TabsTrigger>)}
      </TabsList>
      <TabsContent forceMount value="Evidence" id="panel-Evidence" aria-labelledby="tab-Evidence" aria-label="Submitted evidence" className="dock-panel" tabIndex={0} hidden={activeTab !== 'Evidence'}>
        <h4>Runtime evidence context</h4><pre>{pretty(view.evidenceContext)}</pre>
        <p className="muted">Owner-only coverage diagnostic, separate from the exact submitted evidence below.</p>
        <h4>Shared submitted evidence</h4>
        <p className="muted">Shared by all rules. Redactions and omitted history remain as recorded. Strings may contain secrets.</p>
        {view.evidence === null ? <p className="missing-data">Submitted evidence unavailable. No historical payload is reconstructed.</p> : evidenceEntries.map(([key, value]) =>
          <section key={key} className="evidence-section"><h5>{evidenceNames[key] ?? key}</h5><p className="question-key">state.{key}</p>
            {key === 'trajectory' && view.evidenceContext?.selectionVersion === 'bounded-history-v2' && !!value && typeof value === 'object' && 'values' in value && <p className="muted">Exact references point to this snapshot's values pool. Literal escapes preserve authored lookalikes as untrusted data. Excerpts and omissions are separate losses. This is the recorded representation, not reconstructed history or proof of execution.</p>}
            <pre>{pretty(value)}</pre>
          </section>)}
      </TabsContent>
      <TabsContent forceMount value="Questions" id="panel-Questions" aria-labelledby="tab-Questions" aria-label="Questions" className="dock-panel" tabIndex={0} hidden={activeTab !== 'Questions'}>
        <h4>Questions for {rule ? ruleName(rule) : 'unavailable rule'}</h4>
        <p className="muted">Submitted questions and choices—not current templates.</p>
        <div className="format-toggle" role="group" aria-label="Question display format">
          <Button variant="outline" size="sm" aria-pressed={questionFormat === 'rich'} onClick={() => setQuestionFormat('rich')}>Rich</Button>
          <Button variant="outline" size="sm" aria-pressed={questionFormat === 'json'} onClick={() => setQuestionFormat('json')}>JSON</Button>
        </div>
        <details className="question-details"><summary>Question details</summary>
          <p className="muted format-help">Rich text formats recorded Markdown. HTML, links and images remain inert.</p>
          <dl className="metadata"><div><dt>Version</dt><dd>{String(view.questionVersion ?? 'not recorded')}</dd></div><div><dt>Rule reference</dt><dd>{rule?.mapping?.reference ?? 'not recorded'}</dd></div></dl>
        </details>
        {(['outcome', 'evidence', ...(rule?.mapping?.factsKey ? ['facts' as const] : [])] as const).map(kind =>
          <section key={kind}>
            <h5>{kind === 'outcome' ? 'Outcome question' : kind === 'facts' ? 'Fact-reference question' : 'Evidence question'}</h5>
            <p className="question-key">{rule?.mapping?.[`${kind}Key`] ?? 'Mapping not recorded'}</p>
            <QuestionView question={rule?.questions?.[kind]} format={questionFormat} />
          </section>)}
      </TabsContent>
      <TabsContent forceMount value="Response" id="panel-Response" aria-labelledby="tab-Response" aria-label="Response" className="dock-panel" tabIndex={0} hidden={activeTab !== 'Response'}>
        <h4>Application response</h4><p className="muted">Untrusted recorded content. Truncated snapshots include a preview and original byte count.</p>
        <p className="muted">Credential and header fields are omitted; strings may still contain secrets.</p>
        {view.response?.unavailable ? <p>Response snapshot unavailable. The response could not be safely serialized within capture limits.</p>
          : view.response?.truncated ? <p>Response truncated. Preview limited to 1 MiB; serialized size after field omissions: {view.response.bytes} bytes.</p>
          : !view.response && <p>No application response recorded. This does not prove the provider returned nothing.</p>}
        {view.native && <details className="native-exchanges"><summary>Recorded native exchanges</summary>
          <p>Bounded, sanitized snapshots, not an unredacted wire log. Omitted fields stay omitted. Native strings can contain secrets.</p>
          {view.native.snapshots.map((snapshot, index) => <details key={index}><summary>Exchange {index + 1}</summary><pre>{pretty(snapshot)}</pre></details>)}
        </details>}
        <pre>{pretty(view.response)}</pre><h4>Validation</h4><pre>{pretty(view.validation)}</pre>
      </TabsContent>
      <TabsContent forceMount value="Policy" id="panel-Policy" aria-labelledby="tab-Policy" aria-label="Policy" className="dock-panel" tabIndex={0} hidden={activeTab !== 'Policy'}>
        <h4>Policy at invocation time</h4><p className="muted">Snapshot text, source, target and digest. Changes to current policy do not alter this record.</p><pre>{pretty(view.policy)}</pre>
      </TabsContent>
    </Tabs>
  </section>;
}
