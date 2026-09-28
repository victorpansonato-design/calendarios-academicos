import type {
  CalendarNote,
  CalendarScope,
  ExtractionPageReport,
  ExtractionReport,
  ISODate,
  LegendEntry,
  ReviewIssue,
  SourceRef,
} from '@calendarios/core';
import { coverage, extractFields, normalizeForCompare, occupiedDays, parseDateLabel } from '@calendarios/core';
import { readPdf, type PageModel } from './reader';
import { extractHeader } from './header';
import { isOverviewPage, parseOverview, sameColor, type OverviewResult } from './overview';
import { isMonthlyPage, panelRight, parseMonthly, type RawRow } from './monthly';
import { mergeAcrossPages, type DraftEvent } from './merge';
import { round, type BBox } from './layout';
import type { OcrProvider } from './ocr';

/* ==========================================================================
   Cadeia de leitura de um calendário
   --------------------------------------------------------------------------
     1. Lê todas as páginas: texto com posição, links, formas coloridas.
     2. Classifica: visão geral (grade + legenda), mensal (tabela) ou sem texto.
     3. Cabeçalho: ano, semestre, público, exceções.
     4. Tabelas mensais → linhas data ↔ descrição, com a página e o retângulo.
     5. Páginas sem texto → OCR/IA, se configurado; senão, pendência explícita.
     6. Campos (horários, local, link, ressalvas, público) sem reescrever nada.
     7. Um evento por período, mesmo que apareça em várias páginas.
     8. Cruza com a grade: categoria/cor da legenda e dias pintados sem evento.
     9. Relatório de conferência com os números da leitura.

   Nenhuma etapa publica nada. O resultado é um rascunho com pendências.
   ========================================================================== */

export const ENGINE_VERSION = 'extrator-1.0 (pdfjs 4.10)';

export interface ExtractionInput {
  data: Uint8Array;
  fileId: string;
  relativePath: string;
  ocr: OcrProvider | null;
}

export interface ExtractionOutput {
  title: string;
  year: number | null;
  semester: 1 | 2 | null;
  scope: CalendarScope;
  legend: LegendEntry[];
  notes: CalendarNote[];
  calendarIssues: ReviewIssue[];
  events: (DraftEvent & { category: string | null; color: string | null })[];
  report: ExtractionReport;
}

const MIN_TEXT_ITEMS = 8;

function sourceOf(fileId: string, row: RawRow, method: SourceRef['method']): SourceRef {
  return {
    fileId,
    page: row.page,
    bbox: method === 'ai_ocr' ? null : round(row.bbox),
    text: [row.label, ...row.lines.map((l) => l.text)].join('\n'),
    method,
  };
}

function rowToDraft(row: RawRow, fileId: string, ctx: { year: number | null; semester: 1 | 2 | null }, method: SourceRef['method']): DraftEvent {
  const fields = extractFields(row.lines);
  const parsed = parseDateLabel(row.label, ctx);
  const issues: ReviewIssue[] = [...parsed.issues];

  if (row.strategy === 'nearest_date' && method === 'text_layer')
    issues.push({
      code: 'low_confidence_association',
      severity: 'blocker',
      message: 'A página não tem a estrutura de tabela esperada; a descrição foi ligada à data mais próxima. Confira no PDF.',
    });
  if (method === 'ai_ocr')
    issues.push({
      code: 'ocr_extracted',
      severity: 'blocker',
      message: 'Este evento foi lido por OCR de uma página digitalizada. Confira data e texto contra o PDF.',
    });
  // O público citado no texto é só sugestão: "…Presenciais, Remotas e do Estudo
  // Dirigido (Dependência e Adaptação)" cita DP, mas vale para todos. Uma pessoa
  // decide se aplica o recorte — até lá, o evento mantém o público do calendário.
  if (fields.audience.groups.length)
    issues.push({
      code: 'audience_detected',
      severity: 'blocker',
      field: 'audience',
      message: `O texto menciona um público específico (${fields.audience.groups.join(', ')}). Decida se os avisos devem ir só para esse grupo ou para todo o público do calendário.`,
      detail: { groups: fields.audience.groups, evidence: fields.audience.evidence },
    });
  const urls = [...fields.urls];
  for (const u of row.urls) if (!urls.includes(u)) urls.push(u);

  return {
    label: row.label,
    dates: parsed.dates,
    fields: { ...fields, urls, audience: { groups: [], evidence: fields.audience.evidence } },
    sources: [sourceOf(fileId, row, method)],
    issues,
    confidence: row.confidence,
  };
}

