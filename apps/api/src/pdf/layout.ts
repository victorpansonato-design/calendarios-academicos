import type { Shape, TextItem } from './reader';

/* ==========================================================================
   Geometria de página
   --------------------------------------------------------------------------
   O pdf.js devolve a página em pedaços: "Evento on", "-", "line para…" são três
   itens na mesma linha. Aqui eles voltam a ser linhas de texto, usando a
   posição real de cada pedaço — se o vão entre dois itens é menor que um
   espaço, eles se juntam sem espaço ("on-line"); se não, com um espaço.
   ========================================================================== */

export type BBox = [number, number, number, number]; // x0, top, x1, bottom

export interface Line {
  text: string;
  items: TextItem[];
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  baseline: number;
  height: number;
  bold: boolean;
}

export function centerY(item: { top: number; bottom?: number; baseline?: number; height?: number }): number {
  if (item.bottom !== undefined) return (item.top + item.bottom) / 2;
  return item.top + (item.height ?? 0) * 0.4;
}

export function itemBottom(item: TextItem): number {
  return item.baseline + item.height * 0.2;
}

export function itemCenterY(item: TextItem): number {
  return (item.top + itemBottom(item)) / 2;
}

export function contains(shape: { x0: number; x1: number; top: number; bottom: number }, x: number, y: number, pad = 0): boolean {
  return x >= shape.x0 - pad && x <= shape.x1 + pad && y >= shape.top - pad && y <= shape.bottom + pad;
}

export function unionBox(boxes: BBox[]): BBox | null {
  if (!boxes.length) return null;
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

export function round(b: BBox): BBox {
  return b.map((v) => Math.round(v * 10) / 10) as BBox;
}

/** Junta itens da mesma linha na ordem horizontal, respeitando os vãos reais. */
export function joinItems(items: TextItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let out = '';
  let prevEnd: number | null = null;
  for (const it of sorted) {
    const str = it.str.replace(/\s+/g, ' ');
    if (prevEnd === null) {
      out = str;
    } else {
      const gap = it.x - prevEnd;
      const spaceWidth = it.height * 0.18;
      const needsSpace = gap > spaceWidth && !out.endsWith(' ') && !str.startsWith(' ');
      out += needsSpace ? ` ${str}` : str;
    }
    prevEnd = it.x + it.width;
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

/** Agrupa itens em linhas pela linha de base (tolerância proporcional à fonte). */
export function groupLines(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].baseline - it.baseline) <= Math.max(2, it.height * 0.3)) last.push(it);
    else lines.push([it]);
  }
  return lines.map((group) => {
    const x0 = Math.min(...group.map((i) => i.x));
    const x1 = Math.max(...group.map((i) => i.x + i.width));
    const top = Math.min(...group.map((i) => i.top));
    const bottom = Math.max(...group.map(itemBottom));
    return {
      text: joinItems(group),
      items: group,
      x0,
      x1,
      top,
      bottom,
      baseline: group[0].baseline,
      height: Math.max(...group.map((i) => i.height)),
      bold: group.every((i) => i.bold),
    };
  });
}

export function lineBox(line: Line): BBox {
  return [line.x0, line.top, line.x1, line.bottom];
}

export function isWhite(color: string): boolean {
  return /^#f[a-f0-9]f[a-f0-9]f[a-f0-9]$/i.test(color) || color === '#ffffff';
}

/** Luminância relativa aproximada, para achar formas "de fundo". */
export function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function area(s: Shape): number {
  return (s.x1 - s.x0) * (s.bottom - s.top);
}
