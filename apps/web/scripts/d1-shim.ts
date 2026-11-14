// A Cloudflare D1 look-alike over Node's built-in SQLite, for unit tests
// and CPU estimates of the server code (no workerd, no network). Only what
// our code and Better Auth's D1 dialect use: prepare / bind / first / all /
// run / raw, batch (one transaction) and exec. `delayMs` simulates the
// network wait of a real D1 call (not CPU).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

type Value = string | number | bigint | null | Uint8Array;

const norm = (v: unknown): Value => {
  if (v === undefined) throw new Error('D1_TYPE_ERROR: undefined is not a valid bind value');
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return v as Value;
};

export class ShimStmt {
  db: ShimD1;
  sql: string;
  params: Value[];
  constructor(db: ShimD1, sql: string, params: Value[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...values: unknown[]): ShimStmt {
    return new ShimStmt(this.db, this.sql, values.map(norm));
  }
  /** Runs synchronously (inside a batch's transaction). */
  exec(): ReturnType<ShimStmt['execInner']> {
    // SQLite runs in this process here but on D1's side in production: its
    // CPU is tracked so estimates can leave it out.
    const c0 = process.cpuUsage();
    try {
      return this.execInner();
    } finally {
      const c = process.cpuUsage(c0);
      this.db.dbCpuUs += c.user + c.system;
    }
  }
  execInner(): { results: Record<string, unknown>[]; meta: { changes: number; last_row_id: number; rows_read: number; rows_written: number } } {
    this.db.statements++;
    const st = this.db.sqlite.prepare(this.sql);
    const reader = /^\s*(select|with|pragma)\b/i.test(this.sql) || /\breturning\b/i.test(this.sql);
    if (reader) {
      const rows = st.all(...(this.params as never[])) as Record<string, unknown>[];
      return { results: rows.map((r) => ({ ...r })), meta: { changes: 0, last_row_id: 0, rows_read: rows.length, rows_written: 0 } };
    }
    const r = st.run(...(this.params as never[]));
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid), rows_read: 0, rows_written: Number(r.changes) } };
  }
  async first<T = Record<string, unknown>>(col?: string): Promise<T | null> {
    await this.db.wait();
    const r = this.exec().results[0] ?? null;
    return (col && r ? r[col] : r) as T | null;
  }
  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true; meta: ReturnType<ShimStmt['exec']>['meta'] }> {
    await this.db.wait();
    const r = this.exec();
    return { results: r.results as T[], success: true, meta: r.meta };
  }
  async run() {
    return this.all();
  }
  async raw<T = unknown[]>(): Promise<T[]> {
    await this.db.wait();
    return this.exec().results.map((r) => Object.values(r)) as T[];
  }
}

export class ShimD1 {
  readonly sqlite: DatabaseSync;
  /** Statements run so far (D1 bills per statement and per row). */
  statements = 0;
  /** CPU spent inside SQLite (microseconds); on Cloudflare this is D1's, not the Worker's. */
  dbCpuUs = 0;
  delayMs: number;
  constructor(delayMs = 0, file = ':memory:') {
    this.delayMs = delayMs;
    this.sqlite = new DatabaseSync(file);
  }
  wait(): Promise<void> {
    return this.delayMs ? new Promise((r) => setTimeout(r, this.delayMs)) : Promise.resolve();
  }
  prepare(sql: string): ShimStmt {
    return new ShimStmt(this, sql);
  }
  async batch(stmts: ShimStmt[]) {
    await this.wait();
    this.sqlite.exec('BEGIN');
    try {
      const out = stmts.map((s) => {
        const r = s.exec();
        return { results: r.results, success: true, meta: r.meta };
      });
      this.sqlite.exec('COMMIT');
      return out;
    } catch (e) {
      this.sqlite.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql: string) {
    await this.wait();
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }
}

/** A database with this app's migrations applied (apps/web/migrations). */
export function migratedD1(delayMs = 0): ShimD1 {
  const db = new ShimD1(delayMs);
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.sqlite.exec(readFileSync(join(dir, f), 'utf8'));
  return db;
}
