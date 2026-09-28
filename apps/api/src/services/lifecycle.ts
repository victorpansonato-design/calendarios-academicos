import crypto from 'node:crypto';
import type { Channel, LifecycleRule, LifecycleStep, StudentEventPayload, StudentEventRecord, User } from '@calendarios/core';
import { deliveryKey, findStep, isStepMapped, lifecycleSendAt, previewValues, renderStep, renderTemplate } from '@calendarios/core';
import type { AppContext } from './context';
import { badRequest, notFound } from './errors';
import * as repo from '../repositories/lifecycle';
import { insertJob } from '../repositories/notifications';
import { recordAudit } from '../repositories/audit';
import { stringField, wallTime } from './validate';

/* ==========================================================================
   Acontecimentos do aluno
   --------------------------------------------------------------------------
   Os sistemas institucionais avisam uma mudança de status em
   POST /api/integrations/student-events. Aqui:

     1. idempotência — o mesmo `eventId` de origem nunca gera dois envios;
     2. a etapa é encontrada pelo mapeamento que a TI configurou (sistema +
        código de status). Sem mapeamento: registrado como "sem regra";
     3. etapa desligada: registrado, nada é enviado;
     4. cada envio tem UM destinatário — o aluno do acontecimento. A mensagem é
        renderizada só com os dados desse acontecimento;
     5. preferências de canal do aluno são checadas de novo no disparo.
   ========================================================================== */

function validStep(input: Partial<LifecycleStep>, index: number, existing: LifecycleStep | undefined): LifecycleStep {
  const label = stringField(input.label, `o nome da etapa ${index + 1}`, 80, true);
  const trigger = (input.trigger ?? {}) as Partial<LifecycleStep['trigger']>;
  const channels = (input.channels ?? []).filter((c): c is Channel => c === 'push' || c === 'email');
  const timing = input.timing ?? { mode: 'immediate' };
  let validTiming: LifecycleStep['timing'];
  if (timing.mode === 'delay') {
    const minutes = Number(timing.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) throw badRequest(`Etapa "${label}": o atraso deve ser de 1 a 10080 minutos.`);
    validTiming = { mode: 'delay', minutes };
  } else if (timing.mode === 'business_hours') {
    const start = wallTime(timing.start, `Etapa "${label}": início do horário comercial`);
    const end = wallTime(timing.end, `Etapa "${label}": fim do horário comercial`);
    if (start >= end) throw badRequest(`Etapa "${label}": o horário comercial precisa terminar depois de começar.`);
    validTiming = { mode: 'business_hours', start, end };
  } else validTiming = { mode: 'immediate' };

  const step: LifecycleStep = {
    id: existing?.id ?? `st-${crypto.randomUUID().slice(0, 8)}`,
    label,
    trigger: {
      sourceSystem: stringField(trigger.sourceSystem, 'o sistema de origem', 80),
      statusCode: stringField(trigger.statusCode, 'o código de status', 120),
      notes: stringField(trigger.notes, 'as observações técnicas', 1000),
    },
    enabled: Boolean(input.enabled),
    channels,
    timing: validTiming,
    pushTitle: stringField(input.pushTitle, 'o título do push', 120),
    pushBody: stringField(input.pushBody, 'o texto do push', 500),
    emailSubject: stringField(input.emailSubject, 'o assunto do e-mail', 200),
    emailBody: stringField(input.emailBody, 'o texto do e-mail', 5000),
  };
  if (step.enabled) {
    if (!isStepMapped(step)) throw badRequest(`Etapa "${label}": só é possível ligar depois que a TI preencher o sistema de origem e o código de status.`);
    if (!step.channels.length) throw badRequest(`Etapa "${label}": escolha pelo menos um canal.`);
    if (step.channels.includes('push') && (!step.pushTitle || !step.pushBody)) throw badRequest(`Etapa "${label}": preencha o título e o texto do push.`);
    if (step.channels.includes('email') && (!step.emailSubject || !step.emailBody)) throw badRequest(`Etapa "${label}": preencha o assunto e o texto do e-mail.`);
  }
  return step;
}

export function updateRule(ctx: AppContext, id: string, input: { steps: Partial<LifecycleStep>[] }, actor: User): LifecycleRule {
  const rule = repo.getRule(ctx.db, id);
  if (!rule) throw notFound('Regra');
  if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 12) throw badRequest('Uma regra precisa de 1 a 12 etapas.');
  const steps = input.steps.map((s, i) => validStep(s, i, rule.steps.find((x) => x.id === s.id)));
  // o mesmo status não pode disparar duas etapas
  const keys = steps.filter(isStepMapped).map((s) => `${s.trigger.sourceSystem.toLowerCase()}|${s.trigger.statusCode.toLowerCase()}`);
  const others = repo
    .listRules(ctx.db)
    .filter((r) => r.id !== id)
    .flatMap((r) => r.steps.filter(isStepMapped).map((s) => ({ r, key: `${s.trigger.sourceSystem.toLowerCase()}|${s.trigger.statusCode.toLowerCase()}` })));
  for (const k of keys) {
    if (keys.filter((x) => x === k).length > 1) throw badRequest('Duas etapas desta regra usam o mesmo sistema e código de status.');
    const clash = others.find((o) => o.key === k);
    if (clash) throw badRequest(`O código de status "${k.split('|')[1]}" já está mapeado na regra "${clash.r.name}".`);
  }
  const next: LifecycleRule = { ...rule, steps, updatedAt: ctx.now().toISOString(), updatedBy: actor.name };
  repo.saveRule(ctx.db, next);
  recordAudit(ctx.db, { actor: actor.name, action: 'lifecycle.update', entity: 'lifecycle_rule', entityId: id, summary: `Regra "${rule.name}" alterada.`, detail: { steps: steps.map((s) => ({ label: s.label, enabled: s.enabled, mapped: isStepMapped(s) })) } });
  return next;
}

