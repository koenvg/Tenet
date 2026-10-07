import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { pickerMethods, type PickerSelection } from './picker-contract.js';

const projectCursor = z.object({ kind: z.literal('projects'), after: z.string().max(72) }).strict();
const threadCursor = z.object({ kind: z.literal('threads'), projectId: z.string().max(72),
  archived: z.boolean(), offset: z.number().int().min(0).max(1_000_000) }).strict();
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = (value: string) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
const label = (value: string) => value.length <= 256 ? value : `${value.slice(0, 246)} [omitted]`;

/** Metadata only. Never resolves machines, settings, or archives. */
export function pickerHandlers(sdk: Pick<BbPluginApi['sdk'], 'projects' | 'threads'>) {
  return {
    async pickerProjects({ cursor }: { cursor?: string }) {
      const after = cursor ? projectCursor.parse(decode(cursor)).after : '';
      // SDK 0.6.15 has no project paging API; do not request included threads.
      const projects = (await sdk.projects.list({ includePersonal: true })).sort((a, b) => a.id.localeCompare(b.id));
      const remaining = projects.filter(project => project.id > after);
      const page = remaining.slice(0, 50);
      return pickerMethods.pickerProjects.output.parse({ items: page.map(project => ({ id: project.id, label: label(project.name) })),
        next: remaining.length > 50 ? encode({ kind: 'projects', after: page.at(-1)!.id }) : null });
    },
    async pickerThreads({ projectId, cursor }: { projectId: string; cursor?: string }) {
      const project = await sdk.projects.get({ projectId });
      if (project.id !== projectId) throw new Error('Project unavailable');
      const scope = cursor ? threadCursor.parse(decode(cursor)) : { kind: 'threads' as const, projectId, archived: false, offset: 0 };
      if (scope.projectId !== projectId) throw new Error('Picker cursor scope rejected');
      // One bounded metadata window per request. Non-Pi windows can be empty.
      const threads = await sdk.threads.list({ projectId, includeHidden: true, archived: scope.archived, limit: 50, offset: scope.offset });
      const items = threads.filter(thread => thread.projectId === projectId && thread.providerId === 'pi' && !thread.deletedAt)
        .slice(0, 50).map(thread => ({ id: thread.id, label: label(thread.title ?? thread.titleFallback ?? thread.id),
          status: label(thread.runtime.displayStatus), archived: thread.archivedAt !== null }));
      const next = threads.length === 50 ? encode({ ...scope, offset: scope.offset + 50 })
        : !scope.archived ? encode({ ...scope, archived: true, offset: 0 }) : null;
      return pickerMethods.pickerThreads.output.parse({ items, next });
    },
    async pickerSelection({ threadId, projectId }: { threadId: string; projectId?: string }): Promise<PickerSelection> {
      const empty = (state: PickerSelection['state']): PickerSelection => ({ state, project: null, thread: null });
      try {
        const thread = await sdk.threads.get({ threadId });
        if (!thread || thread.id !== threadId || thread.deletedAt) return empty('unavailable');
        if (thread.providerId !== 'pi') return empty('unsupported');
        if (projectId && thread.projectId !== projectId) return empty('scope-changed');
        const project = await sdk.projects.get({ projectId: thread.projectId });
        if (!project || project.id !== thread.projectId) return empty('unavailable');
        return pickerMethods.pickerSelection.output.parse({ state: 'ready', project: { id: project.id, label: label(project.name) },
          thread: { id: thread.id, label: label(thread.title ?? thread.titleFallback ?? thread.id),
            status: label(thread.status), archived: thread.archivedAt !== null } });
      } catch { return empty('unavailable'); }
    },
  };
}
