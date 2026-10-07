import crypto from 'node:crypto';
import type {
  Calendar,
  CalendarEvent,
  CalendarNote,
  CalendarScope,
  CalendarStatus,
  EventInput,
  Importance,
  IssueCode,
  LegendEntry,
  PublicCalendar,
  ReviewIssue,
  ReviewState,
  StudentImpact,
  User,
} from '@calendarios/core';
import {
  ACKNOWLEDGEABLE,
  checkPublishable,
  defaultNotificationRule,
  emptyReview,
  formatDates,
  IMPORTANCE_LABEL,
  momentLabel,
  normalizeForCompare,
  setReminderMoments,
  suggestAnchor,
  suggestImportance,
  toPublicCalendar,
} from '@calendarios/core';
import type { AppContext } from './context';
import { badRequest, conflict, notFound } from './errors';
import * as repo from '../repositories/calendars';
import { recordAudit } from '../repositories/audit';
import { applyFavoritePlan, applyReminderPlan, cancelCalendarJobs, previewFavoriteDiff, previewReminderDiff } from './notifications';
import type { ExtractionOutput } from '../pdf/pipeline';

/* ==========================================================================
   Calendários
   --------------------------------------------------------------------------
   Ciclo de vida:

     Em preparação ──publicar──▶ Publicado ──tirar do ar──▶ Arquivado
        ▲                          │
        └── editar (nova versão; a publicada continua no ar) ◀┘

   ("Em revisão" continua existindo na API para quem quiser uma segunda
   pessoa conferindo antes, mas não é um passo obrigatório.)

   Regras:
     · nada é publicado automaticamente — a importação sempre cria Rascunho;
     · editar um calendário publicado NÃO muda o que está publicado: o
       rascunho vira uma nova versão, que passa de novo por revisão;
     · toda gravação cria uma versão (fotografia) restaurável e um registro
       de auditoria;
     · publicar recalcula os avisos e mostra o impacto ANTES (publish-preview).
   ========================================================================== */

const PDF_FIELDS: (keyof EventInput)[] = ['title', 'description', 'dates', 'times', 'location', 'urls', 'notes', 'audience', 'type'];

function now(ctx: AppContext) {
  return ctx.now().toISOString();
}

function requireCalendar(ctx: AppContext, id: string): Calendar {
  const c = repo.getCalendar(ctx.db, id);
  if (!c) throw notFound('Calendário');
  return c;
}

function requireEditable(ctx: AppContext, id: string, expectedVersion?: number): Calendar {
  const c = requireCalendar(ctx, id);
  if (c.status === 'archived') throw conflict('Este calendário está arquivado. Reative-o para editar.');
  if (expectedVersion !== undefined && expectedVersion !== c.version)
    throw conflict('Este calendário foi alterado por outra pessoa enquanto você editava. Recarregue para ver a versão atual.', { currentVersion: c.version });
  return c;
}

/** Depois de uma edição: publicado vira rascunho da próxima versão; em revisão continua em revisão. */
function nextStatusAfterEdit(status: CalendarStatus): CalendarStatus {
  return status === 'published' ? 'draft' : status;
}

function commitEdit(ctx: AppContext, calendar: Calendar, actor: User, summary: string, action: string, detail?: unknown, calendarPatch: Parameters<typeof repo.updateCalendarRow>[2] = {}) {
  repo.updateCalendarRow(ctx.db, calendar.id, { status: nextStatusAfterEdit(calendar.status), ...calendarPatch }, actor.name);
  repo.addVersion(ctx.db, calendar.id, 'edit', summary, actor.name);
  recordAudit(ctx.db, { actor: actor.name, action, entity: 'calendar', entityId: calendar.id, summary, detail });
}

/* -- Criação a partir do PDF --------------------------------------------- */