/** Prévia com dados fictícios — nenhum dado de aluno real. */
export function previewStep(rule: LifecycleRule, step: Partial<LifecycleStep>) {
  const values = previewValues(rule);
  const r = (t?: string) => renderTemplate(t ?? '', values);
  const parts = { pushTitle: r(step.pushTitle), pushBody: r(step.pushBody), emailSubject: r(step.emailSubject), emailBody: r(step.emailBody) };
  return {
    pushTitle: parts.pushTitle.text,
    pushBody: parts.pushBody.text,
    emailSubject: parts.emailSubject.text,
    emailBody: parts.emailBody.text,
    missing: [...new Set(Object.values(parts).flatMap((p) => p.missing))],
    sample: values,
  };
}

export function receiveStudentEvent(ctx: AppContext, payload: StudentEventPayload): { record: StudentEventRecord; duplicate: boolean } {
  if (!payload || typeof payload !== 'object') throw badRequest('Corpo inválido.');
  const eventId = stringField(payload.eventId, 'eventId', 200, true);
  const sourceSystem = stringField(payload.sourceSystem, 'sourceSystem', 80, true);
  const statusCode = stringField(payload.statusCode, 'statusCode', 120, true);
  const studentId = stringField(payload.student?.id, 'student.id', 120, true);

  return ctx.db.tx(() => {
    const existing = repo.findStudentEvent(ctx.db, eventId);
    if (existing) return { record: existing, duplicate: true };

    const match = findStep(repo.listRules(ctx.db), sourceSystem, statusCode);
    const base = { externalEventId: eventId, sourceSystem, statusCode, studentId };
    if (!match) return { record: repo.insertStudentEvent(ctx.db, { ...base, ruleId: null, stepId: null, outcome: 'unmapped', jobIds: [] }), duplicate: false };
    const { rule, step } = match;
    if (!step.enabled) return { record: repo.insertStudentEvent(ctx.db, { ...base, ruleId: rule.id, stepId: step.id, outcome: 'disabled', jobIds: [] }), duplicate: false };

    const pref = repo.getPreference(ctx.db, studentId);
    const channels = step.channels.filter((c) => !pref || (c === 'push' ? pref.pushOptIn : pref.emailOptIn));
    if (!channels.length) return { record: repo.insertStudentEvent(ctx.db, { ...base, ruleId: rule.id, stepId: step.id, outcome: 'opted_out', jobIds: [] }), duplicate: false };

    const msg = renderStep(step, { student: { id: studentId, ra: payload.student.ra, firstName: payload.student.firstName }, data: payload.data });
    const sendAt = lifecycleSendAt(step.timing, ctx.now());
    const label = payload.student.ra ? `Aluno RA ${payload.student.ra}` : `Aluno ${studentId}`;
    const jobIds: string[] = [];
    for (const channel of channels) {
      const key = `life:${eventId}:${channel}`;
      const job = insertJob(ctx.db, {
        kind: 'lifecycle',
        channel,
        calendarId: null,
        eventUid: null,
        lifecycleRuleId: rule.id,
        audience: { type: 'student', studentId, label },
        title: channel === 'push' ? msg.pushTitle : msg.emailSubject,
        body: channel === 'push' ? msg.pushBody : msg.emailBody,
        sendAt,
        idempotencyKey: key,
        deliveryKey: deliveryKey(key, sendAt),
        createdBy: `integração:${sourceSystem}`,
        context: { ruleName: `${rule.name} · ${step.label}` },
      });
      if (job) jobIds.push(job.id);
    }
    const record = repo.insertStudentEvent(ctx.db, { ...base, ruleId: rule.id, stepId: step.id, outcome: 'scheduled', jobIds });
    recordAudit(ctx.db, {
      actor: `integração:${sourceSystem}`,
      action: 'lifecycle.received',
      entity: 'lifecycle_rule',
      entityId: rule.id,
      summary: `Acontecimento "${step.label}" recebido; ${jobIds.length} envio(s) agendado(s).`,
      detail: { eventId, studentId, missingVariables: msg.missing },
    });
    return { record, duplicate: false };
  });
}
