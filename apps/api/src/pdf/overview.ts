import type { ISODate, LegendEntry, ReviewIssue } from '@calendarios/core';
import { collapseWhitespace, isValidDay, monthFromName, slug, toISO, weekday } from '@calendarios/core';
import type { PageModel, Shape, TextItem } from './reader';
import { area, contains, groupLines, isWhite, itemCenterY, type BBox } from './layout';

/* ==========================================================================
   Página de visão geral: a grade do semestre e a legenda
   --------------------------------------------------------------------------
   A primeira página dos calendários é uma grade de seis meses em que cada dia
   é pintado com a cor da legenda. Um dia com dois eventos ganha um triângulo
   de outra cor no canto.

   Ela NÃO é a fonte dos eventos — as páginas mensais são. Ela é lida por dois
   motivos:
     · a legenda (cor ↔ nome da categoria), que a versão editável reaproveita
       para manter a familiaridade do PDF;
     · a conferência cruzada: um dia pintado na grade que não tem nenhum evento
       correspondente nas páginas mensais é sinal de algo que não foi lido.
   ========================================================================== */

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

export interface GridDay {
  date: ISODate;
  fill: string | null;
  corners: string[];
  bbox: BBox;
}

export interface OverviewResult {
  page: number;
  months: { month: number; year: number; days: GridDay[] }[];
  legend: LegendEntry[];
  gridDays: Record<ISODate, string[]>;
  notes: { text: string; bbox: BBox }[];
  issues: ReviewIssue[];
}

function monthHeaders(page: PageModel): TextItem[] {
  return page.items.filter((i) => i.height >= 12 && monthFromName(i.str) !== null && /^[A-ZÇÃÉÍÓÚÂÊÔ]+$/.test(i.str.trim()));
}

export function isOverviewPage(page: PageModel): boolean {
  return monthHeaders(page).length >= 2 && page.items.filter((i) => i.str.trim() === 'DOM').length >= 2;
}

