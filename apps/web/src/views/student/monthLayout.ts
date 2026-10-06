import type { ISODate, StudentEventItem } from '@calendarios/core';
import { compareISO, fromISO, occupiedDays } from '@calendarios/core';
import { LONG_RANGE_DAYS, monthWeeks } from '../../lib/calendarGrid';

/* ==========================================================================
   Grade do mês da visão do aluno
   --------------------------------------------------------------------------
   No protótipo, um período (P1 de 28/09 a 09/10) só marcava o primeiro e o
   último dia — o aluno não via que a semana inteira era de prova. Aqui cada
   evento vira uma FAIXA contínua, quebrada só na virada da semana, numa
   "raia" fixa para as faixas não se cruzarem. Períodos longos demais
   (inscrições de meses) não pintam a grade — aparecem só na lista, como na
   grade da gestão (LONG_RANGE_DAYS).
   ========================================================================== */

export interface WeekSegment {
  item: StudentEventItem;
  /** Colunas (0 = domingo) que a faixa ocupa nesta semana. */
  col0: number;
  col1: number;
  lane: number;
  /** A faixa começa/termina de verdade aqui (ponta arredondada). */
  capStart: boolean;
  capEnd: boolean;
}

export interface MonthWeek {
  days: (ISODate | null)[];
  segments: WeekSegment[];
  /** Eventos que não couberam nas raias, por coluna. */
  hidden: number[];
}

const ORDER = { high: 0, medium: 1, low: 2 } as const;

export function drawsOnGrid(item: StudentEventItem): boolean {
  return !(item.dates.kind === 'range' && occupiedDays(item.dates).length > LONG_RANGE_DAYS);
}

/** Dias (consecutivos) de cada trecho do evento: uma lista de datas soltas vira trechos de um dia. */
function runs(item: StudentEventItem): ISODate[][] {
  if (item.dates.kind === 'list') return item.dates.dates.map((d) => [d]);
  return [occupiedDays(item.dates)];
}

export function monthLayout(items: StudentEventItem[], year: number, month: number, lanes = 3): MonthWeek[] {
  const drawable = items
    .filter(drawsOnGrid)
    .sort((a, b) => compareISO(a.dates.start, b.dates.start) || ORDER[a.studentImportance] - ORDER[b.studentImportance] || occupiedDays(b.dates).length - occupiedDays(a.dates).length);

  return monthWeeks(year, month).map((days) => {
    const col = new Map(days.map((d, i) => [d, i] as const).filter(([d]) => d !== null) as [ISODate, number][]);
    const raw: Omit<WeekSegment, 'lane'>[] = [];
    for (const item of drawable) {
      for (const run of runs(item)) {
        const cols = run.map((d) => col.get(d)).filter((c): c is number => c !== undefined);
        if (!cols.length) continue;
        const first = run[0];
        const last = run[run.length - 1];
        raw.push({
          item,
          col0: Math.min(...cols),
          col1: Math.max(...cols),
          capStart: col.has(first),
          capEnd: col.has(last),
        });
      }
    }
    // raias: a primeira livre em todas as colunas do trecho
    const busy: boolean[][] = Array.from({ length: lanes }, () => Array(7).fill(false));
    const hidden = Array(7).fill(0);
    const segments: WeekSegment[] = [];
    for (const s of raw) {
      const lane = busy.findIndex((row) => row.slice(s.col0, s.col1 + 1).every((b) => !b));
      if (lane === -1) {
        for (let c = s.col0; c <= s.col1; c += 1) hidden[c] += 1;
        continue;
      }
      for (let c = s.col0; c <= s.col1; c += 1) busy[lane][c] = true;
      segments.push({ ...s, lane });
    }
    return { days, segments, hidden };
  });
}

/** Meses ("AAAA-MM") que têm algum dia ocupado por algum evento. */
export function monthsWithEvents(items: StudentEventItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) for (const d of occupiedDays(it.dates)) set.add(d.slice(0, 7));
  return [...set].sort();
}

/** Eventos que ocupam algum dia do mês (ou só o dia escolhido). */
export function itemsInMonth(items: StudentEventItem[], month: string, day: ISODate | null): StudentEventItem[] {
  return items
    .filter((it) => {
      const days = occupiedDays(it.dates);
      return day ? days.includes(day) : days.some((d) => d.startsWith(month));
    })
    .sort((a, b) => compareISO(a.dates.start, b.dates.start));
}

export function ym(month: string): { year: number; month: number } {
  const { year, month: m } = fromISO(`${month}-01`);
  return { year, month: m };
}

/** O mês inicial da grade: o de hoje, se tiver eventos; senão o próximo que tiver; senão o primeiro. */
export function initialMonth(months: string[], today: ISODate): string | null {
  if (!months.length) return null;
  const cur = today.slice(0, 7);
  return months.find((m) => m >= cur) ?? months[months.length - 1];
}
