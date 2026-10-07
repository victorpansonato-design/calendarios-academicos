import type { EventTime, PublicCalendar, PublicCalendarEvent, Shift } from './types';
import { addDays } from './dates';
import { wallTimeToInstant } from './schedule';
import { slug } from './text';

/* ==========================================================================
   "Adicionar à agenda" (.ics, RFC 5545)
   --------------------------------------------------------------------------
   Funciona no Google Agenda, Outlook e Calendário do iPhone.

     · Dia inteiro usa DTEND exclusivo (dia seguinte ao fim).
     · Lista de datas vira um VEVENT por data (RDATE tem suporte irregular).
     · Horário só quando há uma data e UM horário para o turno do aluno;
       vai em UTC, sem precisar de VTIMEZONE.
     · UID estável e SEQUENCE = versão: reimportar atualiza, não duplica.
     · Sem alarme: o lembrete é o push, não o celular.
   ========================================================================== */

export interface IcsOptions {
  now: Date;
  shift?: Shift | null;
  uidDomain?: string;
}

type IcsCalendar = Pick<PublicCalendar, 'id' | 'title' | 'version'>;

const CRLF = '\r\n';

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Dobra linhas em 75 octetos (UTF-8), sem partir um caractere acentuado. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuação começa com espaço
    if (size + n > limit) {
      out.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join(`${CRLF} `);
}

function basicDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function basicInstant(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function shiftTimes(times: EventTime[], shift: Shift | null | undefined): EventTime[] {
  if (!shift) return times;
  const own = times.filter((t) => t.shift === shift || t.shift === null);
  return own.length ? own : times;
}

function vevents(cal: IcsCalendar, ev: PublicCalendarEvent, o: IcsOptions): string[][] {
  const domain = o.uidDomain ?? 'calendarios.anchieta.br';
  const times = shiftTimes(ev.times, o.shift);
  const timeText = times.map((t) => (t.shift ? `${t.shift}: ${t.time.replace(':', 'h')}` : t.time.replace(':', 'h'))).join(' · ');
  const description = [ev.description, timeText && `Horário: ${timeText}`, ...ev.notes, ...ev.urls, `Fonte: ${cal.title}`].filter(Boolean).join('\n');
  const common = (uid: string) => [
    `UID:${uid}@${domain}`,
    `DTSTAMP:${basicInstant(o.now.toISOString())}`,
    `SEQUENCE:${cal.version}`,
    `SUMMARY:${escapeText(ev.title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(ev.location ? [`LOCATION:${escapeText(ev.location)}`] : []),
    ...(ev.urls[0] ? [`URL:${ev.urls[0]}`] : []),
  ];
  const allDay = (start: string, end: string) => [`DTSTART;VALUE=DATE:${basicDate(start)}`, `DTEND;VALUE=DATE:${basicDate(addDays(end, 1))}`];

  if (ev.dates.kind === 'list') return ev.dates.dates.map((d) => [...common(`${ev.uid}-${d}`), ...allDay(d, d)]);
  if (ev.dates.kind === 'single' && times.length === 1) {
    const start = wallTimeToInstant(ev.dates.start, times[0].time);
    return [[...common(ev.uid), `DTSTART:${basicInstant(start)}`, 'DURATION:PT1H']];
  }
  return [[...common(ev.uid), ...allDay(ev.dates.start, ev.dates.end)]];
}

export function eventsToIcs(cal: IcsCalendar, events: PublicCalendarEvent[], o: IcsOptions): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grupo Anchieta//Calendario academico//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(cal.title)}`,
    ...events.flatMap((ev) => vevents(cal, ev, o).flatMap((body) => ['BEGIN:VEVENT', ...body, 'END:VEVENT'])),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

export function eventToIcs(cal: IcsCalendar, ev: PublicCalendarEvent, o: IcsOptions): string {
  return eventsToIcs(cal, [ev], o);
}

export function icsFileName(title: string): string {
  return `${slug(title)}.ics`;
}
