import { describe, expect, it } from 'vitest';
import { parseDateLabel } from '../src/dates';
import { defaultNotificationRule, setReminderMoments } from '../src/schedule';
import { emptyReview, checkPublishable } from '../src/validation';
import { suggestImportance, studentImportance } from '../src/importance';
import { coveredByCalendarReminders, favoriteCancelReason, planCalendarFavorites, planFavoriteReminders } from '../src/favorites';
import { buildStudentView, countdownPhrase, OUTROS, todayIn, toPublicCalendar } from '../src/student';
import { eventsToIcs, foldLine } from '../src/ics';
import type { CalendarEvent, EventType, Importance, LegendEntry, NotificationJob } from '../src/types';

let seq = 0;
function ev(label: string, title: string, patch: Partial<CalendarEvent> = {}): CalendarEvent {
  const dates = parseDateLabel(label, { year: 2026, semester: 2 }).dates!;
  seq += 1;
  return {
    id: `e${seq}`,
    uid: `uid-${seq}`,
    calendarId: 'c1',
    title,
    description: '',
    rawText: null,
    dates,
    datesResolved: true,
    times: [],
    location: null,
    urls: [],
    notes: [],
    audience: { groups: [], evidence: null },
    type: 'academic',
    category: null,
    color: null,
    importance: 'unset',
    notification: defaultNotificationRule(dates.kind === 'list' ? 'each' : 'start'),
    sources: [],
    review: emptyReview(),
    origin: 'import',
    modifiedFromSource: false,
    sortOrder: seq,
    createdAt: '',
    updatedAt: '',
    updatedBy: '',
    ...patch,
  };
}

const legend: LegendEntry[] = [
  { key: 'p1', label: 'Período de aplicação da P1', color: '#2f5597', style: 'fill', group: 'Legenda', fromPdf: true },
  { key: 'feriados', label: 'Feriados e Recessos', color: '#d7263d', style: 'fill', group: 'Legenda', fromPdf: true },
];

const meta = { id: 'c1', title: 'Cursos Presenciais', year: 2026, semester: 2 as const, scope: { modality: 'Presencial', courses: [], exceptions: [], cohorts: [], audienceLabel: 'Cursos Presenciais' }, legend, notes: [], sourceFileId: null, sourceFileName: null };

const sug = (title: string, type: EventType, description = '') => suggestImportance({ title, type, description }).importance;

describe('sugestão de importância', () => {
  it('prova, último dia, inscrição em DP, 48 horas e fim do semestre → Alta', () => {
    expect(sug('Período de aplicação da P1', 'exam')).toBe('high');
    expect(sug('Último dia para protocolar as Atividades Complementares', 'deadline')).toBe('high');
    expect(sug('Período de inscrição em DP (Dependência) e Adaptação', 'enrollment')).toBe('high');
    expect(sug('Aviso', 'academic', 'O aluno tem 48 horas para pedir a substitutiva')).toBe('high');
    expect(sug('Fim do semestre letivo', 'term_end')).toBe('high');
  });
  it('feriado, início das aulas e inscrições → Média', () => {
    expect(sug('Feriado – Natal', 'holiday')).toBe('medium');
    expect(sug('Início das aulas para Veteranos', 'term_start')).toBe('medium');
    expect(sug('Período de inscrição e realização - Optativa de Libras e Bagagem', 'enrollment')).toBe('medium');
  });
  it('evento on-line, atividade acadêmica, monitoria e lançamento de nota → Baixa', () => {
    expect(sug('Evento on-line: O que é monitoria?', 'online_event')).toBe('low');
    expect(sug('Cerimônia do Jaleco', 'academic')).toBe('low');
    expect(sug('Término do Programa de Monitoria', 'term_end')).toBe('low');
    expect(sug('Data máxima para lançamento de nota da N1', 'deadline')).toBe('low');
  });
  it('início do Estudo Dirigido (DP) não vira Alta', () => {
    expect(sug('Início do Estudo Dirigido (Dependência e Adaptação)', 'term_start')).toBe('medium');
  });
  it('não definida conta como Baixa para o aluno', () => {
    expect(studentImportance('unset')).toBe('low');
  });
});

