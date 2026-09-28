import { describe, expect, it } from 'vitest';
import {
  applyImportance,
  defaultNotificationRule,
  diffReminders,
  instantToWall,
  planEventReminders,
  reminderBlockReason,
  wallTimeToInstant,
} from '../src/schedule';
import { parseDateLabel } from '../src/dates';
import { emptyReview } from '../src/validation';
import type { CalendarEvent, Importance, NotificationJob } from '../src/types';

function event(label: string, importance: Importance, patch: Partial<CalendarEvent> = {}): CalendarEvent {
  const dates = parseDateLabel(label, { year: 2026, semester: 2 }).dates!;
  const anchor = dates.kind === 'list' ? 'each' : 'start';
  const base: CalendarEvent = {
    id: 'e1',
    uid: 'uid-1',
    calendarId: 'c1',
    title: 'Período de aplicação da P1',
    description: '',
    rawText: null,
    dates,
    datesResolved: true,
    times: [],
    location: null,
    urls: [],
    notes: [],
    audience: { groups: [], evidence: null },
    type: 'exam',
    category: null,
    color: null,
    importance,
    notification: applyImportance(defaultNotificationRule(anchor), importance),
    sources: [],
    review: emptyReview(),
    origin: 'import',
    modifiedFromSource: false,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    updatedBy: '',
  };
  return { ...base, ...patch, notification: { ...base.notification, ...(patch.notification ?? {}) } };
}

const ctx = { calendarId: 'c1', calendarTitle: 'Cursos Presenciais', now: new Date('2026-08-01T12:00:00Z') };

describe('fuso America/Sao_Paulo', () => {
  it('09:00 em São Paulo é 12:00 UTC', () => {
    expect(wallTimeToInstant('2026-09-27', '09:00')).toBe('2026-09-27T12:00:00.000Z');
    expect(instantToWall('2026-09-27T12:00:00.000Z')).toEqual({ date: '2026-09-27', time: '09:00' });
  });
});

describe('importância → lembretes', () => {
  it('baixa: nenhum aviso automático', () => {
    expect(planEventReminders(event('25/08', 'low'), ctx)).toEqual([]);
  });

  it('não definida: nenhum aviso', () => {
    const e = event('25/08', 'unset');
    expect(planEventReminders(e, ctx)).toEqual([]);
    expect(reminderBlockReason(e)).toBe('Importância não definida');
  });

  it('média: um push 1 dia antes', () => {
    const plan = planEventReminders(event('25/08', 'medium'), ctx);
    expect(plan).toHaveLength(1);
    expect(plan[0].sendAt).toBe('2026-08-24T12:00:00.000Z');
    expect(plan[0].body).toBe('Período de aplicação da P1 acontece amanhã (25/08).');
  });

  it('alta: pushes 3 dias e 1 dia antes', () => {
    const plan = planEventReminders(event('25/08', 'high'), ctx);
    expect(plan.map((p) => instantToWall(p.sendAt).date)).toEqual(['2026-08-22', '2026-08-24']);
  });

  it('período sem âncora conferida não agenda nada', () => {
    const e = event('28/09 a 09/10', 'high');
    expect(planEventReminders(e, ctx)).toEqual([]);
    expect(reminderBlockReason(e)).toContain('Âncora');
  });

  it('período com âncora no fim conta a partir do fim', () => {
    const e = event('01/07 a 21/08', 'medium', { notification: { anchor: 'end', anchorConfirmed: true } as never });
    const plan = planEventReminders(e, { ...ctx, now: new Date('2026-07-10T00:00:00Z') });
    expect(instantToWall(plan[0].sendAt).date).toBe('2026-08-20');
    expect(plan[0].body).toContain('termina amanhã');
  });

  it('lista de datas isoladas: um lembrete antes de cada data', () => {
    const plan = planEventReminders(event('13, 14, 27 e 28/11', 'medium'), ctx);
    expect(plan.map((p) => p.occurrence)).toEqual(['2026-11-13', '2026-11-14', '2026-11-27', '2026-11-28']);
    expect(new Set(plan.map((p) => p.idempotencyKey)).size).toBe(4);
  });

  it('sem aviso retroativo: horário que já passou não é criado', () => {
    const plan = planEventReminders(event('25/08', 'high'), { ...ctx, now: new Date('2026-08-23T00:00:00Z') });
    expect(plan.map((p) => instantToWall(p.sendAt).date)).toEqual(['2026-08-24']);
  });

  it('replanejar produz as mesmas chaves (idempotência)', () => {
    const a = planEventReminders(event('25/08', 'high'), ctx).map((p) => p.idempotencyKey);
    const b = planEventReminders(event('25/08', 'high'), ctx).map((p) => p.idempotencyKey);
    expect(a).toEqual(b);
  });

  it('personalização da equipe sobrevive à troca de importância', () => {
    const custom = { ...applyImportance(defaultNotificationRule('start'), 'high'), customized: true, offsets: [{ id: 'c1', daysBefore: 5, time: '18:00' }] };
    expect(applyImportance(custom, 'medium').offsets).toEqual([{ id: 'c1', daysBefore: 5, time: '18:00' }]);
    expect(applyImportance(custom, 'low').offsets).toEqual([]);
  });
});

describe('mudança de data publicada → impacto nos agendamentos', () => {
  const job = (key: string, sendAt: string, title: string, body: string): NotificationJob => ({
    id: key,
    kind: 'event_reminder',
    channel: 'push',
    calendarId: 'c1',
    eventUid: 'uid-1',
    lifecycleRuleId: null,
    audience: { type: 'student', studentId: 'x', label: '' },
    title,
    body,
    sendAt,
    status: 'scheduled',
    idempotencyKey: key,
    deliveryKey: key,
    attempts: 0,
    lastError: null,
    providerMessageId: null,
    createdAt: '',
    createdBy: '',
    sentAt: null,
    canceledReason: null,
    context: {},
  });

  it('data alterada vira atualização; aviso que deixou de existir vira cancelamento', () => {
    const before = planEventReminders(event('25/08', 'high'), ctx);
    const active = before.map((p) => job(p.idempotencyKey, p.sendAt, p.title, p.body));

    const moved = planEventReminders(event('26/08', 'medium'), ctx);
    const diff = diffReminders(active, moved);

    expect(diff.update).toHaveLength(1); // d1 continua, em outro horário
    expect(diff.update[0].after.sendAt).toBe('2026-08-25T12:00:00.000Z');
    expect(diff.cancel).toHaveLength(1); // d3 não existe mais na importância média
    expect(diff.create).toHaveLength(0);
  });

  it('nada muda quando o plano é igual', () => {
    const plan = planEventReminders(event('25/08', 'high'), ctx);
    const diff = diffReminders(plan.map((p) => job(p.idempotencyKey, p.sendAt, p.title, p.body)), plan);
    expect(diff).toMatchObject({ create: [], update: [], cancel: [], unchanged: 2 });
  });
});
