import type { EventDates, ISODate, ReviewIssue } from './types';

/* ==========================================================================
   Datas escritas em prosa
   --------------------------------------------------------------------------
   Os calendários da instituição não escrevem datas em ISO. Escrevem:

     25/08                   um dia
     04 a 31/08              um período no mesmo mês
     28/09 a 09/10           um período que atravessa meses
     12 e 13/10              duas datas isoladas — NÃO é o intervalo 12..13
     13, 14, 27 e 28/11      uma lista — NÃO é o intervalo 13..28
     07/12 e 04/01           uma lista que atravessa o ano

   O mês só aparece no último número de cada grupo ("13, 14, 27 e 28/11"), por
   isso a resolução corre da direita para a esquerda: cada número herda o mês
   do próximo número que o tem.

   O que este módulo NUNCA faz:
     · inventar um ano que não possa justificar (sinaliza `date_year_inferred`);
     · transformar uma lista em intervalo;
     · aceitar um dia que não existe (31/09 vira `date_invalid`, não 01/10);
     · adivinhar uma combinação de período com lista ("01 a 03 e 10/08") — isso
       volta como `date_ambiguous`, com o rótulo original preservado, para uma
       pessoa decidir.
   ========================================================================== */

export interface DateContext {
  /** Ano do calendário (título do PDF). Sem ele, nenhuma data é resolvida. */
  year: number | null;
  /** 1 ou 2. Usado para desconfiar de meses fora do semestre. */
  semester: 1 | 2 | null;
}

export interface ParsedDates {
  dates: EventDates | null;
  issues: ReviewIssue[];
}

interface Token {
  day: number;
  month: number | null;
  year: number | null;
}

type Connector = 'range' | 'list';

const DATE_TOKEN = /^(\d{1,2})(?:\/(\d{1,2})(?:\/(\d{2}|\d{4}))?)?$/;

/** Tudo que pode separar dois números num rótulo de data. */
const CONNECTOR = /^(?:a|à|até|ate|-|–|—|e|,|;|&)$/i;

function normalizeLabel(label: string): string {
  return label
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ' , ')
    .replace(/\s*;\s*/g, ' ; ')
    .trim();
}

/** Quebra o rótulo em números e conectores. Devolve null se sobrar texto. */
function lex(label: string): { tokens: Token[]; connectors: Connector[] } | null {
  const parts = normalizeLabel(label)
    .split(' ')
    .filter(Boolean)
    // "28/09-09/10": hífen colado entre duas datas
    .flatMap((part) => {
      const glued = part.match(/^(\d{1,2}(?:\/\d{1,2})?)[-–—](\d{1,2}(?:\/\d{1,2})?)$/);
      return glued ? [glued[1], 'a', glued[2]] : [part];
    });

  const tokens: Token[] = [];
  const connectors: Connector[] = [];
  let expectNumber = true;

  for (const part of parts) {
    const m = part.match(DATE_TOKEN);
    if (m) {
      if (!expectNumber) return null; // dois números sem conector: "12 13/10"
      const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
      tokens.push({ day: Number(m[1]), month: m[2] ? Number(m[2]) : null, year });
      expectNumber = false;
      continue;
    }
    if (CONNECTOR.test(part)) {
      if (expectNumber) return null; // conector no início ou dois seguidos
      const c = part.toLowerCase();
      connectors.push(c === 'a' || c === 'à' || c === 'até' || c === 'ate' || c === '-' || c === '–' || c === '—' ? 'range' : 'list');
      expectNumber = true;
      continue;
    }
    return null; // palavra que não é data: não é um rótulo de data
  }

  if (tokens.length === 0 || expectNumber) return null;
  return { tokens, connectors };
}

/** Um rótulo parece data? Usado pelo extrator para achar a coluna de datas. */
export function looksLikeDateLabel(label: string): boolean {
  return lex(label) !== null;
}

/**
 * Um fragmento parece o começo de um rótulo quebrado em duas linhas?
 * O PDF de exemplo quebra "13, 14, 27 e" / "28/11" dentro da mesma célula.
 */
export function looksLikeDateFragment(fragment: string): boolean {
  const cleaned = normalizeLabel(fragment).replace(/\s+(?:e|a|,)$/i, '');
  return lex(cleaned) !== null || /^\d{1,2}(?:\s*(?:,|e|a)\s*\d{1,2})*\s*(?:,|e|a)?$/i.test(fragment.trim());
}

