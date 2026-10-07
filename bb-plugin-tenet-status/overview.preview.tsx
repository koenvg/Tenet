import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OverviewAdapter } from './overview-adapter';
import { SummaryWorkspaceMount } from './summary-workspace';
import { syntheticRead as basicSyntheticRead } from './overview.preview-fixture';
import { rulesSyntheticRead } from './rules.preview-fixture';
const syntheticRead = new URLSearchParams(window.location.search).has('rules') ? rulesSyntheticRead : basicSyntheticRead;
import { emptyOverview } from '../src/inspector/bb-summary';

function Preview() {
  const [open, setOpen] = useState(true), [narrow, setNarrow] = useState(true), [failure, setFailure] = useState(false);
  return <><header><h1>TENET thread-panel preview</h1><p>Offline synthetic data. No BB installation, host connection or evaluator call.</p>
    <button onClick={() => setOpen(true)}>Open or focus overview</button><button onClick={() => setOpen(false)}>Close overview</button>
    <button onClick={() => setNarrow(v => !v)}>Toggle 390px panel</button><button onClick={() => setFailure(v => !v)}>Toggle host disconnect</button>
    <p>Native repeated-tab focus and persistence are not reproduced by this preview.</p></header>
    <div className="shell"><article className="conversation"><h2>Pi conversation</h2><p>Synthetic conversation stays visible beside the summary.</p><p>Rule fixtures cover pass, FAIL, WARN, integrity, approval, uncertainty and provider failure. Released permission does not prove execution.</p></article>
      {open && <aside className="panel" style={{ width: narrow ? 390 : 920 }}><h2>TENET overview</h2><Panel failure={failure} /></aside>}</div></>;
}
function Panel({ failure }: { failure: boolean }) {
  const owner = useRef<OverviewAdapter | null>(null), failed = useRef(failure);
  failed.current = failure;
  const [, update] = useState(0);
  useEffect(() => {
    const adapter = new OverviewAdapter(async selection => failed.current ? emptyOverview() : syntheticRead(selection), () => update(v => v + 1));
    owner.current = adapter;
    return () => { owner.current = null; adapter.dispose(); };
  }, []);
  useEffect(() => { owner.current?.restart(); }, [failure]);
  return owner.current ? <SummaryWorkspaceMount {...owner.current.workspace()} /> : <p>Reading synthetic records…</p>;
}
createRoot(document.getElementById('preview')!).render(<Preview />);
