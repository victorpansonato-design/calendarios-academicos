import type { FieldLine } from '@calendarios/core';
import { looksLikeDateFragment, looksLikeDateLabel } from '@calendarios/core';
import type { Link, PageModel, Shape, TextItem } from './reader';
import { groupLines, isWhite, itemCenterY, joinItems, lineBox, unionBox, type BBox, type Line } from './layout';

/* ==========================================================================
   Páginas mensais: a tabela data ↔ descrição
   --------------------------------------------------------------------------
   Cada linha da tabela tem uma célula de data (amarela no PDF de exemplo) e
   uma descrição de uma a sete linhas de texto. A data fica centralizada na
   vertical — por isso associar "a linha de texto mais próxima da data" erra
   em descrições longas: a primeira linha da descrição fica mais perto da data
   de cima do que da sua.

   Estratégias, da mais confiável para a menos:

     1. `date_cells`  — a célula colorida da data define o topo e a base da
                        linha. Tudo que está dentro dessa faixa é da linha.
     2. `separators`  — os traços horizontais da tabela delimitam as linhas.
     3. `nearest_date`— sem geometria de tabela, cada linha de texto vai para a
                        data mais próxima. Confiança baixa: toda linha assim
                        fica pendente de conferência.

   O que não cai em nenhuma linha vira "trecho não associado" e é mostrado na
   revisão — nunca descartado em silêncio.
   ========================================================================== */

export interface RawRow {
  page: number;
  label: string;
  labelBox: BBox;
  lines: FieldLine[];
  bbox: BBox;
  urls: string[];
  strategy: 'date_cells' | 'separators' | 'nearest_date';
  confidence: number;
}

export interface MonthlyResult {
  page: number;
  monthLabel: string | null;
  rows: RawRow[];
  strategy: RawRow['strategy'] | 'none';
  unassociated: { text: string; bbox: BBox }[];
  panelRight: number;
}

