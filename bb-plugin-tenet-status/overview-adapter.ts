import type { FindingCategory } from '../src/decision/finding-triage.js';
import { emptyOverview, type ThreadOverview, type OverviewSelection } from '../src/inspector/bb-summary.js';
import type { SummaryWorkspaceInput } from '../inspector/src/shared/model.js';
import type { ThreadRuleQuery } from '../src/inspector/thread-rules-model.js';
import { liveRead } from './live-read.js';

export interface OverviewState { data: ThreadOverview; category: FindingCategory | ''; loading: boolean; error: string }
const merge = <T extends { id: string; timestamp: number }>(fresh: T[], old: T[]) => [...new Map([...old, ...fresh].map(row => [row.id, row])).values()].sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
function routeSelection(selection: OverviewSelection): OverviewSelection {
  const query = selection.query;
  if (query?.kind === 'inventory') return {};
  if (query?.kind === 'checks') return { query: { kind: 'checks', ruleId: query.ruleId } };
  if (query?.kind === 'call') return { query: { kind: 'call', ruleId: query.ruleId, sessionId: query.sessionId, callId: query.callId } };
  const { sessionId, callId, category } = selection;
  return { ...(query || sessionId || callId || category ? { query: { kind: 'calls' as const } } : {}), ...(sessionId ? { sessionId } : {}), ...(callId ? { callId } : {}), ...(category ? { category } : {}) };
}
const sameSelection = (a: OverviewSelection, b: OverviewSelection) => JSON.stringify(routeSelection(a)) === JSON.stringify(routeSelection(b));
type Append = 'calls' | 'sessions' | 'inventory' | 'checks' | 'call-rules' | 'first-call-rules';

