import crypto from 'node:crypto';
import type { Audience, Channel, JobAttempt, JobKind, JobStatus, NotificationJob } from '@calendarios/core';
import type { Database } from '../db/database';
import { json } from '../db/database';

interface Row {
  id: string;
  kind: JobKind;
  channel: Channel;
  calendar_id: string | null;
  event_uid: string | null;
  lifecycle_rule_id: string | null;
  audience_json: string;
  title: string;
  body: string;
  send_at: string;
  status: JobStatus;
  idempotency_key: string;
  delivery_key: string;
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  created_at: string;
  created_by: string;
  sent_at: string | null;
  canceled_reason: string | null;
  context_json: string;
  student_id: string | null;
}

function map(r: Row): NotificationJob {
  return {
    id: r.id,
    kind: r.kind,
    channel: r.channel,
    calendarId: r.calendar_id,
    eventUid: r.event_uid,
    lifecycleRuleId: r.lifecycle_rule_id,
    audience: json<Audience>(r.audience_json, { type: 'student', studentId: '', label: '' }),
    title: r.title,
    body: r.body,
    sendAt: r.send_at,
    status: r.status,
    idempotencyKey: r.idempotency_key,
    deliveryKey: r.delivery_key,
    attempts: r.attempts,
    lastError: r.last_error,
    providerMessageId: r.provider_message_id,
    createdAt: r.created_at,
    createdBy: r.created_by,
    sentAt: r.sent_at,
    canceledReason: r.canceled_reason,
    context: json(r.context_json, {}),
  };
}

export interface NewJob {
  kind: JobKind;
  channel: Channel;
  calendarId: string | null;
  eventUid: string | null;
  lifecycleRuleId: string | null;
  audience: Audience;
  title: string;
  body: string;
  sendAt: string;
  idempotencyKey: string;
  deliveryKey: string;
  createdBy: string;
  context: NotificationJob['context'];
  /** Envio endereçado a um aluno (lembrete de favorito, acontecimento). */
  studentId?: string | null;
}

/** Insere; se a chave de idempotência já existe, não duplica e devolve null. */
export function insertJob(db: Database, j: NewJob): NotificationJob | null {
  const id = crypto.randomUUID();
  const r = db.run(
    `INSERT INTO notification_jobs (id, kind, channel, calendar_id, event_uid, lifecycle_rule_id, audience_json, title, body, send_at,
       status, idempotency_key, delivery_key, created_at, created_by, context_json, student_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO NOTHING`,
    [
      id,
      j.kind,
      j.channel,
      j.calendarId,
      j.eventUid,
      j.lifecycleRuleId,
      JSON.stringify(j.audience),
      j.title,
      j.body,
      j.sendAt,
      j.idempotencyKey,
      j.deliveryKey,
      new Date().toISOString(),
      j.createdBy,
      JSON.stringify(j.context),
      j.studentId ?? (j.audience.type === 'student' ? j.audience.studentId : null),
    ],
  );
  return r.changes ? getJob(db, id)! : null;
}

export function getJob(db: Database, id: string): NotificationJob | undefined {
  const r = db.get<Row>('SELECT * FROM notification_jobs WHERE id = ?', [id]);
  return r && map(r);
}

export function getJobByKey(db: Database, key: string): NotificationJob | undefined {
  const r = db.get<Row>('SELECT * FROM notification_jobs WHERE idempotency_key = ?', [key]);
  return r && map(r);
}