describe('visão do aluno', () => {
  const p1 = ev('28/09 a 09/10', 'Período de aplicação da P1', { importance: 'high', category: 'p1', color: '#2f5597', type: 'exam' });
  const feriado = ev('12 e 13/10', 'Feriado – Aparecida', { importance: 'medium', category: 'feriados', color: '#d7263d', type: 'holiday' });
  const natal = ev('25/12', 'Feriado – Natal', { importance: 'medium', category: 'feriados', color: '#d7263d', type: 'holiday' });
  const jaleco = ev('08/08', 'Cerimônia do Jaleco', { importance: 'low' });
  const evento = ev('20/10', 'Evento on-line', { importance: 'unset', type: 'online_event' as EventType });
  const veteranos = ev('05/08', 'Início das aulas para Veteranos', { importance: 'medium', audience: { groups: ['Veteranos'], evidence: null } });
  const cal = toPublicCalendar(meta, [p1, feriado, natal, jaleco, evento, veteranos], { version: 3, publishedAt: null, source: 'published' });

  it('Importantes = alta + média + favoritos; baixa e não definida só no completo', () => {
    const v = buildStudentView(cal, { today: '2026-10-06', starred: [evento.uid] });
    expect(v.importantes.map((i) => i.title)).toEqual(['Período de aplicação da P1', 'Feriado – Aparecida', 'Evento on-line', 'Feriado – Natal']);
    expect(v.importantesPast.map((i) => i.title)).toEqual(['Início das aulas para Veteranos']);
    expect(v.completo.flatMap((m) => m.items).length).toBe(6);
  });

  it('média oculta sai; alta "oculta" continua', () => {
    const v = buildStudentView(cal, { today: '2026-10-06', hidden: [feriado.uid, p1.uid] });
    expect(v.importantes.map((i) => i.title)).toEqual(['Período de aplicação da P1', 'Feriado – Natal']);
    expect(v.counts.hidden).toBe(1);
  });

  it('próxima data com contagem; período em andamento à parte', () => {
    const v = buildStudentView(cal, { today: '2026-10-06' });
    expect(v.next?.title).toBe('Feriado – Aparecida');
    expect(v.next?.countdown).toBe('em 6 dias');
    expect(v.ongoing.map((i) => [i.title, i.countdown])).toEqual([['Período de aplicação da P1', 'termina em 3 dias']]);
    expect(countdownPhrase(1)).toBe('amanhã');
    expect(countdownPhrase(-2)).toBe('há 2 dias');
  });

  it('período longo aberto conta como prazo: aparece na data em que fecha, fora de "acontecendo agora"', () => {
    const libras = ev('01/07 a 07/12', 'Inscrição Libras', { importance: 'medium', type: 'enrollment' as EventType });
    const c = toPublicCalendar(meta, [p1, libras], { version: 1, publishedAt: null, source: 'published' });
    const v = buildStudentView(c, { today: '2026-10-06' });
    expect(v.ongoing.map((i) => i.title)).toEqual(['Período de aplicação da P1']);
    expect(v.importantes.map((i) => [i.title, i.nextDate, i.countdown])).toEqual([
      ['Período de aplicação da P1', '2026-10-06', 'termina em 3 dias'],
      ['Inscrição Libras', '2026-12-07', 'termina em 62 dias'],
    ]);
  });

  it('completo agrupado por mês de início, com legenda e "sem cor"', () => {
    const v = buildStudentView(cal, { today: '2026-10-06' });
    expect(v.completo.map((m) => m.label)).toEqual(['Agosto de 2026', 'Setembro de 2026', 'Outubro de 2026', 'Dezembro de 2026']);
    expect(v.legend.map((l) => [l.label, l.count])).toEqual([
      ['Período de aplicação da P1', 1],
      ['Feriados e Recessos', 2],
      ['Sem cor na legenda', 3],
    ]);
    const filtered = buildStudentView(cal, { today: '2026-10-06', category: 'feriados' });
    expect(filtered.items.map((i) => i.title)).toEqual(['Feriado – Aparecida', 'Feriado – Natal']);
    expect(buildStudentView(cal, { today: '2026-10-06', category: OUTROS }).items).toHaveLength(3);
  });

  it('coorte esconde evento só de veteranos; coorte desconhecida mostra tudo', () => {
    expect(buildStudentView(cal, { today: '2026-10-06', cohort: 'ingressantes' }).counts.total).toBe(5);
    expect(buildStudentView(cal, { today: '2026-10-06' }).counts.total).toBe(6);
  });

  it('turno escolhe o horário', () => {
    const prova = ev('17/10', 'Substitutiva', {
      importance: 'high',
      times: [
        { shift: 'Diurno', time: '07:30', raw: '' },
        { shift: 'Noturno', time: '19:30', raw: '' },
      ],
    });
    const c = toPublicCalendar(meta, [prova], { version: 1, publishedAt: null, source: 'draft' });
    expect(buildStudentView(c, { today: '2026-10-06', shift: 'Noturno' }).items[0].timeLabel).toBe('Noturno 19h30');
  });

  it('texto para o aluno não repete título, horário nem observação', () => {
    const e = ev('17/10', 'Prova Substitutiva da P1', {
      description: 'Prova Substitutiva da P1.\nHorário de início - Noturno: 19h30\nTraga documento com foto.\n*O aluno tem 48 horas para pedir.',
      notes: ['O aluno tem 48 horas para pedir.'],
    });
    const c = toPublicCalendar(meta, [e], { version: 1, publishedAt: null, source: 'draft' });
    expect(buildStudentView(c, { today: '2026-10-06' }).items[0].details).toEqual(['Traga documento com foto.']);
  });

  it('busca sem acento', () => {
    expect(buildStudentView(cal, { today: '2026-10-06', query: 'cerimonia jaleco' }).items.map((i) => i.title)).toEqual(['Cerimônia do Jaleco']);
  });

  it('hoje é o dia em São Paulo (01:30Z ainda é o dia anterior)', () => {
    expect(todayIn(new Date('2026-10-07T01:30:00Z'))).toBe('2026-10-06');
  });
});

