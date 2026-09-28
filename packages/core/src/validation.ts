import type { Calendar, CalendarEvent, IssueCode, ReviewIssue, ReviewState } from './types';

/* ==========================================================================
   Pendências e bloqueios de publicação
   --------------------------------------------------------------------------
   Duas origens de pendência:

     · gravadas na importação (texto divergente entre páginas, associação de
       baixa confiança, data que não foi entendida…);
     · calculadas ao vivo a partir do estado atual (importância não definida,
       âncora de período não conferida, título vazio).

   Uma pendência `blocker` impede a publicação até ser resolvida — corrigindo
   o dado ou, quando faz sentido, marcando como conferida. Algumas NÃO podem
   ser só "marcadas": uma data que o sistema não entendeu tem de ser digitada
   por alguém; marcar como conferida não a torna uma data.
   ========================================================================== */

/** Pendências que uma pessoa pode dar como conferidas sem alterar o dado. */
export const ACKNOWLEDGEABLE: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'date_year_inferred',
  'date_outside_semester',
  'text_mismatch_between_pages',
  'low_confidence_association',
  'possible_duplicate',
  'ocr_extracted',
  'grid_color_mismatch',
  'category_unmatched',
  'audience_detected',
  'unassociated_text',
  'courses_from_path',
  'possible_duplicate_calendar',
  'scope_unrecognized',
  'page_without_text',
  'grid_day_without_event',
]);

/** Estas só somem quando o dado é corrigido. */
export const FIX_REQUIRED: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'date_unparsed',
  'date_invalid',
  'date_ambiguous',
  'missing_title',
  'importance_unset',
  'anchor_unconfirmed',
]);

/**
 * O que de fato impede publicar. Os calendários da instituição são bem
 * definidos: os demais sinais da leitura (público citado no texto, curso
 * sugerido pela pasta…) viram observações, não travas. Trava só o que poria
 * um dado errado no ar: data não entendida, evento sem título, página que não
 * pôde ser lida e aviso de período sem saber se conta do início ou do fim.
 */
export const HARD_BLOCKERS: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'date_unparsed',
  'date_invalid',
  'date_ambiguous',
  'missing_title',
  'anchor_unconfirmed',
  'page_without_text',
]);

function soften(issue: ReviewIssue): ReviewIssue {
  return issue.severity === 'blocker' && !HARD_BLOCKERS.has(issue.code) ? { ...issue, severity: 'warning' } : issue;
}

export function emptyReview(confidence = 1): ReviewState {
  return { issues: [], acknowledged: [], confidence };
}

/** Pendências derivadas do estado atual do evento. */
export function liveEventIssues(event: CalendarEvent): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  if (!event.title.trim())
    out.push({ code: 'missing_title', severity: 'blocker', field: 'title', message: 'O evento está sem título.' });
  if (event.importance === 'unset')
    out.push({
      code: 'importance_unset',
      severity: 'info',
      field: 'importance',
      message: 'Aviso ainda não escolhido. Enquanto isso, nenhum aviso sai para este evento.',
    });
  if (
    event.datesResolved &&
    event.dates.kind === 'range' &&
    event.notification.enabled &&
    (event.importance === 'medium' || event.importance === 'high') &&
    !event.notification.anchorConfirmed
  )
    out.push({
      code: 'anchor_unconfirmed',
      severity: 'blocker',
      field: 'notification',
      message: 'Escolha se o aviso sai antes do início ou antes do fim do período.',
    });
  return out;
}

export function allEventIssues(event: CalendarEvent): ReviewIssue[] {
  return [...event.review.issues, ...liveEventIssues(event)];
}

export function isAcknowledged(review: ReviewState, code: IssueCode): boolean {
  return review.acknowledged.some((a) => a.code === code);
}

/** Pendências ainda abertas (não corrigidas nem conferidas). */
export function openEventIssues(event: CalendarEvent): ReviewIssue[] {
  return allEventIssues(event)
    .filter((i) => !(ACKNOWLEDGEABLE.has(i.code) && isAcknowledged(event.review, i.code)))
    .map(soften);
}

export function eventBlockers(event: CalendarEvent): ReviewIssue[] {
  return openEventIssues(event).filter((i) => i.severity === 'blocker');
}

export function openCalendarIssues(calendar: Pick<Calendar, 'review'>): ReviewIssue[] {
  return calendar.review.issues.filter((i) => !(ACKNOWLEDGEABLE.has(i.code) && isAcknowledged(calendar.review, i.code))).map(soften);
}

export interface PublishCheck {
  ok: boolean;
  blockers: { eventId: string | null; eventTitle: string | null; issue: ReviewIssue }[];
  warnings: { eventId: string | null; eventTitle: string | null; issue: ReviewIssue }[];
}

export function checkPublishable(calendar: Pick<Calendar, 'review' | 'title' | 'year' | 'semester' | 'scope'>, events: CalendarEvent[]): PublishCheck {
  const blockers: PublishCheck['blockers'] = [];
  const warnings: PublishCheck['warnings'] = [];

  if (!calendar.title.trim())
    blockers.push({ eventId: null, eventTitle: null, issue: { code: 'missing_title', severity: 'blocker', message: 'O calendário está sem nome.' } });
  if (!calendar.year || !calendar.semester)
    blockers.push({
      eventId: null,
      eventTitle: null,
      issue: { code: 'scope_unrecognized', severity: 'blocker', message: 'Informe o ano e o semestre do calendário em "Informações".' },
    });

  if (!calendar.scope.modality.trim())
    blockers.push({
      eventId: null,
      eventTitle: null,
      issue: { code: 'scope_unrecognized', severity: 'blocker', message: 'Informe a modalidade do calendário em "Informações".' },
    });

  for (const issue of openCalendarIssues(calendar)) {
    (issue.severity === 'blocker' ? blockers : warnings).push({ eventId: null, eventTitle: null, issue });
  }
  for (const event of events) {
    for (const issue of openEventIssues(event)) {
      (issue.severity === 'blocker' ? blockers : warnings).push({ eventId: event.id, eventTitle: event.title, issue });
    }
  }
  if (events.length === 0)
    blockers.push({ eventId: null, eventTitle: null, issue: { code: 'date_unparsed', severity: 'blocker', message: 'O calendário não tem nenhum evento.' } });

  return { ok: blockers.length === 0, blockers, warnings };
}
