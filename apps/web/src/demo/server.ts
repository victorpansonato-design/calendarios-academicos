import type {
  AuditEntry,
  Calendar,
  CalendarEvent,
  CalendarStatus,
  CalendarVersionSummary,
  EventInput,
  ImportBatch,
  Importance,
  IssueCode,
  LifecycleRule,
  LifecycleStep,
  NotificationJob,
  PlannedFavoriteReminder,
  PublicCalendar,
  ReminderDiff,
  ReviewState,
  StudentEventMark,
  StudentImpact,
  SystemStatus,
  User,
} from '@calendarios/core';
import {
  ACKNOWLEDGEABLE,
  buildStudentView,
  canHide,
  checkPublishable,
  coveredByCalendarReminders,
  diffReminders,
  favoriteCancelReason,
  IMPORTANCE_LABEL,
  instantToWall,
  planCalendarFavorites,
  planFavoriteReminders,
  STUDENT_ID_PATTERN,
  suggestImportance,
  todayIn,
  toPublicCalendar,
  emptyReview,
  formatDates,
  momentLabel,
  normalizeForCompare,
  openCalendarIssues,
  openEventIssues,
  planCalendarReminders,
  previewValues,
  renderTemplate,
  scopeLabel,
  setReminderMoments,
} from '@calendarios/core';
import snapshot from './snapshot.json';

/* ==========================================================================
   Demonstração só-interface (VITE_DEMO=true)
   --------------------------------------------------------------------------
   Responde às mesmas rotas da API, dentro do navegador, a partir de um
   retrato real da API (snapshot.json, gerado por
   apps/api/scripts/demo-snapshot.ts). As regras de conferência, publicação e
   avisos vêm do mesmo pacote @calendarios/core que a API usa.

   As alterações ficam só neste navegador (localStorage). Nada é enviado.

   Para a visão do aluno abrir com conteúdo, o retrato chega com a importância
   sugerida já aplicada e com a coorte (ingressantes/veteranos) confirmada nos
   eventos em que o texto do PDF a declara — como a equipe faria.
   ========================================================================== */

type Meta = Pick<Calendar, 'title' | 'year' | 'semester' | 'scope' | 'legend' | 'notes' | 'review' | 'modifiedFromSource'>;
type Snap = { calendar: Meta; events: CalendarEvent[] };

interface CalendarRecord {
  calendar: Calendar;
  events: CalendarEvent[];
  versions: (CalendarVersionSummary & { snapshot: Snap })[];
  audit: AuditEntry[];
  publishedHash: string | null;
}

interface State {
  generatedAt: string;
  /** Formato do estado salvo: mudou → descarta o que estava no navegador. */
  schema: number;
  calendars: CalendarRecord[];
  jobs: NotificationJob[];
  rules: LifecycleRule[];
  /** Estrelas e "ocultar" dos alunos (prévias do portal e do app). */
  marks: StudentEventMark[];
}

const STORAGE_KEY = 'calendarios-demo';
const SCHEMA = 2;

export class DemoError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

const bad = (m: string, d?: unknown) => new DemoError(400, m, d);
const conflict = (m: string, d?: unknown) => new DemoError(409, m, d);
const notFound = (what: string) => new DemoError(404, `${what} não encontrado.`);

const user = snapshot.user as User;
const iso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function initialState(): State {
  return {
    generatedAt: snapshot.generatedAt,
    schema: SCHEMA,
    calendars: snapshot.calendars.map((c) => {
      const calendar = c.detail.calendar as unknown as Calendar;
      const events = (c.detail.events as unknown as CalendarEvent[]).map(seedEvent);
      const snap: Snap = { calendar: metaOf(calendar), events };
      const r: CalendarRecord = {
        calendar,
        events,
        versions: (c.versions as unknown as CalendarVersionSummary[]).map((v) => ({ ...v, snapshot: clone(snap) })),
        audit: c.audit as unknown as AuditEntry[],
        publishedHash: null,
      };
      audit(r, 'event.suggest_importance', `Importância sugerida aplicada a ${events.length} evento(s) (demonstração)`);
      return r;
    }),
    jobs: [],
    rules: snapshot.lifecycleRules as unknown as LifecycleRule[],
    marks: [],
  };
}

/** Importância sugerida + coorte declarada no texto (só ingressantes/veteranos). */
function seedEvent(e: CalendarEvent): CalendarEvent {
  const issue = e.review.issues.find((i) => i.code === 'audience_detected');
  const detected = ((issue?.detail as { groups?: string[] } | undefined)?.groups ?? []).filter((g) => g === 'Ingressantes' || g === 'Veteranos');
  return {
    ...e,
    importance: e.importance === 'unset' ? suggestImportance(e).importance : e.importance,
    audience: detected.length && !e.audience.groups.length ? { ...e.audience, groups: detected } : e.audience,
  };
}

function load(): State {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const s = JSON.parse(saved) as State;
      if (s.generatedAt === snapshot.generatedAt && s.schema === SCHEMA) return s; // retrato ou formato novo descarta edições antigas
    }
  } catch {
    /* sem armazenamento: começa do retrato */
  }
  return initialState();
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* navegador sem armazenamento: as edições valem até recarregar */
  }
}

/** Volta a demonstração ao calendário original. */
export function resetDemo() {
  state = initialState();
  save();
}

/* -- Calendários ---------------------------------------------------------- */

function metaOf(c: Calendar): Meta {
  const { title, year, semester, scope, legend, notes, review, modifiedFromSource } = c;
  return clone({ title, year, semester, scope, legend, notes, review, modifiedFromSource });
}

const hashOf = (r: CalendarRecord) => JSON.stringify({ calendar: metaOf(r.calendar), events: r.events });

function record(id: string): CalendarRecord {
  const r = state.calendars.find((c) => c.calendar.id === id);
  if (!r) throw notFound('Calendário');
  return r;
}