export function eventsFromExtraction(calendarId: string, out: ExtractionOutput, actor: string, at: string): CalendarEvent[] {
  return out.events.map((d, i) => {
    const resolved = d.dates !== null;
    const dates = d.dates ?? { kind: 'single' as const, start: '', end: '', dates: [], label: d.label };
    const anchor = suggestAnchor(dates.kind, d.fields.type, d.fields.description);
    return {
      id: crypto.randomUUID(),
      uid: crypto.randomUUID(),
      calendarId,
      title: d.fields.title,
      description: d.fields.description,
      rawText: d.fields.rawText,
      dates,
      datesResolved: resolved,
      times: d.fields.times,
      location: d.fields.location,
      urls: d.fields.urls,
      notes: d.fields.notes,
      audience: d.fields.audience,
      type: d.fields.type,
      category: d.category,
      color: d.color,
      importance: 'unset' as Importance,
      notification: defaultNotificationRule(anchor),
      sources: d.sources,
      review: { issues: d.issues, acknowledged: [], confidence: d.confidence },
      origin: 'import' as const,
      modifiedFromSource: false,
      sortOrder: i,
      createdAt: at,
      updatedAt: at,
      updatedBy: actor,
    };
  });
}

/** Calendários que parecem o mesmo (período + modalidade + público). */
export function findSimilarCalendars(ctx: AppContext, c: { year: number | null; semester: number | null; scope: CalendarScope }, excludeId?: string) {
  const label = normalizeForCompare(c.scope.audienceLabel);
  const courses = new Set(c.scope.courses.map(normalizeForCompare));
  return repo
    .listCalendars(ctx.db)
    .filter((o) => o.id !== excludeId && o.status !== 'archived')
    .filter((o) => o.year === c.year && o.semester === c.semester && normalizeForCompare(o.scope.modality) === normalizeForCompare(c.scope.modality))
    .filter((o) => normalizeForCompare(o.scope.audienceLabel) === label && (courses.size === 0 || o.scope.courses.length === 0 || o.scope.courses.some((x) => courses.has(normalizeForCompare(x)))) && JSON.stringify([...o.scope.cohorts].sort()) === JSON.stringify([...c.scope.cohorts].sort()))
    .map((o) => ({ id: o.id, title: o.title, status: o.status }));
}

export function createFromExtraction(
  ctx: AppContext,
  input: { out: ExtractionOutput; fileId: string; actor: string; extraCourses?: string[]; extraIssues?: ReviewIssue[] },
): Calendar {
  return ctx.db.tx(() => {
    const id = crypto.randomUUID();
    const at = now(ctx);
    const scope = { ...input.out.scope, courses: [...new Set([...input.out.scope.courses, ...(input.extraCourses ?? [])])] };
    const issues: ReviewIssue[] = [...input.out.calendarIssues, ...(input.extraIssues ?? [])];

    // Não sobrescreve nada: um calendário parecido vira pendência, não substituição.
    const similar = findSimilarCalendars(ctx, { year: input.out.year, semester: input.out.semester, scope });
    if (similar.length)
      issues.push({
        code: 'possible_duplicate_calendar',
        severity: 'blocker',
        message: `Já existe calendário para o mesmo período, modalidade e público: ${similar.map((s) => `"${s.title}"`).join(', ')}. Confira se este é uma nova versão (e arquive o antigo) ou um calendário diferente.`,
        detail: { similar },
      });

    repo.insertCalendar(ctx.db, {
      id,
      title: input.out.title,
      year: input.out.year,
      semester: input.out.semester,
      scope,
      legend: input.out.legend,
      notes: input.out.notes,
      review: { issues, acknowledged: [], confidence: 1 },
      extraction: input.out.report,
      sourceFileId: input.fileId,
      actor: input.actor,
    });
    for (const e of eventsFromExtraction(id, input.out, input.actor, at)) repo.saveEvent(ctx.db, e);
    repo.addVersion(ctx.db, id, 'import', `Importado do PDF (${input.out.events.length} eventos)`, input.actor);
    recordAudit(ctx.db, { actor: input.actor, action: 'calendar.import', entity: 'calendar', entityId: id, summary: `Calendário "${input.out.title}" importado do PDF.` });
    return repo.getCalendar(ctx.db, id)!;
  });
}

