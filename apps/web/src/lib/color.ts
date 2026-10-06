/* ==========================================================================
   Cor das legendas do PDF — contraste
   --------------------------------------------------------------------------
   As cores da legenda são dado (vêm do PDF) e vão de amarelo-claro a
   azul-marinho. Aqui ficam as contas para escrever por cima delas, ou com
   elas, sem perder a leitura:

     contrastRatio(a, b)  — razão de contraste WCAG 2.x entre duas cores hex.
     readableInk(fill)    — a tinta do número do dia sobre o preenchimento:
                            o token escuro ou o claro, o que tiver mais
                            contraste de verdade com aquela cor.
     legibleOn(hex, bg)   — a mesma cor (mesmo matiz e croma), clareada ou
                            escurecida só o bastante para ter ≥ 3:1 sobre o
                            fundo claro (branco) ou escuro (#1e2023). Para
                            texto, borda e ponto feitos com a cor da legenda.

   A conta de luminosidade é feita em OKLCH, para mudar só a claridade sem
   torcer o matiz.
   ========================================================================== */

type RGB = [number, number, number];

/** Os dois tokens de tinta do dia (index.css) — em hex, para a conta de contraste. */
const DAY_INK_DARK = '#0c111d'; // oklch(18% 0.025 264)
const DAY_INK_LIGHT = '#fafcff'; // oklch(99% 0.005 264)

const BACKGROUND = { light: '#ffffff', dark: '#1e2023' } as const;

function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}

function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores hex (1 a 21). Hex inválido conta como preto. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = luminance(parseHex(hexA) ?? [0, 0, 0]);
  const b = luminance(parseHex(hexB) ?? [0, 0, 0]);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Tinta legível sobre uma cor de legenda: o token escuro ou o claro, pelo contraste real. */
export function readableInk(hex: string | null | undefined): string {
  if (!hex || !parseHex(hex)) return 'var(--foreground)';
  return contrastRatio(hex, DAY_INK_DARK) >= contrastRatio(hex, DAY_INK_LIGHT) ? 'var(--day-ink-dark)' : 'var(--day-ink-light)';
}

/* -- OKLCH ---------------------------------------------------------------- */

type OKLCH = { l: number; c: number; h: number };

function srgbToOklch(rgb: RGB): OKLCH {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function oklchToSrgb({ l: L, c, h }: OKLCH): { rgb: RGB; inGamut: boolean } {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin: RGB = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const inGamut = lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  return { rgb: lin.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as RGB, inGamut };
}

/** A cor no sRGB com a claridade pedida, reduzindo o croma até caber no gamut. */
function withLightness(base: OKLCH, l: number): string {
  let c = base.c;
  for (let i = 0; i < 24; i++) {
    const { rgb, inGamut } = oklchToSrgb({ l, c, h: base.h });
    if (inGamut) return toHex(rgb);
    c *= 0.9;
  }
  return toHex(oklchToSrgb({ l, c: 0, h: base.h }).rgb);
}

/**
 * A cor da legenda ajustada para aparecer sobre o fundo do tema: mesmo matiz,
 * claridade mexida só o necessário para ≥ 3:1 (texto grande, borda, ponto).
 * Se a cor já passa, volta como veio (normalizada em hex).
 */
export function legibleOn(hex: string, background: 'light' | 'dark'): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const bg = BACKGROUND[background];
  const original = toHex(rgb);
  if (contrastRatio(original, bg) >= 3) return original;

  const base = srgbToOklch(rgb);
  // Fundo claro: escurece; fundo escuro: clareia. Passo de 1% de claridade.
  const step = background === 'light' ? -0.01 : 0.01;
  for (let l = base.l + step; l > 0 && l < 1; l += step) {
    const candidate = withLightness(base, l);
    if (contrastRatio(candidate, bg) >= 3) return candidate;
  }
  return background === 'light' ? '#000000' : '#ffffff';
}
