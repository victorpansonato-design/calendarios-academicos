/* ==========================================================================
   Texto: normalização e semelhança
   --------------------------------------------------------------------------
   Duas páginas do mesmo PDF podem quebrar a mesma frase em linhas diferentes
   ("…por meio\nda secretaria" numa, "…por\nmeio da secretaria" na outra). Para
   decidir se são o mesmo evento, comparamos o texto sem acento, sem caixa,
   sem pontuação e sem quebras — mas o texto guardado é sempre o original.
   ========================================================================== */

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'para', 'por', 'com', 'via', 'um', 'uma', 'ao', 'aos', 'se', 'que', 'sua', 'seu', 'the',
]);

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Forma de comparação: sem acento, minúscula, só letras e números, espaço único. */
export function normalizeForCompare(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[“”"'’`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Espaços do PDF (não separáveis, duplos) viram espaço simples. */
export function collapseWhitespace(s: string): string {
  return s.replace(/[   \t]/g, ' ').replace(/ {2,}/g, ' ').trim();
}

/** Radical grosseiro: "disciplinas"/"disciplina", "digitais"/"digital". */
function stem(token: string): string {
  return token.length > 6 ? token.slice(0, 6) : token;
}

const ORDINALS: Record<string, string> = { '1': 'primeira', '2': 'segunda', '3': 'terceira', '4': 'quarta', '5': 'quinta' };

/** Sinônimos que os calendários usam lado a lado ("Calouros"/"Ingressantes", "2ª"/"Segunda"). */
function canonical(s: string): string {
  return s
    .replace(/\b([1-5])\s*[ªº°]/g, (_, n: string) => ORDINALS[n])
    // "disciplina híbrida 2" é a "Segunda Disciplina Híbrida" da legenda
    .replace(/(?<![\d/])\b([1-5])\b(?![\d/])/g, (_, n: string) => ORDINALS[n])
    .replace(/\bcalouros?\b/gi, 'ingressantes');
}

export function tokens(s: string): string[] {
  return normalizeForCompare(canonical(s))
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/** Coeficiente de Dice entre conjuntos de radicais — 0 a 1. */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return (2 * inter) / (ta.size + tb.size);
}

/** Quanto de `needle` está contido em `haystack` — 0 a 1. Assimétrico. */
export function coverage(needle: string, haystack: string): number {
  const tn = new Set(tokens(needle));
  const th = new Set(tokens(haystack));
  if (tn.size === 0) return 0;
  let inter = 0;
  for (const t of tn) if (th.has(t)) inter += 1;
  return inter / tn.size;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function slug(s: string): string {
  return normalizeForCompare(s).replace(/ /g, '-').slice(0, 60) || 'item';
}