/* -- Leitura -------------------------------------------------------------- */

export function getDetail(ctx: AppContext, id: string) {
  const calendar = requireCalendar(ctx, id);
  const events = repo.listEvents(ctx.db, id);
  return { calendar, events, publishCheck: checkPublishable(calendar, events) };
}

/* -- Dados gerais --------------------------------------------------------- */

export function updateMeta(
  ctx: AppContext,
  id: string,
  patch: { title?: string; year?: number | null; semester?: 1 | 2 | null; scope?: CalendarScope; legend?: LegendEntry[]; notes?: CalendarNote[] },
  actor: User,
  expectedVersion?: number,
): Calendar {
  return ctx.db.tx(() => {
    const c = requireEditable(ctx, id, expectedVersion);
    const changed: string[] = [];
    if (patch.title !== undefined && patch.title !== c.title) changed.push('nome');
    if (patch.year !== undefined && patch.year !== c.year) changed.push('ano');
    if (patch.semester !== undefined && patch.semester !== c.semester) changed.push('semestre');
    if (patch.scope !== undefined && JSON.stringify(patch.scope) !== JSON.stringify(c.scope)) changed.push('público e cursos');
    if (patch.legend !== undefined && JSON.stringify(patch.legend) !== JSON.stringify(c.legend)) changed.push('legenda');
    if (patch.notes !== undefined && JSON.stringify(patch.notes) !== JSON.stringify(c.notes)) changed.push('observações gerais');
    if (!changed.length) return c;

    // Resolver os campos que a revisão pedia tira a pendência correspondente
    const review = { ...c.review };
    if (patch.year || patch.semester)
      review.issues = review.issues.filter((i) => !(i.code === 'scope_unrecognized' && (i.field === 'year' || i.field === 'semester')));
    if (patch.scope?.modality) review.issues = review.issues.filter((i) => !(i.code === 'scope_unrecognized' && i.field === 'scope.modality'));

    // Se a legenda mudou de cor, os eventos daquela categoria acompanham
    if (patch.legend) {
      for (const ev of repo.listEvents(ctx.db, id)) {
        const entry = ev.category ? patch.legend.find((l) => l.key === ev.category) : null;
        if (ev.category && !entry) repo.saveEvent(ctx.db, { ...ev, category: null, color: null, updatedAt: now(ctx), updatedBy: actor.name });
        else if (entry && entry.color !== ev.color) repo.saveEvent(ctx.db, { ...ev, color: entry.color, updatedAt: now(ctx), updatedBy: actor.name });
      }
    }

    const pdfMetaChanged = changed.some((x) => x !== 'observações gerais' && x !== 'legenda');
    commitEdit(ctx, c, actor, `Dados gerais alterados: ${changed.join(', ')}`, 'calendar.update', { changed }, {
      title: patch.title,
      year: patch.year,
      semester: patch.semester,
      scope: patch.scope,
      legend: patch.legend,
      notes: patch.notes,
      review,
      ...(pdfMetaChanged ? { modifiedFromSource: true } : {}),
    });
    return repo.getCalendar(ctx.db, id)!;
  });
}

/* -- Eventos -------------------------------------------------------------- */