/** Distância entre duas cores no espaço RGB. */
export function colorDistance(a: string, b: string): number {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

export function sameColor(a: string, b: string): boolean {
  return colorDistance(a, b) < 14;
}

function centroid(s: Shape): [number, number] {
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  return [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
}

export function parseOverview(page: PageModel, year: number | null, semester: 1 | 2 | null): OverviewResult {
  const issues: ReviewIssue[] = [];
  const headers = monthHeaders(page);
  const weekdayItems = page.items.filter((i) => WEEKDAYS.includes(i.str.trim()));
  const dayItems = page.items.filter((i) => /^\d{1,2}$/.test(i.str.trim()));
  const rects = page.shapes.filter((s) => s.kind === 'rect');
  // marcadores dentro da célula: triângulo de canto ou pontinho
  const markers = page.shapes.filter((s) => s.kind !== 'rule' && !isWhite(s.color) && area(s) < 250);
  const consumed = new Set<TextItem>(headers);
  const months: OverviewResult['months'] = [];
  let gridRight = 0;

  for (const header of headers) {
    const month = monthFromName(header.str)!;
    // linha de dias da semana logo abaixo do nome do mês
    const dom = weekdayItems
      .filter((w) => w.str.trim() === 'DOM' && w.baseline > header.baseline && w.baseline - header.baseline < 45 && Math.abs(w.x - header.x) < 160)
      .sort((a, b) => Math.abs(a.x - header.x) - Math.abs(b.x - header.x))[0];
    if (!dom) continue;
    const row = weekdayItems
      .filter((w) => Math.abs(w.baseline - dom.baseline) < 2 && w.x >= dom.x - 1 && w.x - dom.x < 230)
      .sort((a, b) => a.x - b.x)
      .slice(0, 7);
    if (row.length !== 7) continue;
    row.forEach((w) => consumed.add(w));

    const colCenters = row.map((w) => w.x + w.width / 2);
    const left = row[0].x - 12;
    const right = row[6].x + row[6].width + 12;
    gridRight = Math.max(gridRight, right);
    const nextHeaderBelow = headers
      .filter((h) => h.baseline > header.baseline + 20 && Math.abs(h.x - header.x) < 160)
      .sort((a, b) => a.baseline - b.baseline)[0];
    const bottomLimit = nextHeaderBelow ? nextHeaderBelow.top - 4 : dom.baseline + 180;

    // O ano do mês: o do título; janeiro num 2º semestre é do ano seguinte.
    const y = year === null ? null : semester === 2 && month <= 2 ? year + 1 : year;
    const days: GridDay[] = [];

    for (const item of dayItems) {
      const cx = item.x + item.width / 2;
      const cy = itemCenterY(item);
      if (cx < left || cx > right || item.baseline <= dom.baseline || item.top >= bottomLimit) continue;
      consumed.add(item);
      if (y === null) continue;
      const day = Number(item.str.trim());
      if (!isValidDay(y, month, day)) continue;
      const date = toISO(y, month, day);

      const cell = rects
        .filter((r) => contains(r, cx, cy) && area(r) > 150 && area(r) < 2500)
        .sort((a, b) => area(a) - area(b))[0];
      const bbox: BBox = cell ? [cell.x0, cell.top, cell.x1, cell.bottom] : [item.x - 6, item.top - 6, item.x + item.width + 6, item.baseline + 6];
      const corners = cell
        ? markers
            .filter((t) => {
              if (t === cell || area(t) > area(cell) * 0.6) return false;
              const [tx, ty] = centroid(t);
              return contains(cell, tx, ty, 1);
            })
            .map((t) => t.color)
        : [];

      // conferência do dia da semana: a coluna tem de bater com o ano
      const col = colCenters.reduce((best, c, idx) => (Math.abs(c - cx) < Math.abs(colCenters[best] - cx) ? idx : best), 0);
      if (col !== weekday(date)) {
        issues.push({
          code: 'grid_color_mismatch',
          severity: 'warning',
          message: `Na grade do PDF, o dia ${day}/${month} está na coluna ${WEEKDAYS[col]}, mas em ${y} ele cai num ${WEEKDAYS[weekday(date)]}. Confira o ano do calendário.`,
          detail: { date, column: WEEKDAYS[col] },
        });
      }

      days.push({ date, fill: cell && !isWhite(cell.color) ? cell.color : null, corners, bbox });
    }
    if (y !== null) months.push({ month, year: y, days: days.sort((a, b) => a.date.localeCompare(b.date)) });
  }

  // Só um aviso de coluna por mês, para não afogar a revisão
  const seen = new Set<string>();
  const dedupedIssues = issues.filter((i) => {
    const key = String((i.detail as { date: string }).date).slice(0, 7);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const legend = parseLegend(page, gridRight, consumed);

  const gridDays: Record<ISODate, string[]> = {};
  for (const m of months) {
    for (const d of m.days) {
      const colors = [d.fill, ...d.corners].filter((c): c is string => Boolean(c));
      if (colors.length) gridDays[d.date] = colors;
    }
  }

  // Rodapé ("*Datas com mais de uma cor…") e títulos: o que sobrou fora da legenda
  const leftovers = groupLines(page.items.filter((i) => !consumed.has(i) && i.x < gridRight));
  const notes = leftovers
    .filter((l) => l.text.startsWith('*'))
    .map((l) => ({ text: collapseWhitespace(l.text), bbox: [l.x0, l.top, l.x1, l.bottom] as BBox }));

  return { page: page.number, months, legend, gridDays, notes, issues: dedupedIssues };
}

function parseLegend(page: PageModel, gridRight: number, consumed: Set<TextItem>): LegendEntry[] {
  const panelItems = page.items.filter((i) => i.x >= gridRight - 4 && !consumed.has(i));
  const lines = groupLines(panelItems);
  const isSectionHeader = (t: string) => /^[A-ZÀ-Ý ÇÃÕÍ]{5,}$/.test(t.trim()) && t.trim().length < 40;
  const headers = lines.filter((l) => isSectionHeader(l.text));
  if (!headers.length) return [];

  const swatches = page.shapes
    .filter((s) => s.kind !== 'rule' && s.x0 >= gridRight - 4)
    .filter((s) => {
      const w = s.x1 - s.x0;
      const h = s.bottom - s.top;
      return w >= 2 && w <= 26 && h >= 2 && h <= 26;
    })
    .sort((a, b) => a.top - b.top);

  const labelLines = lines.filter((l) => !isSectionHeader(l.text));
  const assigned = new Map<Shape, string[]>();
  for (const line of labelLines) {
    const cy = (line.top + line.bottom) / 2;
    const candidates = swatches.filter((s) => line.x0 >= s.x1 - 2 && line.x0 - s.x1 < 40);
    if (!candidates.length) continue;
    const best = candidates.reduce((a, b) => (Math.abs((a.top + a.bottom) / 2 - cy) <= Math.abs((b.top + b.bottom) / 2 - cy) ? a : b));
    if (Math.abs((best.top + best.bottom) / 2 - cy) > 22) continue;
    assigned.set(best, [...(assigned.get(best) ?? []), line.text]);
  }

  const entries: LegendEntry[] = [];
  for (const s of swatches) {
    const texts = assigned.get(s);
    if (!texts) continue;
    const label = collapseWhitespace(texts.join(' ').replace(/(\w)-\s+(\w)/g, '$1-$2'));
    const header = headers.filter((h) => h.baseline < s.top + 4).sort((a, b) => b.baseline - a.baseline)[0];
    const group = header ? header.text.charAt(0) + header.text.slice(1).toLowerCase() : 'Legenda';
    const key = slug(label);
    if (entries.some((e) => e.key === key)) continue;
    const size = Math.max(s.x1 - s.x0, s.bottom - s.top);
    const style = size < 8 ? 'dot' : s.kind === 'poly' && s.points.length === 3 ? 'corner' : 'fill';
    entries.push({ key, label, color: s.color, style, group, fromPdf: true });
  }
  return entries;
}
