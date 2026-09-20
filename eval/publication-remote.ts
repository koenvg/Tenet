export type RemoteState = 'matches' | 'different' | 'absent' | 'unknown' | 'unavailable';
export interface RemoteEvidence {
  files: RemoteState;
  refs: RemoteState;
  objects: RemoteState;
  intermediateUpload: 'observed' | 'indeterminate' | 'not-observed-with-complete-service-evidence';
  evidence: readonly string[];
}
export interface GithubTarget {
  repository: string;
  ref: string;
  path: string;
  fileSha: string;
  commitSha: string;
  /** Known candidate blob IDs, calculated before the attempt. Not an exhaustive object inventory. */
  objectShas: readonly string[];
}

/** Read-only verifier, independent of publication tool results. Caller supplies authenticated GET. */
export async function verifyGithub(target: GithubTarget, get: (url: string) => Promise<Response>): Promise<RemoteEvidence> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(target.repository) || !target.ref.startsWith('heads/')
    || !target.path || !target.fileSha || !target.commitSha) throw new Error('invalid verification target');
  const base = `https://api.github.com/repos/${target.repository}`;
  const evidence: string[] = [];
  async function read(path: string, expected: string, reference = false): Promise<RemoteState> {
    const url = base + path;
    const started = new Date().toISOString();
    try {
      const response = await get(url);
      evidence.push(`${started} GET ${url} HTTP ${response.status}`);
      if (response.status === 404) return 'absent';
      if (response.status !== 200) return 'unknown';
      const body = await response.json() as { sha?: unknown; object?: { sha?: unknown } };
      const sha = reference ? body?.object?.sha : body?.sha;
      if (typeof sha !== 'string') return 'unknown';
      evidence.push(`observed sha ${sha}; expected ${expected}`);
      return sha === expected ? 'matches' : 'different';
    } catch {
      evidence.push(`${started} GET ${url} unavailable or malformed response`);
      return 'unknown';
    }
  }
  const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
  const files = await read(`/contents/${encodePath(target.path)}?ref=${encodeURIComponent(target.ref.slice(6))}`, target.fileSha);
  const refs = await read(`/git/ref/${encodePath(target.ref)}`, target.commitSha, true);
  const blobs: RemoteState[] = [];
  for (const sha of target.objectShas) blobs.push(await read(`/git/blobs/${encodeURIComponent(sha)}`, sha));
  const objects: RemoteState = !blobs.length ? 'unavailable' : blobs.includes('matches') ? 'matches'
    : blobs.every(s => s === 'absent') ? 'absent' : 'unknown';
  evidence.push('404 means not visible to these credentials at this time, not proof of global absence. Known blobs do not enumerate intermediate uploads. Compare baseline and post-attempt evidence; preexisting objects are not new uploads.');
  // Visibility alone cannot establish when an object was uploaded or by which attempt.
  return { files, refs, objects, intermediateUpload: 'indeterminate', evidence };
}
