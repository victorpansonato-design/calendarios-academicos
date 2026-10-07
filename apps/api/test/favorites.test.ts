import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Calendar, CalendarEvent, ImportBatch, NotificationJob, PublicCalendar, StudentView } from '@calendarios/core';
import { instantToWall } from '@calendarios/core';
import { createTestApp, multipart, type TestApp } from './helpers';
import * as students from '../src/services/students';
import { deleteMark } from '../src/repositories/students';
import { upsertPreference } from '../src/repositories/lifecycle';
import { dispatchDue } from '../src/services/notifications';

/* Visão do aluno: importância sugerida → publicação → estrela → lembrete só para o aluno. */

const here = path.dirname(fileURLToPath(import.meta.url));
const pdf = fs.readFileSync(path.join(here, 'fixtures', 'calendario_presencial_2026_2.pdf'));

type Detail = { calendar: Calendar; events: CalendarEvent[] };
const KEY = { 'x-integration-key': 'chave-aluno' };

let t: TestApp;
let cal: string;
let events: CalendarEvent[];
const ev = (title: string) => events.find((e) => e.title.startsWith(title))!;

const student = (id: string, calendarId = cal) => `/api/public/students/${id}/calendars/${calendarId}`;
async function call<T = Record<string, unknown>>(method: 'GET' | 'PUT' | 'DELETE', url: string, headers: Record<string, string> = KEY) {
  const res = await t.app.inject({ method, url, headers });
  return { status: res.statusCode, body: (res.headers['content-type']?.toString().includes('json') ? res.json() : res.body) as T, headers: res.headers };
}
const favoriteJobs = async () =>
  (await t.api<{ items: NotificationJob[] }>('GET', '/api/notifications/jobs?kind=favorite_reminder')).body.items;

beforeAll(async () => {
  t = await createTestApp({ STUDENT_API_KEY: 'chave-aluno' });
  const mp = multipart([{ field: 'f0', path: 'presencial.pdf', data: pdf }]);
  const up = await t.app.inject({ method: 'POST', url: '/api/imports', payload: mp.body, headers: { 'content-type': mp.contentType, authorization: `Bearer ${t.token}` } });
  const batch = up.json() as ImportBatch;
  await t.api('POST', `/api/imports/${batch.id}/start`, {});
  await t.drainImports();
  cal = (await t.api<ImportBatch>('GET', `/api/imports/${batch.id}`)).body.items[0].calendarId!;
  events = (await t.api<Detail>('GET', `/api/calendars/${cal}`)).body.events;
});

describe('importância sugerida e prévia do aluno', () => {
  it('sugerir importância: prévia sem gravar; aplicar só nos não definidos', async () => {
    const preview = (await t.api<{ suggestions: { title: string; to: string; reason: string }[]; changed: number }>('POST', `/api/calendars/${cal}/events/suggest-importance`, {})).body;
    expect(preview.changed).toBe(0);
    expect(preview.suggestions).toHaveLength(46);
    expect(preview.suggestions.find((s) => s.title === 'Período de aplicação da P1')).toMatchObject({ to: 'high', reason: 'é prova ou avaliação' });
    expect((await t.api<Detail>('GET', `/api/calendars/${cal}`)).body.events.every((e) => e.importance === 'unset')).toBe(true);

    const applied = (await t.api<Detail & { changed: number }>('POST', `/api/calendars/${cal}/events/suggest-importance`, { apply: true })).body;
    expect(applied.changed).toBe(46);
    events = applied.events;
    expect(ev('Feriado – Natal').importance).toBe('medium');
    expect(ev('Cerimônia do Jaleco').importance).toBe('low');
    // de novo: nada a fazer (só mexe nos não definidos)
    expect((await t.api<{ suggestions: unknown[] }>('POST', `/api/calendars/${cal}/events/suggest-importance`, {})).body.suggestions).toHaveLength(0);
  });

  it('a equipe vê o rascunho na prévia; o público só vê depois de publicar', async () => {
    const draft = (await t.api<PublicCalendar>('GET', `/api/calendars/${cal}/student-preview`)).body;
    expect(draft.source).toBe('draft');
    expect(draft.events.find((e) => e.title === 'Período de aplicação da P1')?.studentImportance).toBe('high');
    expect((await t.api('GET', `/api/calendars/${cal}/student-preview?source=published`)).status).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: `/api/public/calendars/${cal}` })).statusCode).toBe(404);
    expect((await call('PUT', `${student('RA1')}/events/${ev('Aplicação da Prova Substitutiva da P1').uid}/star`)).status).toBe(404);
  });

  it('publica com aviso geral no Natal', async () => {
    await t.api('POST', `/api/calendars/${cal}/events/bulk-reminders`, { eventIds: [ev('Feriado – Natal').id], days: [1], time: '09:00' });
    const pub = await t.api<{ favoriteDiff: { create: number } }>('POST', `/api/calendars/${cal}/publish`, { confirm: true });
    expect(pub.status).toBe(200);
    expect(pub.body.favoriteDiff.create).toBe(0);
    const pubCal = (await t.app.inject({ method: 'GET', url: `/api/public/calendars/${cal}` })).json() as PublicCalendar;
    expect(pubCal.events.find((e) => e.title === 'Feriado – Natal')?.calendarReminder).toEqual({ enabled: true, labels: ['1 dia antes, às 09h00'] });
  });
});

