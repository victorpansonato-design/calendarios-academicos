import crypto from 'node:crypto';
import type {
  AdditionalCommunicationInput,
  Audience,
  Calendar,
  CalendarEvent,
  NotificationJob,
  PlannedFavoriteReminder,
  PlannedReminder,
  ReminderDiff,
} from '@calendarios/core';
import { deliveryKey, diffReminders, favoriteCancelReason, planCalendarFavorites, planCalendarReminders, planFavoriteReminders, scopeLabel } from '@calendarios/core';
import type { AppContext } from './context';
import { badRequest, conflict, notFound } from './errors';
import { recordAudit } from '../repositories/audit';
import * as jobs from '../repositories/notifications';
import { getPreference } from '../repositories/lifecycle';
import { getMark, listStars } from '../repositories/students';
import { getCalendarRow } from '../repositories/calendars';

/* ==========================================================================
   Agenda de envios
   --------------------------------------------------------------------------
   Quatro origens, visualmente distintas na interface:

     event_reminder    — aviso do evento para todo o público do calendário.
                         Criado/atualizado/cancelado SÓ na publicação;
     favorite_reminder — o mesmo aviso, só para um aluno que marcou o evento
                         com estrela. Criado na hora da estrela e reconciliado
                         a cada publicação;
     additional        — comunicação avulsa que alguém agendou ou enviou;
     lifecycle         — acontecimento individual de um aluno.

   Garantias:
     · a chave de idempotência é única no banco: planejar duas vezes não
       duplica nada;
     · o disparo reivindica cada envio de forma atômica (scheduled → sending),
       então dois processos não enviam o mesmo job;
     · o provedor recebe uma chave de entrega (Idempotency-Key) que muda só
       se o horário mudar — reenvio da mesma entrega é descartável por ele;
     · cada tentativa fica registrada em job_attempts.
   ========================================================================== */

export function calendarAudience(calendar: Pick<Calendar, 'id' | 'scope'>, groups: string[]): Audience {
  const label = scopeLabel(calendar.scope) + (groups.length ? ` · Somente: ${groups.join(', ')}` : '');
  return { type: 'calendar', calendarId: calendar.id, scope: calendar.scope, groups, label };
}

/** Prévia honesta: o número de alunos depende da integração com a base acadêmica. */
export function audiencePreview(calendar: Pick<Calendar, 'id' | 'scope'>, groups: string[]) {
  const audience = calendarAudience(calendar, groups);
  return {
    audience,
    estimate: null as number | null,
    note: 'A contagem de alunos será exibida quando a TI ligar a consulta à base acadêmica. O gateway de envio resolve o público no momento do disparo.',
  };
}

export function planFor(ctx: AppContext, calendar: Pick<Calendar, 'id' | 'title'>, events: CalendarEvent[]): PlannedReminder[] {
  return planCalendarReminders(events, { calendarId: calendar.id, calendarTitle: calendar.title, now: ctx.now() });
}

export function previewReminderDiff(ctx: AppContext, calendar: Calendar, events: CalendarEvent[]): ReminderDiff {
  return diffReminders(jobs.activeReminders(ctx.db, calendar.id), planFor(ctx, calendar, events));
}

/**
 * Cria o envio planejado, ou reativa o mesmo registro se ele tinha sido
 * cancelado. Envio que já saiu nunca é refeito.
 */
function upsertPlannedJob(ctx: AppContext, p: PlannedReminder, build: () => jobs.NewJob, why: string): 'created' | 'reactivated' | 'kept' {
  const existing = jobs.getJobByKey(ctx.db, p.idempotencyKey);
  if (!existing) {
    jobs.insertJob(ctx.db, build());
    return 'created';
  }
  if (existing.status !== 'canceled') return 'kept';
  jobs.updateJob(ctx.db, existing.id, { status: 'scheduled', sendAt: p.sendAt, title: p.title, body: p.body, deliveryKey: deliveryKey(p.idempotencyKey, p.sendAt), canceledReason: null });
  jobs.addAttempt(ctx.db, existing.id, 'skipped', why);
  return 'reactivated';
}

function applyDiff<P extends PlannedReminder>(ctx: AppContext, diff: ReminderDiff<P>, build: (p: P) => jobs.NewJob, where: string) {
  for (const p of diff.create) upsertPlannedJob(ctx, p, () => build(p), `Reagendado ${where}.`);
  for (const u of diff.update) {
    jobs.updateJob(ctx.db, u.before.id, {
      sendAt: u.after.sendAt,
      title: u.after.title,
      body: u.after.body,
      deliveryKey: deliveryKey(u.after.idempotencyKey, u.after.sendAt),
      status: 'scheduled',
    });
    jobs.addAttempt(ctx.db, u.before.id, 'skipped', `Atualizado ${where}: ${u.before.sendAt} → ${u.after.sendAt}.`);
  }
  for (const c of diff.cancel) {
    jobs.updateJob(ctx.db, c.job.id, { status: 'canceled', canceledReason: c.reason });
    jobs.addAttempt(ctx.db, c.job.id, 'skipped', `Cancelado ${where}: ${c.reason}.`);
  }
}

