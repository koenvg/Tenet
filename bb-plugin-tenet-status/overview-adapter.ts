import type { FindingCategory } from '../src/decision/finding-triage.js';
import { emptyOverview, type ThreadOverview, type OverviewSelection } from '../src/inspector/bb-summary.js';
import type { SummaryWorkspaceInput } from '../inspector/src/shared/model.js';
import { liveRead } from './live-read.js';

export interface OverviewState { data: ThreadOverview; category: FindingCategory | ''; loading: boolean; error: string }
const merge = <T extends { id: string; timestamp: number }>(fresh: T[], old: T[]) => [...new Map([...old, ...fresh].map(row => [row.id, row])).values()].sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
// Routes carry selection only. Continuations belong to this read owner.
const routeSelection = ({ sessionId, callId, category }: OverviewSelection): OverviewSelection => ({
  ...(sessionId ? { sessionId } : {}), ...(callId ? { callId } : {}), ...(category ? { category } : {}),
});
const sameSelection = (a: OverviewSelection, b: OverviewSelection) => a.sessionId === b.sessionId && a.callId === b.callId && a.category === b.category;

/** One owner for navigation, reads, timeout and polling. No global history or recovery loop. */
export class OverviewAdapter {
  state: OverviewState = { data: emptyOverview(), category: '', loading: true, error: '' };
  private selection: OverviewSelection;
  private restored: OverviewSelection;
  private callsPaged = false;
  private sessionsPaged = false;
  private generation = 0;
  private disposed = false;
  private active?: AbortController;
  private timer: ReturnType<typeof setInterval>;
  constructor(private read: (selection: OverviewSelection, signal: AbortSignal) => Promise<ThreadOverview>, private changed: (state: OverviewState) => void,
    initial: OverviewSelection = {}, private navigate?: (selection: OverviewSelection) => void) {
    this.selection = { ...initial };
    this.restored = routeSelection(initial);
    this.state.category = initial.category ?? '';
    this.timer = setInterval(() => { if (!this.active && this.state.data.state === 'available') void this.refresh(false); }, 10_000);
    void this.refresh(false);
  }
  private emit() { if (!this.disposed) this.changed({ ...this.state }); }
  private async refresh(restart: boolean, append?: 'calls' | 'sessions') {
    if (this.disposed) return;
    this.active?.abort();
    const generation = ++this.generation, controller = new AbortController();
    this.active = controller;
    const old = this.state.data;
    if (restart) {
      this.selection = routeSelection(this.selection);
      this.callsPaged = this.sessionsPaged = false;
    }
    this.state = { ...this.state, loading: true, error: '' };
    this.emit();
    try {
      const input = { ...this.selection, ...(append === 'calls' && old.nextCall ? { callCursor: old.nextCall } : {}),
        ...(append === 'sessions' && old.nextSession ? { sessionCursor: old.nextSession } : {}) };
      for (const key of Object.keys(input) as (keyof OverviewSelection)[]) {
        if (input[key] === undefined) delete input[key];
      }
      const data = await liveRead(this.read(input, controller.signal), controller.signal);
      if (this.disposed || generation !== this.generation) return;
      if (data.state !== 'available') {
        this.state = { ...this.state, data: emptyOverview(data.state), loading: false, error: '' };
      } else if (old.state === 'available' && old.readScope !== data.readScope) {
        // The BB-selected environment, host or owner archive changed. Never merge scopes.
        this.selection = {}; this.callsPaged = this.sessionsPaged = false;
        this.state = { data: emptyOverview(), category: '', loading: false, error: 'Archive scope changed. Refresh from page one.' };
      } else {
        this.selection.sessionId = data.sessionId ?? undefined;
        this.selection.callId = data.selectedId ?? undefined;
        const preserveSessions = !restart && old.state === 'available';
        const preserveCalls = preserveSessions && old.sessionId === data.sessionId;
        if (!preserveCalls) this.callsPaged = false;
        if (append === 'calls') this.callsPaged = true;
        if (append === 'sessions') this.sessionsPaged = true;
        const calls = preserveCalls ? merge(data.calls, old.calls) : data.calls;
        const selected = data.selected;
        // The selected older call is read even when it is outside the newest timeline page.
        const currentCalls = selected ? calls.map(row => row.id !== data.selectedId ? row : { ...row,
          decision: selected.decision, permission: selected.permission, execution: selected.execution,
          categories: selected.categories, missing: selected.missing, assessmentStatus: selected.assessmentStatus,
          failure: selected.failure, evaluatorState: selected.evaluatorState ?? row.evaluatorState }) : calls;
        this.state = { ...this.state, loading: false, data: { ...data,
          sessions: preserveSessions ? merge(data.sessions, old.sessions) : data.sessions,
          calls: currentCalls.filter(row => !this.selection.category || row.categories.includes(this.selection.category)),
          nextCall: preserveCalls && this.callsPaged && append !== 'calls' ? old.nextCall : data.nextCall,
          nextSession: preserveSessions && this.sessionsPaged && append !== 'sessions' ? old.nextSession : data.nextSession } };
      }
    } catch {
      if (this.disposed || generation !== this.generation) return;
      controller.abort();
      this.state = { ...this.state, data: emptyOverview(), loading: false,
        error: 'Read unavailable or selection rejected. Refresh from page one, or choose the session again.' };
    } finally {
      if (generation === this.generation) { this.active = undefined; this.emit(); }
    }
  }
  /** BB route echoes do not own pagination or rule state. */
  restoreSelection(selection: OverviewSelection) {
    const next = routeSelection(selection);
    if (this.disposed || sameSelection(next, this.restored)) return;
    this.restored = next;
    if (sameSelection(next, routeSelection(this.selection))) return;
    this.changeSelection(next);
  }
  private changeSelection(next: OverviewSelection) {
    const sessionChanged = next.sessionId !== this.selection.sessionId;
    const categoryChanged = next.category !== this.selection.category;
    const callChanged = sessionChanged || next.callId !== this.selection.callId;
    const ruleCursor = !callChanged ? this.selection.ruleCursor : undefined;
    this.selection = { ...next, ...(ruleCursor ? { ruleCursor } : {}) };
    if (sessionChanged || categoryChanged) this.callsPaged = false;
    this.state = { ...this.state, category: next.category ?? '', data: { ...this.state.data,
      ...(sessionChanged || categoryChanged ? { calls: [], nextCall: null } : {}),
      ...(callChanged ? { selected: null, selectedId: null } : {}),
      ...(sessionChanged ? { sessionId: null } : {}) } };
    void this.refresh(false);
  }
  private select(next: OverviewSelection) {
    if (sameSelection(next, routeSelection(this.selection))) return;
    this.changeSelection(next);
    this.navigate?.(routeSelection(next));
  }
  selectSession = (sessionId: string) => this.select({ sessionId, category: this.selection.category });
  selectCall = (callId: string) => this.select({ ...routeSelection(this.selection), callId });
  filterCategory = (category: FindingCategory | '') => this.select({ sessionId: this.selection.sessionId, category: category || undefined });
  loadMoreRules = () => {
    const next = this.state.data.selected?.rulePage?.next;
    if (!this.active && next) { this.selection.ruleCursor = next; void this.refresh(false); }
  };
  restartRules = () => { if (!this.active) { delete this.selection.ruleCursor; void this.refresh(false); } };
  restart = () => { void this.refresh(true); };
  loadMoreSessions = () => { if (!this.active && this.state.data.nextSession) void this.refresh(false, 'sessions'); };
  loadMoreCalls = () => { if (!this.active && this.state.data.nextCall) void this.refresh(false, 'calls'); };
  workspace(): SummaryWorkspaceInput {
    const { data, loading, error, category } = this.state;
    return { model: { calls: data.calls, selected: data.selected, selectedId: data.selectedId ?? undefined, category,
      coverage: loading && !data.calls.length ? 'Reading linked recordings…' : data.state === 'unsupported' ? 'This overview supports Pi threads only.'
        : data.state === 'unavailable' ? 'Host or archive unavailable. No current result.'
        : data.coverage === 'unknown' ? 'No recordings linked to this thread. Assessment unknown, not pass.'
        : `${data.linkedCalls} exact-linked calls. Best-effort capture, not complete coverage.`,
      loading, error, unavailable: data.state !== 'available', moreRules: !!data.selected?.rulePage?.next, moreCalls: !!data.nextCall, sessions: data.sessions, sessionId: data.sessionId ?? undefined,
      moreSessions: !!data.nextSession, archiveWarnings: data.issues }, actions: { loadMoreRules: this.loadMoreRules, restartRules: this.restartRules, selectCall: this.selectCall, filterCategory: this.filterCategory,
        refresh: this.restart, selectSession: this.selectSession, loadMoreSessions: this.loadMoreSessions, loadMoreCalls: this.loadMoreCalls } };
  }
  dispose() { this.disposed = true; this.generation++; clearInterval(this.timer); this.active?.abort(); this.active = undefined; }
}
