// Local, synthetic preview only. No host, archive, SDK or evaluator connection.
// Run: bunx vite bb-plugin-tenet-status --host 127.0.0.1 --port 4174
// Open: http://127.0.0.1:4174/evaluator-state.preview.html
import { createRoot } from 'react-dom/client';
import { CoverageDetails } from './coverage-details';
import type { Findings } from './contract';

const base: Findings = { coverage: 'partial', linkedCalls: 2, issues: [], items: [], next: null,
  notices: { approvals: 0, uncertain: 0, incomplete: 0 } };
const failed: Findings = { ...base, issues: ['corrupt-record'], assessments: {
  completed: 0, unavailable: 2, pending: 0, dropped: 0, cancelled: 0, incomplete: 0,
  reasons: [{ code: 'provider-error', count: 2 }],
} };
const incomplete: Findings = { ...base, issues: ['missing-stages'], assessments: {
  completed: 0, unavailable: 0, pending: 1, dropped: 0, cancelled: 0, incomplete: 1, reasons: [],
}, notices: { approvals: 0, uncertain: 0, incomplete: 1 } };

createRoot(document.getElementById('preview')!).render(<main>
  <h1>TENET-43 recorded assessment status</h1>
  <p>Synthetic component preview. This is not an installed BB plugin or a live assessment.</p>
  <div className="cases">
    <article aria-label="Provider failures">
      <h2>Two terminal provider failures</h2>
      <CoverageDetails {...failed} />
      <p>No flagged calls to show.</p>
    </article>
    <article aria-label="Incomplete records">
      <h2>Pending and missing records</h2>
      <CoverageDetails {...incomplete} />
      <p>No flagged calls to show.</p>
    </article>
  </div>
</main>);