describe('marcações do aluno', () => {
  it('exigem STUDENT_API_KEY configurada (503) e válida (401)', async () => {
    expect((await call('GET', `${student('RA1')}/marks`, {})).status).toBe(401);
    expect((await call('GET', `${student('RA1')}/marks`, { 'x-integration-key': 'errada' })).status).toBe(401);
    expect((await call('GET', `${student('RA:1')}/marks`)).status).toBe(400);
    const semChave = await createTestApp();
    const res = await semChave.app.inject({ method: 'GET', url: `/api/public/students/RA1/calendars/${cal}/marks` });
    expect(res.statusCode).toBe(503);
  });

  it('estrela num evento sem aviso: push só para o aluno, 1 dia antes às 09h, com o texto do evento', async () => {
    const sub = ev('Aplicação da Prova Substitutiva da P1');
    const res = await call<{ coveredByCalendar: boolean; note: string; reminders: { sendAt: string }[] }>('PUT', `${student('RA1')}/events/${sub.uid}/star`);
    expect(res.status).toBe(200);
    expect(res.body.coveredByCalendar).toBe(false);
    expect(res.body.note).toBe('Lembrete agendado para 16/10 às 09h00.');
    const jobs = await favoriteJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ kind: 'favorite_reminder', status: 'scheduled', audience: { type: 'student', studentId: 'RA1' } });
    expect(instantToWall(jobs[0].sendAt)).toEqual({ date: '2026-10-16', time: '09:00' });
    expect(jobs[0].body).toBe('Aplicação da Prova Substitutiva da P1 acontece amanhã (17/10).');
    // a agenda da equipe não lista lembretes individuais por padrão
    expect((await t.api<{ items: NotificationJob[] }>('GET', '/api/notifications/jobs')).body.items.some((j) => j.kind === 'favorite_reminder')).toBe(false);
    expect((await t.api<{ favoriteSummary: { scheduled: number; students: number } }>('GET', `/api/calendars/${cal}/reminders`)).body.favoriteSummary).toEqual({ scheduled: 1, students: 1 });
  });

  it('estrela de novo não duplica; desmarcar cancela; marcar de novo reativa o mesmo envio', async () => {
    const sub = ev('Aplicação da Prova Substitutiva da P1');
    await call('PUT', `${student('RA1')}/events/${sub.uid}/star`);
    const [first] = await favoriteJobs();
    expect(await favoriteJobs()).toHaveLength(1);
    expect((await call<{ canceled: number }>('DELETE', `${student('RA1')}/events/${sub.uid}/star`)).body.canceled).toBe(1);
    expect((await favoriteJobs())[0]).toMatchObject({ status: 'canceled', canceledReason: 'O aluno desmarcou o evento' });
    await call('PUT', `${student('RA1')}/events/${sub.uid}/star`);
    const again = await favoriteJobs();
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ id: first.id, status: 'scheduled' });
  });

  it('evento que já tem aviso para todos: estrela não duplica o push', async () => {
    const res = await call<{ coveredByCalendar: boolean; note: string }>('PUT', `${student('RA1')}/events/${ev('Feriado – Natal').uid}/star`);
    expect(res.body).toMatchObject({ coveredByCalendar: true, note: 'Você já recebe o aviso deste evento.' });
    expect((await favoriteJobs()).filter((j) => j.eventUid === ev('Feriado – Natal').uid)).toHaveLength(0);
  });

  it('evento que já passou: marca sem agendar e explica', async () => {
    const res = await call<{ note: string }>('PUT', `${student('RA1')}/events/${ev('Feriado Estadual').uid}/star`);
    expect(res.body.note).toBe('O horário do lembrete já passou.');
  });

  it('Alta não pode ser ocultada; Média sim; Baixa não faz sentido ocultar', async () => {
    expect((await call('PUT', `${student('RA1')}/events/${ev('Período de aplicação da P1').uid}/hide`)).status).toBe(409);
    expect((await call('PUT', `${student('RA1')}/events/${ev('Cerimônia do Jaleco').uid}/hide`)).status).toBe(400);
    expect((await call('PUT', `${student('RA1')}/events/${ev('Feriado – Dia da Independência').uid}/hide`)).status).toBe(200);
    const marks = (await call<{ starred: string[]; hidden: string[] }>('GET', `${student('RA1')}/marks`)).body;
    expect(marks.hidden).toEqual([ev('Feriado – Dia da Independência').uid]);
    expect(marks.starred).toHaveLength(3);
  });

  it('a visão do aluno junta Alta, Média não oculta e favoritos', async () => {
    const view = (await call<StudentView>('GET', `${student('RA1')}/view?shift=Noturno`)).body;
    const titles = view.importantes.map((i) => i.title);
    expect(titles).toContain('Período de aplicação da P1');
    expect(titles).not.toContain('Feriado – Dia da Independência do Brasil');
    expect(view.items.find((i) => i.title === 'Período de aplicação da P1')?.timeLabel).toBe('Noturno 19h30');
    expect(view.counts).toMatchObject({ starred: 3, hidden: 1 });
  });

  it('.ics do evento e dos importantes', async () => {
    const one = await t.app.inject({ method: 'GET', url: `/api/public/calendars/${cal}/events/${ev('Período de aplicação da P1').uid}/evento.ics` });
    expect(one.headers['content-type']).toContain('text/calendar');
    expect(one.body).toContain('DTSTART;VALUE=DATE:20260928');
    const all = await call<string>('GET', `${student('RA1')}/importantes.ics`);
    expect(all.status).toBe(200);
    expect(all.body).toContain('Aplicação da Prova Substitutiva da P1');
    expect(all.body).not.toContain('Cerimônia do Jaleco');
  });
});

