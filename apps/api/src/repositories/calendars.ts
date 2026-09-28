import crypto from 'node:crypto';
import type {
  Calendar,
  CalendarEvent,
  CalendarNote,
  CalendarScope,
  CalendarStatus,
  CalendarVersionSummary,
  ExtractionReport,
  LegendEntry,
  ReviewState,
} from '@calendarios/core';
import { openCalendarIssues, openEventIssues } from '@calendarios/core';
import type { Database } from '../db/database';
import { json } from '../db/database';

/* ==========================================================================
   Calendários, eventos e versões
   --------------------------------------------------------------------------
   `calendars` + `events` são o RASCUNHO de trabalho. O que está publicado é
   uma fotografia imutável em `calendar_versions` (published = 1), apontada
   por `calendars.published_version_id`. Editar o rascunho nunca muda o que
   o portal e o app estão lendo.
   ========================================================================== */

export interface CalendarRow {
  id: string;
  title: string;
  year: number | null;
  semester: number | null;
  scope_json: string;
  status: CalendarStatus;
  legend_json: string;
  notes_json: string;
  review_json: string;
  extraction_json: string | null;
  source_file_id: string | null;
  published_version_id: string | null;
  published_version_number: number | null;
  published_hash: string | null;
  modified_from_source: number;
  version: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

/** O que entra na fotografia de uma versão. */
export interface Snapshot {
  calendar: Pick<Calendar, 'title' | 'year' | 'semester' | 'scope' | 'legend' | 'notes' | 'review' | 'modifiedFromSource'>;
  events: CalendarEvent[];
}

export function listEvents(db: Database, calendarId: string): CalendarEvent[] {
  return db
    .all<{ data_json: string }>('SELECT data_json FROM events WHERE calendar_id = ? ORDER BY sort_order', [calendarId])
    .map((r) => JSON.parse(r.data_json) as CalendarEvent);
}

export function getEvent(db: Database, calendarId: string, eventId: string): CalendarEvent | undefined {
  const r = db.get<{ data_json: string }>('SELECT data_json FROM events WHERE calendar_id = ? AND id = ?', [calendarId, eventId]);
  return r ? (JSON.parse(r.data_json) as CalendarEvent) : undefined;
}

export function saveEvent(db: Database, event: CalendarEvent) {
  db.run(
    `INSERT INTO events (id, calendar_id, uid, data_json, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
    [event.id, event.calendarId, event.uid, JSON.stringify(event), event.sortOrder, event.updatedAt],
  );
}

export function deleteEvent(db: Database, calendarId: string, eventId: string) {
  db.run('DELETE FROM events WHERE calendar_id = ? AND id = ?', [calendarId, eventId]);
}

export function replaceEvents(db: Database, calendarId: string, events: CalendarEvent[]) {
  db.tx(() => {
    db.run('DELETE FROM events WHERE calendar_id = ?', [calendarId]);
    for (const e of events) saveEvent(db, { ...e, calendarId });
  });
}

/** Hash do conteúdo publicável: diz se o rascunho difere do que está publicado. */
export function contentHash(snapshot: Snapshot): string {
  const strip = (e: CalendarEvent) => {
    const { createdAt, updatedAt, updatedBy, review, ...rest } = e;
    void createdAt;
    void updatedAt;
    void updatedBy;
    void review;
    return rest;
  };
  const { review, ...cal } = snapshot.calendar;
  void review;
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ cal, events: snapshot.events.map(strip) }))
    .digest('hex');
}

function mapCalendar(db: Database, r: CalendarRow, events?: CalendarEvent[]): Calendar {
  const evs = events ?? listEvents(db, r.id);
  const scope = json<CalendarScope>(r.scope_json, { modality: '', courses: [], exceptions: [], cohorts: [], audienceLabel: '' });
  const review = json<ReviewState>(r.review_json, { issues: [], acknowledged: [], confidence: 1 });
  const legend = json<LegendEntry[]>(r.legend_json, []);
  const notes = json<CalendarNote[]>(r.notes_json, []);
  const file = r.source_file_id ? db.get<{ original_name: string }>('SELECT original_name FROM files WHERE id = ?', [r.source_file_id]) : undefined;
  // quantos itens pedem atenção (eventos com pendência + pendências gerais), não quantos problemas
  // (importância e âncora são decisão editorial, não pendência de leitura — ficam fora)
  const reading = (code: string) => code !== 'importance_unset' && code !== 'anchor_unconfirmed';
  const pendingCount =
    evs.filter((e) => openEventIssues(e).some((i) => i.severity === 'blocker' && reading(i.code))).length +
    openCalendarIssues({ review }).filter((i) => i.severity === 'blocker').length;
  const snapshotHash = r.published_hash ? contentHash({ calendar: { title: r.title, year: r.year, semester: r.semester as 1 | 2 | null, scope, legend, notes, review, modifiedFromSource: Boolean(r.modified_from_source) }, events: evs }) : null;

  return {
    id: r.id,
    title: r.title,
    year: r.year,
    semester: r.semester as 1 | 2 | null,
    scope,
    status: r.status,
    publishedVersion: r.published_version_number,
    hasUnpublishedChanges: r.published_hash !== null && snapshotHash !== r.published_hash,
    eventCount: evs.length,
    pendingCount,
    sourceFileId: r.source_file_id,
    sourceFileName: file?.original_name ?? null,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    legend,
    notes,
    review,
    extraction: json<ExtractionReport | null>(r.extraction_json, null),
    modifiedFromSource: Boolean(r.modified_from_source),
    version: r.version,
  };
}

export function getCalendarRow(db: Database, id: string): CalendarRow | undefined {
  return db.get<CalendarRow>('SELECT * FROM calendars WHERE id = ?', [id]);
}

export function getCalendar(db: Database, id: string): Calendar | undefined {
  const r = getCalendarRow(db, id);
  return r && mapCalendar(db, r);
}

export function listCalendars(db: Database): Calendar[] {
  return db.all<CalendarRow>('SELECT * FROM calendars ORDER BY updated_at DESC').map((r) => mapCalendar(db, r));
}

export function insertCalendar(
  db: Database,
  c: {
    id: string;
    title: string;
    year: number | null;
    semester: 1 | 2 | null;
    scope: CalendarScope;
    legend: LegendEntry[];
    notes: CalendarNote[];
    review: ReviewState;
    extraction: ExtractionReport | null;
    sourceFileId: string | null;
    actor: string;
  },
) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO calendars (id, title, year, semester, scope_json, status, legend_json, notes_json, review_json, extraction_json,
       source_file_id, version, created_at, created_by, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [
      c.id,
      c.title,
      c.year,
      c.semester,
      JSON.stringify(c.scope),
      JSON.stringify(c.legend),
      JSON.stringify(c.notes),
      JSON.stringify(c.review),
      c.extraction ? JSON.stringify(c.extraction) : null,
      c.sourceFileId,
      now,
      c.actor,
      now,
      c.actor,
    ],
  );
}

export function updateCalendarRow(
  db: Database,
  id: string,
  patch: Partial<{
    title: string;
    year: number | null;
    semester: number | null;
    scope: CalendarScope;
    status: CalendarStatus;
    legend: LegendEntry[];
    notes: CalendarNote[];
    review: ReviewState;
    modifiedFromSource: boolean;
    publishedVersionId: string | null;
    publishedVersionNumber: number | null;
    publishedHash: string | null;
  }>,
  actor: string,
) {
  const sets: string[] = ['updated_at = ?', 'updated_by = ?'];
  const params: (string | number | null)[] = [new Date().toISOString(), actor];
  const col = (c: string, v: string | number | null) => {
    sets.push(`${c} = ?`);
    params.push(v);
  };
  if (patch.title !== undefined) col('title', patch.title);
  if (patch.year !== undefined) col('year', patch.year);
  if (patch.semester !== undefined) col('semester', patch.semester);
  if (patch.scope !== undefined) col('scope_json', JSON.stringify(patch.scope));
  if (patch.status !== undefined) col('status', patch.status);
  if (patch.legend !== undefined) col('legend_json', JSON.stringify(patch.legend));
  if (patch.notes !== undefined) col('notes_json', JSON.stringify(patch.notes));
  if (patch.review !== undefined) col('review_json', JSON.stringify(patch.review));
  if (patch.modifiedFromSource !== undefined) col('modified_from_source', patch.modifiedFromSource ? 1 : 0);
  if (patch.publishedVersionId !== undefined) col('published_version_id', patch.publishedVersionId);
  if (patch.publishedVersionNumber !== undefined) col('published_version_number', patch.publishedVersionNumber);
  if (patch.publishedHash !== undefined) col('published_hash', patch.publishedHash);
  params.push(id);
  db.run(`UPDATE calendars SET ${sets.join(', ')} WHERE id = ?`, params);
}

export function snapshotOf(calendar: Calendar, events: CalendarEvent[]): Snapshot {
  return {
    calendar: {
      title: calendar.title,
      year: calendar.year,
      semester: calendar.semester,
      scope: calendar.scope,
      legend: calendar.legend,
      notes: calendar.notes,
      review: calendar.review,
      modifiedFromSource: calendar.modifiedFromSource,
    },
    events,
  };
}

/** Grava uma nova versão (fotografia) e avança o contador do calendário. */
export function addVersion(
  db: Database,
  calendarId: string,
  kind: CalendarVersionSummary['kind'],
  summary: string,
  actor: string,
  published = false,
): CalendarVersionSummary {
  return db.tx(() => {
    const calendar = getCalendar(db, calendarId)!;
    const events = listEvents(db, calendarId);
    const number = (db.get<{ n: number | null }>('SELECT MAX(number) AS n FROM calendar_versions WHERE calendar_id = ?', [calendarId])?.n ?? 0) + 1;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO calendar_versions (id, calendar_id, number, kind, summary, snapshot_json, created_at, created_by, published, event_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, calendarId, number, kind, summary, JSON.stringify(snapshotOf(calendar, events)), now, actor, published ? 1 : 0, events.length],
    );
    db.run('UPDATE calendars SET version = ? WHERE id = ?', [number, calendarId]);
    return { id, calendarId, number, kind, summary, createdAt: now, createdBy: actor, published, eventCount: events.length };
  });
}

interface VersionRow {
  id: string;
  calendar_id: string;
  number: number;
  kind: CalendarVersionSummary['kind'];
  summary: string;
  created_at: string;
  created_by: string;
  published: number;
  event_count: number;
}

export function listVersions(db: Database, calendarId: string): CalendarVersionSummary[] {
  return db
    .all<VersionRow>(
      'SELECT id, calendar_id, number, kind, summary, created_at, created_by, published, event_count FROM calendar_versions WHERE calendar_id = ? ORDER BY number DESC',
      [calendarId],
    )
    .map((r) => ({
      id: r.id,
      calendarId: r.calendar_id,
      number: r.number,
      kind: r.kind,
      summary: r.summary,
      createdAt: r.created_at,
      createdBy: r.created_by,
      published: Boolean(r.published),
      eventCount: r.event_count,
    }));
}

export function getVersionSnapshot(db: Database, calendarId: string, versionId: string): (Snapshot & { number: number; createdAt: string }) | undefined {
  const r = db.get<{ snapshot_json: string; number: number; created_at: string }>(
    'SELECT snapshot_json, number, created_at FROM calendar_versions WHERE calendar_id = ? AND id = ?',
    [calendarId, versionId],
  );
  return r ? { ...(JSON.parse(r.snapshot_json) as Snapshot), number: r.number, createdAt: r.created_at } : undefined;
}

export function findCalendarsBySourceFile(db: Database, fileId: string): { id: string; title: string }[] {
  return db.all<{ id: string; title: string }>("SELECT id, title FROM calendars WHERE source_file_id = ? AND status != 'archived'", [fileId]);
}