/** Aplica o plano da versão publicada. Chamado dentro da transação de publicação. */
export function applyReminderPlan(ctx: AppContext, calendar: Calendar, events: CalendarEvent[], actor: string): ReminderDiff {
  const diff = previewReminderDiff(ctx, calendar, events);
  const byUid = new Map(events.map((e) => [e.uid, e]));
  applyDiff(
    ctx,
    diff,
    (p) => ({
      kind: 'event_reminder',
      channel: p.channel,
      calendarId: calendar.id,
      eventUid: p.eventUid,
      lifecycleRuleId: null,
      audience: calendarAudience(calendar, byUid.get(p.eventUid)!.audience.groups),
      title: p.title,
      body: p.body,
      sendAt: p.sendAt,
      idempotencyKey: p.idempotencyKey,
      deliveryKey: deliveryKey(p.idempotencyKey, p.sendAt),
      createdBy: actor,
      context: { calendarTitle: calendar.title, eventTitle: p.eventTitle, offsetLabel: p.offsetLabel },
    }),
    'pela publicação',
  );
  if (diff.create.length || diff.update.length || diff.cancel.length)
    recordAudit(ctx.db, {
      actor,
      action: 'reminders.replan',
      entity: 'calendar',
      entityId: calendar.id,
      summary: `Avisos: ${diff.create.length} novo(s), ${diff.update.length} atualizado(s), ${diff.cancel.length} cancelado(s).`,
    });
  return diff;
}

/* -- Lembretes de favorito ------------------------------------------------ */

export function favoriteJob(calendar: Pick<Calendar, 'id' | 'title'>, p: PlannedFavoriteReminder, actor: string): jobs.NewJob {
  return {
    kind: 'favorite_reminder',
    channel: p.channel,
    calendarId: calendar.id,
    eventUid: p.eventUid,
    lifecycleRuleId: null,
    audience: { type: 'student', studentId: p.studentId, label: `Aluno ${p.studentId}` },
    studentId: p.studentId,
    title: p.title,
    body: p.body,
    sendAt: p.sendAt,
    idempotencyKey: p.idempotencyKey,
    deliveryKey: deliveryKey(p.idempotencyKey, p.sendAt),
    createdBy: actor,
    context: { calendarTitle: calendar.title, eventTitle: p.eventTitle, offsetLabel: p.offsetLabel },
  };
}

/** O que a publicação faria com os lembretes de favorito (sem gravar). */
export function previewFavoriteDiff(ctx: AppContext, calendar: Pick<Calendar, 'id' | 'title'>, events: CalendarEvent[]): ReminderDiff<PlannedFavoriteReminder> {
  const planned = planCalendarFavorites(events, listStars(ctx.db, calendar.id), { calendarId: calendar.id, calendarTitle: calendar.title, now: ctx.now() });
  const diff = diffReminders(jobs.listActiveJobs(ctx.db, { calendarId: calendar.id, kind: 'favorite_reminder' }), planned);
  const byUid = new Map(events.map((e) => [e.uid, e]));
  return { ...diff, cancel: diff.cancel.map((c) => ({ ...c, reason: favoriteCancelReason(c.job, byUid) })) };
}

/** Reconcilia os lembretes de favorito com a versão publicada (mesma transação da publicação). */
export function applyFavoritePlan(ctx: AppContext, calendar: Pick<Calendar, 'id' | 'title'>, events: CalendarEvent[], actor: string): ReminderDiff<PlannedFavoriteReminder> {
  const diff = previewFavoriteDiff(ctx, calendar, events);
  applyDiff(ctx, diff, (p) => favoriteJob(calendar, p, actor), 'pela publicação');
  if (diff.create.length || diff.update.length || diff.cancel.length)
    recordAudit(ctx.db, {
      actor,
      action: 'favorites.replan',
      entity: 'calendar',
      entityId: calendar.id,
      // só contagens: quem favoritou o quê é dado pessoal e fica fora da auditoria
      summary: `Lembretes de favoritos: ${diff.create.length} novo(s), ${diff.update.length} atualizado(s), ${diff.cancel.length} cancelado(s).`,
    });
  return diff;
}

