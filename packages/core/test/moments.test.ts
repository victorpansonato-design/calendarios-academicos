import { describe, expect, it } from 'vitest';
import { defaultNotificationRule, importanceForMoments, instantToWall, planEventReminders, reminderBlockReason, setReminderMoments } from '../src/schedule';
import { eventBlockers, openEventIssues } from '../src/validation';
import { parseDateLabel } from '../src/dates';
import { emptyReview } from '../src/validation';
import type { CalendarEvent } from '../src/types';

function event(label: string, days: number[], time: string, times: { shift: null; time: string; raw: string }[] = []): CalendarEvent {
  const dates = parseDateLabel(label, { year: 2026, semester: 2 }).dates!;
  return {
    id: 'e',
    uid: 'u',
    calendarId: 'c',
    title: 'Evento',
    description: '',
    rawText: null,
    dates,
    datesResolved: true,
    times,
    location: null,
    urls: [],
    notes: [],
    audience: { groups: [], evidence: null },
    type: 'academic',
    category: null,
    color: null,
    importance: importanceForMoments(days),
    notification: { ...setReminderMoments(defaultNotificationRule(dates.kind === 'list' ? 'each' : 'start'), days, time), anchorConfirmed: true },
    sources: [],
    review: emptyReview(),
    origin: 'manual',
    modifiedFromSource: false,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    updatedBy: '',
  };
}

const ctx = { calendarId: 'c', calendarTitle: 'C', now: new Date('2026-08-01T12:00:00Z') };

describe('momentos e horário do aviso', () => {
  it('avisa no dia, no horário informado', () => {
    const plan = planEventReminders(event('25/08', [0], '07:00'), ctx);
    expect(plan.map((p) => instantToWall(p.sendAt))).toEqual([{ date: '2026-08-25', time: '07:00' }]);
    expect(plan[0].offsetLabel).toBe('No dia, às 07h00');
  });

  it('combina no dia, 1 e 3 dias antes com o mesmo horário', () => {
    const plan = planEventReminders(event('25/08', [0, 1, 3], '18:30'), ctx);
    expect(plan.map((p) => instantToWall(p.sendAt).date)).toEqual(['2026-08-22', '2026-08-24', '2026-08-25']);
    expect(plan.every((p) => instantToWall(p.sendAt).time === '18:30')).toBe(true);
  });

  it('sem horário, não agenda nada e TRAVA a publicação', () => {
    const e = event('25/08', [1], '');
    expect(planEventReminders(e, ctx)).toEqual([]);
    expect(reminderBlockReason(e)).toBe('Falta o horário do aviso');
    expect(eventBlockers(e).map((i) => i.code)).toEqual(['reminder_time_missing']);
  });

  it('"Não avisar" é uma escolha válida e não trava', () => {
    const e = event('25/08', [], '');
    expect(e.importance).toBe('low');
    expect(eventBlockers(e)).toEqual([]);
  });

  it('alerta quando o aviso do dia sai depois que o evento começa', () => {
    const e = event('25/08', [0], '09:00', [{ shift: null, time: '07:30', raw: '' }]);
    const issue = openEventIssues(e).find((i) => i.code === 'reminder_after_start');
    expect(issue?.severity).toBe('warning');
    expect(eventBlockers(e)).toEqual([]); // alerta, não trava
    expect(openEventIssues(event('25/08', [0], '06:00', [{ shift: null, time: '07:30', raw: '' }])).some((i) => i.code === 'reminder_after_start')).toBe(false);
  });
});
