import type { FastifyInstance } from 'fastify';
import type { LifecycleStep, StudentEventPayload } from '@calendarios/core';
import type { AppContext } from '../services/context';
import { need, needIntegrationKey } from './auth';
import * as svc from '../services/lifecycle';
import * as repo from '../repositories/lifecycle';
import { badRequest, notFound } from '../services/errors';
import { stringField } from '../services/validate';

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
}