function mergeEvent(existing: CalendarEvent, input: EventInput, actor: User, at: string): CalendarEvent {
  const pdfChanged = PDF_FIELDS.some((k) => JSON.stringify(existing[k as keyof CalendarEvent]) !== JSON.stringify(input[k]));
  const datesChanged = JSON.stringify(existing.dates) !== JSON.stringify(input.dates);

  // importância e aviso são independentes: o que chegou é o que vale
  let notification = input.notification;
  // período mudou de natureza (lista ↔ período): a âncora precisa ser coerente
  if (input.dates.kind === 'list' && !['each', 'first'].includes(notification.anchor)) notification = { ...notification, anchor: 'each' };
  if (input.dates.kind === 'range' && !['start', 'end'].includes(notification.anchor)) notification = { ...notification, anchor: 'start', anchorConfirmed: false };

  let review = existing.review;
  if (datesChanged) {
    // a pessoa digitou as datas: as pendências de leitura de data deixam de valer
    review = { ...review, issues: review.issues.filter((i) => !i.code.startsWith('date_')) };
  }

  const dates = { ...input.dates, label: input.dates.label && !datesChanged ? input.dates.label : formatDates(input.dates) };
  return {
    ...existing,
    ...input,
    dates,
    datesResolved: true,
    notification,
    review,
    modifiedFromSource: existing.modifiedFromSource || (existing.origin === 'import' && pdfChanged),
    updatedAt: at,
    updatedBy: actor.name,
  };
}

export function updateEvent(ctx: AppContext, calendarId: string, eventId: string, input: EventInput, actor: User, expectedVersion?: number): CalendarEvent {
  return ctx.db.tx(() => {
    const c = requireEditable(ctx, calendarId, expectedVersion);
    const existing = repo.getEvent(ctx.db, calendarId, eventId);
    if (!existing) throw notFound('Evento');
    const next = mergeEvent(existing, input, actor, now(ctx));
    repo.saveEvent(ctx.db, next);
    commitEdit(ctx, c, actor, `Evento "${next.title}" editado`, 'event.update', { eventId }, next.modifiedFromSource ? { modifiedFromSource: true } : {});
    return next;
  });
}

export function createEvent(ctx: AppContext, calendarId: string, input: EventInput, actor: User): CalendarEvent {
  return ctx.db.tx(() => {
    const c = requireEditable(ctx, calendarId);
    const at = now(ctx);
    const max = repo.listEvents(ctx.db, calendarId).reduce((m, e) => Math.max(m, e.sortOrder), -1);
    const event: CalendarEvent = {
      ...input,
      dates: { ...input.dates, label: input.dates.label || formatDates(input.dates) },
      notification: input.notification,
      id: crypto.randomUUID(),
      uid: crypto.randomUUID(),
      calendarId,
      rawText: null,
      datesResolved: true,
      sources: [],
      review: emptyReview(),
      origin: 'manual',
      modifiedFromSource: true,
      sortOrder: max + 1,
      createdAt: at,
      updatedAt: at,
      updatedBy: actor.name,
    };
    repo.saveEvent(ctx.db, event);
    commitEdit(ctx, c, actor, `Evento "${event.title}" incluído`, 'event.create', { eventId: event.id }, { modifiedFromSource: true });
    return event;
  });
}

export function duplicateEvent(ctx: AppContext, calendarId: string, eventId: string, actor: User): CalendarEvent {
  return ctx.db.tx(() => {
    const c = requireEditable(ctx, calendarId);
    const src = repo.getEvent(ctx.db, calendarId, eventId);
    if (!src) throw notFound('Evento');
    const at = now(ctx);
    const copy: CalendarEvent = {
      ...src,
      id: crypto.randomUUID(),
      uid: crypto.randomUUID(),
      title: `${src.title} (cópia)`,
      origin: 'manual',
      modifiedFromSource: true,
      sortOrder: src.sortOrder + 0.5,
      review: { ...src.review, issues: src.review.issues.filter((i) => i.code !== 'possible_duplicate') },
      createdAt: at,
      updatedAt: at,
      updatedBy: actor.name,
    };
    repo.saveEvent(ctx.db, copy);
    // reordena para inteiros
    repo.listEvents(ctx.db, calendarId).forEach((e, i) => e.sortOrder !== i && repo.saveEvent(ctx.db, { ...e, sortOrder: i }));
    commitEdit(ctx, c, actor, `Evento "${src.title}" duplicado`, 'event.duplicate', { from: eventId, eventId: copy.id }, { modifiedFromSource: true });
    return repo.getEvent(ctx.db, calendarId, copy.id)!;
  });
}

