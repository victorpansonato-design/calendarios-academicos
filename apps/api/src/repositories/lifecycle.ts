import crypto from 'node:crypto';
import type { LifecycleRule, StudentEventRecord, StudentPreference } from '@calendarios/core';
import { LIFECYCLE_SEEDS, seedStep } from '@calendarios/core';
import type { Database } from '../db/database';
import { json } from '../db/database';

/** Cria as oito regras iniciais, uma vez. Regras já existentes não são tocadas. */
export function seedLifecycleRules(db: Database) {
  db.tx(() => {
    LIFECYCLE_SEEDS.forEach((seed, i) => {
      if (db.get('SELECT 1 FROM lifecycle_rules WHERE key = ?', [seed.key])) return;
      const id = crypto.randomUUID();
      const rule: LifecycleRule = {
        ...seed,
        id,
        steps: seed.steps.map((s, j) => seedStep(id.slice(0, 8), j, s)),
        updatedAt: new Date().toISOString(),
        updatedBy: 'sistema',
      };
      db.run('INSERT INTO lifecycle_rules (id, key, data_json, sort, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)', [id, seed.key, JSON.stringify(rule), i, rule.updatedAt, rule.updatedBy]);
    });
  });
}

export function listRules(db: Database): LifecycleRule[] {
  return db.all<{ data_json: string }>('SELECT data_json FROM lifecycle_rules ORDER BY sort').map((r) => JSON.parse(r.data_json) as LifecycleRule);
}

export function getRule(db: Database, id: string): LifecycleRule | undefined {
  const r = db.get<{ data_json: string }>('SELECT data_json FROM lifecycle_rules WHERE id = ?', [id]);
  return r ? (JSON.parse(r.data_json) as LifecycleRule) : undefined;
}

export function saveRule(db: Database, rule: LifecycleRule) {
  db.run('UPDATE lifecycle_rules SET data_json = ?, updated_at = ?, updated_by = ? WHERE id = ?', [JSON.stringify(rule), rule.updatedAt, rule.updatedBy, rule.id]);
}

interface EventRow {
  id: string;
  external_event_id: string;
  source_system: string;
  status_code: string;
  student_id: string;
  rule_id: string | null;
  step_id: string | null;
  outcome: StudentEventRecord['outcome'];
  job_ids_json: string;
  received_at: string;
}

function mapEvent(r: EventRow): StudentEventRecord {
  return {
    id: r.id,
    externalEventId: r.external_event_id,
    sourceSystem: r.source_system,
    statusCode: r.status_code,
    studentId: r.student_id,
    ruleId: r.rule_id,
    stepId: r.step_id,
    outcome: r.outcome,
    jobIds: json(r.job_ids_json, []),
    receivedAt: r.received_at,
  };
}

export function findStudentEvent(db: Database, externalId: string): StudentEventRecord | undefined {
  const r = db.get<EventRow>('SELECT * FROM student_events WHERE external_event_id = ?', [externalId]);
  return r && mapEvent(r);
}

export function insertStudentEvent(db: Database, e: Omit<StudentEventRecord, 'id' | 'receivedAt'>): StudentEventRecord {
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO student_events (id, external_event_id, source_system, status_code, student_id, rule_id, step_id, outcome, job_ids_json, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, e.externalEventId, e.sourceSystem, e.statusCode, e.studentId, e.ruleId, e.stepId, e.outcome, JSON.stringify(e.jobIds), new Date().toISOString()],
  );
  return mapEvent(db.get<EventRow>('SELECT * FROM student_events WHERE id = ?', [id])!);
}

export function listStudentEvents(db: Database, limit = 100, ruleId?: string): StudentEventRecord[] {
  const rows = ruleId
    ? db.all<EventRow>('SELECT * FROM student_events WHERE rule_id = ? ORDER BY received_at DESC LIMIT ?', [ruleId, limit])
    : db.all<EventRow>('SELECT * FROM student_events ORDER BY received_at DESC LIMIT ?', [limit]);
  return rows.map(mapEvent);
}

export function getPreference(db: Database, studentId: string): StudentPreference | undefined {
  const r = db.get<{ student_id: string; push_opt_in: number; email_opt_in: number; updated_at: string }>('SELECT * FROM student_preferences WHERE student_id = ?', [studentId]);
  return r && { studentId: r.student_id, pushOptIn: Boolean(r.push_opt_in), emailOptIn: Boolean(r.email_opt_in), updatedAt: r.updated_at };
}

export function upsertPreference(db: Database, p: Omit<StudentPreference, 'updatedAt'>): StudentPreference {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO student_preferences (student_id, push_opt_in, email_opt_in, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET push_opt_in = excluded.push_opt_in, email_opt_in = excluded.email_opt_in, updated_at = excluded.updated_at`,
    [p.studentId, p.pushOptIn ? 1 : 0, p.emailOptIn ? 1 : 0, now],
  );
  return { ...p, updatedAt: now };
}
