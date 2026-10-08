import type { FindingCategory } from '../../src/decision/finding-triage.js';
import type { SessionSummary, InvocationSummary } from '../../src/inspector/archive-index.js';
import type { CaptureHealth, InvocationView } from '../../src/inspector/view.js';
import type { ArchiveIssue } from '../../src/recording/archive.js';

type Reader = { build: string; supportedSchemas: number[]; unsupported: number; newerUnsupported: number; corrupt: number; indexing: boolean; otherIssues: number };
type ArchiveState = {
  sessions: SessionSummary[]; invocations: InvocationSummary[]; projects: string[];
  session: string; invocation: string; error: string; project: string;
  busy: boolean; timelineBusy: boolean; detailBusy: boolean; manualRefreshing: boolean;
  view: InvocationView | null; issues: ArchiveIssue[]; health: CaptureHealth;
  nextSession: string | null; nextInvocation: string | null; reader: Reader | null;
  category: FindingCategory | '';
};
type Read = 'sessions' | 'timeline' | 'detail' | 'refresh';
type Request = { signal: AbortSignal; current: () => boolean; finish: () => void };
const message = (e: unknown) => e instanceof Error ? e.message : 'Archive unavailable. Try refreshing.';
const append = <T extends { id: string }>(loaded: T[], items: T[]) => [...loaded, ...items.filter(item => !loaded.some(old => old.id === item.id))];

