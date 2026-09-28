import crypto from 'node:crypto';
import type { Database } from '../db/database';
import { json } from '../db/database';

export interface StoredFile {
  id: string;
  sha256: string;
  size: number;
  originalName: string;
  mime: string;
  pageCount: number | null;
  meta: Record<string, string>;
  storageKey: string;
  createdAt: string;
  createdBy: string;
}

interface Row {
  id: string;
  sha256: string;
  size: number;
  original_name: string;
  mime: string;
  page_count: number | null;
  meta_json: string | null;
  storage_key: string;
  created_at: string;
  created_by: string;
}

function map(r: Row): StoredFile {
  return {
    id: r.id,
    sha256: r.sha256,
    size: r.size,
    originalName: r.original_name,
    mime: r.mime,
    pageCount: r.page_count,
    meta: json(r.meta_json, {}),
    storageKey: r.storage_key,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}

export function findFileByHash(db: Database, sha256: string): StoredFile | undefined {
  const r = db.get<Row>('SELECT * FROM files WHERE sha256 = ?', [sha256]);
  return r && map(r);
}

export function getFile(db: Database, id: string): StoredFile | undefined {
  const r = db.get<Row>('SELECT * FROM files WHERE id = ?', [id]);
  return r && map(r);
}

export function insertFile(db: Database, f: { sha256: string; size: number; originalName: string; storageKey: string; createdBy: string }): StoredFile {
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO files (id, sha256, size, original_name, mime, storage_key, created_at, created_by)
     VALUES (?, ?, ?, ?, 'application/pdf', ?, ?, ?)`,
    [id, f.sha256, f.size, f.originalName, f.storageKey, new Date().toISOString(), f.createdBy],
  );
  return getFile(db, id)!;
}

export function updateFileMeta(db: Database, id: string, pageCount: number, meta: Record<string, string>) {
  db.run('UPDATE files SET page_count = ?, meta_json = ? WHERE id = ?', [pageCount, JSON.stringify(meta), id]);
}