describe('favoritos', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const ctx = { calendarId: 'c1', calendarTitle: 'Cursos Presenciais', now, studentId: 'RA123' };

  it('sem aviso no evento: 1 dia antes às 09h, com o mesmo texto do aviso do evento', () => {
    const e = ev('17/10', 'Aplicação da Prova Substitutiva da P1', { importance: 'low' });
    const plan = planFavoriteReminders(e, ctx);
    expect(plan).toHaveLength(1);
    expect(plan[0].sendAt).toBe('2026-10-16T12:00:00.000Z');
    expect(plan[0].title).toBe('Calendário acadêmico');
    expect(plan[0].body).toBe('Aplicação da Prova Substitutiva da P1 acontece amanhã (17/10).');
    expect(plan[0].idempotencyKey).toBe(`fav:c1:${e.uid}:fav-d1:main:RA123`);
  });

  it('evento com aviso para todos: nada (sem duplicar)', () => {
    const e = ev('17/10', 'Substitutiva', { importance: 'high', notification: setReminderMoments(defaultNotificationRule('start'), [1], '09:00') });
    expect(coveredByCalendarReminders(e)).toBe(true);
    expect(planFavoriteReminders(e, ctx)).toEqual([]);
  });

  it('horário passado não agenda; lista com "cada" agenda um por data; período no fim conta do fim', () => {
    expect(planFavoriteReminders(ev('01/10', 'Hoje'), ctx)).toEqual([]);
    expect(planFavoriteReminders(ev('13, 14, 27 e 28/11', 'Lista'), ctx).map((p) => p.occurrence)).toEqual(['2026-11-13', '2026-11-14', '2026-11-27', '2026-11-28']);
    const prazo = ev('01 a 21/10', 'Inscrição', { notification: { ...defaultNotificationRule('end') } });
    expect(planFavoriteReminders(prazo, ctx)[0].body).toContain('termina amanhã');
  });

  it('funciona com o evento público (portal/app) igual ao interno', () => {
    const e = ev('17/10', 'Substitutiva');
    const pub = toPublicCalendar(meta, [e], { version: 1, publishedAt: null, source: 'published' }).events[0];
    expect(planFavoriteReminders(pub, ctx)).toEqual(planFavoriteReminders(e, ctx));
  });

  it('chave distinta por aluno; motivos de cancelamento', () => {
    const e = ev('17/10', 'Substitutiva');
    const plan = planCalendarFavorites([e], [{ studentId: 'A', eventUid: e.uid }, { studentId: 'B', eventUid: e.uid }], ctx);
    expect(new Set(plan.map((p) => p.idempotencyKey)).size).toBe(2);
    const job = { eventUid: e.uid } as NotificationJob;
    expect(favoriteCancelReason(job, new Map())).toBe('Evento removido do calendário');
    const covered = { ...e, notification: setReminderMoments(e.notification, [1], '09:00') };
    expect(favoriteCancelReason(job, new Map([[e.uid, covered]]))).toBe('O evento passou a ter aviso para todo o calendário');
  });
});

