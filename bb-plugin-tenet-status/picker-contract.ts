import { z } from 'zod';

export const pickerProjectId = z.string().regex(/^proj_[a-z0-9]{8,64}$/);
const threadId = z.string().regex(/^thr_[a-z0-9]{8,64}$/);
const cursor = z.string().min(1).max(512);
const label = z.string().max(256);
export const pickerProject = z.object({ id: pickerProjectId, label }).strict();
export const pickerThread = z.object({ id: threadId, label, status: label, archived: z.boolean() }).strict();
export const pickerMethods = {
  pickerProjects: { input: z.object({ cursor: cursor.optional() }).strict(),
    output: z.object({ items: z.array(pickerProject).max(50), next: cursor.nullable() }).strict() },
  pickerThreads: { input: z.object({ projectId: pickerProjectId, cursor: cursor.optional() }).strict(),
    output: z.object({ items: z.array(pickerThread).max(50), next: cursor.nullable() }).strict() },
  pickerSelection: { input: z.object({ threadId, projectId: pickerProjectId.optional() }).strict(),
    output: z.object({ state: z.enum(['ready', 'unsupported', 'unavailable', 'scope-changed']),
      project: pickerProject.nullable(), thread: pickerThread.nullable() }).strict() },
};
export type ProjectPage = z.infer<typeof pickerMethods.pickerProjects.output>;
export type ThreadPage = z.infer<typeof pickerMethods.pickerThreads.output>;
export type PickerSelection = z.infer<typeof pickerMethods.pickerSelection.output>;
