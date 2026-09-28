import type { FastifyInstance } from 'fastify';
import type { LifecycleStep, StudentEventPayload } from '@calendarios/core';
import type { AppContext } from '../services/context';
import { need, needIntegrationKey } from './auth';
import * as svc from '../services/lifecycle';
import * as repo from '../repositories/lifecycle';
import { badRequest, notFound } from '../services/errors';
import { stringField } from '../services/validate';
import { listCalendars } from '../repositories/calendars';
import { publishedSnapshot } from '../services/calendars';

export function registerLifecycleRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/lifecycle/rules', async (req) => {
    need(req, 'notification.read');
    return { items: repo.listRules(ctx.db) };
  });

  app.put<{ Params: { id: string } }>('/api/lifecycle/rules/:id', async (req) => {
    const user = need(req, 'lifecycle.configure');
    return { rule: svc.updateRule(ctx, req.params.id, req.body as { steps: Partial<LifecycleStep>[] }, user) };
  });

  app.post<{ Params: { id: string } }>('/api/lifecycle/rules/:id/preview', async (req) => {
    need(req, 'notification.read');
    const rule = repo.getRule(ctx.db, req.params.id);
    if (!rule) throw notFound('Regra');
    return svc.previewStep(rule, (req.body ?? {}) as Partial<LifecycleStep>);
  });

  app.get('/api/lifecycle/events', async (req) => {
    need(req, 'notification.read');
    const q = req.query as { ruleId?: string };
    return { items: repo.listStudentEvents(ctx.db, 100, q.ruleId || undefined) };
  });

  /* -- Integrações (sistemas institucionais, por chave) ------------------ */

  app.post('/api/integrations/student-events', async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'integration')) return reply;
    const { record, duplicate } = svc.receiveStudentEvent(ctx, req.body as StudentEventPayload);
    return reply.code(duplicate ? 200 : 202).send({ id: record.id, outcome: record.outcome, duplicate, jobIds: record.jobIds });
  });

  app.put<{ Params: { studentId: string } }>('/api/integrations/student-preferences/:studentId', async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'integration')) return reply;
    const b = (req.body ?? {}) as { pushOptIn?: unknown; emailOptIn?: unknown };
    if (typeof b.pushOptIn !== 'boolean' || typeof b.emailOptIn !== 'boolean') throw badRequest('Informe pushOptIn e emailOptIn (true/false).');
    return repo.upsertPreference(ctx.db, { studentId: stringField(req.params.studentId, 'studentId', 120, true), pushOptIn: b.pushOptIn, emailOptIn: b.emailOptIn });
  });

  /* -- Leitura pública para o portal e o app: só versões publicadas ------- */

  app.get('/api/public/calendars', async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'public')) return reply;
    const items = listCalendars(ctx.db)
      .filter((c) => c.publishedVersion !== null && c.status !== 'archived')
      .map((c) => {
        const snap = publishedSnapshot(ctx, c.id)!;
        return { id: c.id, title: snap.calendar.title, year: snap.calendar.year, semester: snap.calendar.semester, scope: snap.calendar.scope, version: snap.version, publishedAt: snap.publishedAt };
      });
    return { items };
  });

  app.get<{ Params: { id: string } }>('/api/public/calendars/:id', async (req, reply) => {
    if (!needIntegrationKey(ctx, req, reply, 'public')) return reply;
    const snap = publishedSnapshot(ctx, req.params.id);
    if (!snap) throw notFound('Calendário publicado');
    // o contrato público não expõe pendências internas nem quem editou
    return {
      id: snap.id,
      version: snap.version,
      publishedAt: snap.publishedAt,
      title: snap.calendar.title,
      year: snap.calendar.year,
      semester: snap.calendar.semester,
      scope: snap.calendar.scope,
      legend: snap.calendar.legend,
      notes: snap.calendar.notes.map((n) => ({ id: n.id, text: n.text })),
      events: snap.events.map((e) => ({
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
      })),
    };
  });
}
