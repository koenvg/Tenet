import type { SessionSummary } from '../../src/inspector/archive-index.js';
import type { CaptureHealth, InvocationView } from '../../src/inspector/view.js';
import type { ArchiveIssue } from '../../src/recording/archive.js';
import type { SessionRulesPage, SelectedSessionRule, RuleChecksPage } from '../../src/inspector/session-rules-model.js';

export const FIXED_RULE_WORDING = 'Do not directly use write/edit tools. Delegate those actions.';
export type FixedRuleAvailability =
  | { kind: 'inactive' } | { kind: 'choose-session' } | { kind: 'reading' }
  | { kind: 'unavailable'; revision: string | null; reason: string }
  | { kind: 'ready'; revision: string; rule: string };
export type PanelSelection = { kind: 'closed' } | { kind: 'rule'; rule: string } | { kind: 'action'; rule: string | null; invocation: string };
export type OpenRecord =
  | { state: 'loading'; sourceRevision: string | null }
  | { state: 'available'; sourceRevision: string | null; bytes: number; view: InvocationView }
  | { state: 'unavailable'; sourceRevision: string | null; cause: 'source' | 'limit'; reason: string };
const RECORD_LIMIT = 8, RECORD_BYTES = 32 * 1024 * 1024;
const RECORD_LIMIT_REASON = 'Visible record limit reached (8 records / 32 MiB). Close another recorded action and retry.';
type Reader = { build: string; supportedSchemas: number[]; unsupported: number; newerUnsupported: number; corrupt: number; indexing: boolean; otherIssues: number };
type ArchiveState = {
  sessions: SessionSummary[]; session: string; panel: PanelSelection; project: string;
  fixedRule: FixedRuleAvailability;
  rules: SessionRulesPage | null; selected: SelectedSessionRule | null; checks: RuleChecksPage | null;
  openRecords: Record<string, OpenRecord>; panelError: string;
  error: string; busy: boolean; rulesBusy: boolean; panelBusy: boolean; manualRefreshing: boolean;
  issues: ArchiveIssue[]; health: CaptureHealth; nextSession: string | null; reader: Reader | null;
};
type Request = { signal: AbortSignal; current: () => boolean; finish: () => void };
class ArchiveError extends Error { constructor(public status: number) { super(status === 404 ? 'Recording not found. Refresh the archive or choose another session.' : `Archive request failed: ${status}. Try refreshing.`); } }
const message = (e: unknown) => e instanceof Error ? e.message : 'Archive unavailable. Try refreshing.';
const merge = <T extends { id: string }>(a: T[], b: T[]) => [...a, ...b.filter(item => !a.some(old => old.id === item.id))];

