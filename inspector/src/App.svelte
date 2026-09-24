<script lang="ts">
  import { onMount } from 'svelte';
  import Detail from './Detail.svelte';
  import { timestamp, toolLabel, decisionLabel, type MobileView } from './presentation';
  import DecisionIcon from './DecisionIcon.svelte';
  import PaneResizer from './PaneResizer.svelte';
  let explorerWidth = 300;
  import StatusChip from './StatusChip.svelte';
  let mobileView: MobileView = 'calls';
  let pickerOpen = true;
  $: currentSession = sessions.find(s => s.id === session);
  import type { CaptureHealth, InvocationView } from '../../src/inspector/view';
  import type { ArchiveIssue } from '../../src/recording/archive';
  import type { SessionSummary, InvocationSummary } from '../../src/inspector/archive-index';
  let sessions: SessionSummary[] = [], invocations: InvocationSummary[] = [];
  let session = '', invocation = '', error = '', project = '', projectInput = '';
  let busy = false, timelineBusy = false, detailBusy = false;
  let polling = false, manualRefreshing = false;
  let view: InvocationView | null = null;
  let issues: ArchiveIssue[] = [];
  let health: CaptureHealth = [];
  let nextSession: string | null = null, nextInvocation: string | null = null;
  let navigation = 0, sessionRequest = 0, timelineRequest = 0, detailRequest = 0;
  let projects: string[] = [];
  const date = (value: number) => new Date(value).toLocaleString();
  const message = (e: unknown) => e instanceof Error ? e.message : 'Archive unavailable. Try refreshing.';
  const projectName = (paths: string[]) => paths.map(p => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p).join(', ') || 'Unknown project';
  function link(replace = false) {
    const url = new URL(window.location.href);
    url.search = ''; url.hash = '';
    if (session) url.searchParams.set('session', session);
    if (invocation) url.searchParams.set('invocation', invocation);
    if (url.href !== window.location.href) window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
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
      nextSession = data.next; issues = data.issues; health = data.captureHealth;
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
      nextInvocation = data.next; issues = data.issues; health = data.captureHealth;
    } catch (e) { if (current === timelineRequest && generation === navigation) error = message(e); }
    finally { if (current === timelineRequest) timelineBusy = false; }
  }
  async function selectSession(id: string, updateLink = true, openLatest = true) {
    const generation = ++navigation; detailRequest++;
    pickerOpen = !id;
    session = id; invocation = ''; view = null; error = ''; detailBusy = false; mobileView = 'calls';
    invocations = []; nextInvocation = null;
    if (updateLink) link();
    if (id) await loadTimeline();
    if (generation === navigation && openLatest && invocations[0]) {
      await selectInvocation(invocations[0].id, false);
      if (generation === navigation && updateLink) link(true);
    }
  }
  async function selectInvocation(id: string, updateLink = true) {
    if (id === invocation && view) { mobileView = 'assessment'; return; }
    const current = ++detailRequest, generation = navigation;
    invocation = id; view = null; error = ''; detailBusy = true; mobileView = 'assessment';
    if (updateLink) link();
    try {
      const data = await api(`/api/sessions/${session}/invocations/${id}`);
      if (current !== detailRequest || generation !== navigation) return;
      view = data.view; issues = data.issues; health = data.captureHealth;
    } catch (e) { if (current === detailRequest && generation === navigation) error = message(e); }
    finally { if (current === detailRequest) detailBusy = false; }
  }
  function filterProjects() {
    project = projectInput; void selectSession(''); void loadSessions();
  }
  async function restoreLink(initial = false) {
    const params = new URLSearchParams(window.location.search);
    const selectedSession = params.get('session') ?? '', selectedInvocation = params.get('invocation') ?? '';
    await selectSession('', false);
    if ((selectedSession && !/^[a-f0-9]{64}$/.test(selectedSession)) || (selectedInvocation && (!selectedSession || !/^[a-f0-9]{64}$/.test(selectedInvocation)))) {
      error = 'Invalid session or invocation link. Choose a session from the archive.'; return;
    }
    if (selectedSession) {
      const loading = selectSession(selectedSession, false, !selectedInvocation), generation = navigation;
      await loading;
      if (generation === navigation && selectedInvocation) await selectInvocation(selectedInvocation, false);
    } else if (initial && sessions.length) {
      const latest = sessions.reduce((a, b) => b.timestamp > a.timestamp ? b : a);
      await selectSession(latest.id, false);
      link(true);
    }
  }
  async function livePage<T>(path: string, field: 'sessions' | 'invocations', count: number, current: () => boolean) {
    const items: T[] = [];
    let next: string | null = null, pageIssues: ArchiveIssue[] = [], pageHealth: CaptureHealth = [];
    do {
      const url = new URL(path, window.location.origin);
      url.searchParams.set('limit', String(Math.min(100, Math.max(50, count) - items.length)));
      if (next) url.searchParams.set('cursor', next);
      const data = await api(url.pathname + url.search);
      if (!current()) return null;
      items.push(...data[field]); next = data.next; pageIssues = data.issues; pageHealth = data.captureHealth;
    } while (next && items.length < Math.max(50, count));
    return { items, next, issues: pageIssues, captureHealth: pageHealth };
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
      let refreshedInvocations = invocations, refreshedNextInvocation = nextInvocation, refreshedView = view;
      let refreshedIssues = sessionData.issues, refreshedHealth = sessionData.captureHealth;
      if (selectedSession) {
        const invocationData = await livePage<InvocationSummary>(`/api/sessions/${selectedSession}`, 'invocations', invocations.length, current);
        if (!invocationData) return;
        refreshedInvocations = invocationData.items; refreshedNextInvocation = invocationData.next;
        refreshedIssues = invocationData.issues; refreshedHealth = invocationData.captureHealth;
        if (selectedInvocation) {
          const detail = await api(`/api/sessions/${selectedSession}/invocations/${selectedInvocation}`);
          if (!current()) return;
          refreshedView = detail.view; refreshedIssues = detail.issues; refreshedHealth = detail.captureHealth;
        }
      }
      // Publish one completed refresh. Archive-wide warnings must not flash above
      // a selected session before its scoped response replaces them.
      sessions = sessionData.items; nextSession = sessionData.next;
      projects = [...new Set([...projects, ...sessions.flatMap(s => s.projects)])].sort();
      invocations = refreshedInvocations; nextInvocation = refreshedNextInvocation;
      view = refreshedView; issues = refreshedIssues; health = refreshedHealth;
      if (error.startsWith('Live updates paused;')) error = '';
    } catch (e) {
      if (current()) error = `Live updates paused; reconnecting automatically. ${message(e)}`;
    } finally { polling = false; }
  }
  async function refreshArchive() {
    if (polling) return;
    manualRefreshing = true;
    try { await refreshLive(); } finally { manualRefreshing = false; }
  }
  onMount(() => {
    const generation = navigation;
    void loadSessions().then(() => { if (generation === navigation && !error) return restoreLink(true); });
    const restore = () => { void restoreLink(); };
    window.addEventListener('popstate', restore);
    const timer = setInterval(() => { void refreshLive(); }, 2000);
    return () => { navigation++; sessionRequest++; clearInterval(timer); window.removeEventListener('popstate', restore); };
  });
