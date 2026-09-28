import crypto from 'node:crypto';
import type { AuditEntry } from '@calendarios/core';
import type { Database } from '../db/database';
import { json } from '../db/database';

/* Registro de auditoria: quem fez o quê, quando. Só cresce — nunca é editado. */

export function recordAudit(
  db: Database,
  e: { actor: string; action: string; entity: AuditEntry['entity']; entityId: string; summary: string; detail?: unknown },
) {
  db.run(
    `INSERT INTO audit_log (id, at, actor, action, entity, entity_id, summary, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), new Date().toISOString(), e.actor, e.action, e.entity, e.entityId, e.summary, e.detail === undefined ? null : JSON.stringify(e.detail)],
  );
}

interface Row {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: AuditEntry['entity'];
  entity_id: string;
  summary: string;
  detail_json: string | null;
}

export function listAudit(db: Database, filter: { entity?: string; entityId?: string; limit?: number }): AuditEntry[] {
  const where: string[] = [];
  const params: string[] = [];
  if (filter.entity) {
    where.push('entity = ?');
    params.push(filter.entity);
  }
  if (filter.entityId) {
    where.push('entity_id = ?');
    params.push(filter.entityId);
  }
  const rows = db.all<Row>(
    `SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY at DESC LIMIT ${Math.min(filter.limit ?? 200, 1000)}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    summary: r.summary,
    detail: json(r.detail_json, null),
  }));
}
