import type { Stats } from 'node:fs';
import { lstat, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { PolicyCandidate } from '../decision/contracts.js';

interface SelectedCandidate extends PolicyCandidate {
  readonly failure?: 'configuration' | 'policy-unavailable';
}
export interface PolicySelection {
  readonly eligible: boolean;
  readonly candidates: readonly SelectedCandidate[];
}

export function projectPolicyCandidate(cwd: string, env: Record<string, string | undefined>) {
  const override = env.TENET_POLICY;
  if (override === undefined) return { role: 'project' as const, selection: 'local' as const, source: resolve(cwd, 'TENET.md') };
  if (!override.trim()) return { role: 'project' as const, selection: 'explicit' as const, source: '', failure: 'configuration' as const };
  return { role: 'project' as const, selection: 'explicit' as const, source: resolve(cwd, override) };
}

/** Same owner-home mechanism as cooperative activation. No environment-map override. */
export function policyCandidates(cwd: string, env: Record<string, string | undefined>): Omit<SelectedCandidate, 'presence'>[] {
  return [{ role: 'global' as const, selection: 'local' as const, source: join(homedir(), '.tenet', 'TENET.md') },
    projectPolicyCandidate(cwd, env)];
}

/** Bind hook/bridge selection configuration, not readiness or current filesystem state. */
export function policySelectionIdentity(cwd: string, env: Record<string, string | undefined>): string {
  return createHash('sha256').update(JSON.stringify(policyCandidates(cwd, env).map(c => [c.role, c.selection, c.source]))).digest('hex');
}

type SelectionFileSystem = {
  lstat(path: string): Promise<Pick<Stats, 'isDirectory' | 'isSymbolicLink'>>;
  stat(path: string): Promise<Pick<Stats, 'isDirectory'>>;
};
async function inspect(candidate: ReturnType<typeof policyCandidates>[number], fs: SelectionFileSystem): Promise<SelectedCandidate> {
  if (candidate.failure) return { ...candidate, presence: 'unavailable' };
  try {
    await fs.lstat(candidate.source);
    return { ...candidate, presence: 'present' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Missing directories are optional. Broken ancestor links are not absence.
      let parent = dirname(candidate.source);
      for (;;) {
        let info;
        try { info = await fs.lstat(parent); }
        catch (ancestorError) {
          if ((ancestorError as NodeJS.ErrnoException).code !== 'ENOENT') break;
        }
        if (info) {
          try {
            if (!(info.isSymbolicLink() ? await fs.stat(parent) : info).isDirectory()) break;
            return { ...candidate, presence: 'absent' };
          } catch { break; }
        }
        const next = dirname(parent);
        if (next === parent) break;
        parent = next;
      }
    }
    return { ...candidate, presence: 'unavailable', failure: 'policy-unavailable' };
  }
}

/** Only confirmed absence of both implicit sources is dormant. FS injection is internal. */
export async function selectPolicies(cwd: string, env: Record<string, string | undefined>,
  fs: SelectionFileSystem = { lstat, stat }): Promise<PolicySelection> {
  const candidates = [];
  for (const candidate of policyCandidates(cwd, env)) candidates.push(await inspect(candidate, fs));
  return { candidates, eligible: candidates.some(c => c.selection === 'explicit' || c.presence !== 'absent') };
}
