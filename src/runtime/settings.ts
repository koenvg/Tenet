import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, type Stats } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { freeze } from '../decision/evidence.js';
import type { ObservationLimits } from './observation-queue.js';

// Resolve at guard construction, not import. Never derive the owner home from project cwd.
export const ownerHome = () => process.env.HOME ?? homedir();
export const SETTINGS_MAX_BYTES = 32768;
export type SettingsFailure = 'unsafe' | 'unreadable' | 'oversized' | 'malformed' | 'schema';
export interface OwnerSettings {
  version: 1;
  judge: { provider: 'typesafe' } | { provider: 'apus-llamacpp'; baseUrl: string; model: string };
  decision?: { deadlineMs?: number };
  observation?: Partial<ObservationLimits>;
}
export type SettingsSnapshot =
  | { readonly state: 'absent' }
  | { readonly state: 'valid'; readonly value: Readonly<OwnerSettings> }
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
function validSettings(value: unknown): value is OwnerSettings {
  if (!object(value) || !keys(value, ['version', 'judge', 'decision', 'observation']) || value.version !== 1 || !object(value.judge)) return false;
  const judge = value.judge;
  if (judge.provider === 'typesafe') { if (!keys(judge, ['provider'])) return false; }
  else if (judge.provider === 'apus-llamacpp') {
    if (!keys(judge, ['provider', 'baseUrl', 'model']) || !validLocalBaseUrl(judge.baseUrl) || !alias(judge.model)) return false;
  } else return false;
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
const sameIdentity = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.uid === b.uid && a.nlink === b.nlink;
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

/** Read-only, bounded owner configuration. No project search, repair, watcher or content diagnostics. */
export function readOwnerSettings(home = ownerHome(), io = filesystem): SettingsSnapshot {
  const invalid = (reason: SettingsFailure): SettingsSnapshot => Object.freeze({ state: 'invalid', reason });
  if (!isAbsolute(home)) return invalid('unsafe');
  const root = join(home, '.tenet'), path = join(root, 'config.json');
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
        try { const after = io.lstatSync(ancestor); if (!before || !sameIdentity(before, after) || !after.isDirectory()) return false; }
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
    if (!safeFile(opened) || !sameIdentity(selected, opened)) return invalid('unsafe');
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
    if (!safeFile(after) || !sameIdentity(opened, after) || !sameIdentity(after, current)
      || after.size !== count || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs
      || !unchangedAncestors()) return invalid('unsafe');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count))); }
    catch { return invalid('malformed'); }
    return validSettings(parsed) ? freeze({ state: 'valid' as const, value: parsed }) : invalid('schema');
  } catch { return invalid('unreadable'); }
  finally { if (fd !== undefined) { try { io.closeSync(fd); } catch { /* No raw filesystem errors leave this boundary. */ } } }
}
