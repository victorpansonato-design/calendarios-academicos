import type { Cohort, JobStatus, Shift, StudentView } from '@calendarios/core';
import { buildStudentView, canHide, coveredByCalendarReminders, eventsToIcs, icsFileName, instantToWall, STUDENT_ID_PATTERN, todayIn } from '@calendarios/core';
import type { AppContext } from './context';
import { badRequest, conflict, notFound } from './errors';
import { publicCalendar, publishedSnapshot } from './calendars';
import { cancelFavorite, scheduleFavorite } from './notifications';
import * as marks from '../repositories/students';
import { studentReminders } from '../repositories/notifications';
import { getPreference } from '../repositories/lifecycle';

/* ==========================================================================
   Visão do aluno (chamada pelo backend do portal/app)
   --------------------------------------------------------------------------
   Quem identifica o aluno é o backend do portal/app, autenticado pela chave
   STUDENT_API_KEY. Esta API confia no `studentId` que ele envia — por isso a
   chave é obrigatória e as rotas respondem 503 sem ela.

   Tudo aqui lê a versão PUBLICADA; o rascunho nunca chega ao aluno.
   ========================================================================== */

const MAX_MARKS = 300;
const SHIFTS: Shift[] = ['Diurno', 'Noturno', 'Matutino', 'Vespertino', 'Integral'];

export function studentIdField(v: unknown): string {
  const s = String(v ?? '');
  if (!STUDENT_ID_PATTERN.test(s)) throw badRequest('Identificador do aluno inválido.');
  return s;
}

export interface ViewQuery {
  cohort?: Cohort | null;
  shift?: Shift | null;
  category?: string | null;
  query?: string;
}

export function viewQuery(q: Record<string, string | undefined>): ViewQuery {
  const cohort = q.cohort ? (q.cohort === 'ingressantes' || q.cohort === 'veteranos' ? q.cohort : null) : null;
  if (q.cohort && !cohort) throw badRequest('Coorte inválida (ingressantes ou veteranos).');
  const shift = q.shift ? (SHIFTS.find((s) => s.toLowerCase() === q.shift!.toLowerCase()) ?? null) : null;
  if (q.shift && !shift) throw badRequest('Turno inválido.');
  return { cohort, shift, category: q.category?.slice(0, 120) || null, query: q.q?.slice(0, 120) || undefined };
}

function requireEvent(ctx: AppContext, calendarId: string, eventUid: string) {
  const snap = publishedSnapshot(ctx, calendarId);
  if (!snap) throw notFound('Calendário publicado');
  const event = snap.events.find((e) => e.uid === eventUid && e.datesResolved);
  if (!event) throw notFound('Evento');
  return { snap, event };
}

function reminderView(ctx: AppContext, studentId: string, calendarId: string, eventUid?: string) {
  return studentReminders(ctx.db, studentId, calendarId)
    .filter((j) => !eventUid || j.eventUid === eventUid)
    .filter((j) => (['scheduled', 'blocked', 'sent', 'demo_sent'] as JobStatus[]).includes(j.status))
    .map((j) => ({ eventUid: j.eventUid, sendAt: j.sendAt, status: j.status, offsetLabel: j.context.offsetLabel ?? '', title: j.title, body: j.body }));
}

export function getMarks(ctx: AppContext, studentId: string, calendarId: string) {
  if (!publishedSnapshot(ctx, calendarId)) throw notFound('Calendário publicado');
  const rows = marks.listMarks(ctx.db, studentId, calendarId);
  return {
    starred: rows.filter((r) => r.mark === 'star').map((r) => r.eventUid),
    hidden: rows.filter((r) => r.mark === 'hide').map((r) => r.eventUid),
    reminders: reminderView(ctx, studentId, calendarId),
  };
}

function remindNote(sendAt: string): string {
  const w = instantToWall(sendAt);
  return `Lembrete agendado para ${w.date.slice(8, 10)}/${w.date.slice(5, 7)} às ${w.time.replace(':', 'h')}.`;
}

