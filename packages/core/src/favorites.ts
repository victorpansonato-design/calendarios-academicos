import type { CalendarEvent, ISODate, NotificationJob, PlannedFavoriteReminder, PublicCalendarEvent, ReminderOffset } from './types';
import { addDays } from './dates';
import {
  DEFAULT_REMINDER_TIME,
  type PlanContext,
  offsetLabel,
  reminderBlockReason,
  reminderOccurrences,
  renderReminder,
  wallTimeToInstant,
} from './schedule';

/* ==========================================================================
   Favoritos do aluno
   --------------------------------------------------------------------------
   Quando o aluno marca um evento com estrela, ele passa a receber um lembrete
   daquele evento — só ele, com o MESMO texto do aviso do calendário.

     · Se o calendário já manda aviso desse evento para todos, a estrela não
       agenda nada: o aluno já vai receber (sem push duplicado).
     · Senão, 1 dia antes às 09h, respeitando a âncora do evento (início ou
       fim do período, cada data de uma lista).
     · Nada no passado e nada imediato: a confirmação aparece na tela.
   ========================================================================== */

export const FAVORITE_DEFAULT_OFFSET: ReminderOffset = { id: 'fav-d1', daysBefore: 1, time: DEFAULT_REMINDER_TIME };

/** Evento interno ou público: o que o planejamento precisa. */
export type FavoriteSource =
  | CalendarEvent
  | (Pick<PublicCalendarEvent, 'uid' | 'title' | 'dates' | 'times' | 'pushTitle' | 'pushBody' | 'anchor' | 'calendarReminder'> & { datesResolved?: boolean });

/** O id do aluno vai dentro da chave de idempotência: não pode ter ":". */
export const STUDENT_ID_PATTERN = /^[A-Za-z0-9._@-]{1,120}$/;

export function favoriteReminderKey(calendarId: string, eventUid: string, offsetId: string, occurrence: string, studentId: string): string {
  return `fav:${calendarId}:${eventUid}:${offsetId}:${occurrence}:${studentId}`;
}

/** O calendário já avisa todo mundo deste evento? */
export function coveredByCalendarReminders(event: FavoriteSource): boolean {
  if ('notification' in event) return reminderBlockReason(event) === null;
  return event.calendarReminder.enabled;
}

function asSource(event: FavoriteSource) {
  if ('notification' in event)
    return { ...event, pushTitle: event.notification.pushTitle, pushBody: event.notification.pushBody, anchor: event.notification.anchor, resolved: event.datesResolved };
  return { ...event, resolved: event.datesResolved !== false };
}

export function planFavoriteReminders(event: FavoriteSource, ctx: PlanContext & { studentId: string }): PlannedFavoriteReminder[] {
  const src = asSource(event);
  if (!src.resolved || coveredByCalendarReminders(event)) return [];
  const offset = FAVORITE_DEFAULT_OFFSET;
  const out: PlannedFavoriteReminder[] = [];
  for (const occ of reminderOccurrences({ dates: src.dates, notification: { anchor: src.anchor } as CalendarEvent['notification'] })) {
    const sendAt = wallTimeToInstant(addDays(occ.date, -offset.daysBefore), offset.time as string);
    if (new Date(sendAt).getTime() <= ctx.now.getTime()) continue;
    out.push({
      idempotencyKey: favoriteReminderKey(ctx.calendarId, src.uid, offset.id, occ.key, ctx.studentId),
      calendarId: ctx.calendarId,
      eventUid: src.uid,
      offsetId: offset.id,
      occurrence: occ.date as ISODate,
      sendAt,
      ...renderReminder(src, occ, offset, ctx.calendarTitle),
      channel: 'push',
      offsetLabel: offsetLabel(offset),
      eventTitle: src.title,
      studentId: ctx.studentId,
    });
  }
  return out;
}

/** Todos os lembretes de favorito de um calendário, para reconciliar na publicação. */
export function planCalendarFavorites(
  events: CalendarEvent[],
  stars: { studentId: string; eventUid: string }[],
  ctx: PlanContext,
): PlannedFavoriteReminder[] {
  const byUid = new Map(events.map((e) => [e.uid, e]));
  return stars
    .flatMap((s) => {
      const e = byUid.get(s.eventUid);
      return e ? planFavoriteReminders(e, { ...ctx, studentId: s.studentId }) : [];
    })
    .sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}

/** Motivo legível de um lembrete de favorito que deixou de existir. */
export function favoriteCancelReason(job: NotificationJob, eventsByUid: Map<string, CalendarEvent>): string {
  const e = job.eventUid ? eventsByUid.get(job.eventUid) : undefined;
  if (!e) return 'Evento removido do calendário';
  if (coveredByCalendarReminders(e)) return 'O evento passou a ter aviso para todo o calendário';
  return 'Data alterada ou horário já passou';
}
