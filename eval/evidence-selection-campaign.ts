import { closeSync, existsSync, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Manifest, Entry } from './evidence-selection-inputs.js';

function syncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function durableFile(path: string, text: string): void {
  const fd = openSync(path, 'wx', 0o600);
  try {
    const data = Buffer.from(text); let written = 0;
    while (written < data.length) written += writeSync(fd, data, written, data.length - written);
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

/** One exclusive fixed campaign per storage directory. There is deliberately no resume/reset. */
export class EvidenceCampaign {
  readonly directory: string;
  private spent = 0;
  private pending: number | null = null;
  private next = 0;
  private journal: number;
  constructor(storage: string, readonly manifest: Manifest) {
    const root = resolve(storage);
    if (!storage || root !== realpathSync(root) || !lstatSync(root).isDirectory()) throw Error('unsafe-storage');
    this.directory = join(root, 'tenet29-live');
    // mkdir without recursive is the campaign lock and makes re-entry fail closed.
    mkdirSync(this.directory, { mode: 0o700 });
    syncDirectory(root);
    durableFile(join(this.directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    durableFile(join(this.directory, 'attempts.jsonl'), '');
    this.journal = openSync(join(this.directory, 'attempts.jsonl'), 'a');
    syncDirectory(this.directory);
  }
  private check(): void {
    if (realpathSync(this.directory) !== this.directory || !lstatSync(this.directory).isDirectory()
      || !lstatSync(join(this.directory, 'attempts.jsonl')).isFile()) throw Error('durability-failure');
    const path = lstatSync(join(this.directory, 'attempts.jsonl')), fd = fstatSync(this.journal);
    if (path.ino !== fd.ino || path.dev !== fd.dev) throw Error('durability-failure');
  }
  private append(value: unknown): void {
    this.check();
    const data = Buffer.from(JSON.stringify(value) + '\n'); let written = 0;
    while (written < data.length) written += writeSync(this.journal, data, written, data.length - written);
    fsyncSync(this.journal);
  }
  dispatch(entry: Entry): void {
    if (this.pending !== null || this.spent >= 34 || entry.index !== this.next
      || this.manifest.entries[entry.index] !== entry) throw Error('campaign-sequence');
    this.append({ stage: 'dispatch-intent', index: entry.index, id: entry.id, side: entry.side,
      payloadDigest: entry.payloadDigest, timestamp: new Date().toISOString() });
    this.spent++; this.pending = entry.index; this.next++;
  }
  complete(entry: Entry, value: unknown): void {
    if (this.pending !== entry.index) throw Error('campaign-sequence');
    this.append({ stage: 'result', index: entry.index, value });
    this.pending = null;
  }
  checkpoint(report: unknown, markdown: string): void {
    this.check();
    for (const [name, content] of [['report.json', JSON.stringify(report, null, 2) + '\n'], ['report.md', markdown]]) {
      const target = join(this.directory, name!);
      if (existsSync(target) && (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink())) throw Error('unsafe-output');
      const temporary = `${target}.next`;
      durableFile(temporary, content!);
      renameSync(temporary, target);
      syncDirectory(dirname(target));
    }
  }
  close(): void { closeSync(this.journal); }
}
