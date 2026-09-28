import type { IgnoredEntry, ImportBatch, ImportItem, ImportItemStatus } from '@calendarios/core';
import type { Database } from '../db/database';
import { json } from '../db/database';

interface ItemRow {
  id: string;
  batch_id: string;
  relative_path: string;
  file_id: string | null;
  sha256: string | null;
  size: number;
  status: ImportItemStatus;
  error: string | null;
  calendar_id: string | null;
  same_content_json: string;
  already_json: string | null;
  group_leader_id: string | null;
  attempts: number;
  started_at: string | null;
  finished_at: string | null;
}

function mapItem(db: Database, r: ItemRow): ImportItem {
  let eventCount = 0;
  let pendingCount = 0;
  if (r.calendar_id) {
    eventCount = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM events WHERE calendar_id = ?', [r.calendar_id])?.n ?? 0;
  }
  return {
    id: r.id,
    batchId: r.batch_id,
    relativePath: r.relative_path,
    fileId: r.file_id,
    sha256: r.sha256,
    size: r.size,
    status: r.status,
    error: r.error,
    calendarId: r.calendar_id,
    sameContentAs: json(r.same_content_json, []),
    alreadyImportedAs: json(r.already_json, null),
    groupLeaderId: r.group_leader_id,
    attempts: r.attempts,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    pendingCount,
    eventCount,
  };
}

export function insertBatch(db: Database, id: string, actor: string, ignored: IgnoredEntry[]) {
  db.run('INSERT INTO import_batches (id, created_at, created_by, status, ignored_json) VALUES (?, ?, ?, ?, ?)', [
    id,
    new Date().toISOString(),
    actor,
    'staged',
    JSON.stringify(ignored),
  ]);
}

export function insertItem(
  db: Database,
  item: { id: string; batchId: string; relativePath: string; fileId: string; sha256: string; size: number; sameContentAs: string[]; alreadyImportedAs: { calendarId: string; title: string } | null; sort: number },
) {
  db.run(
    `INSERT INTO import_items (id, batch_id, relative_path, file_id, sha256, size, status, same_content_json, already_json, sort)
     VALUES (?, ?, ?, ?, ?, ?, 'staged', ?, ?, ?)`,
    [item.id, item.batchId, item.relativePath, item.fileId, item.sha256, item.size, JSON.stringify(item.sameContentAs), item.alreadyImportedAs ? JSON.stringify(item.alreadyImportedAs) : null, item.sort],
  );
}

export function getBatch(db: Database, id: string, enrich?: (item: ImportItem) => ImportItem): ImportBatch | undefined {
  const b = db.get<{ id: string; created_at: string; created_by: string; status: ImportBatch['status']; ignored_json: string }>('SELECT * FROM import_batches WHERE id = ?', [id]);
  if (!b) return undefined;
  const items = db.all<ItemRow>('SELECT * FROM import_items WHERE batch_id = ? ORDER BY sort', [id]).map((r) => mapItem(db, r));
  return {
    id: b.id,
    createdAt: b.created_at,
    createdBy: b.created_by,
    status: b.status,
    ignored: json(b.ignored_json, []),
    items: enrich ? items.map(enrich) : items,
  };
}

export function listRecentBatches(db: Database, limit = 10): { id: string; createdAt: string; createdBy: string; status: string; total: number; done: number }[] {
  return db.all(
    `SELECT b.id, b.created_at AS createdAt, b.created_by AS createdBy, b.status,
       (SELECT COUNT(*) FROM import_items i WHERE i.batch_id = b.id AND i.status != 'skipped') AS total,
       (SELECT COUNT(*) FROM import_items i WHERE i.batch_id = b.id AND i.status IN ('needs_review','ready','error')) AS done
     FROM import_batches b ORDER BY b.created_at DESC LIMIT ?`,
    [limit],
  );
}

export function setBatchStatus(db: Database, id: string, status: ImportBatch['status']) {
  db.run('UPDATE import_batches SET status = ? WHERE id = ?', [status, id]);
}

export function updateItem(db: Database, id: string, patch: Partial<{ status: ImportItemStatus; error: string | null; calendarId: string | null; groupLeaderId: string | null; startedAt: string | null; finishedAt: string | null; incrementAttempts: boolean }>) {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (patch.error !== undefined) {
    sets.push('error = ?');
    params.push(patch.error);
  }
  if (patch.calendarId !== undefined) {
    sets.push('calendar_id = ?');
    params.push(patch.calendarId);
  }
  if (patch.groupLeaderId !== undefined) {
    sets.push('group_leader_id = ?');
    params.push(patch.groupLeaderId);
  }
  if (patch.startedAt !== undefined) {
    sets.push('started_at = ?');
    params.push(patch.startedAt);
  }
  if (patch.finishedAt !== undefined) {
    sets.push('finished_at = ?');
    params.push(patch.finishedAt);
  }
  if (patch.incrementAttempts) sets.push('attempts = attempts + 1');
  if (!sets.length) return;
  params.push(id);
  db.run(`UPDATE import_items SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * Pega o próximo item da fila de forma atômica (um worker por item).
 * Itens "seguidores" (mesmo conteúdo de um líder) não são lidos: o líder os conclui.
 */
export function claimNextItem(db: Database): ItemRow | undefined {
  return db.tx(() => {
    const next = db.get<ItemRow>("SELECT * FROM import_items WHERE status = 'queued' AND group_leader_id IS NULL ORDER BY sort LIMIT 1");
    if (!next) return undefined;
    const r = db.run("UPDATE import_items SET status = 'reading', started_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'queued'", [new Date().toISOString(), next.id]);
    return r.changes ? next : undefined;
  });
}

export function itemsOfBatch(db: Database, batchId: string): ItemRow[] {
  return db.all<ItemRow>('SELECT * FROM import_items WHERE batch_id = ? ORDER BY sort', [batchId]);
}

export function getItemRow(db: Database, id: string): ItemRow | undefined {
  return db.get<ItemRow>('SELECT * FROM import_items WHERE id = ?', [id]);
}

/** Itens que ficaram "Lendo" quando o processo caiu voltam para a fila. */
export function requeueStuck(db: Database) {
  db.run("UPDATE import_items SET status = 'queued' WHERE status = 'reading'");
}

export type { ItemRow };
