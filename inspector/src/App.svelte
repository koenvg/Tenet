<script lang="ts">
  import { onMount } from 'svelte';
  import Detail from './Detail.svelte';
  import type { InvocationView } from '../../src/inspector/view';
  import type { SessionSummary, InvocationSummary } from '../../src/inspector/archive-index';
  let sessions: SessionSummary[] = [], invocations: InvocationSummary[] = [];
  let session = '', invocation = '', error = '', project = '', projectInput = '';
  let busy = false, timelineBusy = false, detailBusy = false;
  let polling = false;
  let view: InvocationView | null = null;
  let issues: { reason: string }[] = [];
  let nextSession: string | null = null, nextInvocation: string | null = null;
  let navigation = 0, sessionRequest = 0, timelineRequest = 0, detailRequest = 0;
  let projects: string[] = [];
  const date = (value: number) => new Date(value).toLocaleString();
  const message = (e: unknown) => e instanceof Error ? e.message : 'Archive unavailable. Try refreshing.';
  function link() {
    const url = new URL(window.location.href);
    url.search = ''; url.hash = '';
    if (session) url.searchParams.set('session', session);
    if (invocation) url.searchParams.set('invocation', invocation);
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
  }
  async function api(path: string) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'Recording not found. Refresh sessions or choose another call.' : `Archive request failed: ${response.status}. Try refreshing.`);
    return response.json();
  }
  async function loadSessions(cursor?: string) {
    const current = ++sessionRequest;
    busy = true; error = '';
    const query = new URLSearchParams();
    if (project) query.set('project', project);
    if (cursor) query.set('cursor', cursor);
    try {
      const data = await api(`/api/sessions?${query}`);
      if (current !== sessionRequest) return;
      sessions = cursor ? [...sessions, ...data.sessions.filter((item: SessionSummary) => !sessions.some(s => s.id === item.id))] : data.sessions;
      projects = [...new Set([...projects, ...sessions.flatMap(s => s.projects)])].sort();
      nextSession = data.next; issues = data.issues;
    } catch (e) { if (current === sessionRequest) error = message(e); }
    finally { if (current === sessionRequest) busy = false; }
  }
  async function loadTimeline(cursor?: string) {
    const current = ++timelineRequest, selected = session, generation = navigation;
    timelineBusy = true;
    try {
      const query = new URLSearchParams(); if (cursor) query.set('cursor', cursor);
      const data = await api(`/api/sessions/${selected}?${query}`);
      if (current !== timelineRequest || generation !== navigation) return;
      invocations = cursor ? [...invocations, ...data.invocations.filter((item: InvocationSummary) => !invocations.some(i => i.id === item.id))] : data.invocations;
      nextInvocation = data.next; issues = data.issues;
    } catch (e) { if (current === timelineRequest && generation === navigation) error = message(e); }
    finally { if (current === timelineRequest) timelineBusy = false; }
  }
  async function selectSession(id: string, updateLink = true) {
    navigation++; detailRequest++;
    session = id; invocation = ''; view = null; error = ''; detailBusy = false;
    invocations = []; nextInvocation = null;
    if (updateLink) link();
    if (id) await loadTimeline();
  }
  async function selectInvocation(id: string, updateLink = true) {
    const current = ++detailRequest, generation = navigation;
    invocation = id; view = null; error = ''; detailBusy = true;
    if (updateLink) link();
    try {
      const data = await api(`/api/sessions/${session}/invocations/${id}`);
      if (current !== detailRequest || generation !== navigation) return;
      view = data.view; issues = data.issues;
    } catch (e) { if (current === detailRequest && generation === navigation) error = message(e); }
    finally { if (current === detailRequest) detailBusy = false; }
  }
  function filterProjects() {
    project = projectInput; void selectSession(''); void loadSessions();
  }
  async function restoreLink() {
    const params = new URLSearchParams(window.location.search);
    const selectedSession = params.get('session') ?? '', selectedInvocation = params.get('invocation') ?? '';
    await selectSession('', false);
    if ((selectedSession && !/^[a-f0-9]{64}$/.test(selectedSession)) || (selectedInvocation && (!selectedSession || !/^[a-f0-9]{64}$/.test(selectedInvocation)))) {
      error = 'Invalid session or invocation link. Choose a session from the archive.'; return;
    }
    if (selectedSession) {
      const loading = selectSession(selectedSession, false), generation = navigation;
      await loading;
      if (generation === navigation && selectedInvocation) await selectInvocation(selectedInvocation, false);
    }
  }
  async function livePage<T>(path: string, field: 'sessions' | 'invocations', count: number, current: () => boolean) {
    const items: T[] = [];
    let next: string | null = null, pageIssues: { reason: string }[] = [];
    do {
      const url = new URL(path, window.location.origin);
      url.searchParams.set('limit', String(Math.min(100, Math.max(50, count) - items.length)));
      if (next) url.searchParams.set('cursor', next);
      const data = await api(url.pathname + url.search);
      if (!current()) return null;
      items.push(...data[field]); next = data.next; pageIssues = data.issues;
    } while (next && items.length < Math.max(50, count));
    return { items, next, issues: pageIssues };
  }
  async function refreshLive() {
    if (polling || busy || timelineBusy || detailBusy) return;
    polling = true;
    const version = `${navigation}:${sessionRequest}:${timelineRequest}:${detailRequest}`;
    const current = () => version === `${navigation}:${sessionRequest}:${timelineRequest}:${detailRequest}`;
    const selectedSession = session, selectedInvocation = invocation;
    try {
      const query = new URLSearchParams(); if (project) query.set('project', project);
      const sessionData = await livePage<SessionSummary>(`/api/sessions?${query}`, 'sessions', sessions.length, current);
      if (!sessionData) return;
      sessions = sessionData.items; nextSession = sessionData.next; issues = sessionData.issues;
      projects = [...new Set([...projects, ...sessions.flatMap(s => s.projects)])].sort();
      if (selectedSession) {
        const invocationData = await livePage<InvocationSummary>(`/api/sessions/${selectedSession}`, 'invocations', invocations.length, current);
        if (!invocationData) return;
        invocations = invocationData.items; nextInvocation = invocationData.next; issues = invocationData.issues;
        if (selectedInvocation) {
          const detail = await api(`/api/sessions/${selectedSession}/invocations/${selectedInvocation}`);
          if (!current()) return;
          // Keep Detail mounted so its rule selection and scroll survive polling.
          view = detail.view; issues = detail.issues;
        }
      }
      if (error.startsWith('Live updates paused;')) error = '';
    } catch (e) {
      if (current()) error = `Live updates paused; reconnecting automatically. ${message(e)}`;
    } finally { polling = false; }
  }
  onMount(() => {
    void loadSessions(); void restoreLink();
    const restore = () => { void restoreLink(); };
    window.addEventListener('popstate', restore);
    const timer = setInterval(() => { void refreshLive(); }, 2000);
    return () => { navigation++; sessionRequest++; clearInterval(timer); window.removeEventListener('popstate', restore); };
  });