export function star(ctx: AppContext, studentId: string, calendarId: string, eventUid: string) {
  return ctx.db.tx(() => {
    const { snap, event } = requireEvent(ctx, calendarId, eventUid);
    if (marks.getMark(ctx.db, studentId, calendarId, eventUid) === null && marks.countMarks(ctx.db, studentId, calendarId) >= MAX_MARKS)
      throw badRequest(`Limite de ${MAX_MARKS} marcações por calendário.`);
    marks.upsertMark(ctx.db, studentId, calendarId, eventUid, 'star', ctx.now().toISOString());
    const covered = coveredByCalendarReminders(event);
    const jobs = covered ? [] : scheduleFavorite(ctx, { id: calendarId, title: snap.calendar.title }, event, studentId);
    const pref = getPreference(ctx.db, studentId);
    const reminders = reminderView(ctx, studentId, calendarId, eventUid);
    const note = covered
      ? 'Você já recebe o aviso deste evento.'
      : jobs.length
        ? remindNote(jobs[0].sendAt)
        : 'O horário do lembrete já passou.';
    return { mark: 'star' as const, coveredByCalendar: covered, pushOptIn: pref ? pref.pushOptIn : null, reminders, note };
  });
}

export function unstar(ctx: AppContext, studentId: string, calendarId: string, eventUid: string) {
  return ctx.db.tx(() => {
    if (!publishedSnapshot(ctx, calendarId)) throw notFound('Calendário publicado');
    if (marks.getMark(ctx.db, studentId, calendarId, eventUid) === 'star') marks.deleteMark(ctx.db, studentId, calendarId, eventUid);
    const canceled = cancelFavorite(ctx, calendarId, studentId, eventUid, 'O aluno desmarcou o evento');
    return { mark: null, canceled };
  });
}

export function hide(ctx: AppContext, studentId: string, calendarId: string, eventUid: string) {
  return ctx.db.tx(() => {
    const { event } = requireEvent(ctx, calendarId, eventUid);
    if (event.importance === 'high') throw conflict('Eventos de importância Alta não podem ser ocultados.');
    if (!canHide(event.importance)) throw badRequest('Só eventos de importância Média podem ser ocultados dos Importantes.');
    marks.upsertMark(ctx.db, studentId, calendarId, eventUid, 'hide', ctx.now().toISOString());
    const canceled = cancelFavorite(ctx, calendarId, studentId, eventUid, 'O aluno ocultou o evento');
    return { mark: 'hide' as const, canceled };
  });
}

export function unhide(ctx: AppContext, studentId: string, calendarId: string, eventUid: string) {
  return ctx.db.tx(() => {
    if (!publishedSnapshot(ctx, calendarId)) throw notFound('Calendário publicado');
    if (marks.getMark(ctx.db, studentId, calendarId, eventUid) === 'hide') marks.deleteMark(ctx.db, studentId, calendarId, eventUid);
    return { mark: null };
  });
}

export function view(ctx: AppContext, studentId: string, calendarId: string, q: ViewQuery): StudentView {
  const cal = publicCalendar(ctx, calendarId);
  if (!cal) throw notFound('Calendário publicado');
  const m = getMarks(ctx, studentId, calendarId);
  return buildStudentView(cal, { today: todayIn(ctx.now()), ...q, starred: m.starred, hidden: m.hidden });
}

/** "Adicionar todos os meus importantes à agenda". */
export function importantesIcs(ctx: AppContext, studentId: string, calendarId: string, q: ViewQuery) {
  const cal = publicCalendar(ctx, calendarId)!;
  const v = view(ctx, studentId, calendarId, { ...q, category: null, query: undefined });
  const uids = new Set([...v.importantes, ...v.importantesPast].map((i) => i.uid));
  return {
    filename: icsFileName(`${cal.title} - importantes`),
    body: eventsToIcs(cal, cal.events.filter((e) => uids.has(e.uid)), { now: ctx.now(), shift: q.shift }),
  };
}

/** Um evento para a agenda (leitura pública, sem aluno). */
export function eventIcs(ctx: AppContext, calendarId: string, eventUid: string, shift: Shift | null) {
  const cal = publicCalendar(ctx, calendarId);
  if (!cal) throw notFound('Calendário publicado');
  const ev = cal.events.find((e) => e.uid === eventUid);
  if (!ev) throw notFound('Evento');
  return { filename: icsFileName(ev.title), body: eventsToIcs(cal, [ev], { now: ctx.now(), shift }) };
}
