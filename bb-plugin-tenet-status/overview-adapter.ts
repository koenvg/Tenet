import type { FindingCategory } from '../src/decision/finding-triage.js';
import { emptyOverview, type ThreadOverview, type OverviewSelection } from '../src/inspector/bb-summary.js';
import type { SummaryWorkspaceInput } from '../inspector/src/shared/model.js';
import { liveRead } from './live-read.js';

export interface OverviewState { data: ThreadOverview; category: FindingCategory | ''; loading: boolean; error: string }
const merge = <T extends { id: string; timestamp: number }>(fresh: T[], old: T[]) => [...new Map([...old, ...fresh].map(row => [row.id, row])).values()].sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));

/** One owner for navigation, reads, timeout and polling. No global history or recovery loop. */
export class OverviewAdapter {
  state: OverviewState = { data: emptyOverview(), category: '', loading: true, error: '' };
  private selection: OverviewSelection;
  private restored: string;
  private generation = 0;
  private disposed = false;
  private active?: AbortController;
  private timer: ReturnType<typeof setInterval>;
  constructor(private read: (selection: OverviewSelection, signal: AbortSignal) => Promise<ThreadOverview>, private changed: (state: OverviewState) => void,
    initial: OverviewSelection = {}, private navigate?: (selection: OverviewSelection) => void) {
    this.selection = { ...initial };
    this.restored = JSON.stringify(initial);
    this.state.category = initial.category ?? '';
    this.timer = setInterval(() => { if (!this.active) void this.refresh(false); }, 10_000);
    void this.refresh(false);
  }
  private emit() { if (!this.disposed) this.changed({ ...this.state }); }
  private async refresh(restart: boolean, append?: 'calls' | 'sessions') {
    if (this.disposed) return;
    this.active?.abort();
    const generation = ++this.generation, controller = new AbortController();
    this.active = controller;
    const old = this.state.data;
    if (restart) { this.selection = { sessionId: this.selection.sessionId, callId: this.selection.callId, category: this.selection.category }; }
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
      } else {
        this.selection.sessionId = data.sessionId ?? undefined;
        this.selection.callId = data.selectedId ?? undefined;
        const preserve = !restart && old.state === 'available' && old.sessionId === data.sessionId;
        this.state = { ...this.state, loading: false, data: { ...data,
          sessions: preserve ? merge(data.sessions, old.sessions) : data.sessions,
          calls: preserve ? merge(data.calls, old.calls) : data.calls,
          nextCall: preserve && !append && old.calls.length > 50 ? old.nextCall : data.nextCall,
          nextSession: preserve && !append && old.sessions.length > 50 ? old.nextSession : data.nextSession } };
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
  /** BB supplies restored route selections; keep the shared mount and its compact view. */
  restoreSelection(selection: OverviewSelection) {
    const next = JSON.stringify(selection);
    if (this.disposed || next === this.restored) return;
    this.restored = next; this.selection = { ...selection };
    this.state = { data: emptyOverview(), category: selection.category ?? '', loading: true, error: '' };
    void this.refresh(true);
  }
  selectSession = (sessionId: string) => {
    this.selection = { sessionId, category: this.selection.category };
    if (this.navigate) { this.navigate({ ...this.selection }); return; }
    this.state.data = emptyOverview();
    void this.refresh(true);
  };
  selectCall = (callId: string) => {
    delete this.selection.ruleCursor; this.selection.callId = callId;
    if (this.navigate) { this.navigate({ ...this.selection }); return; }
    this.state.data = { ...this.state.data, selected: null }; void this.refresh(false);
  };
  loadMoreRules = () => {
    const next = this.state.data.selected?.rulePage?.next;
    if (!this.active && next) { this.selection.ruleCursor = next; void this.refresh(false); }
  };
  restartRules = () => { if (!this.active) { delete this.selection.ruleCursor; void this.refresh(false); } };
  filterCategory = (category: FindingCategory | '') => {
    this.selection = { sessionId: this.selection.sessionId, category: category || undefined };
    if (this.navigate) { this.navigate({ ...this.selection }); return; }
    this.state = { ...this.state, category, data: emptyOverview() };
    void this.refresh(true);
  };
  restart = () => {
    if (this.navigate) { void this.refresh(true); return; }
    this.selection = {}; this.state = { ...this.state, category: '', data: emptyOverview() }; void this.refresh(true);
  };
  loadMoreSessions = () => { if (!this.active && this.state.data.nextSession) void this.refresh(false, 'sessions'); };
  workspace(): SummaryWorkspaceInput {
    const { data, loading, error, category } = this.state;
    return { model: { calls: data.calls, selected: data.selected, selectedId: data.selectedId ?? undefined, category,
      coverage: loading && !data.calls.length ? 'Reading linked recordings…' : data.state === 'unsupported' ? 'This overview supports Pi threads only.'
        : data.state === 'unavailable' ? 'Host or archive unavailable. No current result.'
        : data.coverage === 'unknown' ? 'No recordings linked to this thread. Assessment unknown, not pass.'
        : `${data.linkedCalls} exact-linked calls. Best-effort capture, not complete coverage.`,
      loading, error, unavailable: data.state !== 'available', moreRules: !!data.selected?.rulePage?.next, moreCalls: !!data.nextCall, sessions: data.sessions, sessionId: data.sessionId ?? undefined,
      moreSessions: !!data.nextSession, archiveWarnings: data.issues }, actions: { loadMoreRules: this.loadMoreRules, restartRules: this.restartRules, selectCall: this.selectCall, filterCategory: this.filterCategory,
        refresh: this.restart, selectSession: this.selectSession, loadMoreSessions: this.loadMoreSessions, loadMoreCalls: () => { if (!this.active && data.nextCall) void this.refresh(false, 'calls'); } } };
  }
  dispose() { this.disposed = true; this.generation++; clearInterval(this.timer); this.active?.abort(); this.active = undefined; }
}