function view(r: CalendarRecord): Calendar {
  const reading = (code: string) => code !== 'importance_unset' && code !== 'anchor_unconfirmed';
  const pendingCount =
    r.events.filter((e) => openEventIssues(e).some((i) => i.severity === 'blocker' && reading(i.code))).length +
    openCalendarIssues(r.calendar).filter((i) => i.severity === 'blocker').length;
  return { ...r.calendar, eventCount: r.events.length, pendingCount, hasUnpublishedChanges: r.publishedHash !== null && hashOf(r) !== r.publishedHash };
}

function detail(r: CalendarRecord) {
  const calendar = view(r);
  const events = [...r.events].sort((a, b) => a.sortOrder - b.sortOrder);
  return { calendar, events, publishCheck: checkPublishable(calendar, events) };
}

function editable(id: string, expectedVersion?: number): CalendarRecord {
  const r = record(id);
  if (r.calendar.status === 'archived') throw conflict('Este calendário está arquivado. Reative-o para editar.');
  if (expectedVersion !== undefined && expectedVersion !== r.calendar.version)
    throw conflict('Este calendário foi alterado por outra pessoa enquanto você editava. Recarregue para ver a versão atual.', { currentVersion: r.calendar.version });
  return r;
}

function audit(r: CalendarRecord, action: string, summary: string, detail?: unknown) {
  r.audit.unshift({ id: uuid(), at: iso(), actor: user.name, action, entity: 'calendar', entityId: r.calendar.id, summary, detail: detail ?? null });
}

function addVersion(r: CalendarRecord, kind: CalendarVersionSummary['kind'], summary: string, published = false) {
  const number = r.versions.reduce((m, v) => Math.max(m, v.number), 0) + 1;
  const v = {
    id: uuid(),
    calendarId: r.calendar.id,
    number,
    kind,
    summary,
    createdAt: iso(),
    createdBy: user.name,
    published,
    eventCount: r.events.length,
    snapshot: clone({ calendar: metaOf(r.calendar), events: r.events }),
  };
  r.versions.unshift(v);
  r.calendar.version = number;
  return v;
}

function touch(r: CalendarRecord) {
  r.calendar.updatedAt = iso();
  r.calendar.updatedBy = user.name;
}

function commitEdit(r: CalendarRecord, summary: string, action: string, detail?: unknown, modifiedFromSource = false) {
  if (r.calendar.status === 'published') r.calendar.status = 'draft';
  if (modifiedFromSource) r.calendar.modifiedFromSource = true;
  touch(r);
  addVersion(r, 'edit', summary);
  audit(r, action, summary, detail);
}

const PDF_FIELDS: (keyof EventInput)[] = ['title', 'description', 'dates', 'times', 'location', 'urls', 'notes', 'audience', 'type'];

function mergeEvent(existing: CalendarEvent, input: EventInput): CalendarEvent {
  const pdfChanged = PDF_FIELDS.some((k) => JSON.stringify(existing[k as keyof CalendarEvent]) !== JSON.stringify(input[k]));
  const datesChanged = JSON.stringify(existing.dates) !== JSON.stringify(input.dates);
  let notification = input.notification;
  if (input.dates.kind === 'list' && !['each', 'first'].includes(notification.anchor)) notification = { ...notification, anchor: 'each' };
  if (input.dates.kind === 'range' && !['start', 'end'].includes(notification.anchor)) notification = { ...notification, anchor: 'start', anchorConfirmed: false };
  let review = existing.review;
  if (datesChanged) review = { ...review, issues: review.issues.filter((i) => !i.code.startsWith('date_')) };
  const dates = { ...input.dates, label: input.dates.label && !datesChanged ? input.dates.label : formatDates(input.dates) };
  return {
    ...existing,
    ...input,
    dates,
    datesResolved: true,
    notification,
    review,
    modifiedFromSource: existing.modifiedFromSource || (existing.origin === 'import' && pdfChanged),
    updatedAt: iso(),
    updatedBy: user.name,
  };
}

function findEvent(r: CalendarRecord, eventId: string): CalendarEvent {
  const e = r.events.find((x) => x.id === eventId);
  if (!e) throw notFound('Evento');
  return e;
}

const replaceEvent = (r: CalendarRecord, e: CalendarEvent) => (r.events = r.events.map((x) => (x.id === e.id ? e : x)));

function plan(r: CalendarRecord) {
  return planCalendarReminders(r.events, { calendarId: r.calendar.id, calendarTitle: r.calendar.title, now: new Date() });
}

function reminderDiff(r: CalendarRecord) {
  const active = state.jobs.filter((j) => j.calendarId === r.calendar.id && j.kind === 'event_reminder' && (j.status === 'scheduled' || j.status === 'blocked'));
  return diffReminders(active, plan(r));
}

/* -- Visão do aluno ------------------------------------------------------- */

/** A versão publicada (a mais recente marcada como publicada), ou null. */
function publishedSnap(r: CalendarRecord) {
  if (r.calendar.status === 'archived' || r.calendar.publishedVersion === null) return null;
  return r.versions.find((v) => v.published) ?? null;
}

function publicOf(r: CalendarRecord, source: 'draft' | 'published'): PublicCalendar | null {
  const meta = { ...r.calendar, id: r.calendar.id };
  if (source === 'draft') return toPublicCalendar(meta, r.events, { version: r.calendar.version, publishedAt: null, source: 'draft' });
  const v = publishedSnap(r);
  if (!v) return null;
  return toPublicCalendar({ ...meta, ...v.snapshot.calendar }, v.snapshot.events, { version: v.number, publishedAt: v.createdAt, source: 'published' });
}