export function deleteEvent(ctx: AppContext, calendarId: string, eventId: string, actor: User) {
  ctx.db.tx(() => {
    const c = requireEditable(ctx, calendarId);
    const src = repo.getEvent(ctx.db, calendarId, eventId);
    if (!src) throw notFound('Evento');
    repo.deleteEvent(ctx.db, calendarId, eventId);
    commitEdit(ctx, c, actor, `Evento "${src.title}" excluído`, 'event.delete', { eventId, title: src.title, dates: src.dates.label }, { modifiedFromSource: true });
  });
}

export function bulkImportance(ctx: AppContext, calendarId: string, eventIds: string[], importance: Importance, actor: User): number {
  return ctx.db.tx(() => {
    const c = requireEditable(ctx, calendarId);
    const ids = new Set(eventIds);
    let n = 0;
    for (const e of repo.listEvents(ctx.db, calendarId)) {
      if (!ids.has(e.id) || e.importance === importance) continue;
      // importância só decide onde o evento aparece para o aluno; os avisos não mudam
      repo.saveEvent(ctx.db, { ...e, importance, updatedAt: now(ctx), updatedBy: actor.name });
      n += 1;
    }
    if (n) commitEdit(ctx, c, actor, `Importância "${IMPORTANCE_LABEL[importance].toLowerCase()}" aplicada a ${n} evento(s)`, 'event.bulk_importance', { eventIds, importance });
    return n;
  });
}

/**
 * Sugere a importância de cada evento (regras do núcleo). `apply: false` só
 * mostra a prévia; `apply: true` grava numa versão só. Por padrão mexe apenas
 * nos eventos ainda sem importância — nunca desfaz uma escolha da equipe.
 */
export function suggestImportanceBulk(
  ctx: AppContext,
  calendarId: string,
  opts: { eventIds?: string[]; onlyUnset?: boolean; apply?: boolean },
  actor: User,
) {
  return ctx.db.tx(() => {
    const c = opts.apply ? requireEditable(ctx, calendarId) : requireCalendar(ctx, calendarId);
    const ids = opts.eventIds?.length ? new Set(opts.eventIds) : null;
    const onlyUnset = opts.onlyUnset !== false;
    const suggestions = repo
      .listEvents(ctx.db, calendarId)
      .filter((e) => (!ids || ids.has(e.id)) && (!onlyUnset || e.importance === 'unset'))
      .map((e) => {
        const s = suggestImportance(e);
        return { eventId: e.id, title: e.title, dateLabel: e.dates.label, from: e.importance, to: s.importance, ruleId: s.ruleId, reason: s.reason };
      })
      .filter((s) => s.from !== s.to);
    let changed = 0;
    if (opts.apply && suggestions.length) {
      const byId = new Map(suggestions.map((s) => [s.eventId, s.to]));
      for (const e of repo.listEvents(ctx.db, calendarId)) {
        const to = byId.get(e.id);
        if (!to) continue;
        repo.saveEvent(ctx.db, { ...e, importance: to, updatedAt: now(ctx), updatedBy: actor.name });
        changed += 1;
      }
      commitEdit(ctx, c, actor, `Importância sugerida aplicada a ${changed} evento(s)`, 'event.suggest_importance', { changed });
    }
    return { suggestions, changed };
  });
}

/**
 * Avisos em lote: os mesmos momentos (dias de antecedência) e o mesmo horário
 * para todos os eventos escolhidos. Sem momentos = "Não avisar".
 */
