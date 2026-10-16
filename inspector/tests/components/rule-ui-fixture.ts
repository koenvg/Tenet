import { vi } from 'vitest';
import { makeView } from './fixtures.js';
import type { RuleStatus } from '../../../src/inspector/session-rules-model.js';
export const session = 'a'.repeat(64), other = 'e'.repeat(64), rule = 'b'.repeat(64), invocation = 'c'.repeat(64), older = 'f'.repeat(64), revision = 'd'.repeat(64);
export const coverage = { capture: 'best-effort', indexing: false, incomplete: false, reasons: [] as string[], omittedRules: 0, omittedChecks: 0, diagnostics: [], omittedDiagnostics: 0 };
export const common = { reader: { build: 'fictional-reader', supportedSchemas: [1, 2, 3, 4, 5], unsupported: 0, newerUnsupported: 0, corrupt: 0, indexing: false, otherIssues: 0 }, issues: [], captureHealth: [], next: null };
export function ruleUIFixture(options: { status?: RuleStatus; unknown?: boolean; empty?: boolean; warning?: boolean; unavailable?: boolean; checks?: number } = {}) {
  const status = options.status ?? 'clear';
  const summary = { status, inventory: options.unknown ? { state: 'unknown', reasons: ['capture-gap'] } : { state: 'known', rules: 1, unchecked: status === 'unchecked' ? 1 : 0 }, ruleCoverage: coverage };
  const item = { id: rule, declarationId: 'historical', policyIdentity: 'historical-version', builtin: false, origin: null, declarationRevision: revision, wordingConflict: false, preview: 'Do not publish secrets.', status, checks: status === 'unchecked' ? 0 : 1, unassessedObservations: 0, timestamp: 100, representative: { invocation, revision } };
  const rows = [session, other].map((id, i) => ({ ...summary, id, revision, projects: [i ? '/second' : '/fixture'], timestamp: 100 - i, started: 100, sessionId: id, host: 'pi', contextId: 'main' }));
  const data = (url: URL) => {
    const sid = url.pathname.split('/')[3] ?? session;
    return url.pathname === '/api/sessions' ? { sessions: options.empty ? [] : rows }
      : url.pathname.endsWith('/checks') ? { ...summary, session: sid, rule, revision, items: status === 'unchecked' ? [] : Array.from({ length: options.checks ?? 1 }, (_, i) => ({ id: i ? older : invocation, invocation: i ? older : invocation, callId: i ? 'older' : 'exact', callIdOmitted: false, timestamp: 100 - i, status, outcome: status === 'violation' ? 'FAIL' : 'PASS', gates: options.unavailable ? null : [], trusted: !options.unavailable, reason: options.unavailable ? 'assessment-unavailable' : 'recorded-pass', profile: 'legacy', questionVersion: 'historical-v1', inputVersion: null })) }
      : url.pathname.endsWith('/rules') ? { ...summary, session: sid, revision, items: [item] }
      : url.pathname.includes('/rules/') ? { ...summary, session: sid, revision, rule: item, wording: options.unavailable ? { state: 'unavailable', reason: 'source-unavailable-or-changed' } : { state: 'available', text: 'Do not publish secrets. <script>inert()</script>' } }
      : url.pathname.includes('/invocations/') ? { view: makeView({ callId: url.pathname.endsWith(older) ? 'older' : 'exact' }) }
      : null;
  };
  let intercept: (url: URL, init: RequestInit) => Promise<Response> | undefined = () => undefined;
  const requests: { url: URL; signal: AbortSignal }[] = [];
  vi.stubGlobal('fetch', vi.fn((input: string, init: RequestInit) => {
    const url = new URL(input, location.href); requests.push({ url, signal: init.signal as AbortSignal });
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) throw new Error('Unexpected non-local request');
    if (init.cache !== 'no-store' || init.credentials !== 'same-origin' || init.mode !== 'same-origin') throw new Error('Unsafe archive transport options');
    const value = data(url); if (!value) throw new Error(`Unexpected route ${url.pathname}`);
    const envelope = options.warning ? { ...common, reader: { ...common.reader, unsupported: 1, newerUnsupported: 1, corrupt: 2, otherIssues: 1 }, issues: [{ reason: 'unsafe-record', file: 'fictional.json' }], captureHealth: [{ writerId: 'fictional-writer', failed: 7, dropped: 8, drainTimeouts: 9 }] } : common;
    return intercept(url, init) ?? Promise.resolve(Response.json({ ...envelope, ...value }));
  }));
  return { requests, summary, item, rows, data, intercept(handler: typeof intercept) { intercept = handler; } };
}
