import type { CalendarScope, Cohort, ReviewIssue } from '@calendarios/core';
import { collapseWhitespace, stripAccents } from '@calendarios/core';
import type { PageModel } from './reader';
import { groupLines, type Line } from './layout';

/* ==========================================================================
   Cabeçalho do calendário: ano, semestre e público
   --------------------------------------------------------------------------
   Três fontes, na ordem de confiança:

     1. o painel azul das páginas mensais ("Cursos Presenciais (exceto
        Direito)") — texto normal, com espaços entre palavras;
     2. o subtítulo da página de visão geral, que vem com espaçamento entre
        letras ("C U R S O S  P R E S E N C I A L") e precisa ser remontado;
     3. o caminho do arquivo dentro da pasta/ZIP ("Direito/Direito
        Veteranos.pdf") — usado só como SUGESTÃO, sempre sinalizada.

   Nada aqui é inventado: se a modalidade não aparece em nenhuma das três
   fontes, ela fica vazia e o calendário não pode ser publicado sem que
   alguém a preencha.
   ========================================================================== */

export interface HeaderInfo {
  title: string;
  year: number | null;
  semester: 1 | 2 | null;
  scope: CalendarScope;
  issues: ReviewIssue[];
  /** De onde veio o rótulo de público (para a revisão). */
  audienceSource: 'panel' | 'overview' | 'path' | 'none';
}

const MONTH_YEAR = /^(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*(\d{4})$/i;

/** Palavras que aparecem nos subtítulos com letras espaçadas. */
const VOCAB = [
  'CALENDÁRIO', 'ACADÊMICO', 'CURSOS', 'CURSO', 'PRESENCIAIS', 'PRESENCIAL', 'SEMIPRESENCIAIS', 'SEMIPRESENCIAL',
  'HÍBRIDOS', 'HÍBRIDO', 'INTENSIVOS', 'INTENSIVO', 'EXCETO', 'DIREITO', 'EAD', 'QUINZENAIS', 'QUINZENAL', 'SEMANAIS',
  'SEMANAL', 'ÀS', 'AOS', 'AO', 'SEXTAS', 'SEXTA', 'SÁBADOS', 'SÁBADO', 'TERÇAS', 'TERÇA', 'QUINTAS', 'QUINTA', 'E', 'DE',
  'DO', 'DA', 'DOS', 'DAS', 'INGRESSANTES', 'VETERANOS', 'ESTÉTICA', 'COSMÉTICA', 'SEMESTRE', 'DIURNO', 'NOTURNO',
  'GRADUAÇÃO', 'TECNÓLOGO', 'TECNOLÓGICOS', 'LICENCIATURA', 'BACHARELADO', 'ENGENHARIAS', 'ENGENHARIA', 'SAÚDE',
  'NOITE', 'MANHÃ', 'TARDE', 'EM', 'PARA', 'COM', 'SEM', 'MÓDULO', 'MODULAR', 'BIMESTRAL', 'BIMESTRE',
];
const VOCAB_SET = new Set(VOCAB.map((w) => stripAccents(w)));

/** "C U R S O S P R E S E N C I A L" → "CURSOS PRESENCIAL". */
export function unspace(letterSpaced: string): string {
  if (!/^(?:\S ){3,}\S/.test(letterSpaced.trim())) return collapseWhitespace(letterSpaced);
  const glyphs = letterSpaced.trim().split(/\s+/);
  // blocos que já têm mais de um caractere (ex.: "2º") ficam como estão
  const chars = glyphs.join('');
  const plain = stripAccents(chars);

  // programação dinâmica: menor número de pedaços desconhecidos
  const n = plain.length;
  const best: { cost: number; words: string[] }[] = Array(n + 1);
  best[0] = { cost: 0, words: [] };
  for (let i = 1; i <= n; i += 1) {
    best[i] = { cost: Infinity, words: [] };
    for (let j = Math.max(0, i - 16); j < i; j += 1) {
      if (!best[j] || best[j].cost === Infinity) continue;
      const piece = plain.slice(j, i);
      const known = VOCAB_SET.has(piece);
      const punct = /^[()·,.\-–º°ª\d]+$/.test(piece);
      const cost = best[j].cost + (known || punct ? 1 : 5 + piece.length);
      if (cost < best[i].cost) best[i] = { cost, words: [...best[j].words, chars.slice(j, i)] };
    }
  }
  return best[n].words
    .join(' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/(\d)\s+º/g, '$1º');
}

/** "CURSOS PRESENCIAL (EXCETO DIREITO)" → "Cursos Presencial (exceto Direito)". */
export function sentenceCaseTitle(s: string): string {
  const lowerWords = new Set(['e', 'de', 'do', 'da', 'dos', 'das', 'às', 'aos', 'ao', 'em', 'para', 'exceto', 'com', 'sem']);
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      const bare = w.replace(/[()]/g, '');
      if (i > 0 && lowerWords.has(bare)) return w;
      if (bare === 'ead') return w.replace('ead', 'EAD');
      return w.replace(/[a-zà-ý]/, (c) => c.toUpperCase());
    })
    .join(' ');
}

