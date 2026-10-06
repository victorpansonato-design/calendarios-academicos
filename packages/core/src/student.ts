import type {
  Calendar,
  CalendarEvent,
  Cohort,
  EventDates,
  EventTime,
  ISODate,
  ISOInstant,
  LegendEntry,
  PublicCalendar,
  PublicCalendarEvent,
  Shift,
  StudentImportance,
} from './types';
import { EVENT_TYPE_LABEL } from './types';
import { compareISO, fromISO, MONTH_NAMES } from './dates';
import { offsetLabel, instantToWall, reminderBlockReason } from './schedule';
import { canHide as canHideImportance, studentImportance } from './importance';
import { normalizeForCompare } from './text';

/* ==========================================================================
   Visão do aluno
   --------------------------------------------------------------------------
   Uma lógica só para o portal, o app, a API e as prévias da equipe:

     Importantes = Alta + Média (que o aluno não ocultou) + favoritos (estrela)
     Completo    = tudo o que vale para o aluno, mês a mês

   "Hoje" é sempre o dia em America/Sao_Paulo — nunca `toISOString()`, que às
   21h de São Paulo já é o dia seguinte.
   ========================================================================== */

/* -- Projeção pública ----------------------------------------------------- */

type CalendarMeta = Pick<Calendar, 'id' | 'title' | 'year' | 'semester' | 'scope' | 'legend' | 'notes' | 'sourceFileId' | 'sourceFileName'>;

export function toPublicEvent(e: CalendarEvent): PublicCalendarEvent {
  const avisa = reminderBlockReason(e) === null;
  return {
    uid: e.uid,
    title: e.title,
    description: e.description,
    dates: e.dates,
    times: e.times,
    location: e.location,
    urls: e.urls,
    notes: e.notes,
    audience: e.audience.groups,
    type: e.type,
    category: e.category,
    color: e.color,
    importance: e.importance,
    studentImportance: studentImportance(e.importance),
    calendarReminder: { enabled: avisa, labels: avisa ? e.notification.offsets.map(offsetLabel) : [] },
    pushTitle: e.notification.pushTitle,
    pushBody: e.notification.pushBody,
    anchor: e.notification.anchor,
    officialText: e.rawText,
  };
}

/** A projeção que portal, app e prévias leem. Datas não resolvidas ficam de fora. */
export function toPublicCalendar(
  meta: CalendarMeta,
  events: CalendarEvent[],
  v: { version: number; publishedAt: ISOInstant | null; source: 'published' | 'draft' },
): PublicCalendar {
  return {
    id: meta.id,
    version: v.version,
    publishedAt: v.publishedAt,
    source: v.source,
    title: meta.title,
    year: meta.year,
    semester: meta.semester,
    scope: meta.scope,
    legend: meta.legend,
    notes: meta.notes.map((n) => ({ id: n.id, text: n.text })),
    sourceFileId: meta.sourceFileId,
    sourceFileName: meta.sourceFileName,
    events: events
      .filter((e) => e.datesResolved && e.title.trim())
      .sort((a, b) => compareISO(a.dates.start, b.dates.start) || a.sortOrder - b.sortOrder)
      .map(toPublicEvent),
  };
}

/* -- Datas para o aluno --------------------------------------------------- */