function favoriteDiff(r: CalendarRecord): ReminderDiff<PlannedFavoriteReminder> {
  const stars = state.marks.filter((m) => m.calendarId === r.calendar.id && m.mark === 'star');
  const planned = planCalendarFavorites(r.events, stars, { calendarId: r.calendar.id, calendarTitle: r.calendar.title, now: new Date() });
  const active = state.jobs.filter((j) => j.calendarId === r.calendar.id && j.kind === 'favorite_reminder' && (j.status === 'scheduled' || j.status === 'blocked'));
  const diff = diffReminders(active, planned);
  const byUid = new Map(r.events.map((e) => [e.uid, e]));
  return { ...diff, cancel: diff.cancel.map((c) => ({ ...c, reason: favoriteCancelReason(c.job, byUid) })) };
}

function studentImpact(r: CalendarRecord): StudentImpact {
  const fav = favoriteDiff(r);
  const students = new Set([...fav.create.map((p) => p.studentId), ...fav.update.map((u) => u.after.studentId), ...fav.cancel.map((c) => (c.job.audience.type === 'student' ? c.job.audience.studentId : ''))]);
  students.delete('');
  return {
    importantes: r.events.filter((e) => e.importance === 'high' || e.importance === 'medium').length,
    unset: r.events.filter((e) => e.importance === 'unset').length,
    withoutLegend: r.events.filter((e) => !e.category && !e.color).length,
    favorites: { create: fav.create.length, update: fav.update.length, cancel: fav.cancel.length, students: students.size },
  };
}

function favoriteJob(r: CalendarRecord, p: PlannedFavoriteReminder): NotificationJob {
  return newJob({
    kind: 'favorite_reminder',
    channel: p.channel,
    calendarId: r.calendar.id,
    eventUid: p.eventUid,
    audience: { type: 'student', studentId: p.studentId, label: `Aluno ${p.studentId}` },
    title: p.title,
    body: p.body,
    sendAt: p.sendAt,
    idempotencyKey: p.idempotencyKey,
    createdBy: 'Aluno (portal/app)',
    context: { calendarTitle: r.calendar.title, eventTitle: p.eventTitle, offsetLabel: p.offsetLabel },
  });
}

/** Cria o envio ou reativa o mesmo registro cancelado — como a API. */
function upsertFavorite(r: CalendarRecord, p: PlannedFavoriteReminder) {
  const existing = state.jobs.find((j) => j.idempotencyKey === p.idempotencyKey);
  if (!existing) state.jobs.push(favoriteJob(r, p));
  else if (existing.status === 'canceled') Object.assign(existing, { status: 'scheduled', sendAt: p.sendAt, title: p.title, body: p.body, canceledReason: null });
}

function cancelFavorites(calendarId: string, studentId: string, eventUid: string, reason: string): number {
  const active = state.jobs.filter(
    (j) => j.kind === 'favorite_reminder' && j.calendarId === calendarId && j.eventUid === eventUid && j.audience.type === 'student' && j.audience.studentId === studentId && (j.status === 'scheduled' || j.status === 'blocked'),
  );
  active.forEach((j) => Object.assign(j, { status: 'canceled', canceledReason: reason }));
  return active.length;
}

function studentId(v: string): string {
  const s = decodeURIComponent(v);
  if (!STUDENT_ID_PATTERN.test(s)) throw bad('Identificador do aluno inválido.');
  return s;
}

function markOf(studentId: string, calendarId: string, eventUid: string) {
  return state.marks.find((m) => m.studentId === studentId && m.calendarId === calendarId && m.eventUid === eventUid) ?? null;
}

function setMark(studentId: string, calendarId: string, eventUid: string, mark: StudentEventMark['mark'] | null) {
  state.marks = state.marks.filter((m) => !(m.studentId === studentId && m.calendarId === calendarId && m.eventUid === eventUid));
  if (mark) state.marks.push({ studentId, calendarId, eventUid, mark, updatedAt: iso() });
}

function studentReminders(studentId: string, calendarId: string, eventUid?: string) {
  return state.jobs
    .filter((j) => j.kind === 'favorite_reminder' && j.calendarId === calendarId && j.audience.type === 'student' && j.audience.studentId === studentId)
    .filter((j) => !eventUid || j.eventUid === eventUid)
    .filter((j) => ['scheduled', 'blocked', 'sent', 'demo_sent'].includes(j.status))
    .map((j) => ({ eventUid: j.eventUid, sendAt: j.sendAt, status: j.status, offsetLabel: j.context.offsetLabel ?? '', title: j.title, body: j.body }));
}

function publishedEvent(calendarId: string, eventUid: string) {
  const r = record(calendarId);
  const v = publishedSnap(r);
  if (!v) throw notFound('Calendário publicado');
  const event = v.snapshot.events.find((e) => e.uid === eventUid && e.datesResolved);
  if (!event) throw notFound('Evento');
  return { r, v, event };
}

function newJob(p: Partial<NotificationJob> & Pick<NotificationJob, 'kind' | 'channel' | 'title' | 'body' | 'sendAt' | 'idempotencyKey' | 'audience'>): NotificationJob {
  return {
    id: uuid(),
    calendarId: null,
    eventUid: null,
    lifecycleRuleId: null,
    status: 'scheduled',
    deliveryKey: `${p.idempotencyKey}@${p.sendAt}`,
    attempts: 0,
    lastError: null,
    providerMessageId: null,
    createdAt: iso(),
    createdBy: user.name,
    sentAt: null,
    canceledReason: null,
    context: {},
    ...p,
  };
}

function audienceOf(r: CalendarRecord, groups: string[]) {
  const c = r.calendar;
  return { type: 'calendar' as const, calendarId: c.id, scope: c.scope, groups, label: scopeLabel(c.scope) + (groups.length ? ` · Somente: ${groups.join(', ')}` : '') };
}

