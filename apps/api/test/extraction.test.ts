import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { occupiedDays } from '@calendarios/core';
import { extractCalendar, type ExtractionOutput } from '../src/pdf/pipeline';

/* Critérios de aceite, contra o PDF real "calendario_presencial_2026_2.pdf". */

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'fixtures', 'calendario_presencial_2026_2.pdf');

let out: ExtractionOutput;
const byLabel = (label: string) => out.events.filter((e) => e.label === label);
const withText = (re: RegExp) => out.events.filter((e) => re.test(e.fields.description));

beforeAll(async () => {
  out = await extractCalendar({ data: new Uint8Array(fs.readFileSync(fixture)), fileId: 'f1', relativePath: 'calendario_presencial_2026_2.pdf', ocr: null });
});

describe('cabeçalho', () => {
  it('cursos presenciais EXCETO Direito, 2º semestre de 2026', () => {
    expect(out.year).toBe(2026);
    expect(out.semester).toBe(2);
    expect(out.scope.modality).toBe('Presencial');
    expect(out.scope.exceptions).toEqual(['Direito']);
    expect(out.scope.audienceLabel).toBe('Cursos Presenciais (exceto Direito)');
  });
});

describe('leitura de todas as páginas', () => {
  it('processa as 8 páginas: 1 de visão geral e 7 mensais', () => {
    expect(out.report.pageCount).toBe(8);
    expect(out.report.pagesProcessed).toBe(8);
    expect(out.report.pages.filter((p) => p.kind === 'overview')).toHaveLength(1);
    expect(out.report.pages.filter((p) => p.kind === 'monthly')).toHaveLength(7);
    expect(out.report.pages.filter((p) => p.kind === 'monthly').every((p) => p.rowStrategy === 'date_cells')).toBe(true);
  });

  it('reconhece todas as datas e não deixa trecho sem associação', () => {
    expect(out.report.datesPending).toBe(0);
    expect(out.report.unassociatedSnippets).toBe(0);
    expect(out.events.every((e) => e.dates !== null)).toBe(true);
  });

  it('lê a legenda da primeira página com as cores do PDF', () => {
    expect(out.legend.length).toBeGreaterThanOrEqual(18);
    expect(out.legend.find((l) => l.label === 'Período de aplicação da P1')?.color).toBe('#2f5597');
    expect(out.legend.find((l) => l.label === 'Feriados e Recessos')?.color).toBe('#d7263d');
    // triângulo de "mais de um evento" é reconhecido como marcador de canto
    expect(out.legend.find((l) => /Bloco 1 e Bloco 2/.test(l.label))?.style).toBe('corner');
  });

  it('preserva a nota de rodapé da primeira página', () => {
    expect(out.notes.map((n) => n.text)).toContain('*Datas com mais de uma cor possuem mais de um evento programado no dia.');
  });
});

