import type { FastifyInstance } from 'fastify';
import type { Channel, JobKind, JobStatus } from '@calendarios/core';
import type { AppContext } from '../services/context';
import { need } from './auth';
import * as svc from '../services/notifications';
import * as jobs from '../repositories/notifications';
import { getCalendar, listEvents } from '../repositories/calendars';
import { badRequest, notFound } from '../services/errors';
import { stringField } from '../services/validate';

export function registerNotificationRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/notifications/jobs', async (req) => {
    need(req, 'notification.read');
    const q = req.query as { status?: string; kind?: string; channel?: string; calendarId?: string; q?: string; from?: string; to?: string };
    const items = jobs.listJobs(ctx.db, {
      status: q.status ? (q.status.split(',') as JobStatus[]) : undefined,
      kind: (q.kind || undefined) as JobKind | undefined,
      channel: (q.channel || undefined) as Channel | undefined,
      calendarId: q.calendarId || undefined,
      q: q.q || undefined,
      from: q.from || undefined,
      to: q.to || undefined,
    });
    return { items, counts: jobs.countByStatus(ctx.db) };
  });

  app.get<{ Params: { id: string } }>('/api/notifications/jobs/:id', async (req) => {
    need(req, 'notification.read');
    const job = jobs.getJob(ctx.db, req.params.id);
    if (!job) throw notFound('Envio');
    return { job, attempts: jobs.listAttempts(ctx.db, job.id) };
  });

  app.post<{ Params: { id: string } }>('/api/notifications/jobs/:id/cancel', async (req) => {
    const user = need(req, 'notification.send');
    return { job: svc.cancelJob(ctx, req.params.id, user.name) };
  });

  app.post<{ Params: { id: string } }>('/api/notifications/jobs/:id/retry', async (req) => {
    const user = need(req, 'notification.send');
    return { job: svc.retryJob(ctx, req.params.id, user.name) };
  });

  app.post('/api/notifications/audience-preview', async (req) => {
    need(req, 'notification.read');
    const b = (req.body ?? {}) as { calendarId?: string; groups?: string[] };
    const calendar = b.calendarId ? getCalendar(ctx.db, b.calendarId) : undefined;
    if (!calendar) throw notFound('Calendário');
    return svc.audiencePreview(calendar, Array.isArray(b.groups) ? b.groups.map(String) : []);
  });

  app.post('/api/notifications/additional', async (req) => {
    const user = need(req, 'notification.send');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const calendar = getCalendar(ctx.db, String(b.calendarId ?? ''));
    if (!calendar) throw notFound('Calendário');
    const eventUid = b.eventUid ? String(b.eventUid) : null;
    const event = eventUid ? listEvents(ctx.db, calendar.id).find((e) => e.uid === eventUid) ?? null : null;
    if (eventUid && !event) throw notFound('Evento');
    if (b.channel !== 'push' && b.channel !== 'email') throw badRequest('Escolha o canal: push ou e-mail.');
    if (b.confirm !== true) throw badRequest('Confirme o público e o horário antes de enviar.');
    const sendAt = b.sendAt ? String(b.sendAt) : null;
    if (sendAt && Number.isNaN(Date.parse(sendAt))) throw badRequest('Horário inválido.');
    const job = svc.createAdditional(
      ctx,
      calendar,
      event,
      {
        calendarId: calendar.id,
        eventUid,
        channel: b.channel,
        title: stringField(b.title, b.channel === 'push' ? 'o título' : 'o assunto', b.channel === 'push' ? 120 : 200, true),
        body: stringField(b.body, 'a mensagem', b.channel === 'push' ? 500 : 5000, true),
        sendAt: sendAt ? new Date(sendAt).toISOString() : null,
        groups: Array.isArray(b.groups) ? b.groups.map(String).slice(0, 10) : [],
      },
      user.name,
    );
    // "enviar agora" não espera o próximo ciclo do agendador
    if (!sendAt) await svc.dispatchDue(ctx);
    return { job: jobs.getJob(ctx.db, job.id) };
  });
}
