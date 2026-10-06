import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../services/context';
import { needIntegrationKey } from './auth';
import * as svc from '../services/students';
import { publicCalendar } from '../services/calendars';
import { listCalendars } from '../repositories/calendars';
import { getFile } from '../repositories/files';
import { notFound } from '../services/errors';

/* ==========================================================================
   Portal do aluno e app Grupo Anchieta
   --------------------------------------------------------------------------
   Leitura pública (X-Integration-Key = PUBLIC_API_KEY, se configurada):
   só versões publicadas, sem pendências nem autoria.

   Marcações do aluno (X-Integration-Key = STUDENT_API_KEY, obrigatória):
   o backend do portal/app diz quem é o aluno; a estrela agenda um lembrete
   só para ele, com o mesmo texto do aviso do evento.
   ========================================================================== */

type Q = Record<string, string | undefined>;
type SP = { studentId: string; calendarId: string };
type SPE = SP & { eventUid: string };

function sendIcs(reply: FastifyReply, file: { filename: string; body: string }) {
  return reply
    .header('content-type', 'text/calendar; charset=utf-8')
    .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
    .header('cache-control', 'no-cache')
    .send(file.body);
}

export function registerStudentRoutes(app: FastifyInstance, ctx: AppContext) {
  /* -- Leitura pública --------------------------------------------------- */

  app.get('/api/public/calendars', async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'public')) return reply;
    const items = listCalendars(ctx.db)
      .filter((c) => c.publishedVersion !== null && c.status !== 'archived')
      .map((c) => publicCalendar(ctx, c.id))
      .filter((c) => c !== null)
      .map((c) => ({ id: c.id, title: c.title, year: c.year, semester: c.semester, scope: c.scope, version: c.version, publishedAt: c.publishedAt }));
    return { items };
  });

  app.get<{ Params: { id: string } }>('/api/public/calendars/:id', async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'public')) return reply;
    const cal = publicCalendar(ctx, req.params.id);
    if (!cal) throw notFound('Calendário publicado');
    return cal;
  });

  app.get<{ Params: { id: string; eventUid: string } }>('/api/public/calendars/:id/events/:eventUid/evento.ics', async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'public')) return reply;
    return sendIcs(reply, svc.eventIcs(ctx, req.params.id, req.params.eventUid, svc.viewQuery(req.query as Q).shift ?? null));
  });

  // PDF oficial da versão publicada ("Ver PDF oficial" no portal/app)
  app.get<{ Params: { id: string } }>('/api/public/calendars/:id/arquivo.pdf', async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'public')) return reply;
    const cal = publicCalendar(ctx, req.params.id);
    const file = cal?.sourceFileId ? getFile(ctx.db, cal.sourceFileId) : undefined;
    if (!file) throw notFound('Arquivo');
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`)
      .header('cache-control', 'public, max-age=3600')
      .send(await ctx.storage.get(file.storageKey));
  });

  /* -- Marcações do aluno ------------------------------------------------ */

  const base = '/api/public/students/:studentId/calendars/:calendarId';

  app.get<{ Params: SP }>(`${base}/marks`, async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'student')) return reply;
    return svc.getMarks(ctx, svc.studentIdField(req.params.studentId), req.params.calendarId);
  });

  app.put<{ Params: SPE }>(`${base}/events/:eventUid/star`, async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'student')) return reply;
    return svc.star(ctx, svc.studentIdField(req.params.studentId), req.params.calendarId, req.params.eventUid);
  });

  app.delete<{ Params: SPE }>(`${base}/events/:eventUid/star`, async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'student')) return reply;
    return svc.unstar(ctx, svc.studentIdField(req.params.studentId), req.params.calendarId, req.params.eventUid);
  });

  app.put<{ Params: SPE }>(`${base}/events/:eventUid/hide`, async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'student')) return reply;
    return svc.hide(ctx, svc.studentIdField(req.params.studentId), req.params.calendarId, req.params.eventUid);
  });

  app.delete<{ Params: SPE }>(`${base}/events/:eventUid/hide`, async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'student')) return reply;
    return svc.unhide(ctx, svc.studentIdField(req.params.studentId), req.params.calendarId, req.params.eventUid);
  });

  app.get<{ Params: SP }>(`${base}/view`, async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'student')) return reply;
    return svc.view(ctx, svc.studentIdField(req.params.studentId), req.params.calendarId, svc.viewQuery(req.query as Q));
  });

  app.get<{ Params: SP }>(`${base}/importantes.ics`, async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'student')) return reply;
    return sendIcs(reply, svc.importantesIcs(ctx, svc.studentIdField(req.params.studentId), req.params.calendarId, svc.viewQuery(req.query as Q)));
  });
}
