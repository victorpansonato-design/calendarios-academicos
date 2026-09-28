import { beforeAll, describe, expect, it } from 'vitest';
import type { LifecycleRule, NotificationJob } from '@calendarios/core';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
let rule: LifecycleRule;

const send = (payload: unknown) =>
  t.app.inject({ method: 'POST', url: '/api/integrations/student-events', payload: payload as object, headers: { 'x-integration-key': 'chave-teste' } });

beforeAll(async () => {
  t = await createTestApp();
  rule = (await t.api<{ items: LifecycleRule[] }>('GET', '/api/lifecycle/rules')).body.items[0];
});

describe('acontecimentos do aluno', () => {
  it('as oito regras existem e nascem aguardando mapeamento da TI', async () => {
    const rules = (await t.api<{ items: LifecycleRule[] }>('GET', '/api/lifecycle/rules')).body.items;
    expect(rules.map((r) => r.name)).toEqual([
      'Horas complementares deferidas',
      'Horas complementares indeferidas',
      'Prática extensionista deferida',
      'Prática extensionista indeferida',
      'Encerramento do RA e colação de grau',
      'Solicitação de horas de estágio',
      'Serviço entregue pela Secretaria Virtual',
      'Compensação de Ausência',
    ]);
  });

  it('não liga uma etapa sem mapeamento técnico', async () => {
    const res = await t.api('PUT', `/api/lifecycle/rules/${rule.id}`, { steps: [{ ...rule.steps[0], enabled: true }] });
    expect(res.status).toBe(400);
  });

  it('status sem regra é registrado e não envia nada', async () => {
    const res = await send({ eventId: 'e-0', sourceSystem: 'lyceum', statusCode: 'X', occurredAt: '2026-08-01T12:00:00Z', student: { id: 's1' } });
    expect(res.json()).toMatchObject({ outcome: 'unmapped', jobIds: [] });
  });

  it('com mapeamento: um envio por canal, endereçado SÓ ao aluno do acontecimento, idempotente', async () => {
    const step = { ...rule.steps[0], enabled: true, channels: ['push', 'email'], trigger: { sourceSystem: 'Lyceum', statusCode: 'HC_DEFERIDA', notes: '' } };
    expect((await t.api('PUT', `/api/lifecycle/rules/${rule.id}`, { steps: [step] })).status).toBe(200);

    const payload = {
      eventId: 'lyceum-123',
      sourceSystem: 'lyceum',
      statusCode: 'hc_deferida',
      occurredAt: '2026-08-01T12:00:00Z',
      student: { id: 'aluno-42', ra: '1234567', firstName: 'Ana' },
      data: { 'solicitacao.horas': 20, 'solicitacao.protocolo': 'P-9' },
    };
    const first = await send(payload);
    expect(first.statusCode).toBe(202);
    expect(first.json().jobIds).toHaveLength(2);

    const again = await send(payload);
    expect(again.json()).toMatchObject({ duplicate: true });

    const jobs = (await t.api<{ items: NotificationJob[] }>('GET', '/api/notifications/jobs?kind=lifecycle')).body.items;
    expect(jobs).toHaveLength(2);
    for (const j of jobs) {
      expect(j.audience).toEqual({ type: 'student', studentId: 'aluno-42', label: 'Aluno RA 1234567' });
      expect(`${j.title} ${j.body}`).toContain('Ana');
      expect(j.body).not.toContain('{{');
    }
  });

  it('respeita a preferência do aluno por canal', async () => {
    await t.app.inject({ method: 'PUT', url: '/api/integrations/student-preferences/aluno-7', payload: { pushOptIn: false, emailOptIn: false }, headers: { 'x-integration-key': 'chave-teste' } });
    const res = await send({ eventId: 'lyceum-777', sourceSystem: 'lyceum', statusCode: 'HC_DEFERIDA', occurredAt: '2026-08-01T12:00:00Z', student: { id: 'aluno-7' } });
    expect(res.json()).toMatchObject({ outcome: 'opted_out', jobIds: [] });
  });

  it('a prévia usa só dados fictícios', async () => {
    const res = await t.api<{ pushBody: string; sample: Record<string, string> }>('POST', `/api/lifecycle/rules/${rule.id}/preview`, rule.steps[0]);
    expect(res.body.pushBody).toContain('Maria');
    expect(res.body.sample['aluno.primeiro_nome']).toBe('Maria');
  });
});
