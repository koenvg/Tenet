import { useEffect, useState, useSyncExternalStore } from 'react';
import type { FindingCategory } from '../../src/decision/finding-triage.js';
import type { UncertaintyGroup, SessionSummary, InvocationSummary } from '../../src/inspector/archive-index.js';
import type { CaptureHealth, InvocationView } from '../../src/inspector/view.js';
import type { ArchiveIssue } from '../../src/recording/archive.js';
import type { MobileView } from './presentation.js';

type Reader = { build: string; supportedSchemas: number[]; unsupported: number; newerUnsupported: number; corrupt: number; indexing: boolean; otherIssues: number };
type ArchiveState = {
  sessions: SessionSummary[]; invocations: InvocationSummary[]; projects: string[];
  session: string; invocation: string; error: string; project: string; projectInput: string;
  busy: boolean; timelineBusy: boolean; detailBusy: boolean; manualRefreshing: boolean;
  view: InvocationView | null; issues: ArchiveIssue[]; health: CaptureHealth;
  nextSession: string | null; nextInvocation: string | null; reader: Reader | null;
  groups: { items: UncertaintyGroup[]; omittedGroups: number }; groupsLoaded: boolean; groupsBusy: boolean; groupsError: string;
  category: FindingCategory | ''; mobileView: MobileView; pickerOpen: boolean; showPatterns: boolean;
};
const message = (e: unknown) => e instanceof Error ? e.message : 'Archive unavailable. Try refreshing.';