</script>

<header class="app-bar">
  <h1><DecisionIcon kind="brand" /> TENET</h1>
  <details class="session-picker" bind:open={pickerOpen}>
    <summary title={currentSession?.sessionId}>{currentSession ? projectName(currentSession.projects) : session ? 'Selected session' : 'Choose a session'}</summary>
    <div class="session-menu">
      <h2>Sessions <span class="muted">{sessions.length} loaded</span></h2>
      <form class="project-filter" on:submit|preventDefault={filterProjects}>
        <label for="project">Project directory</label>
        <input id="project" aria-label="Project directory" list="projects" bind:value={projectInput} placeholder="All projects" />
        <datalist id="projects">{#each projects as path}<option value={path}></option>{/each}</datalist>
        <button type="submit" disabled={busy}>Filter projects</button>
      </form>
      {#if project}<p>Showing {project}</p><button on:click={() => { projectInput = ''; filterProjects(); }}>All projects</button>{/if}
      <nav aria-label="Sessions">
        {#each sessions as item}
          <button class="session-row" aria-pressed={session === item.id} on:click={() => selectSession(item.id)}>
            <strong hidden>{item.sessionId}</strong><b>{projectName(item.projects)}</b><span>{item.invocations} calls</span>
            <small>{date(item.started)}</small>
            {#if item.concerns || item.unavailable}<small>{item.concerns} flagged · {item.unavailable} unavailable</small>{/if}
          </button>
        {/each}
      </nav>
      {#if nextSession !== null}<button class="text-button" disabled={busy} on:click={() => loadSessions(nextSession!)}>More sessions</button>{/if}
      {#if busy}<p role="status">Reading archive…</p>{:else if !sessions.length}<p>No recorded sessions{project ? ' for this project' : ''}.</p>{/if}
    </div>
  </details>
  <span class="local-label">Read-only</span>
  <button class="header-button" disabled={busy || timelineBusy || detailBusy || manualRefreshing} on:click={refreshArchive}>Refresh archive</button>
</header>
<main class="workspace" data-mobile-view={mobileView} style:--explorer-width={`${explorerWidth}px`}>
  <nav class="mobile-nav" aria-label="Workspace views">
    <button aria-pressed={mobileView === 'calls'} on:click={() => mobileView = 'calls'}>Calls</button>
    <button aria-pressed={mobileView === 'assessment'} disabled={!view} on:click={() => mobileView = 'assessment'}>Summary</button>
  </nav>
  <div class="archive-messages">
    {#if error}<p class="archive-alert" role="alert">{error}</p>{/if}
    {#if issues.length || health.length}
      <section class="archive-alert" aria-label="Recording issues">
        <details><summary>Recording issues: {issues.length} files, {health.length} writers reporting recording issues</summary>
          <p>Valid records remain browsable; capture may be incomplete. Temporary files may be in progress or left by an interruption. Their contents are not read.</p>
          <ul>{#each issues as issue}<li><strong>{issue.reason}</strong>: {issue.file || 'Archive directory'}</li>{/each}</ul>
          {#if health.length}<h2>Writer-wide capture health</h2><p>Cumulative counters per writer, not per call. They may include other sessions. Zero counters do not prove complete capture.</p>
            <ul>{#each health as item}<li>{item.failed} failed writes or snapshots, {item.dropped} dropped stages, {item.drainTimeouts} drain timeouts. Writer {item.writerId}</li>{/each}</ul>
          {/if}
        </details>
      </section>
    {/if}
  </div>
  <aside id="call-explorer" class="explorer" aria-label="Call explorer">
    <div class="pane-heading"><h2>Recent calls</h2></div>
    <nav class="call-list" aria-label="Invocations">
      {#each invocations as item}
        <button class="call-row" aria-pressed={invocation === item.id} on:click={() => selectInvocation(item.id)}>
          <DecisionIcon kind={item.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(item.toolName) ? 'document' : 'tool'} />
          <span class="call-copy">
          <span class="call-top"><strong>{toolLabel(item.toolName)}</strong><time>{timestamp(item.timestamp)}</time></span>
          <span class="call-id" hidden>{item.callId}</span>
          <span class="call-state"><StatusChip value={item.decision} label={decisionLabel(item.decision, item.mode)} showIcon /></span>
          {#if item.failure || item.assessmentStatus === 'incomplete'}<small>{item.failure ?? 'Assessment incomplete'}</small>{/if}
          {#if item.missing.length && item.assessmentStatus !== 'incomplete'}<span class="call-execution">Incomplete recording</span>{/if}
          </span>
        </button>
      {/each}
      {#if timelineBusy}<p role="status">Loading calls…</p>{:else if session && !invocations.length}<p class="empty-inline">No recorded invocations in this session.</p>{/if}
      {#if nextInvocation !== null}<button class="text-button" disabled={timelineBusy} on:click={() => loadTimeline(nextInvocation!)}>More invocations</button>{/if}
    </nav>
    <div class="explorer-footer"><span>Recorded data only. No evaluator calls.</span></div>
  </aside>
  <PaneResizer bind:value={explorerWidth} min={220} max={460} label="Resize call explorer" controls="call-explorer" />
  <div class="inspection">
    {#if view}
      {#key view.identity?.invocationId}<Detail {view} bind:mobileView />{/key}
    {:else}
      <section class="empty-state" aria-live="polite">
        <span class="empty-symbol" aria-hidden="true">[ ]</span>
        <h2>{detailBusy ? 'Reading invocation…' : session && !invocations.length ? 'Waiting for recorded calls' : session ? 'Choose a call to investigate' : 'Start with a recorded session'}</h2>
        <p>{detailBusy ? 'Loading its recorded assessment and evidence.' : session && !invocations.length ? 'No calls are recorded for this session yet. New calls appear here as TENET records them.' : 'See what TENET decided, which rules contributed, and the evidence the evaluator actually received.'}</p>
        <p class="muted">Missing records stay unknown. This inspector never reruns an assessment.</p>
      </section>
    {/if}
  </div>
</main>
