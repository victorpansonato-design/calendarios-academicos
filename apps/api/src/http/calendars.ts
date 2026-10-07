import type { FastifyInstance } from 'fastify';
import type { CalendarNote, CalendarStatus, IssueCode } from '@calendarios/core';
import { normalizeForCompare } from '@calendarios/core';
import type { AppContext } from '../services/context';
import { need } from './auth';
import * as svc from '../services/calendars';
import * as repo from '../repositories/calendars';
import { getFile } from '../repositories/files';
import { listAudit } from '../repositories/audit';
import { badRequest, notFound } from '../services/errors';
import { eventInput, importance, legendInput, scopeInput, wallTime } from '../services/validate';
import { planFor } from '../services/notifications';
import { favoriteSummary, listJobs } from '../repositories/notifications';

function notesInput(v: unknown): CalendarNote[] {
  if (!Array.isArray(v) || v.length > 100) throw badRequest('Observações inválidas.');
  return v
    .map((n: Partial<CalendarNote>, i) => ({ ...(n.source ? { source: n.source } : {}), id: String(n.id ?? `n${i}`).slice(0, 80), text: String(n.text ?? '').trim().slice(0, 3000) }))
    .filter((n) => n.text);
}

type P = { id: string };
type PE = { id: string; eventId: string };

