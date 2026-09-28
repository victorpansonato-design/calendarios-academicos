import type { CalendarEvent, ISODate, LegendEntry } from '@calendarios/core';
import { compareISO, fromISO, occupiedDays, toISO } from '@calendarios/core';

/* ==========================================================================
   Grade de calendário
   --------------------------------------------------------------------------
   Um evento é UM registro, mesmo que ocupe vinte dias em dois meses. A grade
   não copia eventos: ela monta um índice data → eventos, e cada célula lê
   desse índice. Editar o evento atualiza todas as células de uma vez.
   ========================================================================== */

export type DayIndex = Map<ISODate, CalendarEvent[]>;

export function indexByDay(events: CalendarEvent[]): DayIndex {
  const idx: DayIndex = new Map();
  for (const e of events) {
    if (!e.datesResolved || !e.dates.start) continue;
    for (const d of occupiedDays(e.dates)) {
      const list = idx.get(d);
      if (list) list.push(e);
      else idx.set(d, [e]);
    }
  }
  return idx;
}

/** Semanas do mês, começando no domingo, com null nas casas vazias. */
export function monthWeeks(year: number, month: number): (ISODate | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (ISODate | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => toISO(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  const weeks: (ISODate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Meses a mostrar: os do semestre, estendidos para cobrir qualquer evento fora dele. */
export function calendarMonths(year: number | null, semester: 1 | 2 | null, events: CalendarEvent[]): { year: number; month: number }[] {
  const resolved = events.filter((e) => e.datesResolved && e.dates.start);
  const y = year ?? (resolved[0] ? fromISO(resolved[0].dates.start).year : new Date().getFullYear());
  let start = toISO(y, semester === 1 ? 1 : 7, 1);
  let end = toISO(y, semester === 1 ? 6 : 12, 1);
  for (const e of resolved) {
    const s = e.dates.start.slice(0, 8) + '01';
    const f = e.dates.end.slice(0, 8) + '01';
    // eventos que cobrem meses fora do semestre só estendem a grade até 2 meses
    if (compareISO(s, start) < 0 && monthsBetween(s, start) <= 2) start = s;
    if (compareISO(f, end) > 0 && monthsBetween(end, f) <= 2) end = f;
  }
  const out: { year: number; month: number }[] = [];
  let cur = fromISO(start);
  const last = fromISO(end);
  while (cur.year < last.year || (cur.year === last.year && cur.month <= last.month)) {
    out.push({ year: cur.year, month: cur.month });
    cur = cur.month === 12 ? { year: cur.year + 1, month: 1, day: 1 } : { ...cur, month: cur.month + 1 };
  }
  return out;
}

function monthsBetween(a: ISODate, b: ISODate): number {
  const x = fromISO(a);
  const y = fromISO(b);
  return (y.year - x.year) * 12 + (y.month - x.month);
}

/** Períodos de mais de 3 semanas (inscrições, DP) são "fundo": como no PDF, só
    pintam o dia quando não há evento pontual nele, e não entram na contagem. */
export const LONG_RANGE_DAYS = 21;

export function isBackground(e: CalendarEvent): boolean {
  return e.dates.kind === 'range' && occupiedDays(e.dates).length > LONG_RANGE_DAYS;
}

/** Eventos pontuais do dia (o que conta como "mais de um evento"). */
export function pointEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => !isBackground(e));
}

/**
 * Cores de um dia, na ordem da grade do PDF: primeiro a de preenchimento
 * (o evento mais curto pinta o dia), depois as de canto (triângulo).
 */
export function dayColors(events: CalendarEvent[], legend: LegendEntry[]): string[] {
  const styleOf = (e: CalendarEvent) => legend.find((l) => l.key === e.category)?.style ?? 'fill';
  const colored = events.filter((e) => e.color);
  const point = colored.filter((e) => !isBackground(e));
  const pool = point.length ? point : colored;
  const len = (e: CalendarEvent) => occupiedDays(e.dates).length;
  const ordered = [...pool.filter((e) => styleOf(e) === 'fill').sort((a, b) => len(a) - len(b)), ...pool.filter((e) => styleOf(e) !== 'fill')];
  return [...new Set(ordered.map((e) => e.color!))];
}

export function eventsInMonth(events: CalendarEvent[], year: number, month: number): CalendarEvent[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return events
    .filter((e) => e.datesResolved && e.dates.start && occupiedDays(e.dates).some((d) => d.startsWith(prefix)))
    .sort((a, b) => a.dates.start.localeCompare(b.dates.start) || a.sortOrder - b.sortOrder);
}

export function todayISO(): ISODate {
  const d = new Date();
  // data de parede em São Paulo
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts;
}