export function bulkReminders(ctx: AppContext, calendarId: string, eventIds: string[], days: number[], time: string, actor: User): number {
  return ctx.db.tx(() => {
    const c = requireEditable(ctx, calendarId);
    if (days.length && !time) throw badRequest('Informe o horário do aviso.');
    const ids = new Set(eventIds);
    let n = 0;
    for (const e of repo.listEvents(ctx.db, calendarId)) {
      if (!ids.has(e.id)) continue;
      let notification = setReminderMoments(e.notification, days, days.length ? time : '');
      // períodos seguem a sugestão (começo, ou fim quando é prazo) — avisado na confirmação
      if (e.dates.kind === 'range' && days.length) notification = { ...notification, anchorConfirmed: true };
      if (e.dates.kind === 'list' && !['each', 'first'].includes(notification.anchor)) notification = { ...notification, anchor: 'each' };
      repo.saveEvent(ctx.db, { ...e, notification, updatedAt: now(ctx), updatedBy: actor.name });
      n += 1;
    }
    const what = days.length ? `${days.map(momentLabel).join(', ')}, às ${time.replace(':', 'h')}` : 'não avisar';
    if (n) commitEdit(ctx, c, actor, `Aviso "${what}" aplicado a ${n} evento(s)`, 'event.bulk_reminders', { eventIds, days, time });
    return n;
  });
}

/* -- Pendências ----------------------------------------------------------- */

export function acknowledge(ctx: AppContext, calendarId: string, input: { eventId: string | null; code: IssueCode; undo?: boolean }, actor: User) {
  return ctx.db.tx(() => {
    const c = requireEditable(ctx, calendarId);
    if (!ACKNOWLEDGEABLE.has(input.code)) throw badRequest('Esta pendência só se resolve corrigindo o dado.');
    const ack = (review: ReviewState): ReviewState => {
      const rest = review.acknowledged.filter((a) => a.code !== input.code);
      return { ...review, acknowledged: input.undo ? rest : [...rest, { code: input.code, by: actor.name, at: now(ctx) }] };
    };
    let label: string;
    if (input.eventId) {
      const e = repo.getEvent(ctx.db, calendarId, input.eventId);
      if (!e) throw notFound('Evento');
      if (!e.review.issues.some((i) => i.code === input.code)) throw badRequest('Este evento não tem essa pendência.');
      repo.saveEvent(ctx.db, { ...e, review: ack(e.review), updatedAt: now(ctx), updatedBy: actor.name });
      label = `"${e.title}"`;
    } else {
      if (!c.review.issues.some((i) => i.code === input.code)) throw badRequest('O calendário não tem essa pendência.');
      repo.updateCalendarRow(ctx.db, calendarId, { review: ack(c.review) }, actor.name);
      label = 'calendário';
    }
    recordAudit(ctx.db, {
      actor: actor.name,
      action: input.undo ? 'review.unack' : 'review.ack',
      entity: 'calendar',
      entityId: calendarId,
      summary: `${input.undo ? 'Conferência desfeita' : 'Pendência conferida'} (${input.code}) em ${label}.`,
      detail: input,
    });
    return getDetail(ctx, calendarId);
  });
}

/* -- Revisão e publicação ------------------------------------------------- */

export function submitForReview(ctx: AppContext, id: string, actor: User) {
  return ctx.db.tx(() => {
    const c = requireEditable(ctx, id);
    if (c.status === 'in_review') throw conflict('O calendário já está em revisão.');
    if (c.status === 'published' && !c.hasUnpublishedChanges) throw conflict('Não há alterações para revisar.');
    repo.updateCalendarRow(ctx.db, id, { status: 'in_review' }, actor.name);
    repo.addVersion(ctx.db, id, 'submit', 'Enviado para revisão', actor.name);
    recordAudit(ctx.db, { actor: actor.name, action: 'calendar.submit', entity: 'calendar', entityId: id, summary: 'Calendário enviado para revisão.' });
    return getDetail(ctx, id);
  });
}