function createArchive() {
  let state: ArchiveState = {
    sessions: [], invocations: [], projects: [], session: '', invocation: '', error: '', project: '', projectInput: '',
    busy: false, timelineBusy: false, detailBusy: false, manualRefreshing: false,
    view: null, issues: [], health: [], nextSession: null, nextInvocation: null, reader: null,
    groups: { items: [], omittedGroups: 0 }, groupsLoaded: false, groupsBusy: false, groupsError: '',
    category: '', mobileView: 'calls', pickerOpen: true, showPatterns: false,
  };
  const listeners = new Set<() => void>();
  let navigation = 0, sessionRequest = 0, timelineRequest = 0, detailRequest = 0, groupRequest = 0, polling = false;
  function update(patch: Partial<ArchiveState>) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  function link(replace = false) {
    const url = new URL(window.location.href);
    url.search = ''; url.hash = '';
    if (state.session) url.searchParams.set('session', state.session);
    if (state.invocation) url.searchParams.set('invocation', state.invocation);
    if (url.href !== window.location.href) window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  async function api(path: string) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'Recording not found. Refresh sessions or choose another call.' : `Archive request failed: ${response.status}. Try refreshing.`);
    return response.json();
  }
  async function loadSessions(cursor?: string) {
    const current = ++sessionRequest;
    update({ busy: true, error: '' });
    const query = new URLSearchParams();
    if (state.project) query.set('project', state.project);
    if (cursor) query.set('cursor', cursor);
    try {
      const data = await api(`/api/sessions?${query}`);
      if (current !== sessionRequest) return;
      const sessions: SessionSummary[] = cursor ? [...state.sessions, ...data.sessions.filter((item: SessionSummary) => !state.sessions.some(s => s.id === item.id))] : data.sessions;
      update({ sessions, projects: [...new Set([...state.projects, ...sessions.flatMap(s => s.projects)])].sort(),
        nextSession: data.next, issues: data.issues, health: data.captureHealth, reader: data.reader ?? null });
    } catch (e) { if (current === sessionRequest) update({ error: message(e) }); }
    finally { if (current === sessionRequest) update({ busy: false }); }
  }
  async function loadGroups() {
    if (!state.session) return;
    const current = ++groupRequest, selected = state.session, generation = navigation;
    update({ groupsBusy: true, groupsError: '' });
    try {
      const data = await api(`/api/sessions/${selected}/groups`);
      if (current !== groupRequest || generation !== navigation) return;
      update({ groups: data.groups, groupsLoaded: true, issues: data.issues, health: data.captureHealth, reader: data.reader ?? null });
    } catch (e) { if (current === groupRequest && generation === navigation) update({ groupsError: message(e) }); }
    finally { if (current === groupRequest && generation === navigation) update({ groupsBusy: false }); }
  }
  function openPatterns() {
    if (!state.session) return;
    update({ showPatterns: true, mobileView: 'assessment' });
    if (!state.groupsBusy) void loadGroups();
  }
  async function loadTimeline(cursor?: string) {
    const current = ++timelineRequest, selected = state.session, generation = navigation, selectedCategory = state.category;
    update({ timelineBusy: true });
    try {
      const query = new URLSearchParams();
      if (cursor) query.set('cursor', cursor);
      if (selectedCategory) query.set('category', selectedCategory);
      const data = await api(`/api/sessions/${selected}?${query}`);
      if (current !== timelineRequest || generation !== navigation) return;
      update({ invocations: cursor ? [...state.invocations, ...data.invocations.filter((item: InvocationSummary) => !state.invocations.some(i => i.id === item.id))] : data.invocations,
        nextInvocation: data.next, issues: data.issues, health: data.captureHealth, reader: data.reader ?? null });
    } catch (e) { if (current === timelineRequest && generation === navigation) update({ error: message(e) }); }
    finally { if (current === timelineRequest) update({ timelineBusy: false }); }
  }
  async function selectSession(id: string, updateLink = true, openLatest = true) {
    const generation = ++navigation; detailRequest++; groupRequest++; timelineRequest++;
    update({ pickerOpen: !id, session: id, invocation: '', view: null, error: '', detailBusy: false, timelineBusy: false,
      mobileView: 'calls', showPatterns: false, invocations: [], nextInvocation: null,
      groups: { items: [], omittedGroups: 0 }, groupsLoaded: false, groupsBusy: false, groupsError: '' });
    if (updateLink) link();
    if (id) await loadTimeline();
    if (generation === navigation && openLatest && state.invocations[0]) {
      await selectInvocation(state.invocations[0].id, false);
      if (generation === navigation && updateLink) link(true);
    }
  }
  async function selectInvocation(id: string, updateLink = true) {
    if (id === state.invocation && state.view) { update({ mobileView: 'assessment', showPatterns: false }); return; }
    const current = ++detailRequest, generation = navigation;
    update({ invocation: id, view: null, error: '', detailBusy: true, mobileView: 'assessment', showPatterns: false });
    if (updateLink) link();
    try {
      const data = await api(`/api/sessions/${state.session}/invocations/${id}`);
      if (current !== detailRequest || generation !== navigation) return;
      update({ view: data.view, issues: data.issues, health: data.captureHealth, reader: data.reader ?? null });
    } catch (e) { if (current === detailRequest && generation === navigation) update({ error: message(e) }); }
    finally { if (current === detailRequest) update({ detailBusy: false }); }
  }
  function filterCategory(category: FindingCategory | '') {
    update({ category, invocations: [], nextInvocation: null });
    if (state.session) void loadTimeline();
  }
  function filterProjects(project = state.projectInput) {
    update({ project, projectInput: project });
    void selectSession(''); void loadSessions();
  }
  async function restoreLink(initial = false) {
    const params = new URLSearchParams(window.location.search);
    const selectedSession = params.get('session') ?? '', selectedInvocation = params.get('invocation') ?? '';
    await selectSession('', false);
    if ((selectedSession && !/^[a-f0-9]{64}$/.test(selectedSession)) || (selectedInvocation && (!selectedSession || !/^[a-f0-9]{64}$/.test(selectedInvocation)))) {
      update({ error: 'Invalid session or invocation link. Choose a session from the archive.' }); return;
    }
    if (selectedSession) {
      const loading = selectSession(selectedSession, false, !selectedInvocation), generation = navigation;
      await loading;
      if (generation === navigation && selectedInvocation) await selectInvocation(selectedInvocation, false);
    } else if (initial && state.sessions.length) {
      const latest = state.sessions.reduce((a, b) => b.timestamp > a.timestamp ? b : a);
      await selectSession(latest.id, false); link(true);
    }
  }
  async function livePage<T>(path: string, field: 'sessions' | 'invocations', count: number, current: () => boolean) {
    const items: T[] = [];
    let next: string | null = null, issues: ArchiveIssue[] = [], health: CaptureHealth = [], reader: Reader | null = null;
    do {
      const url = new URL(path, window.location.origin);
      url.searchParams.set('limit', String(Math.min(100, Math.max(50, count) - items.length)));
      if (next) url.searchParams.set('cursor', next);
      const data = await api(url.pathname + url.search);
      if (!current()) return null;
      items.push(...data[field]); next = data.next; issues = data.issues; health = data.captureHealth; reader = data.reader ?? null;
    } while (next && items.length < Math.max(50, count));
    return { items, next, issues, health, reader };
  }
  async function refreshLive() {
    if (polling || state.busy || state.timelineBusy || state.detailBusy) return;
    polling = true;
    const version = `${navigation}:${sessionRequest}:${timelineRequest}:${detailRequest}`;
    const current = () => version === `${navigation}:${sessionRequest}:${timelineRequest}:${detailRequest}`;
    const selectedSession = state.session, selectedInvocation = state.invocation;
    try {
      const query = new URLSearchParams(); if (state.project) query.set('project', state.project);
      const sessionData = await livePage<SessionSummary>(`/api/sessions?${query}`, 'sessions', state.sessions.length, current);
      if (!sessionData) return;
      let invocations = state.invocations, nextInvocation = state.nextInvocation, view = state.view;
      let issues = sessionData.issues, health = sessionData.health, groups = state.groups;
      if (selectedSession) {
        const query = new URLSearchParams(); if (state.category) query.set('category', state.category);
        const invocationData = await livePage<InvocationSummary>(`/api/sessions/${selectedSession}?${query}`, 'invocations', state.invocations.length, current);
        if (!invocationData) return;
        invocations = invocationData.items; nextInvocation = invocationData.next; issues = invocationData.issues; health = invocationData.health;
        if (selectedInvocation) {
          const detail = await api(`/api/sessions/${selectedSession}/invocations/${selectedInvocation}`);
          if (!current()) return;
          view = detail.view; issues = detail.issues; health = detail.captureHealth;
        }
        if (state.showPatterns && !state.groupsBusy) {
          const groupData = await api(`/api/sessions/${selectedSession}/groups`);
          if (!current()) return;
          groups = groupData.groups;
        }
      }
      // Publish changed data atomically. Unchanged polls keep the current UI snapshot.
      const patch: Partial<ArchiveState> = { sessions: sessionData.items, nextSession: sessionData.next, reader: sessionData.reader,
        projects: [...new Set([...state.projects, ...sessionData.items.flatMap(s => s.projects)])].sort(),
        invocations, nextInvocation, view, issues, health,
        ...(selectedSession && state.showPatterns && !state.groupsBusy ? { groups, groupsLoaded: true } : {}),
        ...(state.error.startsWith('Live updates paused;') ? { error: '' } : {}) };
      if (Object.entries(patch).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(state[key as keyof ArchiveState]))) update(patch);
    } catch (e) { if (current()) update({ error: `Live updates paused; reconnecting automatically. ${message(e)}` }); }
    finally { polling = false; }
  }
  async function refreshArchive() {
    if (polling) return;
    update({ manualRefreshing: true });
    try { await refreshLive(); } finally { update({ manualRefreshing: false }); }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      const generation = navigation;
      void loadSessions().then(() => { if (generation === navigation && !state.error) return restoreLink(true); });
      const restore = () => { void restoreLink(); };
      window.addEventListener('popstate', restore);
      const timer = setInterval(() => { void refreshLive(); }, 2000);
      return () => { navigation++; sessionRequest++; timelineRequest++; detailRequest++; groupRequest++; clearInterval(timer); window.removeEventListener('popstate', restore); };
    },
    loadSessions, loadTimeline, loadGroups, selectSession, selectInvocation, filterCategory, filterProjects, openPatterns, refreshArchive,
    setPickerOpen: (pickerOpen: boolean) => { if (pickerOpen !== state.pickerOpen) update({ pickerOpen }); },
    setProjectInput: (projectInput: string) => update({ projectInput }),
    setMobileView: (mobileView: MobileView) => update({ mobileView }),
    showSummary: () => update({ mobileView: 'assessment', showPatterns: false }),
  };
}

export function useArchive() {
  const [archive] = useState(createArchive);
  const state = useSyncExternalStore(archive.subscribe, archive.getSnapshot);
  useEffect(() => archive.start(), [archive]);
  return { ...state, ...archive };
}