// Owns archive navigation and its lifetime. Rendering and DOM focus stay in the UI.
// start() returns a mount-specific stop function; stopped controllers do not publish or read.
export function createArchiveNavigation() {
  let state: ArchiveState = {
    sessions: [], invocations: [], projects: [], session: '', invocation: '', error: '', project: '',
    busy: false, timelineBusy: false, detailBusy: false, manualRefreshing: false,
    view: null, issues: [], health: [], nextSession: null, nextInvocation: null, reader: null,
    category: '',
  };
  const listeners = new Set<() => void>();
  const requests = new Map<Read, AbortController>();
  let lifetime: object | null = null, navigation = {};
  function update(patch: Partial<ArchiveState>) {
    if (!lifetime) return;
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  function cancel(read: Read) {
    requests.get(read)?.abort();
    requests.delete(read);
    if (read === 'refresh' && state.manualRefreshing) update({ manualRefreshing: false });
  }
  function begin(read: Read): Request | null {
    if (!lifetime) return null;
    if (read !== 'refresh') cancel('refresh');
    cancel(read);
    const controller = new AbortController();
    requests.set(read, controller);
    return { signal: controller.signal,
      current: () => !!lifetime && requests.get(read) === controller && !controller.signal.aborted,
      finish: () => { if (requests.get(read) === controller) requests.delete(read); } };
  }
  function link(replace = false) {
    const url = new URL(window.location.href);
    url.search = ''; url.hash = '';
    if (state.session) url.searchParams.set('session', state.session);
    if (state.invocation) url.searchParams.set('invocation', state.invocation);
    if (url.href !== window.location.href) window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  async function api(path: string, request: Request) {
    const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', mode: 'same-origin', signal: request.signal });
    if (!response.ok) throw new Error(response.status === 404 ? 'Recording not found. Refresh sessions or choose another call.' : `Archive request failed: ${response.status}. Try refreshing.`);
    return response.json();
  }
  // Initial loads, cursor loads and refreshes use the same pagination path.
  async function page<T>(path: string, field: 'sessions' | 'invocations', request: Request, count = 0, cursor?: string) {
    const items: T[] = [];
    let next: string | null = cursor ?? null, issues: ArchiveIssue[] = [], health: CaptureHealth = [], reader: Reader | null = null;
    do {
      const url = new URL(path, window.location.origin);
      if (count) url.searchParams.set('limit', String(Math.min(100, Math.max(50, count) - items.length)));
      if (next) url.searchParams.set('cursor', next);
      const data = await api(url.pathname + url.search, request);
      if (!request.current()) return null;
      items.push(...data[field]); next = data.next; issues = data.issues; health = data.captureHealth; reader = data.reader ?? null;
    } while (count && next && items.length < Math.max(50, count));
    return { items, next, issues, health, reader };
  }
  async function loadSessions(cursor?: string) {
    const request = begin('sessions'); if (!request) return;
    update({ busy: true, error: '' });
    const query = new URLSearchParams(); if (state.project) query.set('project', state.project);
    try {
      const data = await page<SessionSummary>(`/api/sessions?${query}`, 'sessions', request, 0, cursor);
      if (!data) return;
      const sessions = cursor ? append(state.sessions, data.items) : data.items;
      update({ sessions, projects: [...new Set([...state.projects, ...sessions.flatMap(s => s.projects)])].sort(),
        nextSession: data.next, reader: data.reader,
        ...(!state.session ? { issues: data.issues, health: data.health } : {}) });
      return true;
    } catch (e) { if (request.current()) update({ error: message(e) }); }
    finally { if (request.current()) update({ busy: false }); request.finish(); }
  }
  async function loadTimeline(cursor?: string) {
    if (!state.session) return;
    const request = begin('timeline'); if (!request) return;
    update({ timelineBusy: true });
    const query = new URLSearchParams(); if (state.category) query.set('category', state.category);
    try {
      const data = await page<InvocationSummary>(`/api/sessions/${state.session}?${query}`, 'invocations', request, 0, cursor);
      if (!data) return;
      update({ invocations: cursor ? append(state.invocations, data.items) : data.items,
        nextInvocation: data.next, issues: data.issues, health: data.health, reader: data.reader });
      return true;
    } catch (e) { if (request.current()) update({ error: message(e) }); }
    finally { if (request.current()) update({ timelineBusy: false }); request.finish(); }
  }
  async function selectSession(id: string, updateLink = true, openLatest = true) {
    if (!lifetime) return false;
    const selected = navigation = {};
    for (const read of ['timeline', 'detail', 'refresh'] as const) cancel(read);
    update({ session: id, invocation: '', view: null, error: '', issues: [], health: [], detailBusy: false, timelineBusy: false,
      invocations: [], nextInvocation: null });
    if (updateLink) link();
    const timelineLoaded = id ? await loadTimeline() : true;
    // A failed list read does not invalidate navigation to an explicitly linked call.
    if (!lifetime || selected !== navigation) return false;
    if (timelineLoaded && openLatest && state.invocations[0]) {
      const loading = selectInvocation(state.invocations[0].id, false), selectedCall = navigation;
      await loading;
      if (!lifetime || selectedCall !== navigation) return false;
      if (updateLink) link(true);
    }
    return true;
  }
  async function selectInvocation(id: string, updateLink = true) {
    if (!lifetime || !state.session) return;
    navigation = {};
    cancel('refresh');
    if (id === state.invocation && state.view) return;
    const request = begin('detail'); if (!request) return;
    update({ invocation: id, view: null, error: '', detailBusy: true });
    if (updateLink) link();
    try {
      const data = await api(`/api/sessions/${state.session}/invocations/${id}`, request);
      if (!request.current()) return;
      update({ view: data.view, issues: data.issues, health: data.captureHealth, reader: data.reader ?? null });
    } catch (e) { if (request.current()) update({ error: message(e) }); }
    finally { if (request.current()) update({ detailBusy: false }); request.finish(); }
  }
  function filterCategory(category: FindingCategory | '') {
    if (!lifetime) return;
    cancel('refresh');
    update({ category, invocations: [], nextInvocation: null });
    if (state.session) void loadTimeline();
  }
  function filterProjects(project: string) {
    if (!lifetime) return;
    update({ project });
    void selectSession(''); void loadSessions();
  }
  async function restoreLink(initial = false) {
    if (!lifetime) return;
    const params = new URLSearchParams(window.location.search);
    const selectedSession = params.get('session') ?? '', selectedInvocation = params.get('invocation') ?? '';
    void selectSession('', false);
    if ((selectedSession && !/^[a-f0-9]{64}$/.test(selectedSession)) || (selectedInvocation && (!selectedSession || !/^[a-f0-9]{64}$/.test(selectedInvocation)))) {
      update({ error: 'Invalid session or invocation link. Choose a session from the archive.' }); return;
    }
    if (selectedSession) {
      if (await selectSession(selectedSession, false, !selectedInvocation) && selectedInvocation) await selectInvocation(selectedInvocation, false);
    } else if (initial && state.sessions.length) {
      const latest = state.sessions.reduce((a, b) => b.timestamp > a.timestamp ? b : a);
      if (await selectSession(latest.id, false)) link(true);
    }
  }
  async function refreshLive(manual = false) {
    if (!lifetime || requests.has('refresh') || state.busy || state.timelineBusy || state.detailBusy) return;
    const request = begin('refresh'); if (!request) return;
    if (manual) update({ manualRefreshing: true });
    const selectedSession = state.session, selectedInvocation = state.invocation;
    try {
      const query = new URLSearchParams(); if (state.project) query.set('project', state.project);
      const sessionData = await page<SessionSummary>(`/api/sessions?${query}`, 'sessions', request, Math.max(50, state.sessions.length));
      if (!sessionData) return;
      let invocations = state.invocations, nextInvocation = state.nextInvocation, view = state.view;
      let issues = sessionData.issues, health = sessionData.health;
      if (selectedSession) {
        const query = new URLSearchParams(); if (state.category) query.set('category', state.category);
        const invocationData = await page<InvocationSummary>(`/api/sessions/${selectedSession}?${query}`, 'invocations', request, Math.max(50, state.invocations.length));
        if (!invocationData) return;
        invocations = invocationData.items; nextInvocation = invocationData.next; issues = invocationData.issues; health = invocationData.health;
        if (selectedInvocation) {
          const detail = await api(`/api/sessions/${selectedSession}/invocations/${selectedInvocation}`, request);
          if (!request.current()) return;
          view = detail.view; issues = detail.issues; health = detail.captureHealth;
        }
      }
      // Publish only changed fields, once every read has completed. Keep unchanged detail references.
      const patch: Partial<ArchiveState> = { sessions: sessionData.items, nextSession: sessionData.next, reader: sessionData.reader,
        projects: [...new Set([...state.projects, ...sessionData.items.flatMap(s => s.projects)])].sort(),
        invocations, nextInvocation, view, issues, health,
        ...(state.error.startsWith('Live updates paused;') ? { error: '' } : {}) };
      const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(state[key as keyof ArchiveState])));
      if (Object.keys(changed).length) update(changed);
    } catch (e) { if (request.current()) update({ error: `Live updates paused; reconnecting automatically. ${message(e)}` }); }
    finally { if (request.current() && manual) update({ manualRefreshing: false }); request.finish(); }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      if (lifetime) throw new Error('Archive navigation is already started.');
      const mount = lifetime = {}, selected = navigation = {};
      update({ busy: false, timelineBusy: false, detailBusy: false, manualRefreshing: false });
      void loadSessions().then(loaded => { if (loaded && lifetime === mount && selected === navigation && !state.error) return restoreLink(true); });
      const restore = () => { void restoreLink(); };
      window.addEventListener('popstate', restore);
      const timer = setInterval(refreshLive, 2000);
      return () => {
        if (lifetime !== mount) return;
        lifetime = null; navigation = {};
        for (const read of requests.keys()) cancel(read);
        clearInterval(timer); window.removeEventListener('popstate', restore);
      };
    },
    loadSessions, loadTimeline, selectSession, selectInvocation, filterCategory, filterProjects,
    refreshArchive: () => refreshLive(true),
  };
}
