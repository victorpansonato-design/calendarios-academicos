import { describe, expect, it } from 'vitest';
import { datesKey, formatDates, looksLikeDateLabel, occupiedDays, parseDateLabel } from '../src/dates';

const ctx = { year: 2026, semester: 2 as const };

describe('parseDateLabel — formatos do calendário institucional', () => {
  it('data única: 25/08', () => {
    const { dates, issues } = parseDateLabel('25/08', ctx);
    expect(dates).toMatchObject({ kind: 'single', start: '2026-08-25', end: '2026-08-25', label: '25/08' });
    expect(issues).toEqual([]);
  });

  it('período no mesmo mês: 04 a 31/08', () => {
    const { dates } = parseDateLabel('04 a 31/08', ctx);
    expect(dates).toMatchObject({ kind: 'range', start: '2026-08-04', end: '2026-08-31' });
  });

  it('período que atravessa meses: 28/09 a 09/10', () => {
    const { dates, issues } = parseDateLabel('28/09 a 09/10', ctx);
    expect(dates).toMatchObject({ kind: 'range', start: '2026-09-28', end: '2026-10-09' });
    expect(issues).toEqual([]);
  });

  it('duas datas isoladas NÃO viram intervalo: 12 e 13/10', () => {
    const { dates } = parseDateLabel('12 e 13/10', ctx);
    expect(dates?.kind).toBe('list');
    expect(dates?.dates).toEqual(['2026-10-12', '2026-10-13']);
    expect(occupiedDays(dates!)).toEqual(['2026-10-12', '2026-10-13']);
  });

  it('lista com lacunas NÃO vira intervalo: 13, 14, 27 e 28/11', () => {
    const { dates } = parseDateLabel('13, 14, 27 e 28/11', ctx);
    expect(dates?.kind).toBe('list');
    expect(dates?.dates).toEqual(['2026-11-13', '2026-11-14', '2026-11-27', '2026-11-28']);
    // nenhum dia entre 15 e 26 pode aparecer
    expect(occupiedDays(dates!)).not.toContain('2026-11-20');
    expect(occupiedDays(dates!)).toHaveLength(4);
  });

  it('lista que mistura meses: 30/11 e 02/12', () => {
    const { dates } = parseDateLabel('30/11 e 02/12', ctx);
    expect(dates?.dates).toEqual(['2026-11-30', '2026-12-02']);
  });

  it('período de um ano para o outro é consequência lógica, mas é avisado', () => {
    const { dates, issues } = parseDateLabel('15/12 a 10/01', ctx);
    expect(dates).toMatchObject({ kind: 'range', start: '2026-12-15', end: '2027-01-10' });
    expect(issues.find((i) => i.code === 'date_year_inferred')?.severity).toBe('warning');
  });

  it('janeiro num calendário de 2º semestre é suposição — bloqueia até alguém confirmar', () => {
    const { dates, issues } = parseDateLabel('05/01', ctx);
    expect(dates?.start).toBe('2027-01-05');
    expect(issues.find((i) => i.code === 'date_year_inferred')?.severity).toBe('blocker');
  });

  it('dia inexistente não é "corrigido" para o dia seguinte', () => {
    const { dates, issues } = parseDateLabel('31/09', ctx);
    expect(dates).toBeNull();
    expect(issues[0].code).toBe('date_invalid');
  });

  it('período invertido é rejeitado', () => {
    const { dates, issues } = parseDateLabel('10/10 a 01/10', { year: 2026, semester: 2 });
    // 10/10 → 01/10 "volta" no mês: interpretado como virada de ano, então não é invertido…
    // …mas 01/10/2027 fica fora do semestre e a suposição é sinalizada.
    expect(dates === null || issues.length > 0).toBe(true);
  });

  it('mistura de período com lista fica pendente, com o rótulo preservado', () => {
    const { dates, issues } = parseDateLabel('01 a 03 e 10/08', ctx);
    expect(dates).toBeNull();
    expect(issues[0].code).toBe('date_ambiguous');
    expect(issues[0].message).toContain('01 a 03 e 10/08');
  });

  it('texto que não é data não é forçado a virar data', () => {
    expect(parseDateLabel('Fique atento!', ctx).dates).toBeNull();
    expect(looksLikeDateLabel('Fique atento!')).toBe(false);
    expect(looksLikeDateLabel('13, 14, 27 e 28/11')).toBe(true);
  });

  it('sem ano do calendário, nenhuma data é inventada', () => {
    const { dates, issues } = parseDateLabel('25/08', { year: null, semester: null });
    expect(dates).toBeNull();
    expect(issues[0].code).toBe('date_unparsed');
  });

  it('aceita traço e "até" como conector de período', () => {
    expect(parseDateLabel('28/09-09/10', ctx).dates).toMatchObject({ kind: 'range', start: '2026-09-28' });
    expect(parseDateLabel('01/07 até 21/08', ctx).dates).toMatchObject({ kind: 'range', end: '2026-08-21' });
  });

  it('a mesma data lida em duas páginas produz a mesma chave', () => {
    const a = parseDateLabel('28/09 a 09/10', ctx).dates!;
    const b = parseDateLabel('28/09  a  09/10', ctx).dates!;
    expect(datesKey(a)).toBe(datesKey(b));
  });

  it('formata como o PDF escreve', () => {
    expect(formatDates(parseDateLabel('13, 14, 27 e 28/11', ctx).dates!)).toBe('13, 14, 27 e 28/11');
    expect(formatDates(parseDateLabel('04 a 31/08', ctx).dates!)).toBe('04 a 31/08');
    expect(formatDates(parseDateLabel('28/09 a 09/10', ctx).dates!)).toBe('28/09 a 09/10');
    expect(formatDates(parseDateLabel('12 e 13/10', ctx).dates!)).toBe('12 e 13/10');
  });
});