export function isValidDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= last;
}

export function toISO(year: number, month: number, day: number): ISODate {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function fromISO(date: ISODate): { year: number; month: number; day: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addDays(date: ISODate, days: number): ISODate {
  const { year, month, day } = fromISO(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Dia da semana (0 = domingo) de uma data de calendário. */
export function weekday(date: ISODate): number {
  const { year, month, day } = fromISO(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Meses esperados em cada semestre. Julho aparece nos dois (DP, férias). */
function inSemester(month: number, semester: 1 | 2): boolean {
  return semester === 1 ? month >= 1 && month <= 7 : month >= 7 && month <= 12;
}

/**
 * Resolve o rótulo impresso em datas de calendário.
 * O rótulo original é sempre devolvido em `dates.label`, palavra por palavra.
 */
export function parseDateLabel(label: string, ctx: DateContext): ParsedDates {
  const original = label.replace(/\s+/g, ' ').trim();
  const issues: ReviewIssue[] = [];
  const lexed = lex(original);

  if (!lexed) {
    return {
      dates: null,
      issues: [
        {
          code: 'date_unparsed',
          severity: 'blocker',
          field: 'dates',
          message: `Não foi possível entender a data "${original}". Informe a data manualmente.`,
        },
      ],
    };
  }

  const { tokens, connectors } = lexed;

  // Mês herdado da direita para a esquerda.
  let month: number | null = null;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (tokens[i].month !== null) month = tokens[i].month;
    else tokens[i].month = month;
  }

  if (tokens.some((t) => t.month === null)) {
    return {
      dates: null,
      issues: [
        {
          code: 'date_unparsed',
          severity: 'blocker',
          field: 'dates',
          message: `A data "${original}" não informa o mês. Informe a data manualmente.`,
        },
      ],
    };
  }

  const hasRange = connectors.includes('range');
  const hasList = connectors.includes('list');

  if (hasRange && (hasList || tokens.length !== 2)) {
    return {
      dates: null,
      issues: [
        {
          code: 'date_ambiguous',
          severity: 'blocker',
          field: 'dates',
          message: `A data "${original}" mistura período e datas isoladas. Confira no PDF e informe como deve ficar.`,
        },
      ],
    };
  }

  if (ctx.year === null && tokens.every((t) => t.year === null)) {
    return {
      dates: null,
      issues: [
        {
          code: 'date_unparsed',
          severity: 'blocker',
          field: 'dates',
          message: `O ano do calendário não foi identificado, então "${original}" não pôde ser resolvida.`,
        },
      ],
    };
  }

  // Ano: explícito no rótulo > ano do calendário. Virada de ano só dentro de
  // um período ou de uma lista que "volta" no mês (dez → jan), e sempre sinalizada.
  const baseYear = ctx.year ?? tokens.find((t) => t.year !== null)!.year!;
  const resolved: { year: number; month: number; day: number }[] = [];
  let inferredRollover = false;
  let prev: { year: number; month: number; day: number } | null = null;

  for (const t of tokens) {
    let y = t.year ?? baseYear;
    if (t.year === null && prev && (t.month! < prev.month || (t.month === prev.month && t.day < prev.day))) {
      y = prev.year + 1;
      inferredRollover = true;
    } else if (t.year === null && prev) {
      y = prev.year;
    }
    const r = { year: y, month: t.month!, day: t.day };
    resolved.push(r);
    prev = r;
  }

  // Segundo semestre com data em jan/fev: provavelmente o ano seguinte, mas
  // isso é uma suposição — uma pessoa precisa confirmar.
  if (ctx.semester === 2 && tokens.every((t) => t.year === null) && resolved[0].month <= 2 && !inferredRollover) {
    for (const r of resolved) r.year += 1;
    inferredRollover = true;
  }

  const invalid = resolved.filter((r) => !isValidDay(r.year, r.month, r.day));
  if (invalid.length) {
    return {
      dates: null,
      issues: [
        {
          code: 'date_invalid',
          severity: 'blocker',
          field: 'dates',
          message: `A data "${original}" contém um dia que não existe (${invalid
            .map((r) => `${String(r.day).padStart(2, '0')}/${String(r.month).padStart(2, '0')}`)
            .join(', ')}). Confira no PDF.`,
        },
      ],
    };
  }

  const isoDates = resolved.map((r) => toISO(r.year, r.month, r.day));

  if (inferredRollover) {
    // Num período ("15/12 a 10/01") o ano seguinte é consequência lógica: o fim
    // tem de vir depois do início. Numa lista ou num semestre, é suposição.
    const forced = hasRange && tokens.every((t) => t.year === null) && resolved[0].year === baseYear;
    issues.push({
      code: 'date_year_inferred',
      severity: forced ? 'warning' : 'blocker',
      field: 'dates',
      message: forced
        ? `O período "${original}" atravessa a virada do ano; o fim foi considerado em ${resolved[1].year}.`
        : `O PDF não informa o ano de "${original}". O sistema supôs ${[...new Set(resolved.map((r) => r.year))].join(' e ')} — confirme.`,
      detail: { resolved: isoDates },
    });
  }

  if (ctx.semester) {
    const outside = resolved.filter((r) => !inSemester(r.month, ctx.semester!) || r.year !== baseYear);
    if (outside.length && !inferredRollover) {
      issues.push({
        code: 'date_outside_semester',
        severity: 'warning',
        field: 'dates',
        message: `"${original}" fica fora dos meses usuais do ${ctx.semester}º semestre. Pode estar correto (inscrições, férias) — vale conferir.`,
      });
    }
  }

  let dates: EventDates;
  if (tokens.length === 1) {
    dates = { kind: 'single', start: isoDates[0], end: isoDates[0], dates: [], label: original };
  } else if (hasRange) {
    const [start, end] = isoDates;
    if (compareISO(start, end) >= 0) {
      return {
        dates: null,
        issues: [
          {
            code: 'date_invalid',
            severity: 'blocker',
            field: 'dates',
            message: `O período "${original}" termina antes de começar. Confira no PDF.`,
          },
        ],
      };
    }
    dates = { kind: 'range', start, end, dates: [], label: original };
  } else {
    const unique = [...new Set(isoDates)].sort(compareISO);
    if (unique.length !== isoDates.length) {
      issues.push({
        code: 'date_ambiguous',
        severity: 'warning',
        field: 'dates',
        message: `A lista "${original}" repete uma data.`,
      });
    }
    dates = { kind: 'list', start: unique[0], end: unique[unique.length - 1], dates: unique, label: original };
  }

  return { dates, issues };
}

/** Todas as datas que o evento ocupa na grade (períodos são expandidos). */
export function occupiedDays(dates: EventDates): ISODate[] {
  if (dates.kind === 'single') return [dates.start];
  if (dates.kind === 'list') return [...dates.dates];
  const out: ISODate[] = [];
  let cur = dates.start;
  // guarda contra períodos absurdos gerados por erro de digitação
  for (let i = 0; i < 400 && compareISO(cur, dates.end) <= 0; i += 1) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Chave canônica das datas — duas leituras do mesmo período produzem a mesma. */
export function datesKey(dates: EventDates): string {
  if (dates.kind === 'list') return `list:${dates.dates.join(',')}`;
  if (dates.kind === 'range') return `range:${dates.start}..${dates.end}`;
  return `single:${dates.start}`;
}

/** Formata como o PDF escreve: "28/09 a 09/10", "12 e 13/10", "13, 14, 27 e 28/11". */
export function formatDates(dates: EventDates): string {
  const dm = (iso: ISODate) => {
    const { month, day } = fromISO(iso);
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
  };
  if (dates.kind === 'single') return dm(dates.start);
  if (dates.kind === 'range') {
    const s = fromISO(dates.start);
    const e = fromISO(dates.end);
    return s.month === e.month && s.year === e.year
      ? `${String(s.day).padStart(2, '0')} a ${dm(dates.end)}`
      : `${dm(dates.start)} a ${dm(dates.end)}`;
  }
  const list = dates.dates;
  const sameMonth = list.every((d) => fromISO(d).month === fromISO(list[0]).month);
  const parts = sameMonth
    ? [...list.slice(0, -1).map((d) => String(fromISO(d).day).padStart(2, '0')), dm(list[list.length - 1])]
    : list.map(dm);
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

export const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** "JULHO" → 7. Aceita com ou sem acento. */
export function monthFromName(name: string): number | null {
  const n = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  const idx = MONTH_NAMES.findIndex(
    (m) => m.normalize('NFD').replace(/[̀-ͯ]/g, '') === n,
  );
  return idx === -1 ? null : idx + 1;
}