export function createArchiveNavigation() {
  let state: ArchiveState = { fixedRule: { kind: 'inactive' }, sessions: [], session: '', panel: { kind: 'closed' }, project: '', rules: null, selected: null, checks: null,
    openRecords: {}, panelError: '', error: '', busy: false, rulesBusy: false, panelBusy: false, manualRefreshing: false,
    issues: [], health: [], nextSession: null, reader: null };
  const listeners = new Set<() => void>(), requests = new Map<string, AbortController>();
  let lifetime: object | null = null, navigation = {};
  function update(patch: Partial<ArchiveState>) {
    if (!lifetime) return;
    const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(state[key as keyof ArchiveState])));
    if (!Object.keys(changed).length) return;
    state = { ...state, ...changed }; listeners.forEach(listener => listener());
  }
  function cancel(read: string) { requests.get(read)?.abort(); requests.delete(read); }
  function begin(read: string): Request | null {
    if (!lifetime) return null;
    if (read !== 'refresh') { cancel('refresh'); update({ manualRefreshing: false }); }
    cancel(read);
    const mount = lifetime, controller = new AbortController(); requests.set(read, controller);
    return { signal: controller.signal, current: () => lifetime === mount && requests.get(read) === controller && !controller.signal.aborted,
      finish: () => { if (requests.get(read) === controller) requests.delete(read); } };
  }
  function link(replace = false) {
    const url = new URL(window.location.href); url.search = ''; url.hash = '';
    if (state.session) url.searchParams.set('session', state.session);
    if (state.fixedRule.kind !== 'inactive') url.searchParams.set('view', 'fixed-rule');
    if (state.fixedRule.kind === 'inactive' && state.panel.kind !== 'closed' && state.panel.rule) url.searchParams.set('rule', state.panel.rule);
    if (state.fixedRule.kind === 'inactive' && state.panel.kind === 'action') url.searchParams.set('invocation', state.panel.invocation);
    if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  async function api(path: string, request: Request) {
    const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', mode: 'same-origin', signal: request.signal });
    if (!response.ok) throw new ArchiveError(response.status);
    return response.json();
  }
  async function page(path: string, field: 'sessions' | 'items', request: Request, count = 50, cursor?: string) {
    let items: any[] = [], next = cursor ?? null, data: any;
    do {
      const url = new URL(path, location.origin); url.searchParams.set('limit', String(Math.min(100, Math.max(50, count - items.length))));
      if (next) url.searchParams.set('cursor', next);
      data = await api(url.pathname + url.search, request);
      if (!request.current()) return null;
      items = merge(items, data[field]); next = data.next;
    } while (next && items.length < count);
    return { ...data, [field]: items, next };
  }
  const metadata = (data: any) => ({ reader: data.reader ?? null, issues: data.issues ?? [], health: data.captureHealth ?? [] });
  const rulePath = (session = state.session) => `/api/sessions/${session}/rules`;
  function availableRecord(view: InvocationView, sourceRevision: string | null, records: Record<string, OpenRecord>, id: string): OpenRecord {
    const text = JSON.stringify(view), bytes = new TextEncoder().encode(text).byteLength;
    const retained = Object.entries(records).flatMap(([key, record]) => key !== id && record.state === 'available' ? [record] : []);
    if (retained.length >= RECORD_LIMIT || retained.reduce((sum, record) => sum + record.bytes, bytes) > RECORD_BYTES)
      return { state: 'unavailable', sourceRevision, cause: 'limit', reason: RECORD_LIMIT_REASON };
    const previous = records[id];
    return { state: 'available', sourceRevision, bytes, view: previous?.state === 'available' && JSON.stringify(previous.view) === text ? previous.view : view };
  }
  async function resolveFixedRule(rules: SessionRulesPage, request: Request): Promise<{ availability: FixedRuleAvailability; selected: SelectedSessionRule | null } | null> {
    const unavailable = (reason: string, revision: string | null = rules.revision) => ({ availability: { kind: 'unavailable' as const, revision, reason }, selected: null });
    const current = state.fixedRule;
    if ((current.kind === 'ready' || current.kind === 'unavailable') && current.revision === rules.revision)
      return { availability: current, selected: current.kind === 'ready' ? state.selected : null };
    let all = rules;
    if (rules.next) {
      const rest = await page(`${rulePath()}?revision=${rules.revision}`, 'items', request, Infinity, rules.next);
      if (!rest) return null;
      if (rest.revision !== rules.revision) throw new ArchiveError(409);
      all = { ...rest, items: merge(rules.items, rest.items) };
    }
    if (all.inventory.state !== 'known' || all.ruleCoverage.incomplete || all.ruleCoverage.indexing || all.ruleCoverage.omittedRules)
      return unavailable('Recorded rule sources are incomplete. Exact rule identity cannot be established.');
    if (all.items.some(item => item.wordingConflict || item.preview === null))
      return unavailable('Recorded wording is missing or conflicting. Exact rule identity cannot be established.');
    let selected: SelectedSessionRule | null = null;
    for (const candidate of all.items.filter(item => item.preview === FIXED_RULE_WORDING)) {
      const detail: SelectedSessionRule = await api(`${rulePath()}/${candidate.id}?revision=${rules.revision}`, request);
      if (!request.current()) return null;
      if (detail.revision !== rules.revision) throw new ArchiveError(409);
      if (detail.wording.state !== 'available' || detail.rule.wordingConflict) {
        const retryable = detail.wording.state === 'unavailable' && detail.wording.reason === 'source-unavailable-or-changed' && !detail.rule.wordingConflict;
        return unavailable('Exact recorded wording is unavailable or conflicting.', retryable ? null : rules.revision);
      }
      if (detail.wording.text !== FIXED_RULE_WORDING) continue;
      if (selected) return unavailable('More than one recorded declaration has this exact wording. Choose the full Inspector to inspect them.');
      selected = detail;
    }
    return selected ? { availability: { kind: 'ready', revision: rules.revision, rule: selected.rule.id }, selected }
      : unavailable('No declaration with this exact wording was found in the available recorded rules.');
  }
  async function snapshot(request: Request, sessionsCount = state.sessions.length, ruleCount = state.rules?.items.length ?? 50, checkCount = state.checks?.items.length ?? 50, retryRecords = false): Promise<Partial<ArchiveState> | null> {
    const session = state.session, panel = state.panel, project = state.project, fixed = state.fixedRule.kind !== 'inactive';
    const path = rulePath(session);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await page(`/api/sessions?${new URLSearchParams(project ? { project } : {})}`, 'sessions', request, Math.max(50, sessionsCount));
        if (!data) return null;
        if (fixed && session && !data.sessions.some((row: SessionSummary) => row.id === session) && data.next) {
          const rest = await page(`/api/sessions?${new URLSearchParams(project ? { project } : {})}`, 'sessions', request, Infinity, data.next);
          if (!rest) return null;
          data.sessions = merge(data.sessions, rest.sessions); data.next = rest.next;
        }
        const patch: Partial<ArchiveState> = { sessions: data.sessions, nextSession: data.next, ...metadata(data) };
        if (!session) return patch;
        const rules = await page(path, 'items', request, ruleCount);
        if (!rules) return null;
        const row = data.sessions.find((s: SessionSummary) => s.id === session);
        if (row && row.revision !== rules.revision) throw new ArchiveError(409);
        Object.assign(patch, { rules, ...metadata(rules), panelError: '' });
        let rule = panel.kind === 'closed' ? null : panel.rule;
        let fixedSelected: SelectedSessionRule | null = null;
        if (fixed) {
          const resolved = row?.host === 'pi' ? await resolveFixedRule(rules, request)
            : { availability: { kind: 'unavailable' as const, revision: rules.revision, reason: 'Recorded Pi session metadata is unavailable. Choose a recorded Pi session.' }, selected: null };
          if (!resolved) return null;
          Object.assign(patch, { fixedRule: resolved.availability, selected: resolved.selected, checks: null });
          fixedSelected = resolved.selected;
          rule = resolved.availability.kind === 'ready' ? resolved.availability.rule : null;
          Object.assign(patch, { panel: rule ? panel.kind === 'action' && panel.rule === rule ? panel : { kind: 'rule', rule } : { kind: 'closed' } });
        }
        if (rule) {
          try {
            const selected = fixedSelected ?? await api(`${path}/${rule}?revision=${rules.revision}`, request);
            const checks = await page(`${path}/${rule}/checks?revision=${rules.revision}`, 'items', request, checkCount);
            if (!request.current() || !checks) return null;
            Object.assign(patch, { selected, checks });
          } catch (e) {
            if (e instanceof ArchiveError && e.status === 409) throw e;
            if (!request.current()) return null;
            Object.assign(patch, { selected: null, checks: null, panelError: `Recorded rule unavailable. ${message(e)}`, ...(fixed ? { panel: { kind: 'closed' }, fixedRule: { kind: 'unavailable', revision: null, reason: `Recorded rule unavailable. ${message(e)}` } } : {}) });
          }
        }
        const openRecords = { ...state.openRecords }; let read = false;
        const visible = new Set((patch.checks?.items ?? []).map(check => check.invocation));
        const visiblePanel = patch.panel ?? panel;
        if (visiblePanel.kind === 'action') visible.add(visiblePanel.invocation);
        for (const id of Object.keys(openRecords)) if (!visible.has(id)) delete openRecords[id];
        for (const [id, previous] of Object.entries(openRecords)) {
          if (previous.state === 'unavailable' && previous.cause === 'limit' && !retryRecords) continue;
          if (previous.state !== 'available' && Object.values(openRecords).filter(record => record.state === 'available').length >= RECORD_LIMIT) {
            openRecords[id] = { state: 'unavailable', sourceRevision: rules.revision, cause: 'limit', reason: RECORD_LIMIT_REASON }; continue;
          }
          if (previous.sourceRevision === rules.revision && previous.state !== 'loading' && !(retryRecords && previous.state === 'unavailable')) continue;
          read = true;
          try {
            const detail = await api(`/api/sessions/${session}/invocations/${id}`, request);
            if (!request.current()) return null;
            openRecords[id] = availableRecord(detail.view, rules.revision, openRecords, id);
          } catch (e) {
            if (e instanceof ArchiveError && e.status === 409) throw e;
            if (!request.current()) return null;
            openRecords[id] = { state: 'unavailable', sourceRevision: rules.revision, cause: 'source', reason: `Recorded action unavailable. ${message(e)}` };
          }
        }
        if (read) {
          await api(`${path}?limit=1&revision=${rules.revision}`, request);
          if (!request.current()) return null;
        }
        Object.assign(patch, { openRecords });
        return patch;
      } catch (e) { if (!(e instanceof ArchiveError && e.status === 409 && attempt === 0)) throw e; }
    }
    return null;
  }
  async function loadSessions(cursor?: string) {
    const request = begin('sessions'); if (!request) return;
    update({ busy: true });
    try {
      let data, restarted = false;
      const path = `/api/sessions?${new URLSearchParams(state.project ? { project: state.project } : {})}`;
      try { data = await page(path, 'sessions', request, 50, cursor); }
      catch (e) { if (!(e instanceof ArchiveError && e.status === 409)) throw e; restarted = true; data = await page(path, 'sessions', request, Math.max(50, state.sessions.length)); }
      if (data && request.current()) update({ sessions: cursor && !restarted ? merge(state.sessions, data.sessions) : data.sessions, nextSession: data.next, ...(!state.session ? metadata(data) : {}) });
      return !!data;
    } catch (e) { if (request.current()) update({ error: message(e) }); }
    finally { if (request.current()) update({ busy: false }); request.finish(); }
  }
  async function loadRules(cursor?: string, retry = true) {
    if (!state.session) return;
    const request = begin('rules'); if (!request) return;
    update({ rulesBusy: true });
    try {
      if (cursor && state.rules) {
        const data = await page(`${rulePath()}?revision=${state.rules.revision}`, 'items', request, 50, cursor);
        if (data) update({ rules: { ...data, items: merge(state.rules.items, data.items) } });
      } else { const patch = await snapshot(request); if (patch) update({ ...patch, error: '' }); }
    } catch (e) {
      if (request.current() && retry && e instanceof ArchiveError && e.status === 409) { request.finish(); return loadRules(undefined, false); }
      if (request.current()) update({ error: message(e), ...(state.fixedRule.kind !== 'inactive' ? { fixedRule: { kind: 'unavailable', revision: null, reason: message(e) } as FixedRuleAvailability } : {}) });
    } finally { if (request.current()) update({ rulesBusy: false }); request.finish(); }
  }
  async function selectSession(id: string, updateLink = true) {
    if (!lifetime) return false;
    const token = navigation = {}; for (const key of [...requests.keys()]) cancel(key);
    update({ session: id, fixedRule: state.fixedRule.kind === 'inactive' ? { kind: 'inactive' } : id ? { kind: 'reading' } : { kind: 'choose-session' }, panel: { kind: 'closed' }, rules: null, selected: null, checks: null, openRecords: {}, panelError: '', error: '', rulesBusy: false, panelBusy: false, busy: false, manualRefreshing: false });
    if (updateLink) link();
    if (id) await loadRules();
    return !!lifetime && token === navigation;
  }
  async function openFixedRule() {
    update({ fixedRule: state.session ? { kind: 'reading' } : { kind: 'choose-session' } });
    await selectSession(state.session);
  }
  async function selectRule(rule: string, updateLink = true) {
    if (!lifetime || !state.session) return;
    navigation = {}; cancel('refresh'); cancel('panel'); cancel('rules');
    update({ fixedRule: { kind: 'inactive' }, panel: { kind: 'rule', rule }, selected: null, checks: null, openRecords: {}, panelError: '', error: '', panelBusy: true, rulesBusy: false, manualRefreshing: false }); if (updateLink) link();
    const request = begin('panel'); if (!request) return;
    try { const patch = await snapshot(request); if (patch) update(patch); }
    catch (e) { if (request.current()) update({ error: message(e) }); }
    finally { if (request.current()) update({ panelBusy: false }); request.finish(); }
  }
  async function loadChecks() {
    if (!state.checks?.next || state.panel.kind === 'closed' || !state.panel.rule) return;
    const request = begin('panel'); if (!request) return;
    update({ panelBusy: true });
    try {
      const data = await page(`${rulePath()}/${state.panel.rule}/checks?revision=${state.checks.revision}`, 'items', request, 50, state.checks.next);
      if (data) update({ checks: { ...data, items: merge(state.checks.items, data.items) } });
    } catch (e) {
      if (request.current()) {
        try {
          if (e instanceof ArchiveError && e.status === 409) { const patch = await snapshot(request); if (patch && request.current()) update({ ...patch, error: '' }); }
          else throw e;
        } catch (failure) { if (request.current()) update({ error: `Checks are stale; reconnecting automatically. ${message(failure)}` }); }
      }
    } finally { if (request.current()) update({ panelBusy: false }); request.finish(); }
  }
  async function selectInvocation(invocation: string, updateLink = true, rule: string | null = state.panel.kind === 'closed' ? null : state.panel.rule) {
    if (!lifetime || !state.session) return;
    navigation = {};
    const sourceRevision = state.rules?.revision ?? null;
    const previous = rule === null || (state.panel.kind !== 'closed' && state.panel.rule !== rule) ? {} : state.openRecords;
    if (rule === null) { cancel('panel'); cancel('refresh'); cancel('rules'); }
    update({ panel: { kind: 'action', rule, invocation }, openRecords: previous,
      ...(rule === null ? { fixedRule: { kind: 'inactive' }, selected: null, checks: null, panelError: '', panelBusy: false, rulesBusy: false, manualRefreshing: false,
        openRecords: { [invocation]: { state: 'loading', sourceRevision } } } : {}) }); if (updateLink) link();
    if (state.openRecords[invocation]?.state === 'available') return;
    const request = begin('panel'); if (!request) return;
    if (rule !== null) update({ openRecords: { ...state.openRecords, [invocation]: { state: 'loading', sourceRevision } }, panelBusy: false });
    try {
      if (sourceRevision !== null) {
        const patch = await snapshot(request);
        if (patch && request.current()) update({ ...patch, error: '' });
      } else {
        const data = await api(`/api/sessions/${state.session}/invocations/${invocation}`, request);
        if (request.current()) update({ openRecords: { ...state.openRecords, [invocation]: availableRecord(data.view, null, state.openRecords, invocation) } });
      }
    } catch (e) {
      if (request.current()) update({ openRecords: { ...state.openRecords, [invocation]: { state: 'unavailable', sourceRevision, cause: 'source', reason: `Recorded action unavailable; reconnecting automatically. ${message(e)}` } } });
    } finally { request.finish(); }
  }
  function closeInvocation(invocation: string) {
    if (!lifetime || !state.openRecords[invocation]) return;
    cancel('panel'); cancel('refresh'); cancel('rules');
    const openRecords = { ...state.openRecords }; delete openRecords[invocation];
    const panel = state.panel.kind === 'action' && state.panel.invocation === invocation
      ? state.panel.rule ? { kind: 'rule' as const, rule: state.panel.rule } : { kind: 'closed' as const } : state.panel;
    update({ openRecords, panel, panelBusy: false, rulesBusy: false, manualRefreshing: false }); link();
  }
  function closePanel() {
    if (!lifetime) return;
    navigation = {}; cancel('panel'); cancel('refresh'); cancel('rules');
    update({ fixedRule: { kind: 'inactive' }, panel: { kind: 'closed' }, openRecords: {}, selected: null, checks: null, panelError: '', panelBusy: false, rulesBusy: false, manualRefreshing: false }); link();
  }
  async function restoreLink(initial = false) {
    const params = new URLSearchParams(location.search), session = params.get('session') ?? '', rule = params.get('rule') ?? '', invocation = params.get('invocation') ?? '';
    if ([session, rule, invocation].some(id => id && !/^[a-f0-9]{64}$/.test(id)) || ((rule || invocation) && !session)) { update({ error: 'Invalid session, rule or invocation link. Choose a recorded session.' }); return; }
    const fixed = params.get('view') === 'fixed-rule';
    update({ fixedRule: fixed ? session ? { kind: 'reading' } : { kind: 'choose-session' } : { kind: 'inactive' } });
    const selected = navigation = {};
    if (session) {
      const loading = selectSession(session, false), token = navigation;
      if (!await loading || !lifetime || token !== navigation) return;
      if (!fixed && rule) { const loadingRule = selectRule(rule, false), ruleToken = navigation; await loadingRule; if (!lifetime || ruleToken !== navigation) return; }
      if (!fixed && invocation) await selectInvocation(invocation, false, rule || null);
    } else if (!fixed && initial && state.sessions.length) {
      const latest = state.sessions.reduce((a, b) => b.timestamp > a.timestamp ? b : a);
      await selectSession(latest.id, false); if (lifetime) link(true);
    } else if (selected === navigation) await selectSession('', false);
  }
  async function refreshLive(manual = false) {
    if (!lifetime || requests.size) return;
    const request = begin('refresh'); if (!request) return;
    if (manual) update({ manualRefreshing: true });
    try { const patch = await snapshot(request, undefined, undefined, undefined, manual); if (patch && request.current()) update({ ...patch, error: '' }); }
    catch (e) { if (request.current()) update({ error: `Live updates paused; reconnecting automatically. ${message(e)}` }); }
    finally { if (request.current()) update({ manualRefreshing: false }); request.finish(); }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      if (lifetime) throw new Error('Archive navigation is already started.');
      const mount = lifetime = {}, token = navigation = {};
      if (new URLSearchParams(location.search).get('view') === 'fixed-rule') {
        void restoreLink(true);
        if (!state.session) void loadSessions();
      } else void loadSessions().then(loaded => { if (loaded && lifetime === mount && token === navigation) return restoreLink(true); });
      const restore = () => { void restoreLink(); }; window.addEventListener('popstate', restore);
      const timer = setInterval(() => refreshLive(), 2000);
      return () => { if (lifetime !== mount) return; lifetime = null; navigation = {}; for (const key of [...requests.keys()]) cancel(key); clearInterval(timer); window.removeEventListener('popstate', restore); };
    },
    openFixedRule, loadSessions, loadRules, loadChecks, selectSession, selectRule, selectInvocation, closeInvocation, closePanel,
    filterProjects(project: string) { update({ project }); void selectSession(''); void loadSessions(); },
    refreshArchive: () => refreshLive(true),
  };
}
