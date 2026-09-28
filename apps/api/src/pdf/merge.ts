import type { EventDates, ReviewIssue, SourceRef } from '@calendarios/core';
import { datesKey, normalizeForCompare, similarity, tokens } from '@calendarios/core';
import type { ExtractedFields } from '@calendarios/core';

/* ==========================================================================
   Um evento, não dois
   --------------------------------------------------------------------------
   Um período que atravessa meses aparece na página de cada mês: a P1 de
   "28/09 a 09/10" está em setembro E em outubro. Isso é um evento, com duas
   referências de página — não dois eventos.

   Ao mesmo tempo, "25/08" tem três eventos diferentes no mesmo dia, e eles
   têm de continuar três.

   Regras:
     1. mesma data + mesmo texto (ignorando quebra de linha, acento, caixa e
        pontuação) em páginas diferentes → funde, guardando as duas origens;
     2. mesma data + texto quase igual (≥ 90%) em páginas diferentes → funde,
        mas marca "texto diverge entre páginas" com as duas versões, para uma
        pessoa escolher;
     3. mesma data + texto parecido na MESMA página → não funde; marca os dois
        como "possível duplicidade";
     4. o resto é evento distinto.
   ========================================================================== */

export interface DraftEvent {
  label: string;
  dates: EventDates | null;
  fields: ExtractedFields;
  sources: SourceRef[];
  issues: ReviewIssue[];
  confidence: number;
}

function key(e: DraftEvent): string {
  return e.dates ? datesKey(e.dates) : `label:${normalizeForCompare(e.label)}`;
}

function pages(e: DraftEvent): Set<number> {
  return new Set(e.sources.map((s) => s.page));
}

function disjoint(a: Set<number>, b: Set<number>): boolean {
  for (const x of a) if (b.has(x)) return false;
  return true;
}

export interface MergeResult {
  events: DraftEvent[];
  mergedAcrossPages: number;
  possibleDuplicates: number;
}

export function mergeAcrossPages(input: DraftEvent[]): MergeResult {
  const out: DraftEvent[] = [];
  let mergedAcrossPages = 0;

  for (const ev of input) {
    const text = normalizeForCompare(ev.fields.description);
    const sameDate = out.filter((o) => key(o) === key(ev) && disjoint(pages(o), pages(ev)));

    const exact = sameDate.find((o) => normalizeForCompare(o.fields.description) === text);
    if (exact) {
      exact.sources.push(...ev.sources);
      exact.confidence = Math.min(exact.confidence, ev.confidence);
      mergedAcrossPages += 1;
      continue;
    }

    const near = sameDate
      .map((o) => ({ o, s: similarity(o.fields.description, ev.fields.description) }))
      // textos curtos mudam muito com uma palavra: "1ª disciplina híbrida" ×
      // "disciplina digital" não é o mesmo evento
      .filter((x) => x.s >= 0.9 && tokens(ev.fields.description).length >= 6)
      .sort((a, b) => b.s - a.s)[0];
    if (near) {
      near.o.sources.push(...ev.sources);
      near.o.confidence = Math.min(near.o.confidence, ev.confidence);
      const existing = near.o.issues.find((i) => i.code === 'text_mismatch_between_pages');
      const versions = [...((existing?.detail as { versions?: unknown[] })?.versions ?? [{ page: near.o.sources[0].page, text: near.o.fields.rawText }]), { page: ev.sources[0].page, text: ev.fields.rawText }];
      const issue: ReviewIssue = {
        code: 'text_mismatch_between_pages',
        severity: 'blocker',
        field: 'description',
        message: `O texto deste evento é diferente entre as páginas ${versions.map((v) => (v as { page: number }).page).join(' e ')}. Confira qual versão está correta.`,
        detail: { versions },
      };
      near.o.issues = [...near.o.issues.filter((i) => i.code !== 'text_mismatch_between_pages'), issue];
      mergedAcrossPages += 1;
      continue;
    }

    out.push({ ...ev, sources: [...ev.sources], issues: [...ev.issues] });
  }

  // Parecidos na mesma página (ou que não puderam ser fundidos): sinaliza.
  let possibleDuplicates = 0;
  for (let i = 0; i < out.length; i += 1) {
    for (let j = i + 1; j < out.length; j += 1) {
      const a = out[i];
      const b = out[j];
      if (key(a) !== key(b)) continue;
      if (similarity(a.fields.description, b.fields.description) < 0.92) continue;
      for (const [x, y] of [
        [a, b],
        [b, a],
      ] as const) {
        if (x.issues.some((k) => k.code === 'possible_duplicate')) continue;
        x.issues.push({
          code: 'possible_duplicate',
          severity: 'blocker',
          message: `Pode ser o mesmo evento que "${y.fields.title}" (mesma data, texto parecido). Confira e exclua um deles se for repetido.`,
        });
      }
      possibleDuplicates += 1;
    }
  }

  return { events: out, mergedAcrossPages, possibleDuplicates };
}