/** Agenda os lembretes de UMA estrela. Devolve o que ficou agendado. */
export function scheduleFavorite(ctx: AppContext, calendar: Pick<Calendar, 'id' | 'title'>, event: CalendarEvent, studentId: string): NotificationJob[] {
  const planned = planFavoriteReminders(event, { calendarId: calendar.id, calendarTitle: calendar.title, now: ctx.now(), studentId });
  for (const p of planned) upsertPlannedJob(ctx, p, () => favoriteJob(calendar, p, 'Aluno (portal/app)'), 'Reagendado: o aluno marcou de novo.');
  return planned.map((p) => jobs.getJobByKey(ctx.db, p.idempotencyKey)!).filter(Boolean);
}

/** Cancela os lembretes de favorito de um aluno num evento. */
export function cancelFavorite(ctx: AppContext, calendarId: string, studentId: string, eventUid: string, reason: string): number {
  const active = jobs.listActiveJobs(ctx.db, { calendarId, kind: 'favorite_reminder', studentId, eventUid });
  for (const j of active) {
    jobs.updateJob(ctx.db, j.id, { status: 'canceled', canceledReason: reason });
    jobs.addAttempt(ctx.db, j.id, 'skipped', `Cancelado: ${reason}.`);
  }
  return active.length;
}

/** Arquivar um calendário cancela todos os envios futuros dele. */
export function cancelCalendarJobs(ctx: AppContext, calendarId: string, reason: string, actor: string): number {
  const active = jobs.listActiveJobs(ctx.db, { calendarId });
  for (const j of active) {
    jobs.updateJob(ctx.db, j.id, { status: 'canceled', canceledReason: reason });
    jobs.addAttempt(ctx.db, j.id, 'skipped', `Cancelado: ${reason}.`);
  }
  if (active.length) recordAudit(ctx.db, { actor, action: 'jobs.cancel_all', entity: 'calendar', entityId: calendarId, summary: `${active.length} envio(s) cancelado(s): ${reason}.` });
  return active.length;
}

/* -- Comunicação adicional ------------------------------------------------ */

export function createAdditional(ctx: AppContext, calendar: Calendar, event: CalendarEvent | null, input: AdditionalCommunicationInput, actor: string): NotificationJob {
  if (calendar.status === 'archived') throw badRequest('Calendário arquivado não recebe comunicações.');
  if (!calendar.publishedVersion) throw badRequest('Publique o calendário antes de enviar comunicações sobre ele.');
  if (!input.title.trim() || !input.body.trim()) throw badRequest('Preencha o título/assunto e a mensagem.');
  const now = ctx.now();
  const sendAt = input.sendAt ?? now.toISOString();
  if (input.sendAt && new Date(input.sendAt).getTime() < now.getTime() - 60_000) throw badRequest('O horário escolhido já passou. Escolha um horário futuro ou "Enviar agora".');
  const key = `add:${crypto.randomUUID()}`;
  const job = jobs.insertJob(ctx.db, {
    kind: 'additional',
    channel: input.channel,
    calendarId: calendar.id,
    eventUid: event?.uid ?? null,
    lifecycleRuleId: null,
    audience: calendarAudience(calendar, input.groups),
    title: input.title.trim(),
    body: input.body.trim(),
    sendAt,
    idempotencyKey: key,
    deliveryKey: deliveryKey(key, sendAt),
    createdBy: actor,
    context: { calendarTitle: calendar.title, eventTitle: event?.title },
  })!;
  recordAudit(ctx.db, {
    actor,
    action: input.sendAt ? 'additional.schedule' : 'additional.send_now',
    entity: 'notification',
    entityId: job.id,
    summary: `${input.channel === 'push' ? 'Push' : 'E-mail'} adicional ${input.sendAt ? 'agendado' : 'enviado agora'}: "${job.title}".`,
    detail: { audience: job.audience, sendAt },
  });
  return job;
}

export function cancelJob(ctx: AppContext, id: string, actor: string, reason = 'Cancelado manualmente'): NotificationJob {
  const job = jobs.getJob(ctx.db, id);
  if (!job) throw notFound('Envio');
  if (!['scheduled', 'blocked', 'failed'].includes(job.status)) throw conflict('Só é possível cancelar envios que ainda não saíram.');
  jobs.updateJob(ctx.db, id, { status: 'canceled', canceledReason: reason });
  jobs.addAttempt(ctx.db, id, 'skipped', `${reason} por ${actor}.`);
  recordAudit(ctx.db, { actor, action: 'job.cancel', entity: 'notification', entityId: id, summary: `Envio cancelado: "${job.title}".` });
  return jobs.getJob(ctx.db, id)!;
}