const MONTH_YEAR = /^(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*(\d{4})$/i;

/** O painel lateral (azul, altura da página) — o que está nele não é tabela. */
export function panelRight(page: PageModel): number | null {
  const panel = page.shapes
    .filter((s) => s.kind === 'rect' && s.x0 < 5 && s.bottom - s.top > page.height * 0.8 && s.x1 < page.width * 0.5)
    .sort((a, b) => b.x1 - a.x1)[0];
  return panel ? panel.x1 : null;
}

export function monthLabel(page: PageModel): string | null {
  const line = groupLines(page.items.filter((i) => i.height >= 14)).find((l) => MONTH_YEAR.test(l.text));
  return line ? line.text : null;
}

function isInside(item: TextItem, box: { x0: number; x1: number; top: number; bottom: number }): boolean {
  const cx = item.x + item.width / 2;
  const cy = itemCenterY(item);
  return cx >= box.x0 - 1 && cx <= box.x1 + 1 && cy >= box.top - 1 && cy <= box.bottom + 1;
}

function linksIn(links: Link[], box: BBox): string[] {
  return links
    .filter((l) => {
      const cy = (l.top + l.bottom) / 2;
      return cy >= box[1] - 2 && cy <= box[3] + 2 && l.x1 >= box[0];
    })
    .map((l) => l.url);
}

function toFieldLines(lines: Line[]): FieldLine[] {
  return lines.map((l) => ({ text: l.text, emphasis: l.bold }));
}

/** Estratégia 1: células preenchidas que contêm um rótulo de data. */
function rowsFromDateCells(page: PageModel, tableItems: TextItem[], left: number): { rows: RawRow[]; used: Set<TextItem> } | null {
  const cells = page.shapes.filter((s) => s.kind === 'rect' && s.x0 >= left - 2 && !isWhite(s.color) && s.x1 - s.x0 < page.width * 0.3);
  const withDate: { cell: Shape; items: TextItem[] }[] = [];
  for (const cell of cells) {
    const inside = tableItems.filter((i) => isInside(i, cell));
    if (!inside.length) continue;
    const label = groupLines(inside).map((l) => l.text).join(' ');
    if (looksLikeDateLabel(label)) withDate.push({ cell, items: inside });
  }
  if (withDate.length < 1) return null;

  // a coluna de datas é a coluna (x0/x1) mais frequente entre as células
  const colKey = (s: Shape) => `${Math.round(s.x0)}:${Math.round(s.x1)}`;
  const freq = new Map<string, number>();
  for (const w of withDate) freq.set(colKey(w.cell), (freq.get(colKey(w.cell)) ?? 0) + 1);
  const column = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const chosen = withDate.filter((w) => colKey(w.cell) === column).sort((a, b) => a.cell.top - b.cell.top);

  const used = new Set<TextItem>();
  const rows: RawRow[] = [];
  for (const { cell, items } of chosen) {
    items.forEach((i) => used.add(i));
    const labelLines = groupLines(items);
    const desc = tableItems.filter((i) => !used.has(i) && i.x >= cell.x1 - 2 && itemCenterY(i) >= cell.top - 0.5 && itemCenterY(i) <= cell.bottom + 0.5);
    desc.forEach((i) => used.add(i));
    const descLines = groupLines(desc);
    const labelBox = unionBox(labelLines.map(lineBox)) ?? [cell.x0, cell.top, cell.x1, cell.bottom];
    const bbox = unionBox([[cell.x0, cell.top, cell.x1, cell.bottom], ...descLines.map(lineBox)])!;
    rows.push({
      page: page.number,
      label: labelLines.map((l) => l.text).join(' '),
      labelBox,
      lines: toFieldLines(descLines),
      bbox,
      urls: linksIn(page.links, bbox),
      strategy: 'date_cells',
      confidence: descLines.length ? 0.97 : 0.5,
    });
  }
  return { rows, used };
}

/** Estratégia 2: traços horizontais delimitam as linhas. */
function rowsFromSeparators(page: PageModel, tableItems: TextItem[], left: number): { rows: RawRow[]; used: Set<TextItem> } | null {
  const rules = page.shapes
    .filter((s) => s.kind === 'rule' && s.x0 >= left - 4 && s.x1 - s.x0 > 60)
    .map((s) => s.top)
    .sort((a, b) => a - b)
    .filter((y, i, arr) => i === 0 || y - arr[i - 1] > 4);
  if (rules.length < 3) return null;

  const used = new Set<TextItem>();
  const rows: RawRow[] = [];
  for (let i = 0; i < rules.length - 1; i += 1) {
    const top = rules[i];
    const bottom = rules[i + 1];
    const band = tableItems.filter((it) => itemCenterY(it) > top && itemCenterY(it) < bottom);
    if (!band.length) continue;
    const minX = Math.min(...band.map((b) => b.x));
    const labelItems = band.filter((b) => b.x < minX + 60 && looksLikeDateFragment(b.str));
    const label = groupLines(labelItems).map((l) => l.text).join(' ');
    if (!looksLikeDateLabel(label)) continue;
    band.forEach((b) => used.add(b));
    const descLines = groupLines(band.filter((b) => !labelItems.includes(b)));
    const bbox = unionBox(groupLines(band).map(lineBox))!;
    rows.push({
      page: page.number,
      label,
      labelBox: unionBox(groupLines(labelItems).map(lineBox))!,
      lines: toFieldLines(descLines),
      bbox,
      urls: linksIn(page.links, bbox),
      strategy: 'separators',
      confidence: 0.85,
    });
  }
  return rows.length ? { rows, used } : null;
}

/** Estratégia 3: cada linha de texto vai para a data mais próxima. Baixa confiança. */
function rowsFromNearestDate(page: PageModel, tableItems: TextItem[]): { rows: RawRow[]; used: Set<TextItem> } | null {
  const lines = groupLines(tableItems);
  if (!lines.length) return null;
  const minX = Math.min(...lines.map((l) => l.x0));
  const dateCol = lines.filter((l) => l.x0 < minX + 60 && looksLikeDateFragment(l.items.filter((i) => i.x < minX + 110).map((i) => i.str).join(' ')));
  // rótulo quebrado em duas linhas ("13, 14, 27 e" / "28/11")
  const labels: { items: TextItem[]; cy: number }[] = [];
  for (const l of dateCol) {
    const items = l.items.filter((i) => i.x < minX + 110);
    const last = labels[labels.length - 1];
    const prevText = last ? joinItems(last.items) : '';
    if (last && /(?:,|\se)$/.test(prevText) && l.top - Math.max(...last.items.map((i) => i.baseline)) < l.height * 1.2) {
      last.items.push(...items);
      last.cy = (last.cy + (l.top + l.bottom) / 2) / 2;
    } else labels.push({ items, cy: (l.top + l.bottom) / 2 });
  }
  const valid = labels.filter((l) => looksLikeDateLabel(groupLines(l.items).map((g) => g.text).join(' ')));
  if (!valid.length) return null;

  const used = new Set<TextItem>();
  valid.forEach((v) => v.items.forEach((i) => used.add(i)));
  const buckets = new Map<number, TextItem[]>();
  for (const it of tableItems) {
    if (used.has(it)) continue;
    const cy = itemCenterY(it);
    const idx = valid.reduce((best, v, i) => (Math.abs(v.cy - cy) < Math.abs(valid[best].cy - cy) ? i : best), 0);
    buckets.set(idx, [...(buckets.get(idx) ?? []), it]);
    used.add(it);
  }
  const rows: RawRow[] = valid.map((v, i) => {
    const descLines = groupLines(buckets.get(i) ?? []);
    const labelLines = groupLines(v.items);
    const bbox = unionBox([...labelLines, ...descLines].map(lineBox))!;
    return {
      page: page.number,
      label: labelLines.map((l) => l.text).join(' '),
      labelBox: unionBox(labelLines.map(lineBox))!,
      lines: toFieldLines(descLines),
      bbox,
      urls: linksIn(page.links, bbox),
      strategy: 'nearest_date',
      confidence: 0.55,
    };
  });
  return { rows, used };
}

export function isMonthlyPage(page: PageModel): boolean {
  return monthLabel(page) !== null;
}

export function parseMonthly(page: PageModel): MonthlyResult {
  const right = panelRight(page) ?? 0;
  const tableItems = page.items.filter((i) => i.x >= right + 2);

  const attempt = rowsFromDateCells(page, tableItems, right) ?? rowsFromSeparators(page, tableItems, right) ?? rowsFromNearestDate(page, tableItems);

  const rows = attempt?.rows ?? [];
  const used = attempt?.used ?? new Set<TextItem>();
  const unassociated = groupLines(tableItems.filter((i) => !used.has(i))).map((l) => ({ text: l.text, bbox: lineBox(l) }));

  return {
    page: page.number,
    monthLabel: monthLabel(page),
    rows,
    strategy: rows[0]?.strategy ?? 'none',
    unassociated,
    panelRight: right,
  };
}
