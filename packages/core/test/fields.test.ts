import { describe, expect, it } from 'vitest';
import { extractFields, suggestAnchor } from '../src/fields';

const lines = (...t: string[]) => t.map((text) => ({ text }));

describe('extractFields — separa sem reescrever', () => {
  it('P1: horários por turno e ressalva da substitutiva preservados', () => {
    const f = extractFields(
      lines(
        'Período de aplicação da P1.',
        'Horário de início - Diurno: 07h30',
        'Horário de início - Noturno: 19h30',
        '*O aluno tem 48 horas, a partir da data da prova perdida, para solicitar substitutiva por',
        'meio da secretaria virtual, anexando o documento comprobatório, conforme legislação e',
        'os Critérios de Rendimento Acadêmico disponível no Mural do App Grupo Anchieta.',
      ),
    );
    expect(f.title).toBe('Período de aplicação da P1');
    expect(f.times).toEqual([
      { shift: 'Diurno', time: '07:30', raw: 'Horário de início - Diurno: 07h30' },
      { shift: 'Noturno', time: '19:30', raw: 'Horário de início - Noturno: 19h30' },
    ]);
    expect(f.notes).toEqual([
      'O aluno tem 48 horas, a partir da data da prova perdida, para solicitar substitutiva por meio da secretaria virtual, anexando o documento comprobatório, conforme legislação e os Critérios de Rendimento Acadêmico disponível no Mural do App Grupo Anchieta.',
    ]);
    expect(f.type).toBe('exam');
    // a redação integral fica guardada linha a linha
    expect(f.rawText.split('\n')).toHaveLength(6);
    // "48 horas" não é horário
    expect(f.times.some((t) => t.time === '48:00')).toBe(false);
  });

  it('evento on-line: local, link e horário', () => {
    const f = extractFields(
      lines(
        'Evento on-line para Ingressantes: Ambientação - Ambiente Virtual de Aprendizagem (AVA) e',
        'Biblioteca Virtual.',
        'Local: Canal do Youtube TV UniAnchieta: https://www.youtube.com/@TVUniAnchieta',
        'Horário: 10h (horário de Brasília).',
      ),
    );
    expect(f.title).toBe('Evento on-line para Ingressantes: Ambientação - Ambiente Virtual de Aprendizagem (AVA) e Biblioteca Virtual');
    expect(f.location).toBe('Canal do Youtube TV UniAnchieta');
    expect(f.urls).toEqual(['https://www.youtube.com/@TVUniAnchieta']);
    expect(f.times).toEqual([{ shift: null, time: '10:00', raw: 'Horário: 10h' }]);
    expect(f.audience.groups).toEqual(['Ingressantes']);
    expect(f.type).toBe('online_event');
  });

  it('público restrito declarado no texto', () => {
    const f = extractFields(lines('Ambientação Vida do Monitor.', 'Local: On-line, às 18h30. Será notificado apenas aos alunos monitores.'));
    expect(f.location).toBe('On-line');
    expect(f.times[0].time).toBe('18:30');
    expect(f.audience.groups).toContain('Monitores');
    expect(f.audience.evidence).toContain('apenas aos alunos monitores');
  });

  it('instrução depois de " - " sai do título, mas fica na descrição', () => {
    const f = extractFields(
      lines('Início das aulas para Calouros - verificar dias e horários das aulas por meio do App Grupo', 'Anchieta, em "Horários das Aulas”.'),
    );
    expect(f.title).toBe('Início das aulas para Calouros');
    expect(f.description).toContain('verificar dias e horários das aulas por meio do App Grupo Anchieta');
  });

  it('"Optativa" em maiúscula NÃO é tratada como instrução', () => {
    const f = extractFields(
      lines('Período de inscrição e realização para calouros e veteranos - Optativa de Libras e', 'Bagagem de Português, Matemática, Inglês e Excel.'),
    );
    expect(f.title).toContain('Optativa de Libras');
    expect(f.audience.groups).toEqual([]); // calouros E veteranos = todos
  });

  it('feriado e prazo', () => {
    expect(extractFields(lines('Feriado Estadual – Revolução Constitucionalista de 1932.')).type).toBe('holiday');
    expect(extractFields(lines('Último dia para protocolar as Atividades Complementares.')).type).toBe('deadline');
    expect(extractFields(lines('Fim do semestre letivo.')).type).toBe('term_end');
  });

  it('âncora sugerida: prazo conta do fim, evento comum do início, lista antes de cada data', () => {
    expect(suggestAnchor('range', 'enrollment', 'Período de inscrição em DP (Dependência) e Adaptação.')).toBe('end');
    expect(suggestAnchor('range', 'exam', 'Período de aplicação da P1.')).toBe('start');
    expect(suggestAnchor('list', 'exam', 'Aplicação da Prova Oficial')).toBe('each');
  });
});
