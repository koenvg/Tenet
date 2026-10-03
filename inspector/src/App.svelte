<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { categoryLabels, findingCategories, type FindingCategory } from '../../src/decision/finding-triage';
  import type { UncertaintyGroup } from '../../src/inspector/archive-index';
  import Detail from './Detail.svelte';
  import { timestamp, toolLabel, primaryStatus, modeLabel, decisionLabel, gateLabels, type MobileView } from './presentation';
  import DecisionIcon from './DecisionIcon.svelte';
  import PaneResizer from './PaneResizer.svelte';
  let explorerWidth = 300;
  import StatusChip from './StatusChip.svelte';
  import FindingChips from './FindingChips.svelte';
  let mobileView: MobileView = 'calls';
  let pickerOpen = true;
  let showPatterns = false;
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
  let reader: { build: string; supportedSchemas: number[]; unsupported: number; newerUnsupported: number; corrupt: number; indexing: boolean; otherIssues: number } | null = null;
  let groups: { items: UncertaintyGroup[]; omittedGroups: number } = { items: [], omittedGroups: 0 };
  let groupsLoaded = false, groupsBusy = false, groupsError = '';
  let decisionButton: HTMLButtonElement, summaryButton: HTMLButtonElement;
  let category: FindingCategory | '' = '';
  let navigation = 0, sessionRequest = 0, timelineRequest = 0, detailRequest = 0, groupRequest = 0;
  let projects: string[] = [];
  const date = (value: number) => new Date(value).toLocaleString();
  const message = (e: unknown) => e instanceof Error ? e.message : 'Archive unavailable. Try refreshing.';
  const projectName = (paths: string[]) => paths.map(p => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p).join(', ') || 'Unknown project';
  const policyLabel = (identity: string) => {
    try { const [source, digest, target] = JSON.parse(identity); return `${source ?? 'source not recorded'} · digest ${digest} · target ${target ?? 'not recorded'}`; }
    catch { return identity; }
  };
  const policyKey = (identity: string) => {
    try { const [, digest, target] = JSON.parse(identity);
      return `${typeof digest === 'string' ? digest.slice(0, 12) + (digest.length > 12 ? '…' : '') : 'unknown'} · target ${target ?? 'not recorded'}`; }
    catch { return 'unknown'; }
  };
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
      nextSession = data.next; issues = data.issues; health = data.captureHealth; reader = data.reader ?? null;
    } catch (e) { if (current === sessionRequest) error = message(e); }
    finally { if (current === sessionRequest) busy = false; }
  }
  async function loadGroups() {
    if (!session) return;
    const current = ++groupRequest, selected = session, generation = navigation;
    groupsBusy = true; groupsError = '';
    try {
      const data = await api(`/api/sessions/${selected}/groups`);
      if (current !== groupRequest || generation !== navigation) return;
      groups = data.groups; groupsLoaded = true; issues = data.issues; health = data.captureHealth; reader = data.reader ?? null;
    } catch (e) { if (current === groupRequest && generation === navigation) groupsError = message(e); }
    finally { if (current === groupRequest && generation === navigation) groupsBusy = false; }
  }
  function openPatterns() {
    if (!session) return;
    showPatterns = true; mobileView = 'assessment';
    if (!groupsBusy) void loadGroups();
  }
  async function inspectGroupCall(id: string) {
    await selectInvocation(id);
    if (!view || invocation !== id) return;
    await tick();
    (window.matchMedia('(max-width: 900px)').matches ? summaryButton : decisionButton)?.focus();
  }
  async function loadTimeline(cursor?: string) {
    const current = ++timelineRequest, selected = session, generation = navigation, selectedCategory = category;
    timelineBusy = true;
    try {
      const query = new URLSearchParams(); if (cursor) query.set('cursor', cursor); if (selectedCategory) query.set('category', selectedCategory);
      const data = await api(`/api/sessions/${selected}?${query}`);
      if (current !== timelineRequest || generation !== navigation) return;
      invocations = cursor ? [...invocations, ...data.invocations.filter((item: InvocationSummary) => !invocations.some(i => i.id === item.id))] : data.invocations;
      nextInvocation = data.next; issues = data.issues; health = data.captureHealth; reader = data.reader ?? null;
    } catch (e) { if (current === timelineRequest && generation === navigation) error = message(e); }
    finally { if (current === timelineRequest) timelineBusy = false; }
  }
  async function selectSession(id: string, updateLink = true, openLatest = true) {
    const generation = ++navigation; detailRequest++; groupRequest++;
    pickerOpen = !id;
    session = id; invocation = ''; view = null; error = ''; detailBusy = false; mobileView = 'calls'; showPatterns = false;
    invocations = []; nextInvocation = null;
    groups = { items: [], omittedGroups: 0 }; groupsLoaded = false; groupsBusy = false; groupsError = '';
    if (updateLink) link();
    if (id) await loadTimeline();
    if (generation === navigation && openLatest && invocations[0]) {
      await selectInvocation(invocations[0].id, false);
      if (generation === navigation && updateLink) link(true);
    }
  }
  async function selectInvocation(id: string, updateLink = true) {
    if (id === invocation && view) { mobileView = 'assessment'; showPatterns = false; return; }
    const current = ++detailRequest, generation = navigation;
    invocation = id; view = null; error = ''; detailBusy = true; mobileView = 'assessment'; showPatterns = false;
    if (updateLink) link();
    try {
      const data = await api(`/api/sessions/${session}/invocations/${id}`);
      if (current !== detailRequest || generation !== navigation) return;
      view = data.view; issues = data.issues; health = data.captureHealth; reader = data.reader ?? null;
    } catch (e) { if (current === detailRequest && generation === navigation) error = message(e); }
    finally { if (current === detailRequest) detailBusy = false; }
  }
  function filterCategory() {
    invocations = []; nextInvocation = null; if (session) void loadTimeline();
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
    let pageReader: typeof reader = null;
    do {
      const url = new URL(path, window.location.origin);
      url.searchParams.set('limit', String(Math.min(100, Math.max(50, count) - items.length)));
      if (next) url.searchParams.set('cursor', next);
      const data = await api(url.pathname + url.search);
      if (!current()) return null;
      items.push(...data[field]); next = data.next; pageIssues = data.issues; pageHealth = data.captureHealth; pageReader = data.reader ?? null;
    } while (next && items.length < Math.max(50, count));
    return { items, next, issues: pageIssues, captureHealth: pageHealth, reader: pageReader };
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
      let refreshedIssues = sessionData.issues, refreshedHealth = sessionData.captureHealth, refreshedGroups = groups;
      if (selectedSession) {
        const query = new URLSearchParams(); if (category) query.set('category', category);
        const invocationData = await livePage<InvocationSummary>(`/api/sessions/${selectedSession}?${query}`, 'invocations', invocations.length, current);
        if (!invocationData) return;
        refreshedInvocations = invocationData.items; refreshedNextInvocation = invocationData.next;
        refreshedIssues = invocationData.issues; refreshedHealth = invocationData.captureHealth;
        if (selectedInvocation) {
          const detail = await api(`/api/sessions/${selectedSession}/invocations/${selectedInvocation}`);
          if (!current()) return;
          refreshedView = detail.view; refreshedIssues = detail.issues; refreshedHealth = detail.captureHealth;
        }
        if (showPatterns && !groupsBusy) {
          const groupData = await api(`/api/sessions/${selectedSession}/groups`);
          if (!current()) return;
          refreshedGroups = groupData.groups;
        }
      }
      // Publish one completed refresh. Archive-wide warnings must not flash above
      // a selected session before its scoped response replaces them.
      sessions = sessionData.items; nextSession = sessionData.next; reader = sessionData.reader;
      projects = [...new Set([...projects, ...sessions.flatMap(s => s.projects)])].sort();
      invocations = refreshedInvocations; nextInvocation = refreshedNextInvocation;
      view = refreshedView; issues = refreshedIssues; health = refreshedHealth;
      if (selectedSession && showPatterns && !groupsBusy) { groups = refreshedGroups; groupsLoaded = true; }
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
    return () => { navigation++; sessionRequest++; groupRequest++; clearInterval(timer); window.removeEventListener('popstate', restore); };
  });
