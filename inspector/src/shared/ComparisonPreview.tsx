import { useEffect, useRef, useState } from 'react';
import SummaryWorkspace from './SummaryWorkspace.js';
import Detail from '../Detail.js';
import { standaloneSummary } from './standalone-adapter.js';
import { makeView } from '../../tests/components/fixtures.js';
import type { SummaryWorkspaceModel, SummaryWorkspaceActions } from './model.js';
import type { MobileView } from '../presentation.js';

const views = [
  makeView({ execution: 'executed', decision: 'ALLOW', gate: null, callId: 'synthetic-pass' }),
  makeView({ execution: 'unknown', callId: 'synthetic-uncertain' }),
  makeView({ execution: 'executed', failure: 'provider-error', callId: 'synthetic-failure' }),
];
for (const view of views) {
  view.evidence.action.arguments.command = 'RAW_ACTION_SENTINEL';
  view.evidence.privateSource = 'RAW_EVIDENCE_SENTINEL';
  view.response = { value: 'RAW_PROVIDER_SENTINEL' };
}
const calls = views.map((view, index) => ({
  id: view.identity!.callId, callId: view.identity!.callId, toolName: 'bash', timestamp: index * 1000,
  mode: 'observe', decision: view.decision, permission: view.permission, execution: view.execution,
  categories: view.categories, missing: view.missing, assessmentStatus: view.assessmentStatus, failure: view.failure,
}));
export default function ComparisonPreview({ panelWidth, showRaw: initialShowRaw = false }: { panelWidth?: number; showRaw?: boolean }) {
  const [view, setView] = useState(views[1]!);
  const [showRaw, setShowRaw] = useState(initialShowRaw), [category, setCategory] = useState<SummaryWorkspaceModel['category']>('');
  const [mobileView, setMobileView] = useState<MobileView>('calls');
  const left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null), comparison = useRef<HTMLDivElement>(null);
  const model: SummaryWorkspaceModel = { calls: category ? calls.filter(call => call.categories.includes(category)) : calls,
    selected: standaloneSummary(view), selectedId: view.identity!.callId, category,
    coverage: 'Synthetic preview. Best-effort capture, not complete coverage.', loading: false, error: '' };
  const actions: SummaryWorkspaceActions = {
    selectCall(id) { setView(views.find(item => item.identity!.callId === id) ?? view); setMobileView('assessment'); },
    filterCategory: setCategory, refresh() {},
  };
  useEffect(() => {
    const node = comparison.current!;
    let mirroring = false;
    function counterpart(element: HTMLElement, selector: string) {
      const source = left.current!.contains(element) ? left.current! : right.current!;
      const other = source === left.current ? right.current! : left.current!;
      const group = element.closest<HTMLElement>(selector);
      return group ? { group, other: other.querySelector<HTMLElement>(group.matches('.common-summary') ? '.common-summary' : '.mobile-nav') } : null;
    }
    function click(event: Event) {
      if (mirroring || !(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>('button');
      if (!button) return;
      const pair = counterpart(button, '.common-summary');
      if (!pair?.other) return;
      const index = [...pair.group.querySelectorAll('button')].indexOf(button);
      mirroring = true;
      try { pair.other.querySelectorAll<HTMLButtonElement>('button')[index]?.click(); } finally { mirroring = false; }
    }
    function toggle(event: Event) {
      if (!(event.target instanceof HTMLDetailsElement)) return;
      const pair = counterpart(event.target, '.common-summary');
      if (!pair?.other) return;
      const index = [...pair.group.querySelectorAll('details')].indexOf(event.target);
      const other = pair.other.querySelectorAll('details')[index];
      if (other && other.open !== event.target.open) other.open = event.target.open;
    }
    node.addEventListener('click', click); node.addEventListener('toggle', toggle, true);
    return () => { node.removeEventListener('click', click); node.removeEventListener('toggle', toggle, true); };
  }, []);
  const width = panelWidth ? `${panelWidth}px` : '100%';
  return <>
    <h1>Common summary comparison</h1>
    <p>Offline synthetic React preview. No native BB host, real archive or live evaluator is connected.</p>
    <p>Both adapters receive the same safe fields, selection and filter. Summary disclosures and navigation stay synchronized.</p>
    <label className="preview-control"><input type="checkbox" checked={showRaw} onChange={event => setShowRaw(event.target.checked)} /> Show standalone-only inspection</label>
    <p className="preview-limit">Common summary only is the default. Standalone-only additions can make the left workspace taller. BB never receives raw values.</p>
    <p role="status" className="preview-state">Comparison ready · Call {model.selectedId} · Filter {category || 'all'}</p>
    <div className="comparison" ref={comparison}>
      <section aria-label="Standalone adapter"><h2 className="preview-label">Standalone adapter · shared safe fields</h2>
        <div className="preview" id="standalone-preview" ref={left} style={{ width }}>
          <SummaryWorkspace model={model} actions={actions} mobileView={mobileView} onMobileViewChange={setMobileView} inspection={<Detail key={model.selectedId} view={view} showRaw={showRaw} />} />
        </div>
      </section>
      <section aria-label="BB adapter"><h2 className="preview-label">BB adapter · shared safe fields</h2>
        <div className="preview" id="embedded-preview" ref={right} style={{ width }}>
          <SummaryWorkspace model={model} actions={actions} mobileView={mobileView} onMobileViewChange={setMobileView} />
        </div>
      </section>
    </div>
  </>;
}