</script>

<header><h1>TENET <span>Decision inspector</span></h1><p>Local, read-only assessment history. No evaluator calls.</p></header>
<main>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if issues.length}<p role="status">Archive coverage is incomplete: {[...new Set(issues.map(i => i.reason))].join(', ')}. Refresh to check for new records.</p>{/if}
  <div class="workspace">
    <nav aria-label="Archive">
      <h2>Sessions</h2>
      <form on:submit|preventDefault={filterProjects}>
        <label for="project">Project directory</label>
        <input id="project" aria-label="Project directory" list="projects" bind:value={projectInput} placeholder="All projects" />
        <datalist id="projects">{#each projects as path}<option value={path}></option>{/each}</datalist>
        <button type="submit" disabled={busy}>Filter projects</button>
      </form>
      {#if project}<p>Showing {project}</p><button on:click={() => { projectInput = ''; filterProjects(); }}>All projects</button>{/if}
      <button disabled={busy} on:click={() => loadSessions()}>Refresh sessions</button>
      {#if busy}<p role="status">Loading sessions…</p>{:else if !sessions.length}<p>No recorded sessions{project ? ' for this project' : ''}.</p>{/if}
      {#each sessions as item}<button class:chosen={session === item.id} aria-pressed={session === item.id} on:click={() => selectSession(item.id)}>
        <strong>{item.sessionId}</strong><span>{item.projects.join(', ')}</span>
        <span>{item.invocations} calls · {item.concerns} concerns · {item.unavailable} unavailable</span>
        <span>Started {date(item.started)}</span><span>Updated {date(item.timestamp)}</span><span>Best-effort capture</span>
      </button>{/each}
      {#if nextSession !== null}<button disabled={busy} on:click={() => loadSessions(nextSession!)}>More sessions</button>{/if}
      {#if session}<h2 class="timeline-heading">Invocations</h2>
        <button disabled={timelineBusy} on:click={() => loadTimeline()}>Refresh timeline</button>
        {#if timelineBusy}<p role="status">Loading calls…</p>{:else if !invocations.length}<p>No recorded invocations.</p>{/if}
        {#each invocations as item}<button class:chosen={invocation === item.id} aria-pressed={invocation === item.id} on:click={() => selectInvocation(item.id)}>
          {item.toolName} · {item.decision}<span data-call-id>{item.callId}</span><span>{date(item.timestamp)}</span>
          {#if item.missing.length}<span>Incomplete capture · {item.missing.length} missing stages</span>{/if}
        </button>{/each}
        {#if nextInvocation !== null}<button disabled={timelineBusy} on:click={() => loadTimeline(nextInvocation!)}>More invocations</button>{/if}
      {/if}
    </nav>
    <article>
      {#if detailBusy}<p role="status">Loading invocation…</p>
      {:else if view}<p>Session {view.identity?.sessionId}<br />Invocation {view.identity?.invocationId}</p><Detail {view} />
      {:else}<h2>Select an invocation</h2><p>Choose a session, then a call to inspect its recorded rules, questions, evidence and decision.</p>{/if}
    </article>
  </div>
</main>
