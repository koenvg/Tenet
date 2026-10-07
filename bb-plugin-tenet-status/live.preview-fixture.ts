import { emptyOverview, type OverviewSelection, type ThreadOverview } from '../src/inspector/bb-summary.js';
import { rulesSyntheticRead } from './rules.preview-fixture.js';
import { syntheticOverview } from './overview.preview-fixture.js';

export const liveThread = 'thr_livefixture01', otherLiveThread = 'thr_livefixture02', liveProject = 'proj_livefixture1';
export const liveId = (n: number) => n.toString(16).padStart(64, '0');
/** Authored history only. No filesystem or provider access. */
export function createLiveFixture() {
  let revision = 0, failure: 'none' | 'disconnect' | 'timeout' | 'cursor' = 'none';
  const reads: { threadId: string; selection: OverviewSelection; signal?: AbortSignal }[] = [];
  const read = async (threadId: string, selection: OverviewSelection, signal?: AbortSignal): Promise<ThreadOverview> => {
    reads.push({ threadId, selection: { ...selection }, signal });
    if (failure === 'disconnect') return emptyOverview();
    if (failure === 'timeout') return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
    if (failure === 'cursor' && (selection.callCursor || selection.sessionCursor || selection.ruleCursor)) throw new Error('Rejected cursor');
    const scope = threadId === liveThread ? 900 : 901;
    const sessions = Array.from({ length: 55 }, (_, n) => ({ ...syntheticOverview.sessions[0]!, id: liveId(1000 + n),
      timestamp: 55 - n, started: 55 - n, calls: 70 + revision, categoryCounts: { violation: 0, uncertainty: 0, approval: 0, unavailable: 0, pending: 0 } }));
    const sessionId = selection.sessionId ?? sessions[0]!.id;
    if (!sessions.some(session => session.id === sessionId)) throw new Error('Rejected session');
    const source = rulesSyntheticRead(selection.ruleCursor ? { ruleCursor: `synthetic:${liveId(20)}:16` } : {});
    const rows = Array.from({ length: 70 + revision }, (_, n) => ({ ...source.calls[0]!, id: liveId(2000 + 70 + revision - n),
      timestamp: 70 + revision - n, callId: `live-${70 + revision - n}`, categories: [] }));
    const selectedId = selection.callId ?? rows[0]!.id;
    const row = rows.find(row => row.id === selectedId);
    if (!row) throw new Error('Rejected call');
    const offset = (cursor: string | undefined, kind: string) => {
      if (!cursor) return 0;
      if (cursor !== `${kind}:${scope}:${sessionId}:50`) throw new Error('Rejected page');
      return 50;
    };
    const ruleCursor = `rules:${scope}:${sessionId}:${selectedId}:16`;
    if (selection.ruleCursor && selection.ruleCursor !== ruleCursor) throw new Error('Rejected rule page');
    const selected = source.selected!;
    selected.identity!.callId = row.callId;
    selected.rulePage!.next = selection.ruleCursor ? null : ruleCursor;
    const sessionOffset = offset(selection.sessionCursor, 'sessions'), callOffset = offset(selection.callCursor, 'calls');
    return { ...source, readScope: liveId(scope), linkedCalls: rows.length * sessions.length, failures: 0, issues: [],
      sessions: sessions.slice(sessionOffset, sessionOffset + 50), sessionId,
      nextSession: sessionOffset ? null : `sessions:${scope}:${sessionId}:50`,
      calls: rows.slice(callOffset, callOffset + 50), selectedId, selected,
      nextCall: callOffset ? null : `calls:${scope}:${sessionId}:50` };
  };
  return { read, reads, append: () => { revision++; }, fail: (value: typeof failure) => { failure = value; } };
}