export function returnToDraft(ctx: AppContext, id: string, actor: User) {
  return ctx.db.tx(() => {
    const c = requireEditable(ctx, id);
    if (c.status !== 'in_review') throw conflict('Só um calendário em revisão pode voltar para rascunho.');
    repo.updateCalendarRow(ctx.db, id, { status: 'draft' }, actor.name);
    recordAudit(ctx.db, { actor: actor.name, action: 'calendar.return', entity: 'calendar', entityId: id, summary: 'Revisão devolvida para rascunho.' });
    return getDetail(ctx, id);
  });
}

/** O que a publicação muda para os alunos: Importantes, observações e lembretes de favoritos. */
export function studentImpact(ctx: AppContext, calendar: Calendar, events: CalendarEvent[]): StudentImpact {
  const fav = previewFavoriteDiff(ctx, calendar, events);
  const students = new Set([...fav.create.map((p) => p.studentId), ...fav.update.map((u) => u.after.studentId), ...fav.cancel.map((c) => c.job.audience.type === 'student' ? c.job.audience.studentId : '')]);
  students.delete('');
  return {
    importantes: events.filter((e) => e.importance === 'high' || e.importance === 'medium').length,
    unset: events.filter((e) => e.importance === 'unset').length,
    withoutLegend: events.filter((e) => !e.category && !e.color).length,
    favorites: { create: fav.create.length, update: fav.update.length, cancel: fav.cancel.length, students: students.size },
  };
}

export function publishPreview(ctx: AppContext, id: string) {
  const { calendar, events, publishCheck } = getDetail(ctx, id);
  const diff = previewReminderDiff(ctx, calendar, events);
  return { publishCheck, diff, status: calendar.status, studentImpact: studentImpact(ctx, calendar, events) };
}

export function publish(ctx: AppContext, id: string, actor: User, confirm: boolean) {
  return ctx.db.tx(() => {
    const { calendar, events, publishCheck } = getDetail(ctx, id);
    if (calendar.status === 'archived') throw conflict('Calendário arquivado não pode ser publicado.');
    // publica direto de "Em preparação" (a etapa de revisão é opcional)
    if (!publishCheck.ok) throw conflict(`Ainda há ${publishCheck.blockers.length} pendência(s) impedindo a publicação.`, { blockers: publishCheck.blockers });
    if (!confirm) throw badRequest('Confirme o impacto nos avisos antes de publicar.');

    repo.updateCalendarRow(ctx.db, id, { status: 'published' }, actor.name);
    const published = repo.getCalendar(ctx.db, id)!;
    const version = repo.addVersion(ctx.db, id, 'publish', `Publicado (${events.length} eventos)`, actor.name, true);
    const hash = repo.contentHash(repo.snapshotOf(published, events));
    repo.updateCalendarRow(ctx.db, id, { publishedVersionId: version.id, publishedVersionNumber: version.number, publishedHash: hash }, actor.name);
    const diff = applyReminderPlan(ctx, published, events, actor.name);
    const fav = applyFavoritePlan(ctx, published, events, actor.name);
    const favoriteDiff = { create: fav.create.length, update: fav.update.length, cancel: fav.cancel.length };
    recordAudit(ctx.db, { actor: actor.name, action: 'calendar.publish', entity: 'calendar', entityId: id, summary: `Versão ${version.number} publicada.`, detail: { versionId: version.id } });
    return { ...getDetail(ctx, id), diff, favoriteDiff };
  });
}

export function archive(ctx: AppContext, id: string, actor: User) {
  return ctx.db.tx(() => {
    const c = requireCalendar(ctx, id);
    if (c.status === 'archived') throw conflict('O calendário já está arquivado.');
    const canceled = cancelCalendarJobs(ctx, id, 'Calendário arquivado', actor.name);
    repo.updateCalendarRow(ctx.db, id, { status: 'archived' }, actor.name);
    repo.addVersion(ctx.db, id, 'archive', 'Arquivado', actor.name);
    recordAudit(ctx.db, { actor: actor.name, action: 'calendar.archive', entity: 'calendar', entityId: id, summary: `Calendário arquivado (${canceled} envio(s) futuro(s) cancelado(s)).` });
    return { ...getDetail(ctx, id), canceledJobs: canceled };
  });
}