describe('casos obrigatórios', () => {
  it('eventos diferentes em 25/08 continuam separados', () => {
    const e = byLabel('25/08');
    expect(e).toHaveLength(3);
    expect(e.map((x) => x.fields.title)).toEqual([
      'Início da Prática Extensionista e Eletiva via sistema disponíveis no App Grupo Anchieta (verifique quantas horas você ainda precisa cumprir)',
      'Início das disciplinas digitais regulares',
      'Início, no AVA, do bloco 1 das atividades on-line das disciplinas presenciais com carga horária EaD',
    ]);
    // e cada um com a cor certa da legenda
    expect(e[2].color).toBe('#f8cbad');
    expect(e[1].color).toBe('#199e8c');
  });

  it('P1 de 28/09 a 09/10 é UM evento, com referências às páginas 5 e 6', () => {
    const p1 = withText(/^Período de aplicação da P1\./);
    expect(p1).toHaveLength(1);
    expect(p1[0].dates).toMatchObject({ kind: 'range', start: '2026-09-28', end: '2026-10-09' });
    expect(p1[0].sources.map((s) => s.page)).toEqual([5, 6]);
    expect(p1[0].sources.every((s) => s.bbox && s.bbox.length === 4)).toBe(true);
  });

  it('feriado de 12 e 13/10 são duas datas, sem dias intermediários', () => {
    const [e] = byLabel('12 e 13/10');
    expect(e.dates).toMatchObject({ kind: 'list', dates: ['2026-10-12', '2026-10-13'] });
    expect(e.fields.type).toBe('holiday');
    expect(e.category).toBe('feriados-e-recessos');
  });

  it('Prova Oficial do Estudo Dirigido em 13, 14, 27 e 28/11 NÃO vira intervalo', () => {
    const [e] = byLabel('13, 14, 27 e 28/11');
    expect(e.dates?.kind).toBe('list');
    expect(e.dates?.dates).toEqual(['2026-11-13', '2026-11-14', '2026-11-27', '2026-11-28']);
    expect(occupiedDays(e.dates!)).not.toContain('2026-11-20');
    expect(e.fields.title).toBe('Aplicação da Prova Oficial do Estudo Dirigido (Dependência e Adaptação)');
  });

  it('eventos distintos em 07/12 continuam distintos', () => {
    expect(byLabel('07/12').map((e) => e.fields.title)).toEqual([
      'Data máxima para lançamento de nota da N2 e N3',
      'Último dia para protocolar as Atividades Complementares',
      'Último dia para realizar atividades do programa Bagagem',
    ]);
  });

  it('preserva horários por turno e a ressalva sobre a prova substitutiva', () => {
    const [p1] = withText(/^Período de aplicação da P1\./);
    expect(p1.fields.times.map((t) => [t.shift, t.time])).toEqual([
      ['Diurno', '07:30'],
      ['Noturno', '19:30'],
    ]);
    expect(p1.fields.notes[0]).toBe(
      'O aluno tem 48 horas, a partir da data da prova perdida, para solicitar substitutiva por meio da secretaria virtual, anexando o documento comprobatório, conforme legislação e os Critérios de Rendimento Acadêmico disponível no Mural do App Grupo Anchieta.',
    );
    const [p2] = withText(/^Período de aplicação da P2\./);
    expect(p2.sources.map((s) => s.page)).toEqual([7, 8]);
    expect(p2.fields.notes[0]).toMatch(/^O aluno tem 48 horas/);
  });

  it('preserva links, local e horário dos eventos on-line', () => {
    const [ev] = withText(/Evento on-line: O que é monitoria\?/);
    expect(ev.fields.urls).toEqual(['https://www.youtube.com/@eventosunianchieta']);
    expect(ev.fields.location).toBe('Canal do Youtube do UniAnchieta');
    expect(ev.fields.times[0].time).toBe('19:30');
    // o 08/08 tem o link só no texto (sem anotação no PDF) e mesmo assim é lido
    const [estrategias] = withText(/Estratégias de Estudo e Sucesso/);
    expect(estrategias.fields.urls).toEqual(['https://www.youtube.com/@TVUniAnchieta']);
  });

  it('a ressalva em negrito das provas on-line fica guardada', () => {
    const [e] = byLabel('01 a 14/12');
    expect(e.fields.notes).toEqual(['Como há três tentativas para a realização da prova, não haverá substitutiva ou recuperação.']);
  });

  it('guarda a redação integral e a referência de origem em todo evento', () => {
    for (const e of out.events) {
      expect(e.fields.rawText.length).toBeGreaterThan(5);
      expect(e.sources[0].fileId).toBe('f1');
      expect(e.sources[0].method).toBe('text_layer');
    }
  });

  it('não junta períodos da mesma data que são eventos diferentes', () => {
    // 28/09 a 09/10 (P1) × 28/09 a 02/10 (relatório de monitoria): datas diferentes, eventos diferentes
    expect(withText(/relatório parcial de Monitoria/)).toHaveLength(1);
    expect(out.report.mergedAcrossPages).toBe(4); // DP, P1, Integrativa, P2
    expect(out.report.possibleDuplicates).toBe(0);
  });
});

describe('ambiguidade vira pendência, não suposição', () => {
  it('público citado no texto é sugestão que exige decisão, não recorte aplicado', () => {
    const [monitor] = withText(/Ambientação Vida do Monitor/);
    expect(monitor.fields.audience.groups).toEqual([]);
    const issue = monitor.issues.find((i) => i.code === 'audience_detected');
    expect(issue?.severity).toBe('blocker');
    expect((issue?.detail as { groups: string[] }).groups).toEqual(['Monitores']);
  });

  it('nenhum evento chega com importância ou data inventadas', () => {
    expect(out.events.every((e) => e.dates?.label)).toBe(true);
  });
});
