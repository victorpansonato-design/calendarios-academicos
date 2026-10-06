import type {
  CalendarEvent,
  EventDates,
  EventNotificationRule,
  Importance,
  ISODate,
  ISOInstant,
  NotificationJob,
  PlannedReminder,
  ReminderDiff,
  ReminderOffset,
  WallTime,
} from './types';
import { TIME_ZONE } from './types';
import { addDays, formatDates } from './dates';
import { DEFAULT_REMINDER_BODY, DEFAULT_REMINDER_TITLE, renderTemplate } from './templates';

/* ==========================================================================
   Agenda de avisos
   --------------------------------------------------------------------------
   Aviso e importância são decisões separadas. A importância diz onde o evento
   aparece para o aluno ("Importantes" ou só o calendário completo); o aviso
   diz se sai push para todo o público do calendário, e quando. Só
   `notification.enabled` governa os lembretes.

   A importância ainda SUGERE avisos no editor (nunca em lote, nunca sozinha):

     Baixa  — nenhum aviso
     Média  — 1 push, 1 dia antes
     Alta   — 2 pushes, 3 dias e 1 dia antes

   Garantias deste módulo (todas testadas):

     · Horário de parede sempre em America/Sao_Paulo, convertido para UTC aqui
       e só aqui. O fuso é resolvido pelo Intl, então se o horário de verão
       voltar a existir, a conta continua certa.
     · Nada é agendado no passado. Um lembrete cujo horário já passou não é
       criado — não existe aviso retroativo.
     · Aviso desligado, data pendente ou âncora de período ainda não
       conferida = zero lembretes.
     · Cada lembrete tem uma chave de idempotência estável. Replanejar o mesmo
       calendário produz as mesmas chaves, e o banco rejeita a segunda cópia.
   ========================================================================== */

export const DEFAULT_REMINDER_TIME: WallTime = '09:00';

/** Avisos sugeridos para uma importância — só sugestão, aplicada por uma pessoa. */
export function defaultOffsets(importance: Importance): ReminderOffset[] {
  if (importance === 'medium') return [{ id: 'd1', daysBefore: 1, time: DEFAULT_REMINDER_TIME }];
  if (importance === 'high')
    return [
      { id: 'd3', daysBefore: 3, time: DEFAULT_REMINDER_TIME },
      { id: 'd1', daysBefore: 1, time: DEFAULT_REMINDER_TIME },
    ];
  return [];
}

export function defaultNotificationRule(anchor: EventNotificationRule['anchor']): EventNotificationRule {
  return {
    enabled: false,
    offsets: [],
    anchor,
    anchorConfirmed: false,
    pushTitle: DEFAULT_REMINDER_TITLE,
    pushBody: DEFAULT_REMINDER_BODY,
    customized: false,
  };
}

/** Aplica a sugestão de avisos da importância (botão "Usar sugestão" do editor). */
export function suggestedReminders(rule: EventNotificationRule, importance: Importance): EventNotificationRule {
  const offsets = defaultOffsets(importance);
  return { ...rule, enabled: offsets.length > 0, offsets, customized: true };
}

/* -- Fuso horário --------------------------------------------------------- */

const partsFormatter = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = partsFormatter.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatter.set(tz, f);
  }
  return f;
}

