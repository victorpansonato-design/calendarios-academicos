import type { CalendarEvent, Importance, StudentImportance } from './types';
import { stripAccents } from './text';

/* ==========================================================================
   Importância para o aluno
   --------------------------------------------------------------------------
   A equipe decide a importância de cada evento; ela monta sozinha o
   calendário "Importantes" do aluno (Alta + Média). Para não começar do zero
   em cada PDF, o sistema SUGERE uma importância — e uma pessoa aplica.

   As regras valem na ordem: a primeira que casar decide. As de "Baixa" vêm
   antes de propósito: "Data máxima para lançamento de nota" é prazo, mas da
   secretaria e dos professores, não do aluno.
   ========================================================================== */

type Suggestable = Pick<CalendarEvent, 'title' | 'description' | 'type'>;
export type SuggestedImportance = Exclude<Importance, 'unset'>;

export interface ImportanceRule {
  id: string;
  importance: SuggestedImportance;
  /** Motivo curto, mostrado na sugestão: "Sugerido: Alta — é prova". */
  reason: string;
  test: (e: Suggestable, text: string, title: string) => boolean;
}

export const IMPORTANCE_RULES: ImportanceRule[] = [
  { id: 'monitoria', importance: 'low', reason: 'interessa só aos monitores', test: (_e, _t, title) => /monitori/.test(title) },
  { id: 'lancamento-nota', importance: 'low', reason: 'prazo da secretaria e dos professores', test: (_e, _t, title) => /lancamento de nota/.test(title) },
  { id: 'prova', importance: 'high', reason: 'é prova ou avaliação', test: (e, _t, title) => e.type === 'exam' || /\bprova\b|substitutiva|recuperacao|integrativa/.test(title) },
  { id: 'ultimo-dia', importance: 'high', reason: 'é o último dia de um prazo', test: (_e, _t, title) => /\bultimo dia\b(?! letivo)|data maxima|prazo final/.test(title) },
  {
    id: 'inscricao-dp',
    importance: 'high',
    reason: 'é a inscrição em DP/Adaptação',
    test: (e, _t, title) => /\bdp\b|dependencia/.test(title) && (e.type === 'enrollment' || e.type === 'deadline' || /inscri/.test(title)),
  },
  { id: '48-horas', importance: 'high', reason: 'tem prazo de 48 horas', test: (_e, text) => /48\s*horas/.test(text) },
  {
    id: 'fim-semestre',
    importance: 'high',
    reason: 'é o fim do semestre',
    test: (e, _t, title) => /fim do semestre|ultimo dia letivo|termino do semestre/.test(title) || (e.type === 'term_end' && /semestre|letivo/.test(title)),
  },
  { id: 'feriado', importance: 'medium', reason: 'é feriado ou recesso', test: (e) => e.type === 'holiday' },
  { id: 'inicio-aulas', importance: 'medium', reason: 'é início de aulas ou atividades', test: (e) => e.type === 'term_start' },
  { id: 'inscricao', importance: 'medium', reason: 'é período de inscrição', test: (e) => e.type === 'enrollment' },
  { id: 'prazo', importance: 'medium', reason: 'é prazo', test: (e) => e.type === 'deadline' },
  { id: 'encerramento', importance: 'medium', reason: 'é encerramento', test: (e) => e.type === 'term_end' },
  { id: 'evento-online', importance: 'low', reason: 'é evento on-line opcional', test: (e) => e.type === 'online_event' },
];

const FALLBACK: ImportanceSuggestion = { importance: 'low', ruleId: 'outros', reason: 'é atividade complementar' };

export interface ImportanceSuggestion {
  importance: SuggestedImportance;
  ruleId: string;
  reason: string;
}

export function suggestImportance(e: Suggestable): ImportanceSuggestion {
  const title = fold(e.title);
  const text = fold(`${e.title}\n${e.description}`);
  for (const rule of IMPORTANCE_RULES) {
    if (rule.test(e, text, title)) return { importance: rule.importance, ruleId: rule.id, reason: rule.reason };
  }
  return FALLBACK;
}

/** Como o aluno enxerga: não definida conta como Baixa. */
export function studentImportance(i: Importance): StudentImportance {
  return i === 'high' || i === 'medium' ? i : 'low';
}

/** Só Média pode ser ocultada pelo aluno; Alta é "não perca". */
export function canHide(i: Importance): boolean {
  return i === 'medium';
}

function fold(s: string): string {
  return stripAccents(s).toLowerCase();
}