/** Nova tentativa para falhas e para envios que aguardavam configuração. */
export function retryJob(ctx: AppContext, id: string, actor: string): NotificationJob {
  const job = jobs.getJob(ctx.db, id);
  if (!job) throw notFound('Envio');
  if (!['failed', 'blocked'].includes(job.status)) throw conflict('Só envios com falha ou aguardando configuração podem ser tentados de novo.');
  const now = ctx.now().toISOString();
  const sendAt = job.sendAt > now ? job.sendAt : now;
  jobs.updateJob(ctx.db, id, { status: 'scheduled', sendAt, lastError: null });
  jobs.addAttempt(ctx.db, id, 'skipped', `Nova tentativa solicitada por ${actor}.`);
  recordAudit(ctx.db, { actor, action: 'job.retry', entity: 'notification', entityId: id, summary: `Nova tentativa: "${job.title}".` });
  return jobs.getJob(ctx.db, id)!;
}

/* -- Disparo -------------------------------------------------------------- */

/**
 * Dispara os envios vencidos em lotes, repetindo enquanto o lote vier cheio
 * (até um limite de tempo). Lembretes de favorito são um por aluno: às 09h
 * podem vencer milhares de uma vez.
 */
export async function dispatchDue(ctx: AppContext, budgetMs = 15_000): Promise<number> {
  const started = Date.now();
  const batch = ctx.config.scheduler.batchSize;
  jobs.releaseStuckJobs(ctx.db, new Date(ctx.now().getTime() - 10 * 60_000));
  let total = 0;
  for (;;) {
    const claimed = jobs.claimDueJobs(ctx.db, ctx.now(), batch);
    for (const job of claimed) await deliverOne(ctx, job);
    total += claimed.length;
    if (claimed.length < batch || Date.now() - started > budgetMs) return total;
  }
}

async function deliverOne(ctx: AppContext, job: NotificationJob) {
  // Favorito: confere de novo na hora de enviar — o aluno pode ter desmarcado
  // (ou o calendário saído do ar) depois que o envio foi reivindicado.
  if (job.kind === 'favorite_reminder' && job.audience.type === 'student' && job.calendarId && job.eventUid) {
    const stillStarred = getMark(ctx.db, job.audience.studentId, job.calendarId, job.eventUid) === 'star';
    const live = getCalendarRow(ctx.db, job.calendarId)?.status !== 'archived';
    if (!stillStarred || !live) {
      const reason = stillStarred ? 'Calendário arquivado' : 'O aluno desmarcou o evento';
      jobs.updateJob(ctx.db, job.id, { status: 'canceled', canceledReason: reason });
      jobs.addAttempt(ctx.db, job.id, 'skipped', `Não enviado: ${reason.toLowerCase()}.`);
      return;
    }
  }

  // Consentimento: acontecimentos individuais respeitam a preferência do aluno.
  if (job.audience.type === 'student') {
    const pref = getPreference(ctx.db, job.audience.studentId);
    const optedOut = pref && (job.channel === 'push' ? !pref.pushOptIn : !pref.emailOptIn);
    if (optedOut) {
      jobs.updateJob(ctx.db, job.id, { status: 'skipped', lastError: 'O aluno desativou este canal.' });
      jobs.addAttempt(ctx.db, job.id, 'skipped', 'Não enviado: o aluno desativou este canal nas preferências.');
      return;
    }
  }

  const provider = ctx.providers[job.channel];
  let result;
  try {
    result = await provider.deliver(job);
  } catch (err) {
    result = { outcome: 'failed' as const, detail: `Erro inesperado: ${(err as Error).message}`, retryable: true };
  }
  jobs.updateJob(ctx.db, job.id, { incrementAttempts: true });
  jobs.addAttempt(ctx.db, job.id, result.outcome, result.detail);

  if (result.outcome === 'sent' || result.outcome === 'demo_sent') {
    jobs.updateJob(ctx.db, job.id, { status: result.outcome, sentAt: ctx.now().toISOString(), providerMessageId: result.providerMessageId ?? null, lastError: null });
  } else if (result.outcome === 'blocked') {
    jobs.updateJob(ctx.db, job.id, { status: 'blocked', lastError: result.detail });
  } else {
    const attempts = job.attempts + 1;
    const retry = result.retryable && attempts < ctx.config.scheduler.maxAttempts;
    jobs.updateJob(ctx.db, job.id, {
      status: retry ? 'scheduled' : 'failed',
      lastError: result.detail,
      // nova tentativa com espera crescente: 2, 4, 8 minutos…
      ...(retry ? { sendAt: new Date(ctx.now().getTime() + 2 ** attempts * 60_000).toISOString() } : {}),
    });
  }
}
