import type { PickerClient } from './main-page';
import { syntheticOverview, syntheticRead, projectSyntheticThread, syntheticEmptyOverview } from './overview.preview-fixture';
import { emptyOverview, type OverviewSelection, type ThreadOverview } from '../src/inspector/bb-summary';

import { reportedViolations } from '../src/inspector/summary-display';
export const projectA = 'proj_synthetic0001', projectB = 'proj_synthetic0002';
export const stopped = 'thr_stopped0001', remote = 'thr_remote00001', noHistory = 'thr_nohistory01';
export const nonPi = 'thr_nonpi000001', deleted = 'thr_deleted0001';
export const fixtureReads: { threadId: string; machine: string; selection: OverviewSelection }[] = [];
const projects = [
  { id: projectA, label: 'Synthetic local project', updatedAt: 1_735_776_000_000 },
  { id: projectB, label: 'Synthetic remote project', updatedAt: null },
];
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
    const project = projects.find(p => p.id === thread?.projectId);
    return { state, project: state === 'ready' ? { id: project!.id, label: project!.label } : null,
      thread: state === 'ready' ? { id: thread!.id, label: thread!.label, status: thread!.status, archived: thread!.archived } : null };
  },
};
export const crowdedProjects = [
  projects[0]!,
  { id: 'proj_syntheticlong', updatedAt: null, label: `Synthetic workspace / ${'LongUnbrokenProjectName'.repeat(12)}` },
  ...Array.from({ length: 47 }, (_, index) => ({ id: `proj_synthetic${String(index + 3).padStart(4, '0')}`, updatedAt: null, label: `Synthetic project ${String(index + 3).padStart(2, '0')}` })),
  projects[1]!,
];
export const crowdedPicker: PickerClient = {
  ...syntheticPicker,
  projects: async cursor => ({ items: cursor ? [projects[0]!] : crowdedProjects, next: cursor ? null : 'synthetic-project-page2' }),
};
export const cardProjects = [
  { id: projectA, label: 'Field Notes', updatedAt: 1_735_776_000_000 },
  { id: projectB, label: 'Atlas API', updatedAt: 1_735_689_600_000 },
  { id: 'proj_syntheticcards3', label: 'Studio', updatedAt: 1_735_430_400_000 },
  { id: 'proj_syntheticcards4', label: 'Paper Trail', updatedAt: null },
  { id: 'proj_syntheticcards5', label: 'Workshop', updatedAt: 1_734_652_800_000 },
  { id: 'proj_syntheticcards6', label: 'Signal', updatedAt: 1_734_048_000_000 },
];
export const cardPicker: PickerClient = {
  ...syntheticPicker,
  projects: async () => ({ items: cardProjects, next: null }),
};
export const syntheticThread = async (threadId: string) => ({ id: threadId, providerId: threadId === nonPi ? 'codex' : 'pi',
  projectId: threads.find(t => t.id === threadId)?.projectId, deletedAt: threadId === deleted ? 1 : null });
export async function mainSyntheticRead(threadId: string, selection: OverviewSelection): Promise<ThreadOverview> {
  fixtureReads.push({ threadId, machine: threadId === remote ? 'synthetic-machine-b' : 'synthetic-machine-a', selection: { ...selection } });
  if (selection.query?.kind === 'call') selection = { ...selection, sessionId: selection.query.sessionId, callId: selection.query.callId, ruleCursor: selection.query.ruleCursor };
  if (threadId === noHistory) return syntheticEmptyOverview();
  const session = selection.sessionId ?? syntheticOverview.sessionId!;
  const alternate = ['a'.repeat(64), 'c'.repeat(64)].includes(session);
  const allowedCalls = alternate ? [(session === 'c'.repeat(64) ? 'd' : 'b').repeat(64)] : syntheticOverview.calls.map(call => call.id);
  if (![syntheticOverview.sessionId, 'a'.repeat(64), 'c'.repeat(64)].includes(session) || selection.callId && !allowedCalls.includes(selection.callId))
    throw new Error('Synthetic selection rejected');
  const data = alternate ? syntheticRead({ callId: syntheticOverview.calls[0]!.id }) : syntheticRead({ ...selection, query: { kind: 'calls' } });
  data.sessions.push({ ...data.sessions[0]!, id: 'a'.repeat(64), calls: 1,
    categoryCounts: { violation: 1, uncertainty: 0, approval: 0, unavailable: 0, pending: 0 } });
  if (session === 'c'.repeat(64)) data.sessions.push({ ...data.sessions.at(-1)!, id: session });
  data.linkedCalls = 4; data.failures = 1; data.sessionId = session;
  if (alternate) {
    const selected = data.selected!;
    selected.identity!.toolName = 'bash';
    selected.identity!.callId = 'synthetic-selected-fail';
    selected.decision = 'BLOCK'; selected.reason = 'policy-fail'; selected.categories = ['violation'];
    selected.noRulesClassifiedViolated = false;
    selected.rules = selected.rules.map(rule => ({ ...rule, text: '<script>window.archiveExecuted=true</script>',
      contribution: 'blocking-gates', gateIds: ['rule-fail'], result: { outcome: { choice: 'FAIL', probabilities: { FAIL: .99 } },
        evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .99 } } } }));
    selected.reportedViolations = reportedViolations(selected.rules, true, false);
    data.selectedId = allowedCalls[0]!;
    data.calls = [{ ...data.calls[0]!, id: data.selectedId, callId: selected.identity!.callId,
      decision: selected.decision, categories: ['violation'] }];
    data.calls = data.calls.filter(row => !selection.category || row.categories.includes(selection.category));
  }
  if (threadId === remote) {
    data.calls = data.calls.map(row => ({ ...row, callId: `remote-${row.callId}` }));
    if (data.selected?.identity) data.selected.identity.callId = `remote-${data.selected.identity.callId}`;
  }
  return projectSyntheticThread(data, selection);
}