export function unarchive(ctx: AppContext, id: string, actor: User) {
  return ctx.db.tx(() => {
    const c = requireCalendar(ctx, id);
    if (c.status !== 'archived') throw conflict('O calendário não está arquivado.');
    // volta como rascunho: para voltar ao ar, passa de novo por revisão e publicação
    repo.updateCalendarRow(ctx.db, id, { status: 'draft', publishedHash: null, publishedVersionId: null, publishedVersionNumber: null }, actor.name);
    recordAudit(ctx.db, { actor: actor.name, action: 'calendar.unarchive', entity: 'calendar', entityId: id, summary: 'Calendário reativado como rascunho.' });
    return getDetail(ctx, id);
  });
}

export function restoreVersion(ctx: AppContext, id: string, versionId: string, actor: User) {
  return ctx.db.tx(() => {
    const c = requireEditable(ctx, id);
    const snap = repo.getVersionSnapshot(ctx.db, id, versionId);
    if (!snap) throw notFound('Versão');
    repo.replaceEvents(ctx.db, id, snap.events.map((e) => ({ ...e, updatedAt: now(ctx), updatedBy: actor.name })));
    repo.updateCalendarRow(
      ctx.db,
      id,
      {
        title: snap.calendar.title,
        year: snap.calendar.year,
        semester: snap.calendar.semester,
        scope: snap.calendar.scope,
        legend: snap.calendar.legend,
        notes: snap.calendar.notes,
        review: snap.calendar.review,
        modifiedFromSource: snap.calendar.modifiedFromSource,
        status: nextStatusAfterEdit(c.status),
      },
      actor.name,
    );
    repo.addVersion(ctx.db, id, 'restore', `Restaurado da versão ${snap.number}`, actor.name);
    recordAudit(ctx.db, { actor: actor.name, action: 'calendar.restore', entity: 'calendar', entityId: id, summary: `Versão ${snap.number} restaurada.` });
    return getDetail(ctx, id);
  });
}

/** Leitura pública: SÓ a versão publicada, nunca o rascunho. */
export function publishedSnapshot(ctx: AppContext, id: string) {
  const row = repo.getCalendarRow(ctx.db, id);
  if (!row || row.status === 'archived' || !row.published_version_id) return null;
  const snap = repo.getVersionSnapshot(ctx.db, id, row.published_version_id);
  if (!snap) return null;
  return { id, version: snap.number, publishedAt: snap.createdAt, ...snap };
}

/** A versão publicada no formato que o portal e o app leem. */
export function publicCalendar(ctx: AppContext, id: string): PublicCalendar | null {
  const snap = publishedSnapshot(ctx, id);
  const c = repo.getCalendar(ctx.db, id);
  if (!snap || !c) return null;
  return toPublicCalendar({ id, ...snap.calendar, sourceFileId: c.sourceFileId, sourceFileName: c.sourceFileName }, snap.events, {
    version: snap.version,
    publishedAt: snap.publishedAt,
    source: 'published',
  });
}

/** Prévia da visão do aluno para a equipe: o rascunho atual ou a versão publicada. */
export function studentPreview(ctx: AppContext, id: string, source: 'draft' | 'published'): PublicCalendar {
  if (source === 'published') {
    const pub = publicCalendar(ctx, id);
    if (!pub) throw notFound('Calendário publicado');
    return pub;
  }
  const { calendar, events } = getDetail(ctx, id);
  return toPublicCalendar(calendar, events, { version: calendar.version, publishedAt: null, source: 'draft' });
}
