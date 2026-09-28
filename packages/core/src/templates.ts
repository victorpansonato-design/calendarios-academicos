/* ==========================================================================
   Modelos de mensagem
   --------------------------------------------------------------------------
   `{{aluno.primeiro_nome}}`, `{{evento.titulo}}`… são substituídos por valores
   do próprio envio. Uma variável sem valor NÃO vira texto inventado: sai vazia
   e é devolvida em `missing`, para a prévia mostrar o que falta.

   Não há lógica, laço nem acesso a outro registro dentro de um modelo. Isso é
   de propósito: um modelo só enxerga os dados do envio a que pertence, então
   não tem como vazar dado de um aluno na mensagem de outro.
   ========================================================================== */

const VAR = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

export function templateVariables(template: string): string[] {
  return [...new Set([...template.matchAll(VAR)].map((m) => m[1]))];
}

export function renderTemplate(
  template: string,
  values: Record<string, string | number | null | undefined>,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = template.replace(VAR, (_, key: string) => {
    const v = values[key];
    if (v === undefined || v === null || v === '') {
      if (!missing.includes(key)) missing.push(key);
      return '';
    }
    return String(v);
  });
  return { text: text.replace(/ {2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim(), missing };
}

/** Variáveis disponíveis nos lembretes de calendário. */
export const REMINDER_VARIABLES = [
  { key: 'evento.titulo', label: 'Título do evento', example: 'Período de aplicação da P1' },
  { key: 'evento.data', label: 'Data como no calendário', example: '28/09 a 09/10' },
  { key: 'evento.antecedencia', label: '"amanhã", "em 3 dias"', example: 'amanhã' },
  { key: 'evento.marco', label: '"começa", "termina", "acontece"', example: 'começa' },
  { key: 'evento.horario', label: 'Horários do evento', example: 'Diurno 07h30 · Noturno 19h30' },
  { key: 'calendario.nome', label: 'Nome do calendário', example: 'Cursos Presenciais (exceto Direito)' },
] as const;

export const DEFAULT_REMINDER_TITLE = 'Calendário acadêmico';
export const DEFAULT_REMINDER_BODY = '{{evento.titulo}} {{evento.marco}} {{evento.antecedencia}} ({{evento.data}}).';