export interface JobFilter {
  status?: JobStatus[];
  kind?: JobKind;
  /** Tipos que ficam de fora (a agenda da equipe não lista os lembretes individuais de favorito). */
  excludeKinds?: JobKind[];
  channel?: Channel;
  calendarId?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export function listJobs(db: Database, f: JobFilter): NotificationJob[] {
  const where: string[] = [];
  const params: string[] = [];
  if (f.status?.length) {
    where.push(`status IN (${f.status.map(() => '?').join(',')})`);
    params.push(...f.status);
  }
  if (f.kind) {
    where.push('kind = ?');
    params.push(f.kind);
  }
  if (f.excludeKinds?.length) {
    where.push(`kind NOT IN (${f.excludeKinds.map(() => '?').join(',')})`);
    params.push(...f.excludeKinds);
  }
  if (f.channel) {
    where.push('channel = ?');
    params.push(f.channel);
  }
  if (f.calendarId) {
    where.push('calendar_id = ?');
    params.push(f.calendarId);
  }
  if (f.from) {
    where.push('send_at >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('send_at <= ?');
    params.push(f.to);
  }
  if (f.q) {
    where.push('(title LIKE ? OR body LIKE ? OR context_json LIKE ?)');
    const like = `%${f.q.replace(/[%_]/g, '')}%`;
    params.push(like, like, like);
  }
  const rows = db.all<Row>(
    `SELECT * FROM notification_jobs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY send_at ASC LIMIT ${Math.min(f.limit ?? 500, 2000)}`,
    params,
  );
  return rows.map(map);
}

/**
 * Envios ainda ativos (agendados ou aguardando configuração), SEM limite —
 * replanejar ou arquivar precisa enxergar todos, mesmo milhares de favoritos.
 */
export function listActiveJobs(db: Database, f: { calendarId: string; kind?: JobKind; studentId?: string; eventUid?: string }): NotificationJob[] {
  const where = ["calendar_id = ?", "status IN ('scheduled', 'blocked')"];
  const params: string[] = [f.calendarId];
  if (f.kind) {
    where.push('kind = ?');
    params.push(f.kind);
  }
  if (f.studentId) {
    where.push('student_id = ?');
    params.push(f.studentId);
  }
  if (f.eventUid) {
    where.push('event_uid = ?');
    params.push(f.eventUid);
  }
  return db.all<Row>(`SELECT * FROM notification_jobs WHERE ${where.join(' AND ')} ORDER BY send_at ASC`, params).map(map);
}

/** Lembretes ainda ativos de um calendário (os únicos que um replanejamento pode tocar). */
export function activeReminders(db: Database, calendarId: string): NotificationJob[] {
  return listActiveJobs(db, { calendarId, kind: 'event_reminder' });
}

/** Lembretes de favorito de um aluno num calendário (para mostrar no portal/app). */
export function studentReminders(db: Database, studentId: string, calendarId: string): NotificationJob[] {
  return db
    .all<Row>("SELECT * FROM notification_jobs WHERE kind = 'favorite_reminder' AND student_id = ? AND calendar_id = ? ORDER BY send_at", [studentId, calendarId])
    .map(map);
}

/** Resumo dos lembretes de favorito de um calendário, sem expor alunos. */
export function favoriteSummary(db: Database, calendarId: string): { scheduled: number; students: number } {
  const r = db.get<{ n: number; s: number }>(
    "SELECT COUNT(*) AS n, COUNT(DISTINCT student_id) AS s FROM notification_jobs WHERE kind = 'favorite_reminder' AND calendar_id = ? AND status IN ('scheduled', 'blocked')",
    [calendarId],
  );
  return { scheduled: r?.n ?? 0, students: r?.s ?? 0 };
}

export function updateJob(
  db: Database,
  id: string,
  patch: Partial<{ status: JobStatus; sendAt: string; title: string; body: string; deliveryKey: string; lastError: string | null; providerMessageId: string | null; sentAt: string | null; canceledReason: string | null; incrementAttempts: boolean; claimedAt: string | null }>,
) {
  const sets: string[] = [];
  const params: (string | null)[] = [];
  const col = (c: string, v: string | null) => {
    sets.push(`${c} = ?`);
    params.push(v);
  };
  if (patch.status !== undefined) col('status', patch.status);
  if (patch.sendAt !== undefined) col('send_at', patch.sendAt);
  if (patch.title !== undefined) col('title', patch.title);
  if (patch.body !== undefined) col('body', patch.body);
  if (patch.deliveryKey !== undefined) col('delivery_key', patch.deliveryKey);
  if (patch.lastError !== undefined) col('last_error', patch.lastError);
  if (patch.providerMessageId !== undefined) col('provider_message_id', patch.providerMessageId);
  if (patch.sentAt !== undefined) col('sent_at', patch.sentAt);
  if (patch.canceledReason !== undefined) col('canceled_reason', patch.canceledReason);
  if (patch.claimedAt !== undefined) col('claimed_at', patch.claimedAt);
  if (patch.incrementAttempts) sets.push('attempts = attempts + 1');
  if (!sets.length) return;
  params.push(id);
  db.run(`UPDATE notification_jobs SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * Reivindica envios vencidos de forma atômica: só quem trocar
 * scheduled → sending envia. Dois workers nunca enviam o mesmo job.
 */
export function claimDueJobs(db: Database, now: Date, limit = 20): NotificationJob[] {
  return db.tx(() => {
    const due = db.all<Row>("SELECT * FROM notification_jobs WHERE status = 'scheduled' AND send_at <= ? ORDER BY send_at LIMIT ?", [now.toISOString(), limit]);
    const claimed: NotificationJob[] = [];
    for (const r of due) {
      const res = db.run("UPDATE notification_jobs SET status = 'sending', claimed_at = ? WHERE id = ? AND status = 'scheduled'", [now.toISOString(), r.id]);
      if (res.changes) claimed.push({ ...map(r), status: 'sending' });
    }
    return claimed;
  });
}

/** Envios presos em "sending" (queda do processo) voltam para a fila. */
export function releaseStuckJobs(db: Database, olderThan: Date) {
  db.run("UPDATE notification_jobs SET status = 'scheduled', claimed_at = NULL WHERE status = 'sending' AND claimed_at < ?", [olderThan.toISOString()]);
}

export function addAttempt(db: Database, jobId: string, outcome: JobAttempt['outcome'], detail: string) {
  db.run('INSERT INTO job_attempts (id, job_id, at, outcome, detail) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), jobId, new Date().toISOString(), outcome, detail]);
}

export function listAttempts(db: Database, jobId: string): JobAttempt[] {
  return db
    .all<{ id: string; job_id: string; at: string; outcome: JobAttempt['outcome']; detail: string }>('SELECT * FROM job_attempts WHERE job_id = ? ORDER BY at', [jobId])
    .map((r) => ({ id: r.id, jobId: r.job_id, at: r.at, outcome: r.outcome, detail: r.detail }));
}

export function countByStatus(db: Database): Record<string, number> {
  return Object.fromEntries(db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM notification_jobs GROUP BY status').map((r) => [r.status, r.n]));
}
