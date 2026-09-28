import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

/* ==========================================================================
   Leitor de PDF
   --------------------------------------------------------------------------
   Transforma o PDF num modelo geométrico simples, página a página:

     · textos com posição e tamanho (camada de texto selecionável);
     · links (anotações com URL);
     · formas preenchidas com a cor de preenchimento — é assim que o extrator
       sabe onde começa e termina cada linha da tabela (as células amarelas das
       datas) e de que cor está cada dia na grade semestral;
     · metadados do documento.

   Coordenadas: pontos PDF com a origem no CANTO SUPERIOR ESQUERDO (y cresce
   para baixo), igual à tela. Toda conversão de coordenada PDF (origem embaixo)
   acontece aqui e em nenhum outro lugar.

   Versão fixada do pdfjs-dist: 4.10.x. A v5 mudou o formato de
   `constructPath`; atualizar exige revisar `collectShapes`.
   ========================================================================== */

export interface TextItem {
  str: string;
  x: number;
  /** Topo aproximado do glifo. */
  top: number;
  /** Linha de base. */
  baseline: number;
  width: number;
  height: number;
  fontName: string;
  /** Fonte em negrito (heurística pelo nome da fonte embutida). */
  bold: boolean;
}

export interface Shape {
  /** `rule` é um traço horizontal (separador de linhas de tabela). */
  kind: 'rect' | 'poly' | 'rule';
  color: string; // #rrggbb
  x0: number;
  top: number;
  x1: number;
  bottom: number;
  /** Vértices, para triângulos de "mais de um evento". */
  points: [number, number][];
}

export interface Link {
  url: string;
  x0: number;
  top: number;
  x1: number;
  bottom: number;
}

export interface PageModel {
  number: number;
  width: number;
  height: number;
  items: TextItem[];
  shapes: Shape[];
  links: Link[];
}

export interface DocumentModel {
  pageCount: number;
  info: Record<string, string>;
  pages: PageModel[];
}

type Matrix = [number, number, number, number, number, number];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function colorFromArgs(args: unknown): string | null {
  if (typeof args === 'string' && /^#[0-9a-f]{6}$/i.test(args)) return args.toLowerCase();
  if (Array.isArray(args) && typeof args[0] === 'string') return colorFromArgs(args[0]);
  if (args && typeof args === 'object') {
    const v = Object.values(args as Record<string, number>);
    if (v.length >= 3 && v.every((n) => typeof n === 'number')) return hex(v[0], v[1], v[2]);
  }
  return null;
}

// Códigos de operação de caminho do pdf.js
const PATH = { moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18, rectangle: 19 } as const;

/** Lê as formas preenchidas de uma página, já em coordenadas de tela. */
function collectShapes(fnArray: number[], argsArray: unknown[], pageHeight: number): Shape[] {
  const shapes: Shape[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: { ctm: Matrix; fill: string; stroke: string }[] = [];
  let fill = '#000000';
  let stroke = '#000000';
  let path: [number, number][][] = [];

  for (let i = 0; i < fnArray.length; i += 1) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[];
    switch (fn) {
      case OPS.save:
        stack.push({ ctm, fill, stroke });
        break;
      case OPS.restore: {
        const s = stack.pop();
        if (s) ({ ctm, fill, stroke } = s);
        break;
      }
      case OPS.transform:
        ctm = multiply(ctm, args as unknown as Matrix);
        break;
      case OPS.paintFormXObjectBegin: {
        stack.push({ ctm, fill, stroke });
        const matrix = (args as unknown[])[0] as Matrix | null;
        if (Array.isArray(matrix) && matrix.length === 6) ctm = multiply(ctm, matrix);
        break;
      }
      case OPS.paintFormXObjectEnd: {
        const s = stack.pop();
        if (s) ({ ctm, fill, stroke } = s);
        break;
      }
      case OPS.setFillRGBColor:
        fill = colorFromArgs(args) ?? fill;
        break;
      case OPS.setStrokeRGBColor:
        stroke = colorFromArgs(args) ?? stroke;
        break;
      case OPS.constructPath: {
        const [ops, coords] = args as [number[], number[]];
        path = [];
        let current: [number, number][] = [];
        let c = 0;
        for (const op of ops) {
          if (op === PATH.rectangle) {
            const [x, y, w, h] = coords.slice(c, c + 4);
            c += 4;
            path.push([apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h)]);
          } else if (op === PATH.moveTo) {
            if (current.length) path.push(current);
            current = [apply(ctm, coords[c], coords[c + 1])];
            c += 2;
          } else if (op === PATH.lineTo) {
            current.push(apply(ctm, coords[c], coords[c + 1]));
            c += 2;
          } else if (op === PATH.curveTo) {
            current.push(apply(ctm, coords[c + 4], coords[c + 5]));
            c += 6;
          } else if (op === PATH.curveTo2 || op === PATH.curveTo3) {
            current.push(apply(ctm, coords[c + 2], coords[c + 3]));
            c += 4;
          } else if (op === PATH.closePath) {
            if (current.length) path.push(current);
            current = [];
          }
        }
        if (current.length) path.push(current);
        break;
      }
      case OPS.fill:
      case OPS.eoFill:
      case OPS.fillStroke:
      case OPS.eoFillStroke: {
        for (const poly of path) {
          if (poly.length < 3) continue;
          const xs = poly.map((p) => p[0]);
          const ys = poly.map((p) => pageHeight - p[1]);
          const shape: Shape = {
            kind: poly.length === 4 && isAxisAligned(poly) ? 'rect' : 'poly',
            color: fill,
            x0: Math.min(...xs),
            x1: Math.max(...xs),
            top: Math.min(...ys),
            bottom: Math.max(...ys),
            points: poly.map((p) => [p[0], pageHeight - p[1]] as [number, number]),
          };
          shapes.push(shape);
        }
        path = [];
        break;
      }
      case OPS.stroke:
      case OPS.closeStroke: {
        for (const poly of path) {
          if (poly.length !== 2) continue;
          const [[ax, ay], [bx, by]] = poly;
          if (Math.abs(ay - by) > 0.5 || Math.abs(ax - bx) < 20) continue; // só traços horizontais
          const y = pageHeight - ay;
          shapes.push({ kind: 'rule', color: stroke, x0: Math.min(ax, bx), x1: Math.max(ax, bx), top: y, bottom: y, points: [] });
        }
        path = [];
        break;
      }
      case OPS.endPath:
        path = [];
        break;
      default:
        break;
    }
  }
  return shapes;
}

