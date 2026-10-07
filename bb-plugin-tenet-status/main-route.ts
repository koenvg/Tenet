import { findingCategories, type FindingCategory } from '../src/decision/finding-triage.js';
import { pickerProjectId } from './picker-contract.js';
import { threadIdSchema } from './contract.js';
import { recordId } from './overview-contract.js';
import type { OverviewSelection } from '../src/inspector/bb-summary.js';

export type MainRoute = { kind: 'projects' } | { kind: 'threads'; projectId: string }
  | { kind: 'overview'; projectId?: string; threadId: string; selection: OverviewSelection }
  | { kind: 'findings'; threadId: string } | { kind: 'invalid' };
export function parseMainRoute(path: string): MainRoute {
  if (!path) return { kind: 'projects' };
  if (threadIdSchema.safeParse(path).success) return { kind: 'findings', threadId: path };
  if (path.length > 512) return { kind: 'invalid' };
  const parts = path.split('/');
  let projectId: string | undefined;
  if (parts[0] === 'project') {
    parts.shift(); projectId = parts.shift();
    if (!pickerProjectId.safeParse(projectId).success) return { kind: 'invalid' };
    if (!parts.length) return { kind: 'threads', projectId: projectId! };
  }
  if (parts.shift() !== 'overview') return { kind: 'invalid' };
  const threadId = parts.shift();
  if (!threadIdSchema.safeParse(threadId).success) return { kind: 'invalid' };
  const selection: OverviewSelection = {};
  if (parts[0] === 'session') {
    parts.shift(); selection.sessionId = parts.shift();
    if (!recordId.safeParse(selection.sessionId).success) return { kind: 'invalid' };
  }
  if (parts[0] === 'call') {
    parts.shift(); selection.callId = parts.shift();
    if (!selection.sessionId || !recordId.safeParse(selection.callId).success) return { kind: 'invalid' };
  }
  if (parts[0] === 'category') {
    parts.shift(); const category = parts.shift();
    if (!findingCategories.includes(category as FindingCategory)) return { kind: 'invalid' };
    selection.category = category as FindingCategory;
  }
  return parts.length ? { kind: 'invalid' } : { kind: 'overview', projectId, threadId: threadId!, selection };
}
export function overviewPath(threadId: string, selection: OverviewSelection = {}, projectId?: string) {
  return `${projectId ? `project/${projectId}/` : ''}overview/${threadId}`
    + (selection.sessionId ? `/session/${selection.sessionId}` : '')
    + (selection.callId ? `/call/${selection.callId}` : '')
    + (selection.category ? `/category/${selection.category}` : '');
}
