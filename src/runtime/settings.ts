import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, type Stats } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { freeze } from '../decision/evidence.js';
import type { ObservationLimits } from './observation-queue.js';
import { systemOneOrigin } from '../decision/system-one-origin.js';

// Resolve at guard construction, not import. Never derive the owner home from project cwd.
export const ownerHome = () => process.env.HOME ?? homedir();
export const SETTINGS_MAX_BYTES = 32768;
export type SettingsFailure = 'unsafe' | 'unreadable' | 'oversized' | 'malformed' | 'schema';
export type JudgeSettings =
  | { protocol: 'system-one'; baseUrl: string; model: string; auth: { type: 'none' } | { type: 'bearer-env'; name: string } }
  | { protocol: 'apus-llamacpp'; baseUrl: string; model: string };
export interface ProjectSettings {
  version: 2;
  judge?: JudgeSettings;
  decision?: { deadlineMs?: number };
  observation?: Partial<ObservationLimits>;
}
export interface OwnerSettings extends ProjectSettings { judge: JudgeSettings }
export type SettingsSnapshot<T = OwnerSettings> =
  | { readonly state: 'absent' }
  | { readonly state: 'valid'; readonly value: Readonly<T> }
  | { readonly state: 'invalid'; readonly reason: SettingsFailure };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
export const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
export const timerInteger = (value: unknown): value is number => positiveInteger(value) && value <= 2147483647;
const alias = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 256 && !/[\x00-\x1f\x7f-\x9f]/.test(value);

/** Match raw syntax before URL parsing can normalize addresses, paths or empty delimiters. */
export function validLocalBaseUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^http:\/\/(127\.0\.0\.1|\[::1\]):([0-9]{1,5})(\/)?$/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) return false;
  try { const url = new URL(value); return url.protocol === 'http:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'; }
  catch { return false; }
}
function validJudge(judge: unknown): judge is JudgeSettings {
  if (!object(judge) || !alias(judge.model)) return false;
  if (judge.protocol === 'system-one') {
    const origin = systemOneOrigin(judge.baseUrl);
    if (!keys(judge, ['protocol', 'baseUrl', 'model', 'auth']) || !origin || !object(judge.auth)) return false;
    const auth = judge.auth;
    if (auth.type === 'none') return keys(auth, ['type']) && ['127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
    return auth.type === 'bearer-env' && keys(auth, ['type', 'name']) && typeof auth.name === 'string'
      && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(auth.name);
  }
  return judge.protocol === 'apus-llamacpp' && keys(judge, ['protocol', 'baseUrl', 'model']) && validLocalBaseUrl(judge.baseUrl);
}
function validSettings(value: unknown, requireJudge: boolean): value is ProjectSettings {
  if (!object(value) || !keys(value, ['version', 'judge', 'decision', 'observation']) || value.version !== 2) return false;
  if (requireJudge || 'judge' in value) { if (!validJudge(value.judge)) return false; }
  if ('decision' in value && (!object(value.decision) || !keys(value.decision, ['deadlineMs'])
    || ('deadlineMs' in value.decision && !timerInteger(value.decision.deadlineMs)))) return false;
  if ('observation' in value && (!object(value.observation) || !keys(value.observation, ['running', 'waiting', 'bytes', 'ageMs'])
    || !Object.entries(value.observation).every(([key, n]) => key === 'ageMs' ? timerInteger(n) : positiveInteger(n)))) return false;
  return true;
}

// Internal deterministic filesystem seam. Production callers use the default owner home and IO.
const filesystem = { lstatSync, openSync, fstatSync, readSync, closeSync };
const sameOwner = (info: Stats) => process.getuid === undefined || info.uid === process.getuid();
const privateOwner = (info: Stats) => sameOwner(info) && (info.mode & 0o077) === 0;
// Directory link counts can change when unrelated child directories are added or removed.
const sameDirectoryIdentity = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.uid === b.uid;
const sameFileIdentity = (a: Stats, b: Stats) => sameDirectoryIdentity(a, b) && a.nlink === b.nlink;
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

/** Both sources use the same bounded, no-follow reader. No search, repair or watcher. */
export function readOwnerSettings(home = ownerHome(), io = filesystem): SettingsSnapshot {
  return readSettings(home, true, io) as SettingsSnapshot;
}
export function readProjectSettings(project: string, io = filesystem): SettingsSnapshot<ProjectSettings> {
  return readSettings(project, false, io);
}
function readSettings(directory: string, requireJudge: boolean, io: typeof filesystem): SettingsSnapshot<ProjectSettings> {
  const invalid = (reason: SettingsFailure): SettingsSnapshot<ProjectSettings> => Object.freeze({ state: 'invalid', reason });
  if (!isAbsolute(directory)) return invalid('unsafe');
  const root = join(directory, '.tenet'), path = join(root, 'config.json');
  let fd: number | undefined;
  try {
    const ancestors = new Map<string, Stats | undefined>();
    for (let ancestor = root;; ancestor = dirname(ancestor)) {
      try {
        const info = io.lstatSync(ancestor);
        if (!info.isDirectory() || info.isSymbolicLink() || (ancestor === root && !privateOwner(info))) return invalid('unsafe');
        ancestors.set(ancestor, info);
      } catch (error) { if (!missing(error)) return invalid('unreadable'); ancestors.set(ancestor, undefined); }
      if (dirname(ancestor) === ancestor) break;
    }
    const unchangedAncestors = () => {
      for (const [ancestor, before] of ancestors) {
        try { const after = io.lstatSync(ancestor); if (!before || !sameDirectoryIdentity(before, after) || !after.isDirectory()) return false; }
        catch (error) { if (before || !missing(error)) return false; }
      }
      return true;
    };
    // Confirm absence only after checking all ancestors. A broken link is never absence.
    let selected: Stats;
    try { selected = io.lstatSync(path); }
    catch (error) {
      if (!missing(error)) return invalid('unreadable');
      return unchangedAncestors() ? Object.freeze({ state: 'absent' }) : invalid('unsafe');
    }
    const safeFile = (info: Stats) => info.isFile() && info.nlink === 1 && privateOwner(info) && (info.mode & 0o400) !== 0;
    if (!safeFile(selected)) return invalid('unsafe');
    if (selected.size > SETTINGS_MAX_BYTES) return invalid('oversized');
    fd = io.openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = io.fstatSync(fd);
    if (!safeFile(opened) || !sameFileIdentity(selected, opened)) return invalid('unsafe');
    if (opened.size > SETTINGS_MAX_BYTES) return invalid('oversized');
    const buffer = Buffer.alloc(SETTINGS_MAX_BYTES + 1);
    let count = 0;
    while (count < buffer.length) {
      const n = io.readSync(fd, buffer, count, buffer.length - count, null);
      if (n === 0) break;
      count += n;
    }
    if (count > SETTINGS_MAX_BYTES) return invalid('oversized');
    const after = io.fstatSync(fd), current = io.lstatSync(path);
    if (!safeFile(after) || !sameFileIdentity(opened, after) || !sameFileIdentity(after, current)
      || after.size !== count || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs
      || !unchangedAncestors()) return invalid('unsafe');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count))); }
    catch { return invalid('malformed'); }
    return validSettings(parsed, requireJudge) ? freeze({ state: 'valid' as const, value: parsed }) : invalid('schema');
  } catch { return invalid('unreadable'); }
  finally { if (fd !== undefined) { try { io.closeSync(fd); } catch { /* No raw filesystem errors leave this boundary. */ } } }
}