function isAxisAligned(poly: [number, number][]): boolean {
  const xs = new Set(poly.map((p) => Math.round(p[0] * 10)));
  const ys = new Set(poly.map((p) => Math.round(p[1] * 10)));
  return xs.size <= 2 && ys.size <= 2;
}

/** O nome real da fonte ("BCDFEE+Calibri-Bold") só existe depois que as operações da página foram lidas. */
function realFontName(page: { commonObjs: { has(id: string): boolean; get(id: string): unknown } }, fontName: string): string {
  try {
    if (!page.commonObjs.has(fontName)) return fontName;
    const font = page.commonObjs.get(fontName) as { name?: string } | null;
    return font?.name ?? fontName;
  } catch {
    return fontName;
  }
}

export async function readPdf(data: Uint8Array): Promise<DocumentModel> {
  // pdf.js desanexa o buffer que recebe; uma cópia protege quem chamou.
  const doc = await getDocument({ data: new Uint8Array(data), verbosity: 0, isEvalSupported: false, disableFontFace: true }).promise;
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const info: Record<string, string> = {};
    for (const [k, v] of Object.entries((meta?.info ?? {}) as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') info[k] = String(v);
    }

    const pages: PageModel[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const height = viewport.height;
      const text = await page.getTextContent();
      const ops = await page.getOperatorList();
      const boldFonts = new Map<string, boolean>();
      const isBold = (fontName: string) => {
        if (!boldFonts.has(fontName)) boldFonts.set(fontName, /bold|black|heavy|semibold/i.test(realFontName(page, fontName)));
        return boldFonts.get(fontName)!;
      };

      const items: TextItem[] = [];
      for (const raw of text.items) {
        if (!('str' in raw) || !raw.str.trim()) continue;
        const [, , , , tx, ty] = raw.transform as number[];
        const size = raw.height || Math.abs((raw.transform as number[])[3]);
        const baseline = height - ty;
        items.push({
          str: raw.str,
          x: tx,
          baseline,
          top: baseline - size * 0.8,
          width: raw.width,
          height: size,
          fontName: raw.fontName,
          bold: isBold(raw.fontName),
        });
      }

      const shapes = collectShapes(ops.fnArray, ops.argsArray, height).filter(
        // o fundo da página inteira não é informação
        (s) => !(s.x1 - s.x0 >= viewport.width - 2 && s.bottom - s.top >= height - 2),
      );

      const links: Link[] = [];
      for (const a of await page.getAnnotations()) {
        if (a.subtype === 'Link' && typeof a.url === 'string') {
          const [x0, y0, x1, y1] = a.rect as number[];
          links.push({ url: a.url, x0, x1, top: height - y1, bottom: height - y0 });
        }
      }

      pages.push({ number: n, width: viewport.width, height, items, shapes, links });
      page.cleanup();
    }

    return { pageCount: doc.numPages, info, pages };
  } finally {
    await doc.destroy();
  }
}

/** Verdadeiro se o tipo real do arquivo é PDF (assinatura %PDF-). */
export function isPdfSignature(buf: Uint8Array): boolean {
  // a especificação admite lixo antes do cabeçalho, mas dentro do primeiro KB
  const head = Buffer.from(buf.subarray(0, 1024)).toString('latin1');
  return head.includes('%PDF-');
}
