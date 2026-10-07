import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import type { CalendarEvent, ImportBatch, NotificationJob, PublishCheck, ReminderDiff, Calendar, StudentImpact } from '@calendarios/core';
import { instantToWall } from '@calendarios/core';
import { createTestApp, multipart, type TestApp } from './helpers';

/* Fluxo completo pela API: anexar → conferir → ajustar → publicar → avisos. */

const here = path.dirname(fileURLToPath(import.meta.url));
const pdf = fs.readFileSync(path.join(here, 'fixtures', 'calendario_presencial_2026_2.pdf'));

type Detail = { calendar: Calendar; events: CalendarEvent[]; publishCheck: PublishCheck };

let t: TestApp;
let calendarId: string;
let batch: ImportBatch;

async function upload(files: { path: string; data: Buffer }[]) {
  const mp = multipart(files.map((f, i) => ({ field: `f${i}`, ...f })));
  const res = await t.app.inject({ method: 'POST', url: '/api/imports', payload: mp.body, headers: { 'content-type': mp.contentType, authorization: `Bearer ${t.token}` } });
  return { status: res.statusCode, body: res.json() as ImportBatch };
}

beforeAll(async () => {
  t = await createTestApp();
});

describe('importação', () => {
  it('conta os arquivos antes de ler, ignora o que não é PDF e detecta repetidos', async () => {
    const zip = Buffer.from(zipSync({ 'Lote/Presencial/Presencial.pdf': new Uint8Array(pdf), 'Lote/Copia/Presencial.pdf': new Uint8Array(pdf), 'Lote/nota.txt': new TextEncoder().encode('oi') }));
    const res = await upload([
      { path: 'calendarios.zip', data: zip },
      { path: 'Solto/imagem.jpg', data: Buffer.from([0xff, 0xd8, 0xff]) },
    ]);
    expect(res.status).toBe(200);
    batch = res.body;
    expect(batch.status).toBe('staged');
    expect(batch.items).toHaveLength(2);
    expect(batch.items.every((i) => i.status === 'staged')).toBe(true);
    expect(batch.items[0].sameContentAs).toEqual([batch.items[1].relativePath]);
    expect(batch.ignored.map((i) => i.path).sort()).toEqual(['Solto/imagem.jpg', 'calendarios.zip › Lote/nota.txt']);
  });

  it('arquivos idênticos viram um calendário só, em Rascunho — nada é publicado sozinho', async () => {
    const started = await t.api<ImportBatch>('POST', `/api/imports/${batch.id}/start`, { mergeIdentical: true });
    expect(started.body.items.map((i) => i.status)).toEqual(['queued', 'queued']);
    await t.drainImports();
    const done = (await t.api<ImportBatch>('GET', `/api/imports/${batch.id}`)).body;
    expect(done.status).toBe('done');
    expect(done.items[0].calendarId).toBeTruthy();
    expect(done.items[1].calendarId).toBe(done.items[0].calendarId);
    expect(done.items[0].status).toBe('ready'); // leitura sem travas; o curso sugerido pela pasta é só observação
    calendarId = done.items[0].calendarId!;

    const detail = (await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body;
    expect(detail.calendar.status).toBe('draft');
    expect(detail.calendar.publishedVersion).toBeNull();
    expect(detail.events).toHaveLength(46);
    expect(detail.calendar.scope.courses).toEqual(['Presencial', 'Copia']);
    expect(detail.calendar.review.issues.some((i) => i.code === 'courses_from_path')).toBe(true);
    expect(detail.events.every((e) => e.importance === 'unset')).toBe(true);
  });

  it('o mesmo arquivo enviado de novo não é reimportado nem sobrescreve', async () => {
    const again = await upload([{ path: 'de-novo.pdf', data: pdf }]);
    expect(again.body.items[0].alreadyImportedAs?.calendarId).toBe(calendarId);
    const started = await t.api<ImportBatch>('POST', `/api/imports/${again.body.id}/start`, {});
    expect(started.body.items[0].status).toBe('skipped');
    expect((await t.api<{ items: unknown[] }>('GET', '/api/calendars')).body.items).toHaveLength(1);
  });

  it('forçar a reimportação cria OUTRO calendário e aponta a possível duplicidade', async () => {
    const again = await upload([{ path: 'outra-vez.pdf', data: pdf }]);
    await t.api('POST', `/api/imports/${again.body.id}/start`, { forceItemIds: [again.body.items[0].id] });
    await t.drainImports();
    const b = (await t.api<ImportBatch>('GET', `/api/imports/${again.body.id}`)).body;
    const other = (await t.api<Detail>('GET', `/api/calendars/${b.items[0].calendarId}`)).body;
    expect(other.calendar.id).not.toBe(calendarId);
    expect(other.calendar.review.issues.find((i) => i.code === 'possible_duplicate_calendar')?.severity).toBe('blocker');
    // o original continua intacto
    expect((await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body.events).toHaveLength(46);
    await t.api('POST', `/api/calendars/${other.calendar.id}/archive`);
  });

  it('uma falha não cancela os outros, e só os com erro são tentados de novo', async () => {
    const res = await upload([
      { path: 'bom.pdf', data: Buffer.concat([pdf, Buffer.from('\n% variação para mudar o hash\n')]) },
      { path: 'quebrado.pdf', data: Buffer.from('%PDF-1.7\nisto não é um pdf de verdade') },
    ]);
    await t.api('POST', `/api/imports/${res.body.id}/start`, {});
    await t.drainImports();
    let b = (await t.api<ImportBatch>('GET', `/api/imports/${res.body.id}`)).body;
    expect(b.items.map((i) => i.status)).toEqual(['ready', 'error']);
    expect(b.items[1].error).toBeTruthy();

    const retried = await t.api<ImportBatch>('POST', `/api/imports/${res.body.id}/retry`, {});
    expect(retried.body.items.map((i) => i.status)).toEqual(['ready', 'queued']);
    await t.drainImports();
    b = (await t.api<ImportBatch>('GET', `/api/imports/${res.body.id}`)).body;
    expect(b.items[1].status).toBe('error');
    expect(b.items[1].attempts).toBe(2);
    await t.api('POST', `/api/calendars/${b.items[0].calendarId}/archive`);
  });
});

describe('conferência e publicação', () => {
  it('importância em lote não mexe nos avisos (decide só onde o aluno vê o evento)', async () => {
    const d = (await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body;
    const dp = d.events.find((e) => e.dates.label === '01/07 a 21/08')!;
    const res = (await t.api<Detail>('POST', `/api/calendars/${calendarId}/events/bulk-importance`, { eventIds: [dp.id], importance: 'high' })).body;
    const after = res.events.find((e) => e.id === dp.id)!;
    expect(after.importance).toBe('high');
    expect(after.notification).toEqual(dp.notification);
    await t.api('POST', `/api/calendars/${calendarId}/events/bulk-importance`, { eventIds: [dp.id], importance: 'unset' });
  });

  it('aviso em lote em período segue a sugestão de início/fim, sem mudar a importância', async () => {
    const d = (await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body;
    const dp = d.events.find((e) => e.dates.label === '01/07 a 21/08')!;
    const res = (await t.api<Detail>('POST', `/api/calendars/${calendarId}/events/bulk-reminders`, { eventIds: [dp.id], days: [1], time: '09:00' })).body;
    const after = res.events.find((e) => e.id === dp.id)!;
    expect(after.notification).toMatchObject({ anchor: 'end', anchorConfirmed: true, enabled: true }); // inscrição: conta do fim do prazo
    expect(after.importance).toBe('unset');
    await t.api('POST', `/api/calendars/${calendarId}/events/bulk-reminders`, { eventIds: [dp.id], days: [], time: null });
  });

  it('aviso em lote exige horário; com horário, os momentos valem para todos', async () => {
    const d = (await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body;
    const one = d.events.find((e) => e.dates.label === '17/10')!;
    const noTime = await t.api('POST', `/api/calendars/${calendarId}/events/bulk-reminders`, { eventIds: [one.id], days: [0, 1], time: null });
    expect(noTime.status).toBe(400);
    const ok = (await t.api<Detail>('POST', `/api/calendars/${calendarId}/events/bulk-reminders`, { eventIds: [one.id], days: [0, 1], time: '07:00' })).body;
    const after = ok.events.find((e) => e.id === one.id)!;
    expect(after.notification.offsets.map((o) => [o.daysBefore, o.time])).toEqual([
      [1, '07:00'],
      [0, '07:00'],
    ]);
    await t.api('POST', `/api/calendars/${calendarId}/events/bulk-reminders`, { eventIds: [one.id], days: [], time: null });
    await t.api('POST', `/api/calendars/${calendarId}/events/bulk-importance`, { eventIds: [one.id], importance: 'unset' });
  });

  it('evento com aviso marcado e horário vazio trava a publicação', async () => {
    const d = (await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body;
    const one = d.events.find((e) => e.dates.label === '17/10')!;
    await t.api('PATCH', `/api/calendars/${calendarId}/events/${one.id}`, {
      ...one,
      importance: 'medium',
      notification: { ...one.notification, enabled: true, customized: true, offsets: [{ id: 'd1', daysBefore: 1, time: '' }] },
    });
    const blocked = await t.api<{ detail: { blockers: { issue: { code: string } }[] } }>('POST', `/api/calendars/${calendarId}/publish`, { confirm: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.detail.blockers.map((b) => b.issue.code)).toContain('reminder_time_missing');
    await t.api('POST', `/api/calendars/${calendarId}/events/bulk-reminders`, { eventIds: [one.id], days: [], time: null });
    await t.api('POST', `/api/calendars/${calendarId}/events/bulk-importance`, { eventIds: [one.id], importance: 'unset' });
  });

  it('só o que é perigoso trava: período com aviso sem dizer se conta do início ou do fim', async () => {
    let d = (await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body;
    // logo após a importação: nada trava (aviso não escolhido = nenhum aviso sai)
    expect(d.publishCheck.blockers).toEqual([]);
    expect(d.events.every((e) => e.importance === 'unset')).toBe(true);

    const p1 = d.events.find((e) => e.title === 'Período de aplicação da P1')!;
    // P1 com aviso (3 e 1 dia antes), mas sem dizer se conta do início ou do fim
    await t.api('PATCH', `/api/calendars/${calendarId}/events/${p1.id}`, {
      ...p1,
      importance: 'high',
      notification: {
        ...p1.notification,
        enabled: true,
        customized: true,
        offsets: [
          { id: 'd3', daysBefore: 3, time: '09:00' },
          { id: 'd1', daysBefore: 1, time: '09:00' },
        ],
      },
    });

    const blocked = await t.api<{ detail: { blockers: { issue: { code: string } }[] } }>('POST', `/api/calendars/${calendarId}/publish`, { confirm: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.detail.blockers.map((b) => b.issue.code)).toEqual(['anchor_unconfirmed']);

    // P1: alta, avisando antes do início
    d = (await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body;
    const fresh = d.events.find((e) => e.id === p1.id)!;
    const res = await t.api<{ event: CalendarEvent }>('PATCH', `/api/calendars/${calendarId}/events/${p1.id}`, {
      ...fresh,
      notification: { ...fresh.notification, anchor: 'start', anchorConfirmed: true },
    });
    expect(res.status).toBe(200);
    expect(res.body.event.notification.offsets.map((o) => o.daysBefore)).toEqual([3, 1]);
    d = (await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body;
    expect(d.publishCheck.blockers).toEqual([]);
  });

  it('mostra o impacto antes e cria os avisos só na publicação', async () => {
    const preview = (await t.api<{ diff: ReminderDiff; studentImpact: StudentImpact }>('GET', `/api/calendars/${calendarId}/publish-preview`)).body;
    expect(preview.diff.create).toHaveLength(2);
    expect(preview.studentImpact).toMatchObject({ importantes: 1, unset: 45, favorites: { create: 0, update: 0, cancel: 0, students: 0 } });
    expect((await t.api<{ items: NotificationJob[] }>('GET', '/api/notifications/jobs')).body.items).toHaveLength(0);

    expect((await t.api('POST', `/api/calendars/${calendarId}/publish`, {})).status).toBe(400); // sem confirmar
    const pub = await t.api<Detail & { diff: ReminderDiff }>('POST', `/api/calendars/${calendarId}/publish`, { confirm: true });
    expect(pub.status).toBe(200);
    expect(pub.body.calendar.status).toBe('published');

    const jobs = (await t.api<{ items: NotificationJob[] }>('GET', '/api/notifications/jobs')).body.items;
    expect(jobs.map((j) => instantToWall(j.sendAt))).toEqual([
      { date: '2026-09-25', time: '09:00' },
      { date: '2026-09-27', time: '09:00' },
    ]);
    expect(jobs.every((j) => j.kind === 'event_reminder' && j.status === 'scheduled')).toBe(true);
    expect(new Set(jobs.map((j) => j.idempotencyKey)).size).toBe(2);
  });

  it('editar o publicado não muda a versão pública; publicar de novo atualiza/cancela os avisos', async () => {
    let d = (await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body;
    const p1 = d.events.find((e) => e.title === 'Período de aplicação da P1')!;
    const publicBefore = (await t.app.inject({ method: 'GET', url: `/api/public/calendars/${calendarId}` })).json();

    // P1 adiada para 05/10 e rebaixada para média
    await t.api('PATCH', `/api/calendars/${calendarId}/events/${p1.id}`, {
      ...p1,
      dates: { kind: 'range', start: '2026-10-05', end: '2026-10-16', dates: [], label: '' },
      importance: 'medium',
      notification: { ...p1.notification, offsets: [{ id: 'd1', daysBefore: 1, time: '09:00' }] },
    });
    d = (await t.api<Detail>('GET', `/api/calendars/${calendarId}`)).body;
    expect(d.calendar.status).toBe('draft');
    expect(d.calendar.publishedVersion).not.toBeNull();
    expect(d.calendar.hasUnpublishedChanges).toBe(true);
    expect(d.calendar.modifiedFromSource).toBe(true);
    const edited = d.events.find((e) => e.id === p1.id)!;
    expect(edited.modifiedFromSource).toBe(true);
    expect(edited.dates.label).toBe('05 a 16/10'); // mesmo formato do PDF
    expect(edited.notification.offsets.map((o) => o.daysBefore)).toEqual([1]);

    const publicNow = (await t.app.inject({ method: 'GET', url: `/api/public/calendars/${calendarId}` })).json();
    expect(publicNow).toEqual(publicBefore);

    await t.api('POST', `/api/calendars/${calendarId}/submit`);
    const preview = (await t.api<{ diff: ReminderDiff }>('GET', `/api/calendars/${calendarId}/publish-preview`)).body.diff;
    expect(preview.update).toHaveLength(1);
    expect(preview.cancel).toHaveLength(1);
    await t.api('POST', `/api/calendars/${calendarId}/publish`, { confirm: true });

    const jobs = (await t.api<{ items: NotificationJob[] }>('GET', '/api/notifications/jobs')).body.items;
    expect(jobs.filter((j) => j.status === 'scheduled').map((j) => instantToWall(j.sendAt).date)).toEqual(['2026-10-04']);
    expect(jobs.find((j) => j.status === 'canceled')?.canceledReason).toBe('Data ou antecedência alterada');
    expect(jobs).toHaveLength(2); // nada duplicado
  });

  it('o agendador envia na hora certa; sem gateway configurado, modo demonstração marca como simulado', async () => {
    t.clock.now = new Date('2026-10-04T12:00:30Z');
    const { dispatchDue } = await import('../src/services/notifications');
    expect(await dispatchDue(t.ctx)).toBe(1);
    expect(await dispatchDue(t.ctx)).toBe(0); // não envia duas vezes
    const jobs = (await t.api<{ items: NotificationJob[] }>('GET', '/api/notifications/jobs?status=demo_sent')).body.items;
    expect(jobs).toHaveLength(1);
    const detail = (await t.api<{ attempts: { outcome: string; detail: string }[] }>('GET', `/api/notifications/jobs/${jobs[0].id}`)).body;
    expect(detail.attempts.at(-1)).toMatchObject({ outcome: 'demo_sent' });
  });

  it('histórico permite restaurar uma versão anterior', async () => {
    const versions = (await t.api<{ items: { id: string; kind: string; number: number }[] }>('GET', `/api/calendars/${calendarId}/versions`)).body.items;
    const imported = versions.find((v) => v.kind === 'import')!;
    const restored = (await t.api<Detail>('POST', `/api/calendars/${calendarId}/versions/${imported.id}/restore`)).body;
    expect(restored.events.find((e) => e.title === 'Período de aplicação da P1')?.dates.start).toBe('2026-09-28');
    expect(restored.calendar.status).toBe('draft');
  });

  it('arquivar cancela os envios futuros', async () => {
    const res = await t.api<{ canceledJobs: number; calendar: Calendar }>('POST', `/api/calendars/${calendarId}/archive`);
    expect(res.body.calendar.status).toBe('archived');
    expect((await t.app.inject({ method: 'GET', url: `/api/public/calendars/${calendarId}` })).statusCode).toBe(404);
  });
});

describe('segurança básica', () => {
  it('com o Entra ID ligado, sem sessão nada é acessível', async () => {
    const entra = await createTestApp({ AUTH_MODE: 'entra' });
    expect((await entra.app.inject({ method: 'GET', url: '/api/calendars' })).statusCode).toBe(401);
  });

  it('no modo de desenvolvimento, o login é só visual: funciona sem sessão', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/calendars' });
    expect(res.statusCode).toBe(200);
  });

  it('integração sem chave é recusada', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/integrations/student-events', payload: {} });
    expect(res.statusCode).toBe(401);
  });
});
