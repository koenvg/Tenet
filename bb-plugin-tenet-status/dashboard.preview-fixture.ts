import type { DashboardClient } from './dashboard-view';
import type { DashboardPage } from './dashboard-contract';
import { projectA, stopped, remote } from './main.preview-fixture';

export const dashboardCases = ['recorded', 'limited', 'empty', 'unavailable', 'restart-required', 'error', 'slow', 'paging', 'expired-return', 'unprocessed'] as const;
export type DashboardCase = typeof dashboardCases[number];
export const syntheticDashboardPage: DashboardPage = {
  run: 'synthetic-run', scope: { kind: 'project', projectId: projectA }, projectLabel: 'Synthetic local project', state: 'finished', revision: 2,
  started: 1700000000000, observed: 1700000002000,
  coverage: { discovered: 4, resolved: 4, processed: 4, unknown: 0, unavailable: 0, unprocessed: 0, partial: 0, omittedInvocations: 0, invocations: 12, capture: 'best-effort', reasons: [] },
  rows: [
    { key: '1'.repeat(64), preview: 'Ask before publishing.', builtin: false, passed: 9, failed: 1, unscored: 2, passing: 90, failing: 10, threads: 3 },
    { key: '2'.repeat(64), preview: 'Keep credentials private.', builtin: false, passed: 10, failed: 0, unscored: 0, passing: 100, failing: 0, threads: 4 },
    { key: '3'.repeat(64), preview: 'Add tests for changed behavior.', builtin: false, passed: 8, failed: 2, unscored: 0, passing: 80, failing: 20, threads: 3 },
    { key: '4'.repeat(64), preview: 'Do not edit generated files.', builtin: false, passed: 0, failed: 2, unscored: 1, passing: 0, failing: 100, threads: 1 },
    { key: '5'.repeat(64), preview: 'Run offline tests.', builtin: false, passed: 0, failed: 0, unscored: 3, passing: null, failing: null, threads: 1 },
  ], next: null, rowsNext: null,
};
export function syntheticDashboard(scenario: DashboardCase = 'recorded'): DashboardClient {
  let projectId = projectA;
  return {
    async read(input, signal) {
      if (scenario === 'slow') await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 3000);
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(Error('aborted')); }, { once: true });
      });
      const page = structuredClone(syntheticDashboardPage);
      if (scenario === 'paging') page.rows[0] = { ...page.rows[0]!, passed: 0, failed: 51, passing: 0, failing: 100 };
      if (scenario === 'expired-return' && input.kind === 'results') return { ...page, state: 'restart-required', rows: [] };
      if (scenario === 'unprocessed') { page.rows = []; page.state = 'limited'; page.coverage.processed = 0; page.coverage.unprocessed = 4; }
      if (input.kind === 'start') projectId = input.scope.projectId;
      page.scope = { kind: 'project', projectId };
      page.projectLabel = projectId === projectA ? 'Synthetic local project' : 'Synthetic remote project';
      if (input.kind === 'start') return { ...page, state: 'discovering', rows: [], revision: 0, next: 'synthetic-step' };
      if (scenario === 'error') throw Error('synthetic continuation error');
      if (scenario === 'limited') { page.state = 'limited'; page.coverage.reasons.push('writer-loss', 'host-metadata-limit'); }
      if (scenario === 'empty') { page.rows = []; page.coverage.unknown = 4; }
      if (scenario === 'unavailable') { page.rows = []; page.coverage.processed = 0; page.coverage.unavailable = 4; page.coverage.reasons = ['destination-unavailable']; }
      if (scenario === 'restart-required') { page.state = 'restart-required'; page.rows = []; }
      return page;
    },
    async contributors({ rule, expectedRevision, cursor }) {
      if (expectedRevision !== syntheticDashboardPage.revision) return { state: 'restart-required', items: [], next: null };
      const count = scenario === 'paging' && rule === '1'.repeat(64) ? 51 : syntheticDashboardPage.rows.find(row => row.key === rule)?.failed ?? 0;
      const offset = cursor ? 50 : 0;
      return { state: 'ready', items: Array.from({ length: Math.min(50, count - offset) }, (_, n) => ({
        threadId: projectId === projectA ? stopped : remote, projectId, label: 'Prepare release notes',
        sessionId: 'a'.repeat(64), callId: n + offset ? (n + offset).toString(16).padStart(64, '0') : 'b'.repeat(64),
        timestamp: 1700000000000 + (n + offset) * 60000, toolName: 'bash',
      })), next: count > offset + 50 ? 'synthetic-failures-50' : null };
    },
  };
}
