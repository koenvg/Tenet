<script lang="ts">
  import { onMount } from 'svelte';
  import Detail from './Detail.svelte';
  import type { InvocationView } from '../../src/inspector/view';
  let sessions: { id: string; sessionId: string; projects: string[] }[] = [];
  let invocations: { id: string; callId: string; toolName: string; decision: string }[] = [];
  let session = '', invocation = '', error = '', busy = false;
  let view: InvocationView | null = null;
  let issues: unknown[] = [];
  let nextSession: number | null = null, nextInvocation: number | null = null;
  let generation = 0;
  async function api(path: string) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Archive request failed: ${response.status}`);
    return response.json();
  }
  async function loadSessions(offset = 0) {
    busy = true; error = '';
    try { const data = await api(`/api/sessions?offset=${offset}`); sessions = offset ? [...sessions, ...data.sessions] : data.sessions; nextSession = data.next; issues = data.issues; }
    catch (e) { error = e instanceof Error ? e.message : 'Archive unavailable'; }
    finally { busy = false; }
  }
  async function selectSession(id: string, offset = 0) {
    const current = ++generation;
    session = id; invocation = ''; view = null; error = '';
    if (!offset) invocations = [];
    try { const data = await api(`/api/sessions/${id}?offset=${offset}`); if (current !== generation) return;
      invocations = offset ? [...invocations, ...data.invocations] : data.invocations; nextInvocation = data.next; issues = data.issues; }
    catch (e) { if (current === generation) error = e instanceof Error ? e.message : 'Archive unavailable'; }
  }
  async function selectInvocation(id: string) {
    const current = ++generation;
    invocation = id; view = null; error = '';
    try { const data = await api(`/api/sessions/${session}/invocations/${id}`); if (current !== generation) return; view = data.view; issues = data.issues; }
    catch (e) { if (current === generation) error = e instanceof Error ? e.message : 'Archive unavailable'; }
  }
  onMount(() => { void loadSessions(); });
</script>

<header><h1>TENET <span>Decision inspector</span></h1><p>Local, read-only assessment history. No evaluator calls.</p></header>
<main>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if issues.length}<p role="alert">{issues.length} archive issue(s). Some recordings are unavailable or unsafe.</p>{/if}
  <div class="workspace">
    <nav aria-label="Archive">
      <h2>Sessions</h2><button disabled={busy} on:click={() => loadSessions()}>Refresh sessions</button>
      {#if !busy && !sessions.length}<p>No recorded sessions.</p>{/if}
      {#each sessions as item}<button class:chosen={session === item.id} on:click={() => selectSession(item.id)}><strong>{item.sessionId}</strong><span>{item.projects.join(', ')}</span></button>{/each}
      {#if nextSession !== null}<button on:click={() => loadSessions(nextSession!)}>More sessions</button>{/if}
      {#if session}<h2>Invocations</h2>
        {#if !invocations.length}<p>No recorded invocations.</p>{/if}
        {#each invocations as item}<button class:chosen={invocation === item.id} on:click={() => selectInvocation(item.id)}>{item.toolName} · {item.decision}<span>{item.callId}</span></button>{/each}
        {#if nextInvocation !== null}<button on:click={() => selectSession(session, nextInvocation!)}>More invocations</button>{/if}
      {/if}
    </nav>
    <article>{#if view}<Detail {view} />{:else}<h2>Select an invocation</h2><p>Choose a session, then a call to inspect its recorded rules, questions, evidence and decision.</p>{/if}</article>
  </div>
</main>