/** Deslocamento do fuso (minutos) num instante: São Paulo = -180. */
export function tzOffsetMinutes(instant: Date, tz: string = TIME_ZONE): number {
  const parts = Object.fromEntries(formatterFor(tz).formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** "2026-09-27" + "09:00" em São Paulo → instante UTC. */
export function wallTimeToInstant(date: ISODate, time: WallTime, tz: string = TIME_ZONE): ISOInstant {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  // duas passadas resolvem fronteiras de horário de verão
  let offset = tzOffsetMinutes(new Date(naive), tz);
  offset = tzOffsetMinutes(new Date(naive - offset * 60000), tz);
  return new Date(naive - offset * 60000).toISOString();
}

/** Instante UTC → data e hora de parede em São Paulo. */
export function instantToWall(instant: ISOInstant | Date, tz: string = TIME_ZONE): { date: ISODate; time: WallTime } {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = Object.fromEntries(formatterFor(tz).formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/* -- Planejamento --------------------------------------------------------- */

export interface PlanContext {
  calendarId: string;
  calendarTitle: string;
  now: Date;
}

export function reminderKey(calendarId: string, eventUid: string, offsetId: string, occurrence: string): string {
  return `rem:${calendarId}:${eventUid}:${offsetId}:${occurrence}`;
}

/** Datas de referência para os lembretes, conforme a âncora. */
export function reminderOccurrences(event: Pick<CalendarEvent, 'dates' | 'notification'>): { date: ISODate; key: string; milestone: 'começa' | 'termina' | 'acontece' }[] {
  const { dates, notification } = event;
  if (dates.kind === 'single') return [{ date: dates.start, key: 'main', milestone: 'acontece' }];
  if (dates.kind === 'range')
    return notification.anchor === 'end'
      ? [{ date: dates.end, key: 'main', milestone: 'termina' }]
      : [{ date: dates.start, key: 'main', milestone: 'começa' }];
  if (notification.anchor === 'first') return [{ date: dates.dates[0], key: 'main', milestone: 'acontece' }];
  return dates.dates.map((d) => ({ date: d, key: d, milestone: 'acontece' as const }));
}

function leadPhrase(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `em ${days} dias`;
}

export function offsetLabel(o: ReminderOffset): string {
  return o.time ? `${momentLabel(o.daysBefore)}, às ${o.time.replace(':', 'h')}` : `${momentLabel(o.daysBefore)}, sem horário`;
}

/** Por que um evento não gera lembrete — ou null se gera. */
export function reminderBlockReason(event: Pick<CalendarEvent, 'notification' | 'datesResolved' | 'dates'>): string | null {
  if (!event.notification.enabled) return 'Sem aviso para este evento';
  if (!event.datesResolved) return 'Data pendente de revisão';
  if (event.notification.offsets.length === 0) return 'Nenhum momento de aviso marcado';
  if (event.notification.offsets.some((o) => !o.time)) return 'Falta o horário do aviso';
  if (event.dates.kind === 'range' && !event.notification.anchorConfirmed)
    return 'Falta dizer se o aviso é sobre o começo ou o fim do período';
  return null;
}

/* -- Momentos de aviso (no dia, 1 dia antes, 3 dias antes…) --------------- */

/** Os momentos oferecidos na tela, em dias de antecedência. */
export const REMINDER_MOMENTS = [0, 1, 3] as const;

export function momentLabel(daysBefore: number): string {
  return daysBefore === 0 ? 'No dia' : daysBefore === 1 ? '1 dia antes' : `${daysBefore} dias antes`;
}

/**
 * Define os avisos de um evento: os dias de antecedência e UM horário de envio
 * para todos. Horário vazio é aceito aqui, mas trava a publicação.
 */
export function setReminderMoments(rule: EventNotificationRule, days: readonly number[], time: WallTime | ''): EventNotificationRule {
  const unique = [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 60).sort((a, b) => b - a);
  return {
    ...rule,
    enabled: unique.length > 0,
    offsets: unique.map((d) => ({ id: `d${d}`, daysBefore: d, time })),
    customized: true,
  };
}

/** Horário de envio comum aos avisos ('' se não informado ou se diferem). */
export function reminderTime(rule: EventNotificationRule): WallTime | '' {
  const times = [...new Set(rule.offsets.map((o) => o.time))];
  return times.length === 1 ? times[0] : '';
}

export type ReminderOccurrence = ReturnType<typeof reminderOccurrences>[number];

/** O mínimo para montar o texto de um aviso (serve ao evento interno e ao público). */
export type ReminderSource = Pick<CalendarEvent, 'title' | 'dates' | 'times'> & { pushTitle: string; pushBody: string };

/**
 * Texto do aviso de uma ocorrência. Os avisos para todos e os lembretes de
 * favorito passam por aqui — por isso o aluno recebe exatamente o mesmo texto.
 */
export function renderReminder(
  event: ReminderSource,
  occ: ReminderOccurrence,
  offset: Pick<ReminderOffset, 'daysBefore'>,
  calendarTitle: string,
): { title: string; body: string } {
  const horario = event.times.map((t) => (t.shift ? `${t.shift} ${t.time.replace(':', 'h')}` : t.time.replace(':', 'h'))).join(' · ');
  const values = {
    'evento.titulo': event.title,
    'evento.data': event.dates.kind === 'list' && occ.key !== 'main' ? formatDates(singleDay(event.dates, occ.date)) : formatDates(event.dates),
    'evento.antecedencia': leadPhrase(offset.daysBefore),
    'evento.marco': occ.milestone,
    'evento.horario': horario,
    'calendario.nome': calendarTitle,
  };
  return {
    title: renderTemplate(event.pushTitle || DEFAULT_REMINDER_TITLE, values).text,
    body: renderTemplate(event.pushBody || DEFAULT_REMINDER_BODY, values).text,
  };
}

function singleDay(dates: EventDates, date: ISODate): EventDates {
  return { ...dates, kind: 'single', start: date, end: date };
}

export function planEventReminders(event: CalendarEvent, ctx: PlanContext): PlannedReminder[] {
  if (reminderBlockReason(event)) return [];
  const out: PlannedReminder[] = [];
  const source = { ...event, pushTitle: event.notification.pushTitle, pushBody: event.notification.pushBody };

  for (const occ of reminderOccurrences(event)) {
    for (const offset of event.notification.offsets) {
      if (!offset.time) continue;
      const sendDate = addDays(occ.date, -offset.daysBefore);
      const sendAt = wallTimeToInstant(sendDate, offset.time);
      if (new Date(sendAt).getTime() <= ctx.now.getTime()) continue; // sem aviso retroativo

      out.push({
        idempotencyKey: reminderKey(ctx.calendarId, event.uid, offset.id, occ.key),
        calendarId: ctx.calendarId,
        eventUid: event.uid,
        offsetId: offset.id,
        occurrence: occ.date,
        sendAt,
        ...renderReminder(source, occ, offset, ctx.calendarTitle),
        channel: 'push',
        offsetLabel: offsetLabel(offset),
        eventTitle: event.title,
      });
    }
  }
  return out;
}

export function planCalendarReminders(events: CalendarEvent[], ctx: PlanContext): PlannedReminder[] {
  return events.flatMap((e) => planEventReminders(e, ctx)).sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}

/**
 * Compara os lembretes ativos (agendados ou aguardando configuração) com o
 * plano da versão nova. Envios já feitos nunca entram aqui — o passado não muda.
 */
export function diffReminders<P extends PlannedReminder>(active: NotificationJob[], planned: P[]): ReminderDiff<P> {
  const byKey = new Map(planned.map((p) => [p.idempotencyKey, p]));
  const plannedUids = new Set(planned.map((p) => p.eventUid));
  const diff: ReminderDiff<P> = { create: [], update: [], cancel: [], unchanged: 0 };

  for (const job of active) {
    const next = byKey.get(job.idempotencyKey);
    if (!next) {
      diff.cancel.push({
        job,
        reason: job.eventUid && plannedUids.has(job.eventUid) ? 'Data ou antecedência alterada' : 'Evento removido, sem aviso ou com data já passada',
      });
      continue;
    }
    byKey.delete(job.idempotencyKey);
    if (next.sendAt !== job.sendAt || next.title !== job.title || next.body !== job.body) diff.update.push({ before: job, after: next });
    else diff.unchanged += 1;
  }
  diff.create = [...byKey.values()];
  return diff;
}

/** Chave de entrega: muda se o horário mudar, para o provedor não descartar um reagendamento. */
export function deliveryKey(idempotencyKey: string, sendAt: ISOInstant): string {
  return `${idempotencyKey}@${sendAt}`;
}