/* -- Categoria pela legenda ----------------------------------------------
   A cor da grade ajuda, mas não decide sozinha: durante o período de inscrição
   em DP, TODOS os dias de julho e agosto estão azul-claros — isso não faz do
   "Período de inscrição para Monitoria" um evento de DP. Por isso:
     · texto forte (≥ 0,6) decide sozinho;
     · texto fraco (≥ 0,3) só vale se o dia tem a cor da legenda E nenhum outro
       evento já reivindica essa legenda com texto forte;
     · ou, com a cor no dia, se metade do rótulo da legenda está no texto. */

function legendScore(text: string, label: string): number {
  return (coverage(text, label) + coverage(label, text)) / 2;
}

const STRONG = 0.6;
const WEAK = 0.3;

function assignCategories(
  events: DraftEvent[],
  legend: LegendEntry[],
  gridDays: Record<ISODate, string[]>,
): { category: string | null; color: string | null; issue: ReviewIssue | null }[] {
  const none = { category: null, color: null, issue: null };
  if (!legend.length) return events.map(() => none);

  const holiday = legend.find((l) => /feriad|recess/i.test(l.label));
  const scores = events.map((e) => legend.map((l) => legendScore(e.fields.title || e.fields.description, l.label)));
  const strongClaim = new Set<string>();
  events.forEach((e, i) =>
    legend.forEach((l, j) => {
      if (scores[i][j] >= STRONG || (holiday && l.key === holiday.key && e.fields.type === 'holiday')) strongClaim.add(l.key);
    }),
  );

  const result = events.map((e, i) => {
    if (e.fields.type === 'holiday' && holiday) return { category: holiday.key, color: holiday.color, issue: null };
    const days = e.dates ? occupiedDays(e.dates) : [];
    const colors = days.flatMap((d) => gridDays[d] ?? []);
    const ranked = legend.map((l, j) => ({ l, s: scores[i][j], hit: colors.some((c) => sameColor(c, l.color)) })).sort((a, b) => b.s + (b.hit ? 0.05 : 0) - (a.s + (a.hit ? 0.05 : 0)));
    const best = ranked[0];
    if (best.s >= STRONG) return { category: best.l.key, color: best.l.color, issue: null };
    // Legendas agrupam eventos ("Regulares, Eletivas e Prática Extensionista"):
    // metade do rótulo da legenda presente no texto + cor no dia também vale.
    const text = e.fields.title || e.fields.description;
    const weak = ranked.find((r) => r.hit && ((r.s >= WEAK && !strongClaim.has(r.l.key)) || coverage(r.l.label, text) >= 0.5));
    if (weak) return { category: weak.l.key, color: weak.l.color, issue: null };
    return none;
  });

  // Dia colorido que nenhum evento com categoria explica: vale mostrar.
  return result.map((r, i) => {
    if (r.category || !events[i].dates || events[i].dates!.kind === 'range') return r;
    const days = occupiedDays(events[i].dates!);
    const unexplained = days.some((d) =>
      (gridDays[d] ?? []).some(
        (c) => !result.some((o, k) => o.color && sameColor(o.color, c) && events[k].dates && occupiedDays(events[k].dates!).includes(d)),
      ),
    );
    if (!unexplained) return r;
    return {
      ...r,
      issue: {
        code: 'category_unmatched' as const,
        severity: 'info' as const,
        field: 'category',
        message: 'O dia deste evento está colorido na grade do PDF com uma cor que nenhum outro evento explica. Escolha a categoria da legenda, se for o caso.',
      },
    };
  });
}

