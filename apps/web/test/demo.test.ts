import { describe, expect, it } from 'vitest';
import type { CalendarEvent, NotificationJob, StudentView } from '@calendarios/core';
import { demoRequest } from '../src/demo/server';

/* A demonstração da Vercel responde como a API: importância sugerida,
   publicação, estrela → lembrete só do aluno. */

type Detail = { calendar: { id: string }; events: CalendarEvent[] };

describe('demonstração (VITE_DEMO)', () => {
  it('abre com importância sugerida e coorte confirmada; estrela gera lembrete do aluno após publicar', async () => {
    const { items } = (await demoRequest('GET', '/api/calendars')) as { items: { id: string }[] };
    const id = items[0].id;
    const d = (await demoRequest('GET', `/api/calendars/${id}`)) as Detail;
    expect(d.events.some((e) => e.importance === 'unset')).toBe(false);
    expect(d.events.find((e) => e.title === 'Início das aulas para Veteranos')?.audience.groups).toEqual(['Veteranos']);

    const draft = (await demoRequest('GET', `/api/calendars/${id}/student-preview`)) as { source: string };
    expect(draft.source).toBe('draft');
    await demoRequest('POST', `/api/calendars/${id}/publish`, { confirm: true });

    const ev = d.events.find((e) => e.title === 'Feriado – Natal')!;
    const star = (await demoRequest('PUT', `/api/public/students/RA1/calendars/${id}/events/${ev.uid}/star`)) as { note: string };
    // a demonstração usa o relógio real: depois de 24/12/2026 às 09h o lembrete já passou
    const future = Date.now() < Date.parse('2026-12-24T12:00:00Z');
    expect(star.note).toBe(future ? 'Lembrete agendado para 24/12 às 09h00.' : 'O horário do lembrete já passou.');
    const view = (await demoRequest('GET', `/api/public/students/RA1/calendars/${id}/view`)) as StudentView;
    expect(view.counts.starred).toBe(1);
    const fav = (await demoRequest('GET', '/api/notifications/jobs?kind=favorite_reminder')) as { items: NotificationJob[] };
    expect(fav.items).toHaveLength(future ? 1 : 0);
    const all = (await demoRequest('GET', '/api/notifications/jobs')) as { items: NotificationJob[] };
    expect(all.items.some((j) => j.kind === 'favorite_reminder')).toBe(false);
  });
});
