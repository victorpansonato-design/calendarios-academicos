import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { MIGRATIONS } from './migrations';

/* ==========================================================================
   Banco de dados
   --------------------------------------------------------------------------
   SQLite embutido no Node (node:sqlite): zero dependência nativa, um arquivo
   só, transações reais. É suficiente para a operação de uma instituição e
   deixa a implantação trivial.

   Para trocar por PostgreSQL, o ponto de troca é este arquivo e os
   repositórios em ./repositories — o SQL é padrão (sem recursos exclusivos
   do SQLite além de JSON em TEXT), e nenhum serviço fala SQL diretamente.
   ========================================================================== */

export type Params = Record<string, SQLInputValue> | SQLInputValue[];

export class Database {
  readonly raw: DatabaseSync;
  private depth = 0;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  private migrate() {
    this.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const applied = new Set(this.all<{ id: string }>('SELECT id FROM schema_migrations').map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      this.tx(() => {
        this.raw.exec(m.sql);
        this.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [m.id, new Date().toISOString()]);
      });
    }
  }

  private bind(params?: Params): SQLInputValue[] {
    if (!params) return [];
    return Array.isArray(params) ? params : [params as unknown as SQLInputValue];
  }

  get<T>(sql: string, params?: Params): T | undefined {
    const stmt = this.raw.prepare(sql);
    return (Array.isArray(params) || params === undefined ? stmt.get(...this.bind(params)) : stmt.get(params as Record<string, SQLInputValue>)) as T | undefined;
  }

  all<T>(sql: string, params?: Params): T[] {
    const stmt = this.raw.prepare(sql);
    return (Array.isArray(params) || params === undefined ? stmt.all(...this.bind(params)) : stmt.all(params as Record<string, SQLInputValue>)) as T[];
  }

  run(sql: string, params?: Params): { changes: number } {
    const stmt = this.raw.prepare(sql);
    const r = Array.isArray(params) || params === undefined ? stmt.run(...this.bind(params)) : stmt.run(params as Record<string, SQLInputValue>);
    return { changes: Number(r.changes) };
  }

  /** Transação reentrante: chamadas aninhadas participam da externa. */
  tx<T>(fn: () => T): T {
    if (this.depth > 0) {
      this.depth += 1;
      try {
        return fn();
      } finally {
        this.depth -= 1;
      }
    }
    this.raw.exec('BEGIN IMMEDIATE');
    this.depth = 1;
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    } finally {
      this.depth = 0;
    }
  }

  close() {
    this.raw.close();
  }
}

export function json<T>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