/* -- Pipeline ------------------------------------------------------------- */

export async function extractCalendar(input: ExtractionInput): Promise<ExtractionOutput> {
  const started = Date.now();
  const doc = await readPdf(input.data);
  const calendarIssues: ReviewIssue[] = [];
  const notes: CalendarNote[] = [];
  const pageReports: ExtractionPageReport[] = [];

  const header = extractHeader(doc.pages, {
    info: doc.info,
    relativePath: input.relativePath,
    panelRightFor: (p: PageModel) => panelRight(p),
  });
  calendarIssues.push(...header.issues);
  const ctx = { year: header.year, semester: header.semester };

  let overview: OverviewResult | null = null;
  const drafts: DraftEvent[] = [];
  const unassociatedAll: { page: number; text: string; bbox: BBox }[] = [];
  let ocrState: ExtractionReport['ocr'] = 'not_needed';
  let rowsFound = 0;

  for (const page of doc.pages) {
    if (page.items.length < MIN_TEXT_ITEMS) {
      // Página digitalizada ou só imagem
      const report: ExtractionPageReport = {
        page: page.number,
        kind: 'no_text',
        rows: 0,
        textItems: page.items.length,
        method: 'none',
        rowStrategy: 'none',
        unassociated: [],
      };
      if (input.ocr) {
        try {
          const rows = await input.ocr.readPage(input.data, page.number);
          for (const r of rows) {
            const raw: RawRow = {
              page: page.number,
              label: r.dateLabel,
              labelBox: [0, 0, 0, 0],
              lines: r.lines.map((text) => ({ text })),
              bbox: [0, 0, 0, 0],
              urls: [],
              strategy: 'nearest_date',
              confidence: 0.5,
            };
            drafts.push(rowToDraft(raw, input.fileId, ctx, 'ai_ocr'));
          }
          report.rows = rows.length;
          report.method = 'ai_ocr';
          rowsFound += rows.length;
          ocrState = 'used';
        } catch (err) {
          calendarIssues.push({
            code: 'page_without_text',
            severity: 'blocker',
            message: `A página ${page.number} não tem texto selecionável e a leitura por IA falhou (${(err as Error).message}). Confira a página e cadastre os eventos manualmente.`,
            detail: { page: page.number },
          });
          ocrState = ocrState === 'used' ? 'used' : 'unavailable';
        }
      } else {
        ocrState = 'unavailable';
        calendarIssues.push({
          code: 'page_without_text',
          severity: 'blocker',
          message: `A página ${page.number} não tem texto selecionável (parece digitalizada). O OCR aguarda configuração do serviço de IA — confira a página e cadastre os eventos manualmente.`,
          detail: { page: page.number },
        });
      }
      pageReports.push(report);
      continue;
    }

    if (isOverviewPage(page) && !isMonthlyPage(page)) {
      overview = parseOverview(page, header.year, header.semester);
      calendarIssues.push(...overview.issues);
      for (const n of overview.notes)
        notes.push({ id: `note-p${page.number}-${notes.length + 1}`, text: n.text, source: { fileId: input.fileId, page: page.number, bbox: round(n.bbox), text: n.text, method: 'text_layer' } });
      pageReports.push({
        page: page.number,
        kind: 'overview',
        rows: 0,
        textItems: page.items.length,
        method: 'text_layer',
        rowStrategy: 'none',
        unassociated: [],
      });
      continue;
    }

    const monthly = parseMonthly(page);
    for (const row of monthly.rows) drafts.push(rowToDraft(row, input.fileId, ctx, 'text_layer'));
    rowsFound += monthly.rows.length;
    for (const u of monthly.unassociated) unassociatedAll.push({ page: page.number, ...u });
    pageReports.push({
      page: page.number,
      kind: isMonthlyPage(page) ? 'monthly' : monthly.rows.length ? 'monthly' : 'other',
      rows: monthly.rows.length,
      textItems: page.items.length,
      method: 'text_layer',
      rowStrategy: monthly.strategy,
      unassociated: monthly.unassociated.map((u) => ({ text: u.text, bbox: round(u.bbox) })),
    });
  }

  // Trechos fora da tabela: viram observações do calendário (repetidos → uma só)
  const byText = new Map<string, { text: string; pages: number[]; bbox: BBox; page: number }>();
  for (const u of unassociatedAll) {
    const k = normalizeForCompare(u.text);
    if (!k) continue;
    const existing = byText.get(k);
    if (existing) existing.pages.push(u.page);
    else byText.set(k, { text: u.text, pages: [u.page], bbox: u.bbox, page: u.page });
  }
  for (const u of byText.values()) {
    notes.push({
      id: `note-p${u.page}-${notes.length + 1}`,
      text: u.text,
      source: { fileId: input.fileId, page: u.page, bbox: round(u.bbox), text: u.text, method: 'text_layer' },
    });
  }
  if (byText.size)
    calendarIssues.push({
      code: 'unassociated_text',
      severity: 'blocker',
      message: `${byText.size} trecho(s) do PDF não pertencem a nenhuma linha de data e foram guardados como observações gerais. Confira se algum deles deveria fazer parte de um evento.`,
      detail: { snippets: [...byText.values()].map((u) => ({ text: u.text, pages: u.pages })) },
    });

  // Um evento por período
  const merged = mergeAcrossPages(drafts);
  const legend = overview?.legend ?? [];
  const gridDays = overview?.gridDays ?? {};

  const categories = assignCategories(merged.events, legend, gridDays);
  const events = merged.events.map((e, i) => {
    const { category, color, issue } = categories[i];
    return { ...e, category, color, issues: issue ? [...e.issues, issue] : e.issues };
  });

  // Conferência cruzada: dia pintado na grade sem nenhum evento daquela cor
  if (overview) {
    const covered = new Map<string, Set<ISODate>>(); // cor → dias cobertos
    for (const e of events) {
      if (!e.color || !e.dates) continue;
      const set = covered.get(e.color) ?? new Set<ISODate>();
      for (const d of occupiedDays(e.dates)) set.add(d);
      covered.set(e.color, set);
    }
    const missing: { date: ISODate; legend: string }[] = [];
    for (const [date, colors] of Object.entries(gridDays)) {
      for (const c of colors) {
        const entry = legend.find((l) => sameColor(l.color, c));
        if (!entry) continue;
        const days = [...covered.entries()].find(([col]) => sameColor(col, c))?.[1];
        if (!days?.has(date)) missing.push({ date, legend: entry.label });
      }
    }
    if (missing.length)
      calendarIssues.push({
        code: 'grid_day_without_event',
        severity: 'warning',
        message: `${missing.length} dia(s) coloridos na grade do PDF não têm um evento correspondente nas páginas mensais. Pode ser só diferença de desenho — confira.`,
        detail: { days: missing },
      });
  }

  const datesRecognized = events.filter((e) => e.dates !== null).length;
  const report: ExtractionReport = {
    fileId: input.fileId,
    pageCount: doc.pageCount,
    pagesProcessed: pageReports.filter((p) => p.method !== 'none').length,
    rowsFound,
    eventsFound: events.length,
    mergedAcrossPages: merged.mergedAcrossPages,
    datesRecognized,
    datesPending: events.length - datesRecognized,
    possibleDuplicates: merged.possibleDuplicates,
    unassociatedSnippets: byText.size,
    pages: pageReports,
    gridDays,
    pdfTitle: doc.info.Title ?? null,
    pdfMetadata: doc.info,
    ocr: ocrState,
    durationMs: Date.now() - started,
    engineVersion: ENGINE_VERSION,
  };

  return {
    title: header.title,
    year: header.year,
    semester: header.semester,
    scope: header.scope,
    legend,
    notes,
    calendarIssues,
    events,
    report,
  };
}
