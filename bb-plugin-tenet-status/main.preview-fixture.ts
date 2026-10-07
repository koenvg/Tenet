import type { PickerClient } from './main-page';
import { syntheticOverview, syntheticRead } from './overview.preview-fixture';
import { emptyOverview, type OverviewSelection, type ThreadOverview } from '../src/inspector/bb-summary';

export const projectA = 'proj_synthetic0001', projectB = 'proj_synthetic0002';
export const stopped = 'thr_stopped0001', remote = 'thr_remote00001', noHistory = 'thr_nohistory01';
export const nonPi = 'thr_nonpi000001', deleted = 'thr_deleted0001';
export const fixtureReads: { threadId: string; machine: string; selection: OverviewSelection }[] = [];
const projects = [{ id: projectA, label: 'Synthetic local project' }, { id: projectB, label: 'Synthetic remote project' }];
const threads = [
  { id: stopped, label: 'Stopped Pi · retained calls', projectId: projectA, status: 'idle', archived: false },
  { id: noHistory, label: 'Pi · no linked history', projectId: projectA, status: 'idle', archived: false },
  { id: remote, label: 'Remote Pi · retained calls', projectId: projectB, status: 'idle', archived: true },
];
export const syntheticPicker: PickerClient = {
  projects: async cursor => ({ items: cursor ? [projects[1]!] : [projects[0]!], next: cursor ? null : 'synthetic-project-page2' }),
  threads: async projectId => ({ items: threads.filter(t => t.projectId === projectId).map(({ projectId: _, ...thread }) => thread), next: null }),
  selection: async (threadId, projectId) => {
    const thread = threads.find(t => t.id === threadId);
    const state = threadId === nonPi ? 'unsupported' : !thread ? 'unavailable' : projectId && projectId !== thread.projectId ? 'scope-changed' : 'ready';
    return { state, project: state === 'ready' ? projects.find(p => p.id === thread!.projectId)! : null,
      thread: state === 'ready' ? { id: thread!.id, label: thread!.label, status: thread!.status, archived: thread!.archived } : null };
  },
};
export const syntheticThread = async (threadId: string) => ({ id: threadId, providerId: threadId === nonPi ? 'codex' : 'pi',
  projectId: threads.find(t => t.id === threadId)?.projectId, deletedAt: threadId === deleted ? 1 : null });
export async function mainSyntheticRead(threadId: string, selection: OverviewSelection): Promise<ThreadOverview> {
  fixtureReads.push({ threadId, machine: threadId === remote ? 'synthetic-machine-b' : 'synthetic-machine-a', selection: { ...selection } });
  if (threadId === noHistory) return { ...emptyOverview(), state: 'available', coverage: 'unknown', issues: [] };
  const session = selection.sessionId ?? syntheticOverview.sessionId!;
  const alternate = session === 'a'.repeat(64);
  const allowedCalls = alternate ? ['b'.repeat(64)] : syntheticOverview.calls.map(call => call.id);
  if (![syntheticOverview.sessionId, 'a'.repeat(64)].includes(session) || selection.callId && !allowedCalls.includes(selection.callId))
    throw new Error('Synthetic selection rejected');
  const data = alternate ? syntheticRead({ callId: syntheticOverview.calls[0]!.id }) : syntheticRead(selection);
  data.sessions.push({ ...data.sessions[0]!, id: 'a'.repeat(64), calls: 1,
    categoryCounts: { violation: 1, uncertainty: 0, approval: 0, unavailable: 0, pending: 0 } });
  data.linkedCalls = 4; data.failures = 1; data.sessionId = session;
  if (alternate) {
    const selected = data.selected!;
    selected.identity!.callId = 'synthetic-selected-fail';
    selected.decision = 'BLOCK'; selected.reason = 'policy-fail'; selected.categories = ['violation'];
    selected.noRulesClassifiedViolated = false;
    selected.rules = selected.rules.map(rule => ({ ...rule, text: '<script>window.archiveExecuted=true</script>',
      contribution: 'blocking-gates', gateIds: ['rule-fail'], result: { outcome: { choice: 'FAIL', probabilities: { FAIL: .99 } },
        evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .99 } } } }));
    data.selectedId = 'b'.repeat(64);
    data.calls = [{ ...data.calls[0]!, id: data.selectedId, callId: selected.identity!.callId,
      decision: selected.decision, categories: ['violation'] }];
    data.calls = data.calls.filter(row => !selection.category || row.categories.includes(selection.category));
  }
  if (threadId === remote) {
    data.calls = data.calls.map(row => ({ ...row, callId: `remote-${row.callId}` }));
    if (data.selected?.identity) data.selected.identity.callId = `remote-${data.selected.identity.callId}`;
  }
  return data;
}