function panelLines(page: PageModel, panelRight: number): Line[] {
  return groupLines(page.items.filter((i) => i.x < panelRight && i.height >= 14));
}

/** Rótulo de público no painel lateral da página mensal. */
function audienceFromPanel(pages: PageModel[], panelRightFor: (p: PageModel) => number | null): string | null {
  for (const page of pages) {
    const right = panelRightFor(page);
    if (right === null) continue;
    const lines = panelLines(page, right);
    const monthIdx = lines.findIndex((l) => MONTH_YEAR.test(l.text));
    if (monthIdx === -1) continue;
    const titleIdx = lines.findIndex((l) => /acad[êe]mico/i.test(l.text));
    const between = lines.slice(titleIdx + 1, monthIdx).map((l) => l.text).filter((t) => !/calend[áa]rio|acad[êe]mico/i.test(t));
    const label = collapseWhitespace(between.join(' '));
    if (label) return label;
  }
  return null;
}

function parseScope(label: string, pathHint: string): { scope: CalendarScope; recognized: boolean } {
  const plain = stripAccents(label).toLowerCase();
  const pathPlain = stripAccents(pathHint).toLowerCase();

  let modality = '';
  if (/\bead\b|a distancia/.test(plain)) modality = 'EAD';
  else if (/semipresencia|hibrid|quinzena|intensivo/.test(plain)) modality = 'Híbrido';
  else if (/presencia/.test(plain)) modality = /semana/.test(plain) || /hibrid|semipresencia|intensivo/.test(pathPlain) ? 'Híbrido' : 'Presencial';
  else if (/semana/.test(plain) && /hibrid|semipresencia|intensivo/.test(pathPlain)) modality = 'Híbrido';

  const exceptions: string[] = [];
  const exc = label.match(/\(?\s*exceto\s+([^)]+?)\s*\)?$/i) ?? label.match(/\(\s*exceto\s+([^)]+)\)/i);
  if (exc) exceptions.push(...exc[1].split(/\s*(?:,|\se\s)\s*/).map((s) => sentenceCaseTitle(s.trim())).filter(Boolean));

  const courses: string[] = [];
  const course = label.match(/curso\s+(?:presencial\s+|semanal\s+|quinzenal\s+)?de\s+(.+?)(?:\s+(?:às|aos|ao)\s+|\s*\(|$)/i);
  if (course) courses.push(sentenceCaseTitle(course[1].trim()));

  const cohorts: Cohort[] = [];
  const mentionsNew = /ingressantes|calouros/.test(plain);
  const mentionsOld = /veteranos/.test(plain);
  if (mentionsNew && !mentionsOld) cohorts.push('ingressantes');
  if (mentionsOld && !mentionsNew) cohorts.push('veteranos');

  return { scope: { modality, courses, exceptions, cohorts, audienceLabel: label }, recognized: Boolean(modality) };
}