/** One read owner for rule navigation, selected calls, cancellation and polling. */
export class OverviewAdapter {
  state: OverviewState = { data: emptyOverview(), category: '', loading: true, error: '' };
  private selection: OverviewSelection;
  private restored: OverviewSelection;
  private paged = new Set<Append>();
  private generation = 0;
  private disposed = false;
  private active?: AbortController;
  private timer: ReturnType<typeof setInterval>;
  constructor(private read: (selection: OverviewSelection, signal: AbortSignal) => Promise<ThreadOverview>, private changed: (state: OverviewState) => void,
    initial: OverviewSelection = {}, private navigate?: (selection: OverviewSelection) => void) {
    this.selection = routeSelection(initial); this.restored = routeSelection(initial);
    this.state.category = initial.category ?? '';
    this.timer = setInterval(() => { if (!this.active && this.state.data.state === 'available') void this.refresh(false); }, 10_000);
    void this.refresh(false);
  }
  private emit() { if (!this.disposed) this.changed({ ...this.state }); }
  private input(append?: Append): OverviewSelection {
    const input = routeSelection(this.selection), old = this.state.data;
    const rules = old.threadRules;
    if (append === 'inventory' && rules?.kind === 'inventory' && rules.next) input.query = { kind: 'inventory', inventoryCursor: rules.next, revision: old.revision };
    if (append === 'checks' && rules?.kind === 'checks' && rules.next) input.query = { kind: 'checks', ruleId: rules.rule.id, checkCursor: rules.next, revision: old.revision };
    if (append === 'sessions' && old.nextSession) input.sessionCursor = old.nextSession;
    if (append === 'calls' && old.nextCall) input.callCursor = old.nextCall;
    if (append === 'call-rules' && old.selected?.rulePage?.next) {
      if (input.query?.kind === 'call') input.query = { ...input.query, ruleCursor: old.selected.rulePage.next, revision: old.revision };
      else input.ruleCursor = old.selected.rulePage.next;
    }
    return input;
  }
  private async refresh(restart: boolean, append?: Append) {
    if (this.disposed) return;
    this.active?.abort();
    const generation = ++this.generation, controller = new AbortController();
    this.active = controller;
    const old = this.state.data;
    if (restart) this.paged.clear();
    const input = this.input(append);
    this.state = { ...this.state, loading: true, error: '' }; this.emit();
    try {
      const data = await liveRead(this.read(input, controller.signal), controller.signal);
      if (this.disposed || generation !== this.generation) return;
      if (data.state !== 'available') {
        this.paged.clear(); this.state = { ...this.state, data: emptyOverview(data.state), loading: false, error: '' };
      } else if (old.state === 'available' && old.readScope !== data.readScope) {
        this.selection = {}; this.paged.clear();
        this.state = { data: emptyOverview(), category: '', loading: false, error: 'Archive scope changed. Refresh from page one.' };
      } else {
        const sameRevision = old.state === 'available' && old.revision === data.revision && !restart;
        if (!sameRevision) this.paged.clear();
        if (append) this.paged.add(append);
        let threadRules = data.threadRules;
        const previous = old.threadRules;
        if (sameRevision && threadRules?.kind === 'inventory' && previous?.kind === 'inventory') {
          threadRules = { ...threadRules, items: merge(threadRules.items, previous.items), next: this.paged.has('inventory') && append !== 'inventory' ? previous.next : threadRules.next };
        } else if (sameRevision && threadRules?.kind === 'checks' && previous?.kind === 'checks' && threadRules.rule.id === previous.rule.id) {
          threadRules = { ...threadRules, items: merge(threadRules.items, previous.items), next: this.paged.has('checks') && append !== 'checks' ? previous.next : threadRules.next };
        }
        const preserveCalls = sameRevision && old.sessionId === data.sessionId;
        const selected = sameRevision && append !== 'call-rules' && append !== 'first-call-rules' && old.selectedId === data.selectedId
          && old.selected?.rulePage?.snapshot === data.selected?.rulePage?.snapshot && old.selected?.rulePage
          ? { ...data.selected!, rules: old.selected.rules, rulePage: old.selected.rulePage, omittedRules: old.selected.omittedRules } : data.selected;
        if (!this.selection.query || this.selection.query.kind === 'calls') {
          if (this.isBrowsing()) this.selection = { ...routeSelection(this.selection), query: { kind: 'calls' },
            ...(data.sessionId ? { sessionId: data.sessionId } : {}), ...(data.selectedId ? { callId: data.selectedId } : {}) };
        }
        const calls = preserveCalls ? merge(data.calls, old.calls) : data.calls;
        this.state = { ...this.state, loading: false, data: { ...data, selected, threadRules,
          sessions: sameRevision ? merge(data.sessions, old.sessions) : data.sessions,
          calls: calls.map(row => row.id === data.selectedId && selected ? { ...row, decision: selected.decision, permission: selected.permission,
            execution: selected.execution, categories: selected.categories, missing: selected.missing, assessmentStatus: selected.assessmentStatus,
            failure: selected.failure, evaluatorState: selected.evaluatorState ?? row.evaluatorState } : row)
            .filter(row => !this.selection.category || row.categories.includes(this.selection.category)),
          nextCall: preserveCalls && this.paged.has('calls') && append !== 'calls' ? old.nextCall : data.nextCall,
          nextSession: sameRevision && this.paged.has('sessions') && append !== 'sessions' ? old.nextSession : data.nextSession } };
      }
    } catch {
      if (this.disposed || generation !== this.generation) return;
      controller.abort(); this.paged.clear();
      this.state = { ...this.state, data: emptyOverview(), loading: false, error: 'Read unavailable or selection rejected. Refresh from page one.' };
    } finally { if (generation === this.generation) { this.active = undefined; this.emit(); } }
  }
  private isBrowsing() { return this.selection.query?.kind === 'calls' || !this.selection.query && !!(this.selection.sessionId || this.selection.callId || this.selection.category); }
  restoreSelection(selection: OverviewSelection) {
    const next = routeSelection(selection);
    if (this.disposed || sameSelection(next, this.restored)) return;
    this.restored = next;
    if (!sameSelection(next, this.selection)) this.changeSelection(next);
  }
  private changeSelection(next: OverviewSelection) {
    const preserveBrowse = this.isBrowsing() && (next.query?.kind === 'calls' || !!next.sessionId)
      && next.sessionId === this.selection.sessionId && next.category === this.selection.category;
    const sessions = this.state.data.sessions, nextSession = this.state.data.nextSession;
    const previousScope = this.state.data.readScope;
    this.selection = routeSelection(next);
    if (!preserveBrowse) this.paged.clear();
    this.state = { ...this.state, category: next.category ?? '', data: { ...this.state.data, readScope: previousScope, selected: null, selectedId: null,
      threadRules: null, ...(preserveBrowse ? {} : { calls: [], nextCall: null, sessionId: null }), sessions, nextSession } };
    void this.refresh(false);
  }
  private select(next: OverviewSelection) {
    if (sameSelection(next, this.selection)) return;
    this.changeSelection(next); this.navigate?.(routeSelection(next));
  }
  selectRule = (ruleId: string) => this.select({ query: { kind: 'checks', ruleId } });
  selectCheck = (sessionId: string, callId: string) => {
    const query = this.selection.query;
    if (query?.kind === 'checks') this.select({ query: { kind: 'call', ruleId: query.ruleId, sessionId, callId } });
  };
  back = () => {
    const query = this.selection.query;
    this.select(query?.kind === 'call' ? { query: { kind: 'checks', ruleId: query.ruleId } } : {});
  };
  browseCalls = () => this.select({ query: { kind: 'calls' } });
  selectSession = (sessionId: string) => this.select({ query: { kind: 'calls' }, sessionId, category: this.selection.category });
  selectCall = (callId: string) => this.select({ ...routeSelection(this.selection), callId });
  filterCategory = (category: FindingCategory | '') => this.select({ query: { kind: 'calls' }, sessionId: this.selection.sessionId, category: category || undefined });
  loadMoreRules = () => { if (!this.active && this.state.data.selected?.rulePage?.next) void this.refresh(false, 'call-rules'); };
  restartRules = () => { if (!this.active) void this.refresh(false, 'first-call-rules'); };
  restart = () => { void this.refresh(true); };
  loadMoreSessions = () => { if (!this.active && this.state.data.nextSession) void this.refresh(false, 'sessions'); };
  loadMoreCalls = () => { if (!this.active && this.state.data.nextCall) void this.refresh(false, 'calls'); };
  loadMore = () => {
    if (this.active) return;
    const rules = this.state.data.threadRules;
    if (rules?.next) void this.refresh(false, rules.kind === 'inventory' ? 'inventory' : 'checks');
  };
  workspace(): SummaryWorkspaceInput {
    const { data, loading, error, category } = this.state;
    const model = { calls: data.calls, selected: data.selected, selectedId: data.selectedId ?? undefined, category,
      coverage: data.state === 'unsupported' ? 'This overview supports Pi threads only.' : data.state === 'unavailable' ? loading ? 'Reading linked recordings…' : 'Host or archive unavailable. No current result.'
        : data.coverage === 'unknown' ? 'No recordings linked to this thread. Assessment unknown, not pass.' : `${data.linkedCalls} exact-linked calls across this thread. Best-effort capture, not complete coverage.`,
      loading, error, unavailable: data.state !== 'available', moreRules: !!data.selected?.rulePage?.next, moreCalls: !!data.nextCall,
      sessions: data.sessions, sessionId: data.sessionId ?? undefined, moreSessions: !!data.nextSession, archiveWarnings: data.issues };
    const actions = { loadMoreRules: this.loadMoreRules, restartRules: this.restartRules, selectCall: this.selectCall, filterCategory: this.filterCategory,
      refresh: this.restart, selectSession: this.selectSession, loadMoreSessions: this.loadMoreSessions, loadMoreCalls: this.loadMoreCalls };
    if (this.isBrowsing()) return { variant: 'calls', model, actions: { ...actions, backToRules: () => this.select({}) } };
    return { variant: 'thread-rules', model: { ...model, rules: data.threadRules ?? null }, actions: { ...actions,
      selectRule: this.selectRule, selectCheck: this.selectCheck, back: this.back, browseCalls: this.browseCalls, loadMore: this.loadMore } };
  }
  dispose() { this.disposed = true; this.generation++; clearInterval(this.timer); this.active?.abort(); this.active = undefined; }
}