/* -- Rotas ---------------------------------------------------------------- */

type Handler = (m: RegExpMatchArray, body: Record<string, unknown>, query: URLSearchParams) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, h: Handler) => routes.push([method, new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, '([^/]+)')}$`), h]);

on('POST', '/api/auth/login', () => ({ token: 'demo', user }));
on('POST', '/api/auth/logout', () => ({ ok: true }));
on('GET', '/api/auth/me', () => ({ user }));
on('GET', '/api/system/status', () => snapshot.status as unknown as SystemStatus);

on('GET', '/api/calendars', (_m, _b, q) => {
  const text = q.get('q') ? normalizeForCompare(q.get('q')!) : '';
  const status = q.get('status');
  const items = state.calendars
    .map(view)
    .filter((c) => {
      if (status && status !== 'all') {
        if (status === 'published' ? c.publishedVersion === null || c.status === 'archived' : c.status !== (status as CalendarStatus)) return false;
      }
      if (q.get('year') && String(c.year) !== q.get('year')) return false;
      if (q.get('semester') && String(c.semester) !== q.get('semester')) return false;
      if (q.get('modality') && c.scope.modality !== q.get('modality')) return false;
      if (text && !normalizeForCompare([c.title, c.scope.audienceLabel, c.scope.modality, ...c.scope.courses, c.sourceFileName ?? ''].join(' ')).includes(text)) return false;
      return true;
    })
    .map(({ extraction, legend, notes, review, ...s }) => (void extraction, void legend, void notes, void review, s));
  return { items };
});

on('GET', '/api/calendars/:id', (m) => detail(record(m[1])));

on('PATCH', '/api/calendars/:id', (m, b) => {
  const r = editable(m[1], b.expectedVersion === undefined ? undefined : Number(b.expectedVersion));
  const c = r.calendar;
  const changed: string[] = [];
  const differs = (k: keyof Meta) => b[k] !== undefined && JSON.stringify(b[k]) !== JSON.stringify(c[k]);
  const names: [keyof Meta, string][] = [['title', 'nome'], ['year', 'ano'], ['semester', 'semestre'], ['scope', 'público e cursos'], ['legend', 'legenda'], ['notes', 'observações gerais']];
  for (const [k, label] of names) if (differs(k)) changed.push(label);
  if (!changed.length) return detail(r);

  const review: ReviewState = { ...c.review };
  if (b.year || b.semester) review.issues = review.issues.filter((i) => !(i.code === 'scope_unrecognized' && (i.field === 'year' || i.field === 'semester')));
  if ((b.scope as Calendar['scope'] | undefined)?.modality) review.issues = review.issues.filter((i) => !(i.code === 'scope_unrecognized' && i.field === 'scope.modality'));
  if (b.legend) {
    const legend = b.legend as Calendar['legend'];
    r.events = r.events.map((ev) => {
      const entry = ev.category ? legend.find((l) => l.key === ev.category) : null;
      if (ev.category && !entry) return { ...ev, category: null, color: null };
      if (entry && entry.color !== ev.color) return { ...ev, color: entry.color };
      return ev;
    });
  }
  for (const [k] of names) if (b[k] !== undefined) (c as unknown as Record<string, unknown>)[k] = b[k];
  c.review = review;
  commitEdit(r, `Dados gerais alterados: ${changed.join(', ')}`, 'calendar.update', { changed }, changed.some((x) => x !== 'observações gerais' && x !== 'legenda'));
  return detail(r);
});

on('POST', '/api/calendars/:id/events', (m, b) => {
  const r = editable(m[1]);
  const input = b as unknown as EventInput;
  const at = iso();
  const event: CalendarEvent = {
    ...input,
    dates: { ...input.dates, label: input.dates.label || formatDates(input.dates) },
    notification: input.notification,
    id: uuid(),
    uid: uuid(),
    calendarId: r.calendar.id,
    rawText: null,
    datesResolved: true,
    sources: [],
    review: emptyReview(),
    origin: 'manual',
    modifiedFromSource: true,
    sortOrder: r.events.reduce((mx, e) => Math.max(mx, e.sortOrder), -1) + 1,
    createdAt: at,
    updatedAt: at,
    updatedBy: user.name,
  };
  r.events.push(event);
  commitEdit(r, `Evento "${event.title}" incluído`, 'event.create', { eventId: event.id }, true);
  return { event, ...detail(r) };
});

on('PATCH', '/api/calendars/:id/events/:eventId', (m, b) => {
  const r = editable(m[1], b.expectedVersion === undefined ? undefined : Number(b.expectedVersion));
  const next = mergeEvent(findEvent(r, m[2]), b as unknown as EventInput);
  replaceEvent(r, next);
  commitEdit(r, `Evento "${next.title}" editado`, 'event.update', { eventId: next.id }, next.modifiedFromSource);
  return { event: next, ...detail(r) };
});

on('DELETE', '/api/calendars/:id/events/:eventId', (m) => {
  const r = editable(m[1]);
  const src = findEvent(r, m[2]);
  r.events = r.events.filter((e) => e.id !== src.id);
  commitEdit(r, `Evento "${src.title}" excluído`, 'event.delete', { eventId: src.id, title: src.title, dates: src.dates.label }, true);
  return detail(r);
});

on('POST', '/api/calendars/:id/events/:eventId/duplicate', (m) => {
  const r = editable(m[1]);
  const src = findEvent(r, m[2]);
  const at = iso();
  const copy: CalendarEvent = {
    ...clone(src),
    id: uuid(),
    uid: uuid(),
    title: `${src.title} (cópia)`,
    origin: 'manual',
    modifiedFromSource: true,
    sortOrder: src.sortOrder + 0.5,
    review: { ...src.review, issues: src.review.issues.filter((i) => i.code !== 'possible_duplicate') },
    createdAt: at,
    updatedAt: at,
    updatedBy: user.name,
  };
  r.events.push(copy);
  r.events.sort((a, b) => a.sortOrder - b.sortOrder).forEach((e, i) => (e.sortOrder = i));
  commitEdit(r, `Evento "${src.title}" duplicado`, 'event.duplicate', { from: src.id, eventId: copy.id }, true);
  return { event: copy, ...detail(r) };
});

on('POST', '/api/calendars/:id/events/bulk-importance', (m, b) => {
  const r = editable(m[1]);
  const ids = new Set((b.eventIds as string[] | undefined) ?? []);
  if (!ids.size) throw bad('Selecione pelo menos um evento.');
  const importance = b.importance as Importance;
  let changed = 0;
  r.events = r.events.map((e) => {
    if (!ids.has(e.id) || e.importance === importance) return e;
    changed += 1;
    // importância só decide onde o evento aparece para o aluno; os avisos não mudam
    return { ...e, importance, updatedAt: iso(), updatedBy: user.name };
  });
  const label = IMPORTANCE_LABEL[importance].toLowerCase();
  if (changed) commitEdit(r, `Importância "${label}" aplicada a ${changed} evento(s)`, 'event.bulk_importance', { eventIds: [...ids], importance });
  return { changed, ...detail(r) };
});

on('POST', '/api/calendars/:id/events/bulk-reminders', (m, b) => {
  const r = editable(m[1]);
  const ids = new Set((b.eventIds as string[] | undefined) ?? []);
  if (!ids.size) throw bad('Selecione pelo menos um evento.');
  const days = (b.days as number[] | undefined) ?? [];
  const time = (b.time as string | null) ?? '';
  if (days.length && !time) throw bad('Informe o horário do aviso.');
  let changed = 0;
  r.events = r.events.map((e) => {
    if (!ids.has(e.id)) return e;
    changed += 1;
    let notification = setReminderMoments(e.notification, days, days.length ? time : '');
    if (e.dates.kind === 'range' && days.length) notification = { ...notification, anchorConfirmed: true };
    if (e.dates.kind === 'list' && !['each', 'first'].includes(notification.anchor)) notification = { ...notification, anchor: 'each' };
    return { ...e, notification, updatedAt: iso(), updatedBy: user.name };
  });
  const what = days.length ? `${days.map(momentLabel).join(', ')}, às ${time.replace(':', 'h')}` : 'não avisar';
  if (changed) commitEdit(r, `Aviso "${what}" aplicado a ${changed} evento(s)`, 'event.bulk_reminders', { eventIds: [...ids], days, time });
  return { changed, ...detail(r) };
});

on('POST', '/api/calendars/:id/review/ack', (m, b) => {
  const r = editable(m[1]);
  const code = b.code as IssueCode;
  const undo = Boolean(b.undo);
  if (!ACKNOWLEDGEABLE.has(code)) throw bad('Esta pendência só se resolve corrigindo o dado.');
  const ack = (review: ReviewState): ReviewState => {
    const rest = review.acknowledged.filter((a) => a.code !== code);
    return { ...review, acknowledged: undo ? rest : [...rest, { code, by: user.name, at: iso() }] };
  };
  let label: string;
  if (b.eventId) {
    const e = findEvent(r, String(b.eventId));
    if (!e.review.issues.some((i) => i.code === code)) throw bad('Este evento não tem essa pendência.');
    replaceEvent(r, { ...e, review: ack(e.review), updatedAt: iso(), updatedBy: user.name });
    label = `"${e.title}"`;
  } else {
    if (!r.calendar.review.issues.some((i) => i.code === code)) throw bad('O calendário não tem essa pendência.');
    r.calendar.review = ack(r.calendar.review);
    label = 'calendário';
  }
  touch(r);
  audit(r, undo ? 'review.unack' : 'review.ack', `${undo ? 'Conferência desfeita' : 'Pendência conferida'} (${code}) em ${label}.`, b);
  return detail(r);
});

on('POST', '/api/calendars/:id/submit', (m) => {
  const r = editable(m[1]);
  if (r.calendar.status === 'in_review') throw conflict('O calendário já está em revisão.');
  if (r.calendar.status === 'published' && !view(r).hasUnpublishedChanges) throw conflict('Não há alterações para revisar.');
  r.calendar.status = 'in_review';
  touch(r);
  addVersion(r, 'submit', 'Enviado para revisão');
  audit(r, 'calendar.submit', 'Calendário enviado para revisão.');
  return detail(r);
});

on('POST', '/api/calendars/:id/return', (m) => {
  const r = editable(m[1]);
  if (r.calendar.status !== 'in_review') throw conflict('Só um calendário em revisão pode voltar para rascunho.');
  r.calendar.status = 'draft';
  touch(r);
  audit(r, 'calendar.return', 'Revisão devolvida para rascunho.');
  return detail(r);
});

on('GET', '/api/calendars/:id/publish-preview', (m) => {
  const r = record(m[1]);
  return { publishCheck: detail(r).publishCheck, diff: reminderDiff(r), status: r.calendar.status, studentImpact: studentImpact(r) };
});

on('POST', '/api/calendars/:id/publish', (m, b) => {
  const r = record(m[1]);
  const { publishCheck, events } = detail(r);
  if (r.calendar.status === 'archived') throw conflict('Calendário arquivado não pode ser publicado.');
  if (!publishCheck.ok) throw conflict(`Ainda há ${publishCheck.blockers.length} pendência(s) impedindo a publicação.`, { blockers: publishCheck.blockers });
  if (b.confirm !== true) throw bad('Confirme o impacto nos avisos antes de publicar.');

  const diff = reminderDiff(r);
  const fav = favoriteDiff(r);
  r.calendar.status = 'published';
  touch(r);
  const version = addVersion(r, 'publish', `Publicado (${events.length} eventos)`, true);
  r.calendar.publishedVersion = version.number;
  r.publishedHash = hashOf(r);

  const byUid = new Map(r.events.map((e) => [e.uid, e]));
  for (const p of diff.create)
    state.jobs.push(
      newJob({
        kind: 'event_reminder',
        channel: p.channel,
        calendarId: r.calendar.id,
        eventUid: p.eventUid,
        audience: audienceOf(r, byUid.get(p.eventUid)?.audience.groups ?? []),
        title: p.title,
        body: p.body,
        sendAt: p.sendAt,
        idempotencyKey: p.idempotencyKey,
        context: { calendarTitle: r.calendar.title, eventTitle: p.eventTitle, offsetLabel: p.offsetLabel },
      }),
    );
  for (const u of diff.update) Object.assign(state.jobs.find((j) => j.id === u.before.id)!, { sendAt: u.after.sendAt, title: u.after.title, body: u.after.body, status: 'scheduled' });
  for (const c of diff.cancel) Object.assign(state.jobs.find((j) => j.id === c.job.id)!, { status: 'canceled', canceledReason: c.reason });
  if (diff.create.length || diff.update.length || diff.cancel.length)
    audit(r, 'reminders.replan', `Avisos: ${diff.create.length} novo(s), ${diff.update.length} atualizado(s), ${diff.cancel.length} cancelado(s).`);
  // lembretes de favorito acompanham a versão publicada
  for (const p of fav.create) upsertFavorite(r, p);
  for (const u of fav.update) Object.assign(state.jobs.find((j) => j.id === u.before.id)!, { sendAt: u.after.sendAt, title: u.after.title, body: u.after.body, status: 'scheduled' });
  for (const c of fav.cancel) Object.assign(state.jobs.find((j) => j.id === c.job.id)!, { status: 'canceled', canceledReason: c.reason });
  if (fav.create.length || fav.update.length || fav.cancel.length)
    audit(r, 'favorites.replan', `Lembretes de favoritos: ${fav.create.length} novo(s), ${fav.update.length} atualizado(s), ${fav.cancel.length} cancelado(s).`);
  audit(r, 'calendar.publish', `Versão ${version.number} publicada.`, { versionId: version.id });
  return { ...detail(r), diff, favoriteDiff: { create: fav.create.length, update: fav.update.length, cancel: fav.cancel.length } };
});

on('POST', '/api/calendars/:id/archive', (m) => {
  const r = record(m[1]);
  if (r.calendar.status === 'archived') throw conflict('O calendário já está arquivado.');
  const active = state.jobs.filter((j) => j.calendarId === r.calendar.id && (j.status === 'scheduled' || j.status === 'blocked'));
  active.forEach((j) => Object.assign(j, { status: 'canceled', canceledReason: 'Calendário arquivado' }));
  r.calendar.status = 'archived';
  touch(r);
  addVersion(r, 'archive', 'Arquivado');
  audit(r, 'calendar.archive', `Calendário arquivado (${active.length} envio(s) futuro(s) cancelado(s)).`);
  return { ...detail(r), canceledJobs: active.length };
});

on('POST', '/api/calendars/:id/unarchive', (m) => {
  const r = record(m[1]);
  if (r.calendar.status !== 'archived') throw conflict('O calendário não está arquivado.');
  r.calendar.status = 'draft';
  r.calendar.publishedVersion = null;
  r.publishedHash = null;
  touch(r);
  audit(r, 'calendar.unarchive', 'Calendário reativado como rascunho.');
  return detail(r);
});

on('GET', '/api/calendars/:id/versions', (m) => ({ items: record(m[1]).versions.map(({ snapshot: s, ...v }) => (void s, v)) }));

on('POST', '/api/calendars/:id/versions/:versionId/restore', (m) => {
  const r = editable(m[1]);
  const v = r.versions.find((x) => x.id === m[2]);
  if (!v) throw notFound('Versão');
  const snap = clone(v.snapshot);
  r.events = snap.events.map((e) => ({ ...e, updatedAt: iso(), updatedBy: user.name }));
  Object.assign(r.calendar, snap.calendar);
  if (r.calendar.status === 'published') r.calendar.status = 'draft';
  touch(r);
  addVersion(r, 'restore', `Restaurado da versão ${v.number}`);
  audit(r, 'calendar.restore', `Versão ${v.number} restaurada.`);
  return detail(r);
});

on('GET', '/api/calendars/:id/audit', (m) => ({ items: record(m[1]).audit }));

on('GET', '/api/calendars/:id/reminders', (m) => {
  const r = record(m[1]);
  const fav = state.jobs.filter((j) => j.calendarId === r.calendar.id && j.kind === 'favorite_reminder' && (j.status === 'scheduled' || j.status === 'blocked'));
  return {
    draftPlan: plan(r),
    jobs: state.jobs.filter((j) => j.calendarId === r.calendar.id && j.kind !== 'favorite_reminder'),
    favoriteSummary: { scheduled: fav.length, students: new Set(fav.map((j) => (j.audience.type === 'student' ? j.audience.studentId : ''))).size },
  };
});

on('POST', '/api/calendars/:id/events/suggest-importance', (m, b) => {
  const apply = b.apply === true;
  const r = apply ? editable(m[1]) : record(m[1]);
  const ids = Array.isArray(b.eventIds) && b.eventIds.length ? new Set((b.eventIds as unknown[]).map(String)) : null;
  const onlyUnset = b.onlyUnset !== false;
  const suggestions = r.events
    .filter((e) => (!ids || ids.has(e.id)) && (!onlyUnset || e.importance === 'unset'))
    .map((e) => {
      const s = suggestImportance(e);
      return { eventId: e.id, title: e.title, dateLabel: e.dates.label, from: e.importance, to: s.importance, ruleId: s.ruleId, reason: s.reason };
    })
    .filter((s) => s.from !== s.to);
  if (!apply) return { suggestions, changed: 0 };
  const byId = new Map(suggestions.map((s) => [s.eventId, s.to]));
  let changed = 0;
  r.events = r.events.map((e) => {
    const to = byId.get(e.id);
    if (!to) return e;
    changed += 1;
    return { ...e, importance: to, updatedAt: iso(), updatedBy: user.name };
  });
  if (changed) commitEdit(r, `Importância sugerida aplicada a ${changed} evento(s)`, 'event.suggest_importance', { changed });
  return { suggestions, changed, ...detail(r) };
});

on('GET', '/api/calendars/:id/student-preview', (m, _b, q) => {
  const pub = publicOf(record(m[1]), q.get('source') === 'published' ? 'published' : 'draft');
  if (!pub) throw notFound('Calendário publicado');
  return pub;
});

/* -- Portal do aluno e app (rotas públicas, sem chave na demonstração) ---- */

on('GET', '/api/public/calendars', () => ({
  items: state.calendars
    .map((r) => publicOf(r, 'published'))
    .filter((c) => c !== null)
    .map((c) => ({ id: c.id, title: c.title, year: c.year, semester: c.semester, scope: c.scope, version: c.version, publishedAt: c.publishedAt })),
}));

on('GET', '/api/public/calendars/:id', (m) => {
  const pub = publicOf(record(m[1]), 'published');
  if (!pub) throw notFound('Calendário publicado');
  return pub;
});

const STUDENT = '/api/public/students/:studentId/calendars/:calendarId';

on('GET', `${STUDENT}/marks`, (m) => {
  const sid = studentId(m[1]);
  if (!publishedSnap(record(m[2]))) throw notFound('Calendário publicado');
  const mine = state.marks.filter((x) => x.studentId === sid && x.calendarId === m[2]);
  return { starred: mine.filter((x) => x.mark === 'star').map((x) => x.eventUid), hidden: mine.filter((x) => x.mark === 'hide').map((x) => x.eventUid), reminders: studentReminders(sid, m[2]) };
});

on('PUT', `${STUDENT}/events/:eventUid/star`, (m) => {
  const sid = studentId(m[1]);
  const { r, v, event } = publishedEvent(m[2], m[3]);
  setMark(sid, m[2], m[3], 'star');
  const covered = coveredByCalendarReminders(event);
  const planned = covered ? [] : planFavoriteReminders(event, { calendarId: m[2], calendarTitle: v.snapshot.calendar.title, now: new Date(), studentId: sid });
  planned.forEach((p) => upsertFavorite(r, p));
  const first = planned[0] && instantToWall(planned[0].sendAt);
  const note = covered
    ? 'Você já recebe o aviso deste evento.'
    : first
      ? `Lembrete agendado para ${first.date.slice(8, 10)}/${first.date.slice(5, 7)} às ${first.time.replace(':', 'h')}.`
      : 'O horário do lembrete já passou.';
  return { mark: 'star', coveredByCalendar: covered, pushOptIn: null, reminders: studentReminders(sid, m[2], m[3]), note };
});

on('DELETE', `${STUDENT}/events/:eventUid/star`, (m) => {
  const sid = studentId(m[1]);
  if (!publishedSnap(record(m[2]))) throw notFound('Calendário publicado');
  if (markOf(sid, m[2], m[3])?.mark === 'star') setMark(sid, m[2], m[3], null);
  return { mark: null, canceled: cancelFavorites(m[2], sid, m[3], 'O aluno desmarcou o evento') };
});

on('PUT', `${STUDENT}/events/:eventUid/hide`, (m) => {
  const sid = studentId(m[1]);
  const { event } = publishedEvent(m[2], m[3]);
  if (event.importance === 'high') throw conflict('Eventos de importância Alta não podem ser ocultados.');
  if (!canHide(event.importance)) throw bad('Só eventos de importância Média podem ser ocultados dos Importantes.');
  setMark(sid, m[2], m[3], 'hide');
  return { mark: 'hide', canceled: cancelFavorites(m[2], sid, m[3], 'O aluno ocultou o evento') };
});

on('DELETE', `${STUDENT}/events/:eventUid/hide`, (m) => {
  const sid = studentId(m[1]);
  if (markOf(sid, m[2], m[3])?.mark === 'hide') setMark(sid, m[2], m[3], null);
  return { mark: null };
});

on('GET', `${STUDENT}/view`, (m, _b, q) => {
  const sid = studentId(m[1]);
  const pub = publicOf(record(m[2]), 'published');
  if (!pub) throw notFound('Calendário publicado');
  const mine = state.marks.filter((x) => x.studentId === sid && x.calendarId === m[2]);
  const cohort = q.get('cohort') === 'ingressantes' || q.get('cohort') === 'veteranos' ? (q.get('cohort') as 'ingressantes' | 'veteranos') : null;
  return buildStudentView(pub, {
    today: todayIn(new Date()),
    cohort,
    starred: mine.filter((x) => x.mark === 'star').map((x) => x.eventUid),
    hidden: mine.filter((x) => x.mark === 'hide').map((x) => x.eventUid),
    category: q.get('category'),
    query: q.get('q') ?? undefined,
  });
});

/* -- Importação: desligada na demonstração -------------------------------- */

on('GET', '/api/imports', () => ({ items: snapshot.importsRecent }));
on('GET', '/api/imports/:id', (m) => {
  const b = (snapshot.imports as Record<string, unknown>)[m[1]];
  if (!b) throw notFound('Envio');
  return b as ImportBatch;
});
const noImport = () => {
  throw bad('Na demonstração a importação de PDFs fica desligada. O calendário de exemplo já está carregado.');
};
on('POST', '/api/imports/:id/start', noImport);
on('POST', '/api/imports/:id/retry', noImport);

/* -- Envios --------------------------------------------------------------- */

function findJob(id: string) {
  const j = state.jobs.find((x) => x.id === id);
  if (!j) throw notFound('Envio');
  return j;
}

on('GET', '/api/notifications/jobs', (_m, _b, q) => {
  const status = q.get('status')?.split(',');
  const text = q.get('q') ? normalizeForCompare(q.get('q')!) : '';
  const items = state.jobs
    .filter((j) => {
      if (status && !status.includes(j.status)) return false;
      if (q.get('kind') ? j.kind !== q.get('kind') : j.kind === 'favorite_reminder') return false; // favoritos só quando pedidos
      if (q.get('channel') && j.channel !== q.get('channel')) return false;
      if (q.get('calendarId') && j.calendarId !== q.get('calendarId')) return false;
      if (q.get('from') && j.sendAt < q.get('from')!) return false;
      if (q.get('to') && j.sendAt > q.get('to')!) return false;
      if (text && !normalizeForCompare([j.title, j.body, j.context.eventTitle ?? '', j.context.calendarTitle ?? ''].join(' ')).includes(text)) return false;
      return true;
    })
    .sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  const counts: Record<string, number> = {};
  for (const j of state.jobs) counts[j.status] = (counts[j.status] ?? 0) + 1;
  return { items, counts };
});

on('GET', '/api/notifications/jobs/:id', (m) => ({ job: findJob(m[1]), attempts: [] }));

on('POST', '/api/notifications/jobs/:id/cancel', (m) => {
  const j = findJob(m[1]);
  if (j.status !== 'scheduled' && j.status !== 'blocked' && j.status !== 'failed') throw conflict('Este envio não pode mais ser cancelado.');
  Object.assign(j, { status: 'canceled', canceledReason: `Cancelado por ${user.name}` });
  return { job: j };
});

on('POST', '/api/notifications/jobs/:id/retry', (m) => {
  const j = findJob(m[1]);
  Object.assign(j, { status: 'scheduled', lastError: null });
  return { job: j };
});

on('POST', '/api/notifications/audience-preview', (_m, b) => ({
  audience: audienceOf(record(String(b.calendarId ?? '')), ((b.groups as string[] | undefined) ?? []).map(String)),
  estimate: null,
  note: 'A contagem de alunos será exibida quando a TI ligar a consulta à base acadêmica. O gateway de envio resolve o público no momento do disparo.',
}));

on('POST', '/api/notifications/additional', (_m, b) => {
  const r = record(String(b.calendarId ?? ''));
  if (r.calendar.status === 'archived') throw bad('Calendário arquivado não recebe comunicações.');
  if (!r.calendar.publishedVersion) throw bad('Publique o calendário antes de enviar comunicações sobre ele.');
  if (b.channel !== 'push' && b.channel !== 'email') throw bad('Escolha o canal: push ou e-mail.');
  const title = String(b.title ?? '').trim();
  const text = String(b.body ?? '').trim();
  if (!title || !text) throw bad('Preencha o título/assunto e a mensagem.');
  const sendAt = b.sendAt ? new Date(String(b.sendAt)).toISOString() : iso();
  const event = b.eventUid ? r.events.find((e) => e.uid === b.eventUid) ?? null : null;
  const job = newJob({
    kind: 'additional',
    channel: b.channel,
    calendarId: r.calendar.id,
    eventUid: event?.uid ?? null,
    audience: audienceOf(r, ((b.groups as string[] | undefined) ?? []).map(String)),
    title,
    body: text,
    sendAt,
    idempotencyKey: `add:${uuid()}`,
    context: { calendarTitle: r.calendar.title, eventTitle: event?.title },
    ...(b.sendAt ? {} : { status: 'demo_sent' as const, sentAt: iso(), attempts: 1 }),
  });
  state.jobs.push(job);
  return { job };
});

/* -- Acontecimentos do aluno ---------------------------------------------- */

on('GET', '/api/lifecycle/rules', () => ({ items: state.rules }));
on('GET', '/api/lifecycle/events', () => ({ items: [] }));

on('PUT', '/api/lifecycle/rules/:id', (m, b) => {
  const rule = state.rules.find((x) => x.id === m[1]);
  if (!rule) throw notFound('Regra');
  const steps = b.steps as LifecycleStep[] | undefined;
  if (!Array.isArray(steps) || !steps.length || steps.length > 12) throw bad('Uma regra precisa de 1 a 12 etapas.');
  Object.assign(rule, { steps, updatedAt: iso(), updatedBy: user.name });
  return { rule };
});

on('POST', '/api/lifecycle/rules/:id/preview', (m, b) => {
  const rule = state.rules.find((x) => x.id === m[1]);
  if (!rule) throw notFound('Regra');
  const values = previewValues(rule);
  const r = (t?: unknown) => renderTemplate(typeof t === 'string' ? t : '', values);
  const parts = { pushTitle: r(b.pushTitle), pushBody: r(b.pushBody), emailSubject: r(b.emailSubject), emailBody: r(b.emailBody) };
  return {
    pushTitle: parts.pushTitle.text,
    pushBody: parts.pushBody.text,
    emailSubject: parts.emailSubject.text,
    emailBody: parts.emailBody.text,
    missing: [...new Set(Object.values(parts).flatMap((p) => p.missing))],
    sample: values,
  };
});

/** Atende uma chamada da interface como a API atenderia. */
export async function demoRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = new URL(path, 'http://demo');
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = url.pathname.match(re);
    if (!match) continue;
    const result = h(match, (body ?? {}) as Record<string, unknown>, url.searchParams);
    if (method !== 'GET') save();
    return clone(result);
  }
  throw new DemoError(404, 'Rota não encontrada.');
}