describe('republicar e disparar', () => {
  it('republicar: data alterada atualiza; aviso geral novo cancela por cobertura; evento removido cancela', async () => {
    // RA2 marca três eventos sem aviso geral
    const sub = ev('Aplicação da Prova Substitutiva da P1');
    const p2 = ev('Aplicação da Prova Substitutiva da P2');
    const fin = ev('Fim do semestre letivo');
    for (const e of [sub, p2, fin]) await call('PUT', `${student('RA2')}/events/${e.uid}/star`);
    const impact = (await t.api<{ studentImpact: { favorites: unknown } }>('GET', `/api/calendars/${cal}/publish-preview`)).body.studentImpact;
    expect(impact.favorites).toEqual({ create: 0, update: 0, cancel: 0, students: 0 });

    await t.api('PATCH', `/api/calendars/${cal}/events/${sub.id}`, { ...sub, dates: { kind: 'single', start: '2026-10-24', end: '2026-10-24', dates: [], label: '' } });
    await t.api('POST', `/api/calendars/${cal}/events/bulk-reminders`, { eventIds: [p2.id], days: [1], time: '09:00' });
    await t.api('DELETE', `/api/calendars/${cal}/events/${fin.id}`);
    const preview = (await t.api<{ studentImpact: { favorites: { update: number; cancel: number; students: number } } }>('GET', `/api/calendars/${cal}/publish-preview`)).body.studentImpact;
    expect(preview.favorites).toMatchObject({ update: 2, cancel: 2, students: 2 });
    await t.api('POST', `/api/calendars/${cal}/publish`, { confirm: true });

    const jobs = await favoriteJobs();
    const of = (uid: string, studentId: string) => jobs.filter((j) => j.eventUid === uid && j.audience.type === 'student' && j.audience.studentId === studentId);
    expect(of(sub.uid, 'RA2').map((j) => [j.status, instantToWall(j.sendAt).date])).toEqual([['scheduled', '2026-10-23']]);
    expect(of(sub.uid, 'RA1')[0].body).toContain('(24/10)');
    expect(of(p2.uid, 'RA2')[0]).toMatchObject({ status: 'canceled', canceledReason: 'O evento passou a ter aviso para todo o calendário' });
    expect(of(fin.uid, 'RA2')[0]).toMatchObject({ status: 'canceled', canceledReason: 'Evento removido do calendário' });
  });

  it('disparo: push desligado não sai; desmarcado depois de agendado é cancelado na hora', async () => {
    const sub = ev('Aplicação da Prova Substitutiva da P1');
    upsertPreference(t.ctx.db, { studentId: 'RA2', pushOptIn: false, emailOptIn: true });
    deleteMark(t.ctx.db, 'RA1', cal, sub.uid); // simula o aluno desmarcando no instante do disparo
    t.clock.now = new Date('2026-10-23T12:00:30Z');
    await dispatchDue(t.ctx);
    const jobs = (await favoriteJobs()).filter((j) => j.eventUid === sub.uid);
    const by = (s: string) => jobs.find((j) => j.audience.type === 'student' && j.audience.studentId === s)!;
    expect(by('RA2')).toMatchObject({ status: 'skipped' });
    expect(by('RA1')).toMatchObject({ status: 'canceled', canceledReason: 'O aluno desmarcou o evento' });
    t.clock.now = new Date('2026-08-01T12:00:00Z');
  });

  it('arquivar cancela todos os lembretes de favorito (mais de 500)', async () => {
    const p1sub = ev('Período de aplicação da P2');
    for (let i = 0; i < 520; i += 1) students.star(t.ctx, `M${i}`, cal, p1sub.uid);
    const scheduled = () => t.ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM notification_jobs WHERE calendar_id = ? AND status = 'scheduled'", [cal])!.n;
    expect(scheduled()).toBeGreaterThanOrEqual(520);
    const res = await t.api<{ canceledJobs: number }>('POST', `/api/calendars/${cal}/archive`);
    expect(res.body.canceledJobs).toBeGreaterThanOrEqual(520);
    expect(scheduled()).toBe(0);
    expect((await call('PUT', `${student('RA1')}/events/${p1sub.uid}/star`)).status).toBe(404);
  });
});