</script>

<header class="app-bar">
  <h1><DecisionIcon kind="brand" /> TENET</h1>
  <details class="session-picker" bind:open={pickerOpen}>
    <summary title={currentSession?.sessionId}>{currentSession ? `${projectName(currentSession.projects)} · ${currentSession.host} / ${currentSession.contextId}` : session ? 'Selected session' : 'Choose a session'}</summary>
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
            <strong hidden>{item.sessionId}</strong><b>{projectName(item.projects)}</b><span>{item.host} / {item.contextId} · {item.invocations} calls</span>
            <small>{date(item.started)}</small>
            {#if item.concerns || item.unavailable}<small>{item.concerns} flagged · {item.unavailable} unavailable</small>{/if}
            {#if item.categoryCounts}<small>{Object.entries(item.categoryCounts).filter(([, n]) => n).map(([c, n]) => `${n} ${categoryLabels[c as FindingCategory]?.toLowerCase() ?? c}`).join(' · ')} (distinct calls; categories overlap)</small>{/if}
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
    <button bind:this={summaryButton} aria-pressed={mobileView === 'assessment' && !showPatterns} disabled={!view} on:click={() => { mobileView = 'assessment'; showPatterns = false; }}>Summary</button>
    <button aria-pressed={mobileView === 'assessment' && showPatterns} disabled={!session} on:click={openPatterns}>Patterns</button>
  </nav>
  <div class="archive-messages">
    {#if error}<p class="archive-alert" role="alert">{error}</p>{/if}
    {#if reader}<p class="reader-status">Reader {reader.build} · supported recording schemas {reader.supportedSchemas.join(', ')} · read-only, best-effort archive</p>{/if}
    {#if reader && (reader.unsupported || reader.indexing || reader.corrupt || reader.otherIssues)}
      <p class="archive-alert compatibility-warning" role="status">Partial archive coverage: {reader.unsupported} unsupported schema records ({reader.newerUnsupported ?? 0} newer), {reader.corrupt} corrupt records, {reader.otherIssues} other issues{reader.indexing ? '; indexing is still in progress' : ''}. Older supported calls remain available. <span class="upgrade-guidance">For newer records, update the reader, run <code>bun run inspector:build</code>, then restart the inspector process. A rebuild alone does not update a running reader.</span><span class="mobile-upgrade">For newer records, rebuild and restart the reader.</span></p>
    {:else if !reader && !busy}<p class="archive-alert" role="status">Reader compatibility is unknown. Do not treat these calls as a complete archive.</p>{/if}
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
    <div class="triage-tools">
      <label for="finding-category">Finding category</label>
      <select id="finding-category" bind:value={category} on:change={filterCategory}>
        <option value="">All recorded calls</option>
        {#each findingCategories as c}<option value={c}>{categoryLabels[c]}</option>{/each}
      </select>
    </div>
    <nav class="call-list" aria-label="Invocations">
      {#each invocations as item}
        {@const status = primaryStatus(item)}
        <button class="call-row" aria-pressed={invocation === item.id} on:click={() => selectInvocation(item.id)}>
          <DecisionIcon kind={item.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(item.toolName) ? 'document' : 'tool'} />
          <span class="call-copy">
          <span class="call-top"><strong>{toolLabel(item.toolName)}</strong><time>{timestamp(item.timestamp)}</time></span>
          <span class="call-id" hidden>{item.callId}</span>
          <span class="call-state" title={status.explanation}><StatusChip value={status.label} tone={status.tone} icon={status.icon} showIcon /><StatusChip value={modeLabel(item.mode)} tone="neutral" /></span>
          {#if status.label === 'Released'}<small class="call-execution">Execution unknown</small>{/if}
          {#if status.inconsistency}<small class="recording-inconsistency">Inconsistent recording: blocked permission with a result</small>{/if}
          {#if item.categories?.length}<FindingChips categories={item.categories} />{/if}
          {#if ['ALLOW', 'ASK', 'BLOCK'].includes(item.decision)}<small class="call-assessment">{decisionLabel(item.decision, item.mode)}</small>{/if}
          {#if item.failure || item.assessmentStatus !== 'validated'}<small>Assessment {item.assessmentStatus}{item.failure ? `: ${item.failure}` : ''}</small>{/if}
          {#if item.missing.length && item.assessmentStatus !== 'incomplete'}<span class="call-execution">Incomplete recording</span>{/if}
          </span>
        </button>
      {/each}
      {#if timelineBusy}<p role="status">Loading calls…</p>{:else if session && !invocations.length}<p class="empty-inline">{category ? 'No calls match this finding category.' : 'No recorded invocations in this session.'}</p>{/if}
      {#if nextInvocation !== null}<button class="text-button" disabled={timelineBusy} on:click={() => loadTimeline(nextInvocation!)}>More invocations</button>{/if}
    </nav>
    <div class="explorer-footer"><span>Recorded data only. No evaluator calls.</span></div>
  </aside>
  <PaneResizer bind:value={explorerWidth} min={220} max={460} label="Resize call explorer" controls="call-explorer" />
  <div class="inspection">
    {#if session}
      <nav class="inspection-switch" aria-label="Inspection views">
        <button bind:this={decisionButton} aria-pressed={!showPatterns} disabled={!view} on:click={() => showPatterns = false}>Decision</button>
        <button aria-pressed={showPatterns} on:click={openPatterns}>Uncertainty groups{groupsLoaded ? ` (${groups.items.length}${groups.omittedGroups ? '+' : ''})` : ''}</button>
      </nav>
    {/if}
    {#if view}
      <div class="decision-pane" hidden={showPatterns}>
        {#key view.identity?.invocationId}<Detail {view} bind:mobileView />{/key}
      </div>
    {:else if !showPatterns}
      <section class="empty-state" aria-live="polite">
        <span class="empty-symbol" aria-hidden="true">[ ]</span>
        <h2>{detailBusy ? 'Reading invocation…' : session && category && !invocations.length ? 'No matching calls' : session && !invocations.length ? 'Waiting for recorded calls' : session ? 'Choose a call to investigate' : 'Start with a recorded session'}</h2>
        <p>{detailBusy ? 'Loading its recorded assessment and evidence.' : session && category && !invocations.length ? 'No calls match this finding category. Clear the filter to browse all calls, or open uncertainty groups for the session.' : session && !invocations.length ? 'No calls are recorded for this session yet. New calls appear here as TENET records them.' : 'See what TENET decided, which rules contributed, and the evidence the evaluator actually received.'}</p>
        <p class="muted">Missing records stay unknown. This inspector never reruns an assessment.</p>
      </section>
    {/if}
    {#if session}
      <section class="pattern-view" aria-label="Uncertainty groups" hidden={!showPatterns}>
        <header><h2>Uncertain calls by rule and gate</h2>
          <p>Calls with the same recorded policy, assessment profile, rule and gate appear together. Each call stays separate, even in one-call groups. This session-wide view does not change with the call filter.</p>
        </header>
        {#if groupsError}<p class="missing-data" role="alert">Could not load groups: {groupsError} <button on:click={() => loadGroups()}>Try again</button></p>{/if}
        {#if groupsBusy && !groupsLoaded}<p role="status">Loading uncertainty groups…</p>
        {:else if groupsLoaded && !groups.items.length}<p>No uncertainty groups recorded in this session.</p>
        {:else if groupsLoaded}
          <div class="pattern-list">
            {#each groups.items as group}
              <details class="uncertainty-group">
                <summary><span class="pattern-heading"><strong>{gateLabels[group.gate] ?? group.gate}</strong><span>{group.count} {group.count === 1 ? 'call' : 'calls'}</span></span>
                  <small>Rule {group.ruleId} · {group.profile} · Policy {policyKey(group.policyIdentity)}</small></summary>
                <div class="pattern-context"><p>Policy {policyLabel(group.policyIdentity)}</p><p>First {date(group.first)} · Last {date(group.last)}</p></div>
                <ul>{#each group.invocations as ref}<li><button on:click={() => inspectGroupCall(ref.id)}>{ref.callId} · {date(ref.timestamp)}</button></li>{/each}</ul>
                {#if group.omitted}<p class="pattern-overflow">{group.omitted} more links omitted here. Browse the paginated call list for individual records.</p>{/if}
              </details>
            {/each}
            {#if groups.omittedGroups}<p class="pattern-overflow">{groups.omittedGroups} more groups omitted from this bounded view. Individual calls remain in the call list.</p>{/if}
          </div>
        {/if}
      </section>
    {/if}
  </div>
</main>