export function extractHeader(
  pages: PageModel[],
  opts: { info: Record<string, string>; relativePath: string; panelRightFor: (p: PageModel) => number | null },
): HeaderInfo {
  const issues: ReviewIssue[] = [];
  const allLines = pages.slice(0, 3).flatMap((p) => groupLines(p.items.filter((i) => i.height >= 12)));
  const joined = allLines.map((l) => l.text).join(' \n ');

  // Ano: título do PDF > "JULHO / 2026" > metadado
  let year: number | null = null;
  const titleYear = joined.match(/acad[êe]mico\s+(20\d{2})/i);
  const monthYear = allLines.map((l) => l.text.match(MONTH_YEAR)).find(Boolean);
  if (titleYear) year = Number(titleYear[1]);
  else if (monthYear) year = Number(monthYear[2]);
  else if (/\b(20\d{2})\b/.test(opts.info.Title ?? '')) year = Number((opts.info.Title ?? '').match(/\b(20\d{2})\b/)![1]);

  // Semestre: "2º SEMESTRE" costuma vir com letras espaçadas
  let semester: 1 | 2 | null = null;
  const compact = joined.replace(/\s+/g, '');
  const sem = compact.match(/([12])[º°o]?SEMESTRE/i) ?? stripAccents(opts.relativePath).match(/([12])[º°o]?\s*sem/i);
  if (sem) semester = Number(sem[1]) as 1 | 2;

  // Público
  let audienceSource: HeaderInfo['audienceSource'] = 'none';
  let label = audienceFromPanel(pages, opts.panelRightFor);
  if (label) audienceSource = 'panel';
  if (!label) {
    const sub = allLines.find((l) => /^(?:\S ){4,}/.test(l.text) && /C\s*U\s*R\s*S\s*O/.test(l.text));
    if (sub) {
      const cut = sub.text.split(/\s·\s|·/)[0];
      label = sentenceCaseTitle(unspace(cut));
      audienceSource = 'overview';
    }
  }
  const fileBase = opts.relativePath.split('/').pop()!.replace(/\.pdf$/i, '');
  if (!label) {
    label = fileBase;
    audienceSource = 'path';
  }

  const { scope, recognized } = parseScope(label, opts.relativePath);

  // Caminho do arquivo: "…/Administração/Administração Veteranos.pdf"
  const segments = opts.relativePath.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const folder = segments[segments.length - 2];
    const isGroupingFolder = /calend[áa]rio|semestre|cursos|^\d{2}\s/i.test(folder);
    if (!isGroupingFolder && !scope.courses.length) {
      scope.courses.push(folder);
      issues.push({
        code: 'courses_from_path',
        severity: 'blocker',
        field: 'scope.courses',
        message: `O curso "${folder}" foi sugerido pelo nome da pasta, não pelo PDF. Confirme em "Dados gerais".`,
        detail: { path: opts.relativePath },
      });
    }
  }
  if (!scope.cohorts.length) {
    const plainBase = stripAccents(fileBase).toLowerCase();
    const c: Cohort[] = [];
    if (/ingressantes|calouros/.test(plainBase)) c.push('ingressantes');
    if (/veteranos/.test(plainBase)) c.push('veteranos');
    if (c.length === 1) {
      scope.cohorts = c;
      issues.push({
        code: 'courses_from_path',
        severity: 'blocker',
        field: 'scope.cohorts',
        message: `O público "${c[0] === 'ingressantes' ? 'Ingressantes' : 'Veteranos'}" foi sugerido pelo nome do arquivo. Confirme em "Dados gerais".`,
      });
    }
  }

  if (!recognized)
    issues.push({
      code: 'scope_unrecognized',
      severity: 'warning',
      field: 'scope.modality',
      message: 'A modalidade não foi identificada no PDF. Preencha em "Dados gerais".',
    });
  if (year === null)
    issues.push({ code: 'scope_unrecognized', severity: 'warning', field: 'year', message: 'O ano do calendário não foi encontrado no PDF.' });
  if (semester === null)
    issues.push({ code: 'scope_unrecognized', severity: 'warning', field: 'semester', message: 'O semestre não foi encontrado no PDF.' });

  return { title: label, year, semester, scope, issues, audienceSource };
}