export function registerCalendarRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/calendars', async (req) => {
    need(req, 'calendar.read');
    const q = req.query as { q?: string; status?: string; year?: string; semester?: string; modality?: string };
    const text = q.q ? normalizeForCompare(q.q) : '';
    const items = repo.listCalendars(ctx.db).filter((c) => {
      if (q.status && q.status !== 'all') {
        if (q.status === 'published' ? c.publishedVersion === null || c.status === 'archived' : c.status !== (q.status as CalendarStatus)) return false;
      }
      if (q.year && String(c.year) !== q.year) return false;
      if (q.semester && String(c.semester) !== q.semester) return false;
      if (q.modality && c.scope.modality !== q.modality) return false;
      if (text) {
        const hay = normalizeForCompare([c.title, c.scope.audienceLabel, c.scope.modality, ...c.scope.courses, c.sourceFileName ?? ''].join(' '));
        if (!hay.includes(text)) return false;
      }
      return true;
    });
    // lista não precisa do relatório de extração inteiro
    return { items: items.map(({ extraction, legend, notes, review, ...s }) => (void extraction, void legend, void notes, void review, s)) };
  });

  app.get<{ Params: P }>('/api/calendars/:id', async (req) => {
    need(req, 'calendar.read');
    return svc.getDetail(ctx, req.params.id);
  });

  app.patch<{ Params: P }>('/api/calendars/:id', async (req) => {
    const user = need(req, 'calendar.edit');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const year = b.year === undefined ? undefined : b.year === null ? null : Number(b.year);
    if (year !== undefined && year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) throw badRequest('Ano inválido.');
    const semester = b.semester === undefined ? undefined : b.semester === null ? null : Number(b.semester);
    if (semester !== undefined && semester !== null && semester !== 1 && semester !== 2) throw badRequest('Semestre inválido.');
    const calendar = svc.updateMeta(
      ctx,
      req.params.id,
      {
        title: b.title === undefined ? undefined : String(b.title).trim().slice(0, 200),
        year,
        semester: semester as 1 | 2 | null | undefined,
        scope: b.scope === undefined ? undefined : scopeInput(b.scope),
        legend: b.legend === undefined ? undefined : legendInput(b.legend),
        notes: b.notes === undefined ? undefined : notesInput(b.notes),
      },
      user,
      b.expectedVersion === undefined ? undefined : Number(b.expectedVersion),
    );
    return svc.getDetail(ctx, calendar.id);
  });

  app.post<{ Params: P }>('/api/calendars/:id/events', async (req) => {
    const user = need(req, 'calendar.edit');
    const event = svc.createEvent(ctx, req.params.id, eventInput(req.body), user);
    return { event, ...svc.getDetail(ctx, req.params.id) };
  });

  app.patch<{ Params: PE }>('/api/calendars/:id/events/:eventId', async (req) => {
    const user = need(req, 'calendar.edit');
    const b = (req.body ?? {}) as { expectedVersion?: number };
    const event = svc.updateEvent(ctx, req.params.id, req.params.eventId, eventInput(req.body), user, b.expectedVersion);
    return { event, ...svc.getDetail(ctx, req.params.id) };
  });

  app.delete<{ Params: PE }>('/api/calendars/:id/events/:eventId', async (req) => {
    const user = need(req, 'calendar.edit');
    svc.deleteEvent(ctx, req.params.id, req.params.eventId, user);
    return svc.getDetail(ctx, req.params.id);
  });

  app.post<{ Params: PE }>('/api/calendars/:id/events/:eventId/duplicate', async (req) => {
    const user = need(req, 'calendar.edit');
    const event = svc.duplicateEvent(ctx, req.params.id, req.params.eventId, user);
    return { event, ...svc.getDetail(ctx, req.params.id) };
  });

  app.post<{ Params: P }>('/api/calendars/:id/events/bulk-importance', async (req) => {
    const user = need(req, 'calendar.edit');
    const b = (req.body ?? {}) as { eventIds?: unknown; importance?: unknown };
    if (!Array.isArray(b.eventIds) || !b.eventIds.length) throw badRequest('Selecione pelo menos um evento.');
    const changed = svc.bulkImportance(ctx, req.params.id, b.eventIds.map(String), importance(b.importance), user);
    return { changed, ...svc.getDetail(ctx, req.params.id) };
  });

  /** Sugere a importância (prévia por padrão; `apply: true` grava). */
  app.post<{ Params: P }>('/api/calendars/:id/events/suggest-importance', async (req) => {
    const b = (req.body ?? {}) as { eventIds?: unknown; onlyUnset?: unknown; apply?: unknown };
    const apply = b.apply === true;
    const user = need(req, apply ? 'calendar.edit' : 'calendar.read');
    const result = svc.suggestImportanceBulk(
      ctx,
      req.params.id,
      { eventIds: Array.isArray(b.eventIds) ? b.eventIds.map(String) : undefined, onlyUnset: b.onlyUnset !== false, apply },
      user,
    );
    return apply ? { ...result, ...svc.getDetail(ctx, req.params.id) } : result;
  });

  /** Como o aluno vai ver: rascunho atual (padrão) ou a versão publicada. */
  app.get<{ Params: P }>('/api/calendars/:id/student-preview', async (req) => {
    need(req, 'calendar.read');
    const source = (req.query as { source?: string }).source === 'published' ? 'published' : 'draft';
    return svc.studentPreview(ctx, req.params.id, source);
  });

  app.post<{ Params: P }>('/api/calendars/:id/events/bulk-reminders', async (req) => {
    const user = need(req, 'calendar.edit');
    const b = (req.body ?? {}) as { eventIds?: unknown; days?: unknown; time?: unknown };
    if (!Array.isArray(b.eventIds) || !b.eventIds.length) throw badRequest('Selecione pelo menos um evento.');
    if (!Array.isArray(b.days) || b.days.some((d) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 60)) throw badRequest('Momentos de aviso inválidos.');
    const time = b.time ? wallTime(b.time, 'Horário do aviso') : '';
    const changed = svc.bulkReminders(ctx, req.params.id, b.eventIds.map(String), b.days as number[], time, user);
    return { changed, ...svc.getDetail(ctx, req.params.id) };
  });

  app.post<{ Params: P }>('/api/calendars/:id/review/ack', async (req) => {
    const user = need(req, 'calendar.review');
    const b = (req.body ?? {}) as { eventId?: string | null; code?: string; undo?: boolean };
    if (!b.code) throw badRequest('Informe a pendência.');
    return svc.acknowledge(ctx, req.params.id, { eventId: b.eventId ?? null, code: b.code as IssueCode, undo: Boolean(b.undo) }, user);
  });

  app.post<{ Params: P }>('/api/calendars/:id/submit', async (req) => svc.submitForReview(ctx, req.params.id, need(req, 'calendar.edit')));
  app.post<{ Params: P }>('/api/calendars/:id/return', async (req) => svc.returnToDraft(ctx, req.params.id, need(req, 'calendar.review')));

  app.get<{ Params: P }>('/api/calendars/:id/publish-preview', async (req) => {
    need(req, 'calendar.read');
    return svc.publishPreview(ctx, req.params.id);
  });

  app.post<{ Params: P }>('/api/calendars/:id/publish', async (req) => {
    const user = need(req, 'calendar.publish');
    return svc.publish(ctx, req.params.id, user, Boolean((req.body as { confirm?: boolean } | undefined)?.confirm));
  });

  app.post<{ Params: P }>('/api/calendars/:id/archive', async (req) => svc.archive(ctx, req.params.id, need(req, 'calendar.archive')));
  app.post<{ Params: P }>('/api/calendars/:id/unarchive', async (req) => svc.unarchive(ctx, req.params.id, need(req, 'calendar.archive')));

  app.get<{ Params: P }>('/api/calendars/:id/versions', async (req) => {
    need(req, 'calendar.read');
    return { items: repo.listVersions(ctx.db, req.params.id) };
  });

  app.get<{ Params: { id: string; versionId: string } }>('/api/calendars/:id/versions/:versionId', async (req) => {
    need(req, 'calendar.read');
    const snap = repo.getVersionSnapshot(ctx.db, req.params.id, req.params.versionId);
    if (!snap) throw notFound('Versão');
    return snap;
  });

  app.post<{ Params: { id: string; versionId: string } }>('/api/calendars/:id/versions/:versionId/restore', async (req) =>
    svc.restoreVersion(ctx, req.params.id, req.params.versionId, need(req, 'calendar.edit')),
  );

  app.get<{ Params: P }>('/api/calendars/:id/audit', async (req) => {
    need(req, 'calendar.read');
    return { items: listAudit(ctx.db, { entity: 'calendar', entityId: req.params.id, limit: 300 }) };
  });

  /** Avisos deste calendário: o plano do rascunho atual + a agenda real. */
  app.get<{ Params: P }>('/api/calendars/:id/reminders', async (req) => {
    need(req, 'notification.read');
    const { calendar, events } = svc.getDetail(ctx, req.params.id);
    // lembretes de favorito são por aluno: aqui só o resumo
    return {
      draftPlan: planFor(ctx, calendar, events),
      jobs: listJobs(ctx.db, { calendarId: calendar.id, excludeKinds: ['favorite_reminder'] }),
      favoriteSummary: favoriteSummary(ctx.db, calendar.id),
    };
  });

  // PDF original, inline, para abrir na página de origem (#page=N)
  app.get<{ Params: P }>('/api/files/:id/content', async (req, reply) => {
    need(req, 'calendar.read');
    const file = getFile(ctx.db, req.params.id);
    if (!file) throw notFound('Arquivo');
    const data = await ctx.storage.get(file.storageKey);
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`)
      .header('cache-control', 'private, max-age=3600')
      .header('x-content-type-options', 'nosniff')
      .send(data);
  });
}
