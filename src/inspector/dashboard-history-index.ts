import { DatabaseSync } from 'node:sqlite';
import type { DashboardFactSource, DashboardRecordFacts } from './dashboard-facts.js';

type RootIndex = { db: DatabaseSync; bytes: number; rows: number; clock: number };
const FACT_BYTES = 8 * 1024 * 1024;

/** Disposable host-local facts. No database, journal or checkpoint is written to disk. */
export class DashboardHistoryIndex {
  private roots = new Map<string, RootIndex>();
  private closed = false;
  readonly metrics = { hits: 0, misses: 0, payloadBytes: 0, evictions: 0 };
  private forget(path: string) {
    const index = this.roots.get(path);
    if (!index) return;
    this.roots.delete(path); this.metrics.evictions++;
    try { index.db.close(); } catch {}
  }
  private root(path: string): RootIndex {
    if (this.closed) throw Error('history-index-closed');
    let index = this.roots.get(path);
    if (index) { this.roots.delete(path); this.roots.set(path, index); return index; }
    if (this.roots.size >= 4) this.forget(this.roots.keys().next().value!);
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`PRAGMA page_size=4096; PRAGMA max_page_count=4096; PRAGMA cache_size=-1024; PRAGMA temp_store=MEMORY;
        CREATE TABLE facts(path TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, value TEXT NOT NULL, bytes INTEGER NOT NULL, used INTEGER NOT NULL);
        CREATE INDEX facts_used ON facts(used);`);
    } catch (error) { db.close(); throw error; }
    index = { db, bytes: 0, rows: 0, clock: 0 }; this.roots.set(path, index); return index;
  }
  source(root: string): DashboardFactSource {
    return async (path, fingerprint, threads, load) => {
      try {
        const index = this.root(root);
        const cached = index.db.prepare('SELECT fingerprint, value, bytes FROM facts WHERE path=?').get(path) as { fingerprint: string; value: string; bytes: number } | undefined;
        if (cached) {
          const facts = JSON.parse(cached.value) as DashboardRecordFacts;
          if (cached.fingerprint === fingerprint && (!facts.thread || !threads.has(facts.thread) || facts.stage)) {
            index.db.prepare('UPDATE facts SET used=? WHERE path=?').run(++index.clock, path);
            this.metrics.hits++; return facts;
          }
          index.db.prepare('DELETE FROM facts WHERE path=?').run(path); index.bytes -= cached.bytes; index.rows--;
        }
      } catch { this.forget(root); }
      this.metrics.misses++;
      const facts = await load(); this.metrics.payloadBytes += facts.bytes;
      try {
        const value = JSON.stringify(facts), bytes = Buffer.byteLength(value) + Buffer.byteLength(path) + Buffer.byteLength(fingerprint) + 256;
        if (bytes > 256 * 1024) return facts;
        const current = this.root(root);
        const previous = current.db.prepare('SELECT bytes FROM facts WHERE path=?').get(path) as { bytes: number } | undefined;
        if (previous) { current.db.prepare('DELETE FROM facts WHERE path=?').run(path); current.bytes -= previous.bytes; current.rows--; }
        while (current.bytes + bytes > FACT_BYTES || current.rows >= 8192) {
          const oldest = current.db.prepare('SELECT path, bytes FROM facts ORDER BY used LIMIT 1').get() as { path: string; bytes: number };
          current.db.prepare('DELETE FROM facts WHERE path=?').run(oldest.path);
          current.bytes -= oldest.bytes; current.rows--; this.metrics.evictions++;
        }
        current.db.prepare('INSERT INTO facts VALUES(?,?,?,?,?)').run(path, fingerprint, value, bytes, ++current.clock);
        current.bytes += bytes; current.rows++;
      } catch { this.forget(root); }
      return facts;
    };
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const index of this.roots.values()) index.db.close();
    this.roots.clear();
  }
}
