import type { StudentMark } from '@calendarios/core';
import type { Database } from '../db/database';

/* Marcações do aluno: estrela (leva o evento para "Importantes" e agenda um
   lembrete só para ele) ou ocultar (tira uma Média de "Importantes").
   Uma linha por aluno e evento: estrela e ocultar se excluem por construção.
   Ficam presas ao `uid` do evento, que se mantém entre versões. */

export interface MarkRow {
  studentId: string;
  calendarId: string;
  eventUid: string;
  mark: StudentMark;
  updatedAt: string;
}

export function getMark(db: Database, studentId: string, calendarId: string, eventUid: string): StudentMark | null {
  const r = db.get<{ mark: StudentMark }>('SELECT mark FROM student_event_marks WHERE student_id = ? AND calendar_id = ? AND event_uid = ?', [studentId, calendarId, eventUid]);
  return r?.mark ?? null;
}

export function listMarks(db: Database, studentId: string, calendarId: string): MarkRow[] {
  return db
    .all<{ student_id: string; calendar_id: string; event_uid: string; mark: StudentMark; updated_at: string }>(
      'SELECT * FROM student_event_marks WHERE student_id = ? AND calendar_id = ? ORDER BY updated_at',
      [studentId, calendarId],
    )
    .map((r) => ({ studentId: r.student_id, calendarId: r.calendar_id, eventUid: r.event_uid, mark: r.mark, updatedAt: r.updated_at }));
}

export function countMarks(db: Database, studentId: string, calendarId: string): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM student_event_marks WHERE student_id = ? AND calendar_id = ?', [studentId, calendarId])?.n ?? 0;
}

export function upsertMark(db: Database, studentId: string, calendarId: string, eventUid: string, mark: StudentMark, at: string) {
  db.run(
    `INSERT INTO student_event_marks (student_id, calendar_id, event_uid, mark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, calendar_id, event_uid) DO UPDATE SET mark = excluded.mark, updated_at = excluded.updated_at`,
    [studentId, calendarId, eventUid, mark, at, at],
  );
}

export function deleteMark(db: Database, studentId: string, calendarId: string, eventUid: string) {
  db.run('DELETE FROM student_event_marks WHERE student_id = ? AND calendar_id = ? AND event_uid = ?', [studentId, calendarId, eventUid]);
}

/** Todas as estrelas de um calendário — para reconciliar lembretes na publicação. */
export function listStars(db: Database, calendarId: string): { studentId: string; eventUid: string }[] {
  return db
    .all<{ student_id: string; event_uid: string }>("SELECT student_id, event_uid FROM student_event_marks WHERE calendar_id = ? AND mark = 'star'", [calendarId])
    .map((r) => ({ studentId: r.student_id, eventUid: r.event_uid }));
}