export function todayIn(now: Date): ISODate {
  return instantToWall(now).date;
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const a = fromISO(from);
  const b = fromISO(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
}

/** "hoje", "amanhã", "em 3 dias", "ontem", "há 5 dias". */
export function countdownPhrase(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days === -1) return 'ontem';
  return days > 1 ? `em ${days} dias` : `há ${-days} dias`;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'] as const;

function weekdayOf(d: ISODate): number {
  const { year, month, day } = fromISO(d);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function weekdayShort(d: ISODate): string {
  return WEEKDAYS[weekdayOf(d)];
}

export function weekdayLong(d: ISODate): string {
  return WEEKDAYS_LONG[weekdayOf(d)];
}

/** "28 de setembro", "28 de setembro a 9 de outubro", "13, 14, 27 e 28 de novembro". */
export function friendlyDates(dates: EventDates): string {
  const dm = (iso: ISODate) => `${fromISO(iso).day} de ${MONTH_NAMES[fromISO(iso).month - 1]}`;
  if (dates.kind === 'single') return dm(dates.start);
  if (dates.kind === 'range') {
    const s = fromISO(dates.start);
    const e = fromISO(dates.end);
    return s.month === e.month ? `${s.day} a ${dm(dates.end)}` : `${dm(dates.start)} a ${dm(dates.end)}`;
  }
  const list = dates.dates;
  const sameMonth = list.every((d) => fromISO(d).month === fromISO(list[0]).month);
  const parts = sameMonth ? [...list.slice(0, -1).map((d) => String(fromISO(d).day)), dm(list[list.length - 1])] : list.map(dm);
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTH_NAMES[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
}

/* -- Visão ---------------------------------------------------------------- */

export interface StudentContext {
  today: ISODate;
  /** Coorte do aluno; desconhecida = mostra tudo. */
  cohort?: Cohort | null;
  shift?: Shift | null;
  starred?: readonly string[];
  hidden?: readonly string[];
  /** Filtro por cor da legenda. `OUTROS` = eventos sem cor. */
  category?: string | null;
  /** Busca sem acento por título, descrição e legenda. */
  query?: string;
}

export const OUTROS = '__outros';

/**
 * Período longo (inscrições de meses): para o aluno é um PRAZO. Enquanto
 * está aberto, ele aparece na data em que fecha — não fica meses no topo nem
 * em "Acontecendo agora". Mesma régua da grade da gestão.
 */
export const LONG_PERIOD_DAYS = 21;

export function isLongPeriod(dates: EventDates): boolean {
  return dates.kind === 'range' && daysBetween(dates.start, dates.end) + 1 > LONG_PERIOD_DAYS;
}

export type StudentEventStatus = 'upcoming' | 'ongoing' | 'past';

export interface StudentEventItem extends PublicCalendarEvent {
  dateLabel: string;
  friendlyDate: string;
  /** Próxima data que importa: início, hoje (em andamento) ou próxima da lista. */
  nextDate: ISODate;
  status: StudentEventStatus;
  daysUntil: number;
  /** "em 3 dias", "hoje", "termina em 4 dias", "há 2 dias". */
  countdown: string;
  starred: boolean;
  hidden: boolean;
  inImportantes: boolean;
  /** Por que está em Importantes. */
  why: 'high' | 'medium' | 'starred' | null;
  canHide: boolean;
  /** Horários do turno do aluno (todos, se o turno não for conhecido). */
  shiftTimes: EventTime[];
  timeLabel: string;
  /**
   * A descrição sem o que a tela já mostra formatado: o próprio título, as
   * linhas de horário e as observações (*). É o texto corrido para o aluno.
   */
  details: string[];
  legendKey: string;
  legendLabel: string;
  /** Cor da legenda do PDF, ou null (aparece em cinza). */
  legendColor: string | null;
}

export interface StudentLegendItem {
  key: string;
  label: string;
  color: string | null;
  count: number;
  importantCount: number;
}

export interface StudentView {
  calendar: Pick<PublicCalendar, 'id' | 'title' | 'version' | 'source' | 'publishedAt' | 'scope' | 'year' | 'semester' | 'sourceFileName'>;
  today: ISODate;
  /** Próxima data importante que ainda vai começar. */
  next: StudentEventItem | null;
  /** Importantes acontecendo agora (períodos curtos, como a semana de provas). */
  ongoing: StudentEventItem[];
  /** Importantes que ainda vão acontecer ou estão em andamento, em ordem. */
  importantes: StudentEventItem[];
  /** Importantes que já passaram, do mais recente para o mais antigo. */
  importantesPast: StudentEventItem[];
  /** Tudo, agrupado pelo mês de início. */
  completo: { month: string; label: string; items: StudentEventItem[] }[];
  /** Todos os itens (já filtrados), para grades de mês. */
  items: StudentEventItem[];
  legend: StudentLegendItem[];
  counts: { total: number; importantes: number; starred: number; hidden: number };
}

function visibleFor(e: PublicCalendarEvent, cohort: Cohort | null | undefined): boolean {
  if (!cohort) return true;
  const novos = e.audience.includes('Ingressantes');
  const antigos = e.audience.includes('Veteranos');
  if (cohort === 'veteranos' && novos && !antigos) return false;
  if (cohort === 'ingressantes' && antigos && !novos) return false;
  return true;
}

function timing(dates: EventDates, today: ISODate): { nextDate: ISODate; status: StudentEventStatus; daysUntil: number; countdown: string } {
  if (dates.kind === 'range' && compareISO(dates.start, today) <= 0 && compareISO(today, dates.end) <= 0) {
    const left = daysBetween(today, dates.end);
    const countdown = left === 0 ? 'termina hoje' : left === 1 ? 'termina amanhã' : `termina em ${left} dias`;
    // período longo aberto: conta como prazo, na data em que fecha
    if (isLongPeriod(dates)) return { nextDate: dates.end, status: 'ongoing', daysUntil: left, countdown };
    return { nextDate: today, status: 'ongoing', daysUntil: 0, countdown };
  }
  const candidates = dates.kind === 'list' ? dates.dates : [dates.start];
  const upcoming = candidates.find((d) => compareISO(d, today) >= 0);
  if (upcoming) {
    const n = daysBetween(today, upcoming);
    return { nextDate: upcoming, status: 'upcoming', daysUntil: n, countdown: countdownPhrase(n) };
  }
  const n = daysBetween(today, dates.end);
  return { nextDate: dates.end, status: 'past', daysUntil: n, countdown: countdownPhrase(n) };
}

/** Parágrafos da descrição que acrescentam algo ao título, horários e observações. */
export function studentDetails(e: Pick<PublicCalendarEvent, 'title' | 'description' | 'notes'>): string[] {
  const norm = (x: string) => normalizeForCompare(x.replace(/^\*+\s*/, ''));
  const title = norm(e.title);
  const notes = new Set(e.notes.map(norm));
  return e.description
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => {
      const n = norm(p);
      if (!n || n === title || notes.has(n)) return false;
      if (p.startsWith('*')) return false; // observação: já aparece como nota
      if (/^horarios? /.test(`${n} `)) return false; // horário: já aparece formatado
      return true;
    });
}

function timeLabel(times: EventTime[]): string {
  return times.map((t) => (t.shift ? `${t.shift} ${t.time.replace(':', 'h')}` : t.time.replace(':', 'h'))).join(' · ');
}

function legendFor(e: PublicCalendarEvent, legend: LegendEntry[]): { key: string; label: string; color: string | null } {
  const entry = (e.category && legend.find((l) => l.key === e.category)) || (e.color && legend.find((l) => l.color.toLowerCase() === e.color!.toLowerCase())) || null;
  if (entry) return { key: entry.key, label: entry.label, color: e.color ?? entry.color };
  if (e.color) return { key: `cor:${e.color.toLowerCase()}`, label: EVENT_TYPE_LABEL[e.type], color: e.color };
  return { key: OUTROS, label: EVENT_TYPE_LABEL[e.type], color: null };
}

const ORDER: Record<StudentImportance, number> = { high: 0, medium: 1, low: 2 };

export function buildStudentView(cal: PublicCalendar, ctx: StudentContext): StudentView {
  const starred = new Set(ctx.starred ?? []);
  const hidden = new Set(ctx.hidden ?? []);
  const terms = ctx.query ? normalizeForCompare(ctx.query).split(' ').filter(Boolean) : [];

  const all: StudentEventItem[] = cal.events
    .filter((e) => visibleFor(e, ctx.cohort))
    .map((e) => {
      const t = timing(e.dates, ctx.today);
      const isStar = starred.has(e.uid);
      const isHidden = !isStar && hidden.has(e.uid) && canHideImportance(e.importance);
      const why = e.studentImportance === 'high' ? 'high' : isStar ? 'starred' : e.studentImportance === 'medium' && !isHidden ? 'medium' : null;
      const shiftTimes = ctx.shift ? e.times.filter((x) => x.shift === ctx.shift || x.shift === null) : e.times;
      const times = shiftTimes.length ? shiftTimes : e.times;
      const lg = legendFor(e, cal.legend);
      return {
        ...e,
        ...t,
        dateLabel: friendlyLabel(e.dates),
        friendlyDate: friendlyDates(e.dates),
        details: studentDetails(e),
        starred: isStar,
        hidden: isHidden,
        inImportantes: why !== null,
        why,
        canHide: canHideImportance(e.importance),
        shiftTimes: times,
        timeLabel: timeLabel(times),
        legendKey: lg.key,
        legendLabel: lg.label,
        legendColor: lg.color,
      };
    });

  // legenda: contada antes do filtro por cor, para o aluno ver as outras opções
  const legendMap = new Map<string, StudentLegendItem>();
  for (const it of all) {
    const cur = legendMap.get(it.legendKey) ?? { key: it.legendKey, label: it.legendKey === OUTROS ? 'Sem cor na legenda' : it.legendLabel, color: it.legendColor, count: 0, importantCount: 0 };
    cur.count += 1;
    if (it.inImportantes) cur.importantCount += 1;
    legendMap.set(it.legendKey, cur);
  }
  const legendOrder = new Map(cal.legend.map((l, i) => [l.key, i]));
  const legend = [...legendMap.values()].sort(
    (a, b) => (a.key === OUTROS ? 1 : 0) - (b.key === OUTROS ? 1 : 0) || (legendOrder.get(a.key) ?? 999) - (legendOrder.get(b.key) ?? 999),
  );

  const items = all.filter(
    (it) =>
      (!ctx.category || it.legendKey === ctx.category) &&
      (!terms.length || matchesAll(normalizeForCompare(`${it.title} ${it.description} ${it.legendLabel}`), terms)),
  );

  const byNext = (a: StudentEventItem, b: StudentEventItem) =>
    compareISO(a.nextDate, b.nextDate) || ORDER[a.studentImportance] - ORDER[b.studentImportance] || compareISO(a.dates.start, b.dates.start);

  const importantAll = items.filter((it) => it.inImportantes);
  const importantes = importantAll.filter((it) => it.status !== 'past').sort(byNext);
  const importantesPast = importantAll.filter((it) => it.status === 'past').sort((a, b) => compareISO(b.dates.end, a.dates.end));

  const months = new Map<string, StudentEventItem[]>();
  for (const it of items) {
    const m = it.dates.start.slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), it]);
  }
  const completo = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => ({ month, label: monthLabel(month), items: list.sort((a, b) => compareISO(a.dates.start, b.dates.start)) }));

  return {
    calendar: {
      id: cal.id,
      title: cal.title,
      version: cal.version,
      source: cal.source,
      publishedAt: cal.publishedAt,
      scope: cal.scope,
      year: cal.year,
      semester: cal.semester,
      sourceFileName: cal.sourceFileName,
    },
    today: ctx.today,
    next: importantes.find((it) => it.status === 'upcoming') ?? null,
    ongoing: importantes.filter((it) => it.status === 'ongoing' && !isLongPeriod(it.dates)),
    importantes,
    importantesPast,
    completo,
    items,
    legend,
    counts: {
      total: all.length,
      importantes: all.filter((it) => it.inImportantes).length,
      starred: all.filter((it) => it.starred).length,
      hidden: all.filter((it) => it.hidden).length,
    },
  };
}

function matchesAll(text: string, terms: string[]): boolean {
  return terms.every((t) => text.includes(t));
}

/** "seg, 28/09 a sex, 09/10" — curto, com dia da semana. */
function friendlyLabel(dates: EventDates): string {
  const dm = (iso: ISODate) => `${weekdayShort(iso)}, ${String(fromISO(iso).day).padStart(2, '0')}/${String(fromISO(iso).month).padStart(2, '0')}`;
  if (dates.kind === 'single') return dm(dates.start);
  if (dates.kind === 'range') return `${dm(dates.start)} a ${dm(dates.end)}`;
  return dates.dates.map((d) => `${String(fromISO(d).day).padStart(2, '0')}/${String(fromISO(d).month).padStart(2, '0')}`).join(', ');
}
