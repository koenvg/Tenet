import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Judge } from '../src/decision/contracts.js';
import { registerGuard } from '../src/pi/guard.js';
import { answer } from './helpers.js';

export async function guardHarness(options: { env?: Record<string, string>; judge?: Judge | null; createJudge?: () => Judge; policy?: string; hasUI?: boolean; controlPath?: string } = {}) {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-observe-')));
  const file = join(cwd, 'TENET.md');
  await writeFile(file, options.policy ?? 'Rule; Never commit.');
  const handlers = new Map<string, any>(), commands = new Map<string, any>();
  const records: any[] = [], statuses: string[] = [], notifications: string[] = [], prompts: string[] = [], views: any[] = [];
  const branch: any[] = [];
  const controller = new AbortController();
  const pi = {
    on: (name: string, fn: any) => handlers.set(name, fn),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    getAllTools: () => [{ name: 'edit', description: 'Edit a file', parameters: {} }],
    appendEntry: (customType: string, data: any) => { records.push(data); branch.push({ type: 'custom', customType, data }); },
  };
  const ctx = { cwd, hasUI: options.hasUI ?? true, signal: controller.signal,
    sessionManager: { getSessionId: () => 's', getBranch: () => branch },
    ui: { setStatus: (_key: string, value: string) => statuses.push(value),
      notify: (value: string) => notifications.push(value),
      confirm: async (title: string) => { prompts.push(title); return false; },
      select: async (title: string, items: string[]): Promise<string | undefined> => { views.push({ title, items }); return undefined; },
    },
  };
  registerGuard(pi as unknown as ExtensionAPI, { controlPath: options.controlPath ?? join(cwd, 'control.json'), env: { TENET_RECORDING: 'off', ...options.env }, createJudge: options.createJudge,
    ...(options.judge === null || options.createJudge ? {} : { judge: options.judge ?? (async request => answer(request.policy)) }) });
  const emit = (type: string, data: any = {}) => handlers.get(type)?.({ type, ...data }, ctx as unknown as ExtensionContext);
  const start = () => emit('session_start', { reason: 'startup' });
  const call = (id = 'c', input: any = { path: 'README.md', text: 'hello' }) => emit('tool_call', { toolName: 'edit', toolCallId: id, input });
  return { cwd, file, pi, ctx, records, statuses, notifications, prompts, views, branch, commands, controller, emit, start, call,
    close: async () => { await emit('session_shutdown'); await rm(cwd, { recursive: true, force: true }); } };
}