describe('publicação: observações agregadas', () => {
  it('sem importância e sem cor viram UM aviso cada, sem travar', () => {
    const events = [ev('17/10', 'A'), ev('18/10', 'B'), ev('19/10', 'C', { importance: 'high' as Importance, category: 'p1', color: '#2f5597' })];
    const check = checkPublishable({ review: emptyReview(), title: 'X', year: 2026, semester: 2, scope: meta.scope }, events);
    expect(check.ok).toBe(true);
    expect(check.warnings.map((w) => w.issue.code)).toEqual(['importance_unset', 'legend_missing']);
    expect(check.warnings[0].issue.message).toContain('2 evento(s)');
  });
});

describe('.ics', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const cal = { id: 'c1', title: 'Cursos Presenciais', version: 4 };
  const pub = (e: CalendarEvent) => toPublicCalendar(meta, [e], { version: 4, publishedAt: null, source: 'published' }).events[0];

  it('dia inteiro com DTEND exclusivo, CRLF, UID estável e SEQUENCE = versão', () => {
    const e = ev('28/09 a 09/10', 'Período de aplicação da P1');
    const ics = eventsToIcs(cal, [pub(e)], { now });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260928\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261010\r\n');
    expect(ics).toContain(`UID:${e.uid}@calendarios.anchieta.br`);
    expect(ics).toContain('SEQUENCE:4');
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
  });

  it('lista vira um VEVENT por data; horário do turno vai em UTC', () => {
    expect(eventsToIcs(cal, [pub(ev('13, 14/11', 'Lista'))], { now }).match(/BEGIN:VEVENT/g)).toHaveLength(2);
    const prova = ev('17/10', 'Prova', { times: [{ shift: 'Diurno', time: '07:30', raw: '' }, { shift: 'Noturno', time: '19:30', raw: '' }] });
    expect(eventsToIcs(cal, [pub(prova)], { now, shift: 'Noturno' })).toContain('DTSTART:20261017T223000Z');
  });

  it('escapa vírgula e ponto e vírgula; dobra em 75 octetos sem partir acento', () => {
    const e = ev('17/10', 'Prova; P1, turma A');
    expect(eventsToIcs(cal, [pub(e)], { now })).toContain('SUMMARY:Prova\\; P1\\, turma A');
    const long = foldLine(`DESCRIPTION:${'ção'.repeat(40)}`);
    for (const line of long.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(long.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'ção'.repeat(40)}`);
  });
});
